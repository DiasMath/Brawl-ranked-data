from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field, HttpUrl, StringConstraints, model_validator

from ..config import account
from ..db import database
from ..domain import encoded, utc_now
from ..services.explorer import TABLES, explore, parquet


router = APIRouter()


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


@router.post("/api/evidence")
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


@router.post("/api/meta")
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


@router.post("/api/sql")
def query(data: SqlRequest):
    with database() as (_, cursor):
        try:
            return explore(cursor, data.sql, data.engine)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc


@router.get("/api/parquet/{table}")
def get_parquet(table: str):
    if table not in TABLES:
        raise HTTPException(404, "Tabela indisponível para exportação.")
    with database() as (_, cursor):
        content = parquet(cursor, table)
    return Response(content, media_type="application/vnd.apache.parquet",
                    headers={"Content-Disposition": f'attachment; filename="{table}.parquet"'})
