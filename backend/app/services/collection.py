import psycopg

from ..db import database
from ..domain import encoded, integer, parse_battle, ranked_reading, utc_now
from ..repositories.history import latest_run, remember_retry, retry_until
from .credentials import stored_token
from .supercell import CollectionError, fetch, official_client


BATTLE_FIELDS = (
    "id player_tag played_at event_id map_name mode api_type ranked result duration_seconds "
    "player_brawler_id player_brawler rank_label rank_score season bans raw"
).split()


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


def publish_progress(connection, cursor, run_id, phase, received=None, processed=None):
    cursor.execute("UPDATE update_log SET phase=%s, received=%s, processed=%s WHERE id=%s",
                   (phase, received, processed, run_id))
    connection.commit()


def collect_account(player, *, scheduled=False):
    lock_name = "brawl:sync"
    with database() as (connection, cursor):
        cursor.execute("SELECT pg_try_advisory_lock(hashtextextended(%s, 0)) AS acquired", (lock_name,))
        if not cursor.fetchone()["acquired"]:
            if scheduled:
                return None
            raise CollectionError(409, "Uma atualização já está em andamento.")
        try:
            waiting = retry_until(cursor)
            now = utc_now()
            if waiting and waiting > now:
                if scheduled:
                    return None
                seconds = max(1, int((waiting-now).total_seconds()) + 1)
                raise CollectionError(429, "A coleta está em pausa após limite da Supercell.",
                                    headers={"Retry-After": str(seconds)})
            previous_success = latest_run(cursor, player, successful=True)
            cursor.execute(
                "UPDATE update_log SET status='error', finished_at=%s, message='Atualização interrompida' "
                "WHERE player_tag=%s AND status='running'", (utc_now(), player)
            )
            cursor.execute("INSERT INTO update_log (player_tag, started_at, status, phase, origin) "
                           "VALUES (%s,%s,'running','profile',%s) RETURNING id",
                           (player, utc_now(), "scheduled" if scheduled else "manual"))
            run_id = cursor.fetchone()["id"]
            connection.commit()
            received = None
            try:
                key = stored_token(cursor)
                connection.commit()
                with official_client(key) as client:
                    path = "players/%23" + player[1:]
                    profile = fetch(client, path)
                    publish_progress(connection, cursor, run_id, "battlelog")
                    log = fetch(client, path + "/battlelog")
                if profile.get("tag") != player or not isinstance(profile.get("name"), str):
                    raise CollectionError(502, "O perfil retornado não corresponde à conta configurada.")
                if not isinstance(log.get("items"), list):
                    raise CollectionError(502, "A resposta não contém o histórico esperado.")
                received = len(log["items"])
                publish_progress(connection, cursor, run_id, "saving", received, 0)
                try:
                    battles = [parse_battle(item, player) for item in log["items"]]
                except (KeyError, AttributeError, TypeError, ValueError) as exc:
                    raise CollectionError(502, "Estrutura de partida inesperada. A atualização foi revertida.") from exc
                cursor.execute(
                    "INSERT INTO account_profile (player_tag,player_name,raw,fetched_at) VALUES (%s,%s,%s,%s) "
                    "ON CONFLICT (player_tag) DO UPDATE SET player_name=EXCLUDED.player_name, raw=EXCLUDED.raw, "
                    "fetched_at=EXCLUDED.fetched_at", (player, profile["name"], encoded(profile), utc_now()),
                )
                observed_at = utc_now()
                added = 0
                with database() as (progress_connection, progress_cursor):
                    for processed, battle in enumerate(battles, 1):
                        inserted = save_battle(cursor, battle)
                        added += inserted
                        observed = bool(inserted and previous_success and
                                        previous_success["started_at"] <= battle["played_at"] <= observed_at)
                        cursor.execute(
                            "INSERT INTO battle_collection (battle_id, first_seen_at, delay_observed, last_run_id) "
                            "VALUES (%s,%s,%s,%s) ON CONFLICT (battle_id) DO UPDATE SET last_run_id=EXCLUDED.last_run_id",
                            (battle["id"], observed_at, observed, run_id),
                        )
                        if processed % 5 == 0 or processed == received:
                            publish_progress(progress_connection, progress_cursor, run_id, "saving", received, processed)
                if previous_success and len(battles) >= 25 and added == len(battles):
                    cursor.execute(
                        "INSERT INTO collection_state (player_tag, last_possible_gap) VALUES (%s,%s) "
                        "ON CONFLICT (player_tag) DO UPDATE SET last_possible_gap=EXCLUDED.last_possible_gap", (player, observed_at),
                    )
                record_profile_reading(cursor, player, run_id, observed_at, profile)
                cursor.execute("UPDATE update_log SET finished_at=%s, status='success', received=%s, added=%s, processed=%s "
                               "WHERE id=%s", (utc_now(), received, added, received, run_id))
                connection.commit()
                return {"run_id": run_id, "received": received, "added": added}
            except (CollectionError, psycopg.Error) as exc:
                connection.rollback()
                message = str(exc.detail) if isinstance(exc, CollectionError) else "Falha de persistência no PostgreSQL."
                if isinstance(exc, CollectionError) and exc.status_code == 429:
                    remember_retry(cursor, player, exc)
                cursor.execute("UPDATE update_log SET finished_at=%s, status='error', received=%s, message=%s "
                               "WHERE id=%s", (utc_now(), received, message, run_id))
                connection.commit()
                raise
        finally:
            connection.rollback()
            cursor.execute("SELECT pg_advisory_unlock(hashtextextended(%s, 0))", (lock_name,))


def record_profile_reading(cursor, player, run_id, at, profile):
    rank, score, season = ranked_reading(profile)
    readings = (integer(profile.get("trophies")), score, rank, season)
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
