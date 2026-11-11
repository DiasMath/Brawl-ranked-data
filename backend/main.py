import asyncio
import logging
from contextlib import asynccontextmanager, contextmanager
from datetime import date, timedelta
from email.utils import parsedate_to_datetime
from hmac import compare_digest
from pathlib import Path
import json
import os
from typing import Annotated

import httpx
import psycopg
from psycopg.rows import dict_row
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field, HttpUrl, StringConstraints, model_validator

from domain import encoded, integer, iso, obj, parse_battle, string, tag, utc_now
from explorer import TABLES, explore, parquet


ROOT = Path(__file__).resolve().parent
LOG = logging.getLogger("brawl.collection")
POLL_SECONDS = int(os.getenv("BRAWL_POLL_SECONDS", "300"))
if POLL_SECONDS and POLL_SECONDS < 60:
    raise RuntimeError("Configure BRAWL_POLL_SECONDS com 0 ou pelo menos 60 segundos.")


async def collect_periodically(stop):
    while not stop.is_set():
        try:
            await asyncio.to_thread(collect_account, True)
        except HTTPException as exc:
            if exc.status_code not in (409, 429):
                LOG.warning("Coleta da Supercell recusada (HTTP %s).", exc.status_code)
        except psycopg.Error:
            LOG.warning("Banco indisponível durante a coleta automática.")
        try:
            await asyncio.wait_for(stop.wait(), timeout=POLL_SECONDS)
        except TimeoutError:
            continue


@asynccontextmanager
async def lifespan(_app):
    if len(service_token()) < 32:
        raise RuntimeError("Configure BRAWL_SERVICE_TOKEN com pelo menos 32 caracteres.")
    account()
    await asyncio.to_thread(prepare_collection)
    stop = asyncio.Event()
    worker = asyncio.create_task(collect_periodically(stop)) if POLL_SECONDS and api_token() else None
    try:
        yield
    finally:
        stop.set()
        if worker:
            await worker


app = FastAPI(title="Brawl Ranked Lab", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
BATTLE_FIELDS = (
    "id player_tag played_at event_id map_name mode api_type ranked result duration_seconds "
    "player_brawler_id player_brawler rank_label rank_score season bans raw"
).split()


def service_token():
    return os.getenv("BRAWL_SERVICE_TOKEN", "").strip()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.middleware("http")
async def access_control(request: Request, call_next):
    if request.url.path == "/health" and request.method in {"GET", "HEAD"}:
        return await call_next(request)
    expected = service_token()
    received = request.headers.get("authorization", "").encode()
    if not expected or not compare_digest(received, ("Bearer " + expected).encode()):
        return JSONResponse({"detail": "Acesso privado."}, status_code=401, headers={"Cache-Control": "no-store"})
    response = await call_next(request)
    response.headers["Cache-Control"] = "private, no-store"
    return response


def api_token():
    return os.getenv("BRAWL_API_TOKEN", "").strip()


def account():
    try:
        return tag(os.getenv("BRAWL_PLAYER_TAG", ""))
    except ValueError as exc:
        raise HTTPException(503, "Corrija BRAWL_PLAYER_TAG no arquivo .env.") from exc


@contextmanager
def database():
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("Configure DATABASE_URL para o PostgreSQL.")
    with psycopg.connect(url, row_factory=dict_row, connect_timeout=8) as connection:
        connection.execute("SET search_path TO brawl_lab")
        connection.commit()
        with connection.cursor() as cursor:
            yield connection, cursor


def prepare_collection():
    schema = (ROOT / "schema.sql").read_text(encoding="utf-8")
    with database() as (connection, cursor):
        cursor.execute("SELECT pg_advisory_xact_lock(hashtextextended('brawl:schema', 0))")
        cursor.execute("CREATE SCHEMA IF NOT EXISTS brawl_lab")
        for statement in schema.split(";"):
            if statement.strip():
                cursor.execute(statement)
        connection.commit()


def latest_run(cursor, player, successful=False):
    cursor.execute(
        "SELECT id, started_at, finished_at, status, received, added, message "
        "FROM update_log WHERE player_tag=%s " + ("AND status='success' " if successful else "") +
        "ORDER BY id DESC LIMIT 1", (player,),
    )
    return cursor.fetchone()


def retry_until(cursor, player):
    cursor.execute("SELECT retry_until FROM collection_state WHERE player_tag=%s", (player,))
    return (cursor.fetchone() or {}).get("retry_until")


def retry_seconds(value):
    if value.isdecimal() and len(value) < 8:
        return max(60, int(value))
    try:
        return max(60, int((parsedate_to_datetime(value).replace(tzinfo=None) - utc_now()).total_seconds()))
    except (TypeError, ValueError, OverflowError):
        return 600


@app.exception_handler(psycopg.Error)
async def db_error(_request, _exception):
    return JSONResponse({"detail": "PostgreSQL indisponível. Confira a conexão do Render."}, 503)


def fetch(client, path):
    try:
        response = client.get(path)
    except httpx.RequestError as exc:
        raise HTTPException(502, "Falha de conexão com a API oficial.") from exc
    if response.status_code == 403:
        raise HTTPException(403, "Supercell recusou a chave. Confira sua validade e o IP público autorizado.")
    if response.status_code == 404:
        raise HTTPException(404, "Conta não encontrada na API oficial.")
    if response.status_code == 429:
        raise HTTPException(429, "Limite da API atingido. Aguarde antes de atualizar novamente.",
                            headers={"Retry-After": str(retry_seconds(response.headers.get("Retry-After", "")))})
    if response.status_code != 200:
        raise HTTPException(502, f"A API oficial retornou HTTP {response.status_code}.")
    try:
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError()
        return payload
    except ValueError as exc:
        raise HTTPException(502, "Formato inesperado na resposta da Supercell.") from exc


def save_battle(cursor, battle):
    values = [battle[field] for field in BATTLE_FIELDS]
    cursor.execute("SELECT id FROM battles WHERE id=%s FOR UPDATE", (battle["id"],))
    existing = cursor.fetchone() is not None
    updates = ", ".join(
        f"{field}=COALESCE(EXCLUDED.{field}, battles.{field})" for field in BATTLE_FIELDS[3:]
    )
    cursor.execute(
        f"INSERT INTO battles ({', '.join(BATTLE_FIELDS)}) VALUES ({', '.join(['%s'] * len(values))}) "
        f"ON CONFLICT (id) DO UPDATE SET {updates}", values,
    )
    if battle["players"]:
        cursor.execute("DELETE FROM battle_players WHERE battle_id=%s", (battle["id"],))
        cursor.executemany(
            "INSERT INTO battle_players (battle_id, team_index, slot, player_tag, player_name, "
            "brawler_id, brawler, power, side) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            [(battle["id"], *player) for player in battle["players"]],
        )
    return int(not existing)


@app.post("/api/sync")
def sync():
    return collect_account()


def collect_account(automatic=False):
    player = account()
    key = api_token()
    lock_name = "brawl:sync:" + player
    with database() as (connection, cursor):
        cursor.execute("SELECT pg_try_advisory_lock(hashtextextended(%s, 0)) AS acquired", (lock_name,))
        if cursor.fetchone()["acquired"] != 1:
            raise HTTPException(409, "Uma atualização já está em andamento.")
        try:
            waiting = retry_until(cursor, player)
            now = utc_now()
            if waiting and waiting > now:
                if automatic:
                    return None
                seconds = max(1, int((waiting-now).total_seconds()) + 1)
                raise HTTPException(429, "A coleta está em pausa após limite da Supercell.",
                                    headers={"Retry-After": str(seconds)})
            previous_run = latest_run(cursor, player)
            if automatic and previous_run and previous_run["finished_at"] and (
                now - previous_run["finished_at"] < timedelta(seconds=POLL_SECONDS-5)
            ):
                return None
            previous_success = latest_run(cursor, player, successful=True)
            cursor.execute(
                "UPDATE update_log SET status='error', finished_at=%s, message='Atualização interrompida' "
                "WHERE player_tag=%s AND status='running'", (utc_now(), player)
            )
            cursor.execute("INSERT INTO update_log (player_tag, started_at, status) VALUES (%s,%s,'running') RETURNING id",
                           (player, utc_now()))
            run_id = cursor.fetchone()["id"]
            connection.commit()
            received = None
            try:
                if not key:
                    raise HTTPException(503, "Defina BRAWL_API_TOKEN no .env e recrie o serviço app.")
                with httpx.Client(
                    base_url="https://api.brawlstars.com/v1/", timeout=15,
                    headers={"Authorization": f"Bearer {key}"}, follow_redirects=False,
                ) as client:
                    path = "players/%23" + player[1:]
                    profile = fetch(client, path)
                    log = fetch(client, path + "/battlelog")
                if profile.get("tag") != player or not isinstance(profile.get("name"), str):
                    raise HTTPException(502, "O perfil retornado não corresponde à conta configurada.")
                if not isinstance(log.get("items"), list):
                    raise HTTPException(502, "A resposta não contém o histórico esperado.")
                received = len(log["items"])
                try:
                    battles = [parse_battle(item, player) for item in log["items"]]
                except (KeyError, AttributeError, TypeError, ValueError) as exc:
                    raise HTTPException(502, "Estrutura de partida inesperada. A importação foi revertida.") from exc
                cursor.execute(
                    "INSERT INTO account_profile (player_tag,player_name,raw,fetched_at) VALUES (%s,%s,%s,%s) "
                    "ON CONFLICT (player_tag) DO UPDATE SET player_name=EXCLUDED.player_name, raw=EXCLUDED.raw, "
                    "fetched_at=EXCLUDED.fetched_at", (player, profile["name"], encoded(profile), utc_now()),
                )
                observed_at = utc_now()
                added = 0
                for battle in battles:
                    inserted = save_battle(cursor, battle)
                    added += inserted
                    observed = bool(inserted and previous_success and
                                    previous_success["started_at"] <= battle["played_at"] <= observed_at)
                    cursor.execute(
                        "INSERT INTO battle_collection (battle_id, first_seen_at, delay_observed, last_run_id) "
                        "VALUES (%s,%s,%s,%s) ON CONFLICT (battle_id) DO UPDATE SET last_run_id=EXCLUDED.last_run_id",
                        (battle["id"], observed_at, observed, run_id),
                    )
                if previous_success and len(battles) >= 25 and added == len(battles):
                    cursor.execute(
                        "INSERT INTO collection_state (player_tag, last_possible_gap) VALUES (%s,%s) "
                        "ON CONFLICT (player_tag) DO UPDATE SET last_possible_gap=EXCLUDED.last_possible_gap", (player, observed_at),
                    )
                record_profile_reading(cursor, player, run_id, observed_at, profile)
                cursor.execute("UPDATE update_log SET finished_at=%s, status='success', received=%s, added=%s "
                               "WHERE id=%s", (utc_now(), received, added, run_id))
                connection.commit()
                return {"received": received, "added": added}
            except (HTTPException, psycopg.Error) as exc:
                connection.rollback()
                message = str(exc.detail) if isinstance(exc, HTTPException) else "Falha de persistência no PostgreSQL."
                if isinstance(exc, HTTPException) and exc.status_code == 429:
                    retry = utc_now() + timedelta(seconds=int((exc.headers or {}).get("Retry-After", 600)))
                    cursor.execute(
                        "INSERT INTO collection_state (player_tag, retry_until) VALUES (%s,%s) "
                        "ON CONFLICT (player_tag) DO UPDATE SET retry_until=EXCLUDED.retry_until", (player, retry),
                    )
                cursor.execute("UPDATE update_log SET finished_at=%s, status='error', received=%s, message=%s "
                               "WHERE id=%s", (utc_now(), received, message, run_id))
                connection.commit()
                raise
        finally:
            connection.rollback()
            cursor.execute("SELECT pg_advisory_unlock(hashtextextended(%s, 0))", (lock_name,))


def record_profile_reading(cursor, player, run_id, at, profile):
    rank = profile.get("rankedRank")
    rank = string(rank) or (str(rank) if integer(rank) is not None else None)
    readings = (integer(profile.get("trophies")), integer(profile.get("rankedScore")), rank,
                string(profile.get("rankedSeason")))
    if not any(value is not None for value in readings[:3]):
        return
    cursor.execute("SELECT trophies, rank_score, rank_label, season FROM profile_readings "
                   "WHERE player_tag=%s ORDER BY run_id DESC LIMIT 1", (player,))
    previous = cursor.fetchone()
    if previous and tuple(previous.values()) == readings:
        return
    cursor.execute(
        "INSERT INTO profile_readings (player_tag, run_id, observed_at, trophies, rank_score, rank_label, season) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s)", (player, run_id, at, *readings),
    )


@app.get("/api/collection/status")
def collection_status():
    player = account()
    with database() as (_, cursor):
        last_attempt = latest_run(cursor, player)
        last_success = latest_run(cursor, player, successful=True)
        cursor.execute("SELECT MAX(played_at) AS latest FROM battles WHERE player_tag=%s", (player,))
        latest_battle = cursor.fetchone()["latest"]
        cursor.execute("SELECT last_possible_gap, retry_until FROM collection_state WHERE player_tag=%s", (player,))
        state = cursor.fetchone() or {}
    return {
        "player_tag": player, "configured": bool(api_token()), "interval_seconds": POLL_SECONDS,
        "last_attempt": {**last_attempt, "started_at": iso(last_attempt["started_at"]),
                         "finished_at": iso(last_attempt["finished_at"])} if last_attempt else None,
        "last_success": iso(last_success["finished_at"]) if last_success else None,
        "last_battle": iso(latest_battle), "last_possible_gap": iso(state.get("last_possible_gap")),
        "retry_until": iso(state.get("retry_until")) if state.get("retry_until") and state["retry_until"] > utc_now() else None,
    }


@app.get("/api/collection/history")
def collection_history(after: int = 0):
    player = account()
    with database() as (_, cursor):
        cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        latest = latest_run(cursor, player, successful=True)
        run_id = latest["id"] if latest else 0
        snapshot = dataset(cursor, player, after_run=after if 0 < after <= run_id else 0, include_archive=True)
        return {"run_id": run_id, "snapshot": snapshot}


def dataset(cursor, player, after_run=0, include_archive=False):
    cursor.execute("SELECT player_name, fetched_at, raw FROM account_profile WHERE player_tag=%s", (player,))
    profile = cursor.fetchone()
    changed = " AND o.last_run_id>%s" if after_run else ""
    params = (player, after_run) if after_run else (player,)
    cursor.execute(f"""
        SELECT b.id, b.played_at, b.event_id, b.map_name, b.mode, b.api_type, b.ranked, b.result, b.duration_seconds,
               b.player_brawler, COALESCE(b.rank_label, e.rank_label) AS rank_label,
               COALESCE(b.rank_score, e.rank_score) AS rank_score, COALESCE(b.season, e.season) AS season,
               COALESCE(b.bans, e.bans) AS bans,
               CASE WHEN b.rank_label IS NULL THEN e.rank_reference END AS rank_reference,
               CASE WHEN b.rank_score IS NULL THEN e.score_reference END AS score_reference,
               CASE WHEN b.season IS NULL THEN e.season_reference END AS season_reference,
               CASE WHEN b.bans IS NULL THEN e.bans_reference END AS bans_reference,
               CASE WHEN b.rank_label IS NULL AND e.rank_label IS NOT NULL THEN 'evidência' END AS rank_source,
               CASE WHEN b.rank_score IS NULL AND e.rank_score IS NOT NULL THEN 'evidência' END AS score_source,
               CASE WHEN b.season IS NULL AND e.season IS NOT NULL THEN 'evidência' END AS season_source,
               CASE WHEN b.bans IS NULL AND e.bans IS NOT NULL THEN 'evidência' END AS bans_source,
               o.first_seen_at, o.delay_observed, b.raw
        FROM battles b LEFT JOIN battle_evidence e ON e.battle_id=b.id
        LEFT JOIN battle_collection o ON o.battle_id=b.id
        WHERE b.player_tag=%s{changed} ORDER BY b.played_at DESC
    """, params)
    matches = cursor.fetchall()
    by_id = {row["id"]: row for row in matches}
    raw_battles = {}
    for match in matches:
        item = json.loads(match.pop("raw"))
        if include_archive:
            raw_battles[match["id"]] = item
        match["trophy_change"] = integer(obj(item.get("battle")).get("trophyChange")) if match["api_type"] == "ranked" else None
        match["first_seen_at"] = iso(match["first_seen_at"])
        match["delay_observed"] = bool(match["delay_observed"])
        match["played_at"] = iso(match["played_at"])
        match["ranked"] = bool(match["ranked"])
        match["bans"] = json.loads(match["bans"]) if match["bans"] is not None else None
        match["players"] = []
    cursor.execute(f"""
        SELECT p.battle_id, p.team_index, p.player_tag, p.player_name, p.brawler_id, p.brawler, p.power, p.side
        FROM battle_players p JOIN battles b ON p.battle_id=b.id
        LEFT JOIN battle_collection o ON o.battle_id=b.id WHERE b.player_tag=%s{changed}
        ORDER BY p.battle_id, p.team_index, p.slot
    """, params)
    for participant in cursor.fetchall():
        by_id[participant.pop("battle_id")]["players"].append(participant)
    cursor.execute("SELECT id, started_at, finished_at, status, received, added, message FROM update_log "
                   "WHERE player_tag=%s ORDER BY id DESC LIMIT 100", (player,))
    updates = cursor.fetchall()
    for row in updates:
        row["started_at"], row["finished_at"] = iso(row["started_at"]), iso(row["finished_at"])
    cursor.execute("SELECT id, source_name, source_url, period_start, period_end, map_name, mode, rank_label, season, "
                   "brawler, wins, games, pick_count, pick_total, ban_count, ban_total "
                   "FROM meta_observations WHERE player_tag=%s ORDER BY period_end DESC, id DESC", (player,))
    meta = cursor.fetchall()
    raw_profile = json.loads(profile["raw"]) if profile else {}
    brawlers = raw_profile.get("brawlers")
    owned = []
    for brawler in brawlers if isinstance(brawlers, list) else []:
        name, power = string(obj(brawler).get("name")), integer(obj(brawler).get("power"))
        if name and power is not None:
            owned.append({"name": name, "power": power})
    snapshot = {
        "schema": 1, "exported_at": iso(utc_now()), "player_tag": player,
        "profile": {"name": profile["player_name"], "fetched_at": iso(profile["fetched_at"]),
                    "trophies": integer(raw_profile.get("trophies")), "icon_id": integer(obj(raw_profile.get("icon")).get("id")),
                    "owned_brawlers": owned} if profile else None,
        "matches": matches, "updates": updates, "meta": meta,
    }
    if include_archive:
        cursor.execute("SELECT run_id, observed_at, trophies, rank_score, rank_label, season FROM profile_readings "
                       "WHERE player_tag=%s AND run_id>%s ORDER BY run_id", (player, after_run))
        snapshot["progress"] = [
            {"id": f"server:{iso(row['observed_at'])}", "at": iso(row["observed_at"]), "trophies": row["trophies"],
             "score": row["rank_score"], "rank": row["rank_label"], "season": row["season"],
             "source": "Perfil da API · servidor", "method": "api"}
            for row in cursor.fetchall()
        ]
        snapshot["raw"] = raw_battles
    return snapshot


@app.get("/api/dataset")
def get_dataset():
    with database() as (_, cursor):
        return dataset(cursor, account())


@app.get("/api/export")
def export():
    with database() as (_, cursor):
        from fastapi.encoders import jsonable_encoder
        data = jsonable_encoder(dataset(cursor, account(), include_archive=True))
    return JSONResponse(data, headers={"Content-Disposition": 'attachment; filename="brawl-snapshot.json"'})


@app.get("/api/battles/{battle_id}")
def raw_battle(battle_id: str):
    with database() as (_, cursor):
        cursor.execute("SELECT raw FROM battles WHERE player_tag=%s AND id=%s", (account(), battle_id))
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(404, "Partida não encontrada.")
        return json.loads(row["raw"])


Label = Annotated[str, StringConstraints(min_length=1, max_length=100, strip_whitespace=True)]
Count = Annotated[int, Field(strict=True, ge=0, le=2147483647)]


class Evidence(BaseModel):
    battle_id: str = Field(pattern=r"^[a-f0-9]{64}$")
    rank_label: str | None = Field(default=None, min_length=1, max_length=60)
    rank_score: Count | None = None
    season: Label | None = None
    bans: list[Label] | None = Field(default=None, max_length=30)
    evidence: str = Field(min_length=3, max_length=400)

    @model_validator(mode="after")
    def check_values(self):
        if not self.evidence.strip() or all(v is None for v in (self.rank_label, self.rank_score, self.season, self.bans)):
            raise ValueError("Informe a referência da evidência e pelo menos um campo observado.")
        return self


@app.post("/api/evidence")
def import_evidence(evidence: Evidence):
    with database() as (connection, cursor):
        cursor.execute("SELECT ranked FROM battles WHERE id=%s AND player_tag=%s", (evidence.battle_id, account()))
        if not (row := cursor.fetchone()) or not row["ranked"]:
            raise HTTPException(404, "Partida ranqueada não encontrada.")
        cursor.execute("""
            INSERT INTO battle_evidence (battle_id, rank_label, rank_score, season, bans,
               rank_reference, score_reference, season_reference, bans_reference, recorded_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) 
            ON CONFLICT (battle_id) DO UPDATE SET rank_label=COALESCE(EXCLUDED.rank_label,battle_evidence.rank_label),
              rank_score=COALESCE(EXCLUDED.rank_score,battle_evidence.rank_score),
              season=COALESCE(EXCLUDED.season,battle_evidence.season),
              bans=COALESCE(EXCLUDED.bans,battle_evidence.bans),
              rank_reference=COALESCE(EXCLUDED.rank_reference,battle_evidence.rank_reference),
              score_reference=COALESCE(EXCLUDED.score_reference,battle_evidence.score_reference),
              season_reference=COALESCE(EXCLUDED.season_reference,battle_evidence.season_reference),
              bans_reference=COALESCE(EXCLUDED.bans_reference,battle_evidence.bans_reference),
              recorded_at=EXCLUDED.recorded_at
        """, (evidence.battle_id, evidence.rank_label, evidence.rank_score, evidence.season,
              encoded(evidence.bans) if evidence.bans is not None else None,
              *(evidence.evidence if field is not None else None for field in
                (evidence.rank_label, evidence.rank_score, evidence.season, evidence.bans)), utc_now()))
        connection.commit()
    return {"saved": True}


class MetaRow(BaseModel):
    map_name: Label | None = None
    mode: Label | None = None
    rank_label: str | None = Field(default=None, min_length=1, max_length=60)
    season: Label | None = None
    brawler: Label
    wins: Count
    games: Annotated[Count, Field(gt=0)]
    pick_count: Count | None = None
    pick_total: Count | None = None
    ban_count: Count | None = None
    ban_total: Count | None = None

    @model_validator(mode="after")
    def valid_totals(self):
        if self.wins > self.games:
            raise ValueError("Vitórias excedem o total de resultados decisivos.")
        for count, total in ((self.pick_count, self.pick_total), (self.ban_count, self.ban_total)):
            if (count is None) != (total is None) or (total is not None and (total == 0 or count > total)):
                raise ValueError("Picks e bans exigem numerador e denominador válidos.")
        return self


class MetaImport(BaseModel):
    source_name: str = Field(min_length=1, max_length=120)
    source_url: HttpUrl
    period_start: date
    period_end: date
    rows: list[MetaRow] = Field(min_length=1, max_length=5000)

    @model_validator(mode="after")
    def valid_period(self):
        if self.period_start > self.period_end:
            raise ValueError("Período da fonte inválido.")
        keys = [(row.brawler.casefold(), row.map_name, row.mode, row.rank_label, row.season) for row in self.rows]
        if len(set(keys)) != len(keys):
            raise ValueError("Há recortes de meta duplicados no arquivo.")
        if len(str(self.source_url)) > 400:
            raise ValueError("URL da fonte muito longa.")
        return self


@app.post("/api/meta")
def import_meta(data: MetaImport):
    with database() as (connection, cursor):
        player = account()
        lock_name = "brawl:meta:" + player
        cursor.execute("SELECT pg_try_advisory_lock(hashtextextended(%s, 0)) AS acquired", (lock_name,))
        if cursor.fetchone()["acquired"] != 1:
            raise HTTPException(409, "Outra importação de meta está em andamento.")
        source = (player, data.source_name, str(data.source_url), data.period_start, data.period_end)
        try:
            cursor.execute("DELETE FROM meta_observations WHERE player_tag=%s AND source_name=%s "
                           "AND source_url=%s AND period_start=%s AND period_end=%s", source)
            cursor.executemany("""
                INSERT INTO meta_observations (player_tag, source_name, source_url, period_start, period_end,
                  map_name, mode, rank_label, season, brawler, wins, games, pick_count, pick_total, ban_count,
                  ban_total, recorded_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, [(*source, row.map_name, row.mode, row.rank_label, row.season, row.brawler, row.wins, row.games,
                   row.pick_count, row.pick_total, row.ban_count, row.ban_total, utc_now()) for row in data.rows])
            connection.commit()
        finally:
            connection.rollback()
            cursor.execute("SELECT pg_advisory_unlock(hashtextextended(%s, 0))", (lock_name,))
    return {"imported": len(data.rows)}


class SqlRequest(BaseModel):
    sql: str = Field(min_length=1, max_length=12000)
    engine: str = Field(pattern=r"^(postgres|duckdb)$")


@app.post("/api/sql")
def query(data: SqlRequest):
    with database() as (_, cursor):
        try:
            return explore(cursor, data.sql, data.engine)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc


@app.get("/api/parquet/{table}")
def get_parquet(table: str):
    if table not in TABLES:
        raise HTTPException(404, "Tabela indisponível para exportação.")
    with database() as (_, cursor):
        content = parquet(cursor, table)
    return Response(content, media_type="application/vnd.apache.parquet",
                    headers={"Content-Disposition": f'attachment; filename="{table}.parquet"'})

