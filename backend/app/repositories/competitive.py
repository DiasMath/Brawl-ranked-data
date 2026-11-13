from datetime import UTC, timedelta
from zoneinfo import ZoneInfo

from ..config import collection_environment
from ..domain import iso


BRASILIA = ZoneInfo("America/Sao_Paulo")


def local_day(value):
    return value.replace(tzinfo=UTC).astimezone(BRASILIA).date().isoformat()


def competitive_periods(cursor, now):
    cursor.execute("""
        SELECT id, label, earliest_at, latest_at, source_url
        FROM ranked_patches WHERE earliest_at <= %s
        ORDER BY earliest_at DESC LIMIT 2
    """, (now,))
    patches = cursor.fetchall()
    periods = {}
    end = now
    for key, patch in zip(("patch", "previous_patch"), patches):
        start = patch["latest_at"]
        periods[key] = {"id": patch["id"], "label": patch["label"], "start_at": start,
                        "end_at": end, "source_url": patch["source_url"],
                        "date_only": patch["earliest_at"] != start}
        end = patch["earliest_at"]
    cursor.execute("""
        SELECT id, label, starts_at, ends_at, source_url, date_only FROM ranked_seasons
        WHERE starts_at <= %s ORDER BY starts_at DESC LIMIT 1
    """, (now,))
    season = cursor.fetchone()
    if season:
        periods["season"] = {"id": season["id"], "label": season["label"],
                             "start_at": season["starts_at"], "end_at": min(now, season["ends_at"]),
                             "source_url": season["source_url"], "date_only": season["date_only"]}
    return periods


def public_period(period):
    start, end = period["start_at"], period["end_at"]
    return {**period, "start_at": iso(start), "end_at": iso(end),
            "start": local_day(start), "end": local_day(max(start, end - timedelta(milliseconds=1)))}


def sampled_battles(cursor, start, end):
    cursor.execute("""
        SELECT played_at, map_name, mode, team_a, team_b, winner, observed_elo,
               ((played_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date AS day
        FROM meta_sample_battles WHERE played_at >= %s AND played_at < %s
    """, (start, end))
    return cursor.fetchall()


def collection_diagnostics(cursor):
    cursor.execute("""
        SELECT pg_database_size(current_database()) AS database_bytes,
               pg_total_relation_size('meta_sample_battles') AS sample_bytes,
               pg_total_relation_size('battles') + pg_total_relation_size('battle_players') AS account_battle_bytes
    """)
    sizes = cursor.fetchone()
    cursor.execute("""
        SELECT COUNT(*) AS sample_records,
               COUNT(*) FILTER (WHERE played_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '24 hours')
                 AS played_last_24h
        FROM meta_sample_battles
    """)
    counts = cursor.fetchone()
    cursor.execute("""
        SELECT finished_at, origin, environment, profile_requests, battlelog_requests, ranking_requests,
               unique_received, added, status
        FROM meta_collection_runs ORDER BY finished_at DESC, id DESC LIMIT 1
    """)
    run = cursor.fetchone()
    if run:
        run["finished_at"] = iso(run["finished_at"])
    return {**sizes, **counts, "last_run": run}


def record_collection(cursor, origin, requests, received, added, status):
    cursor.execute("""
        INSERT INTO meta_collection_runs (finished_at, origin, environment, profile_requests,
                                          battlelog_requests, ranking_requests, unique_received, added, status)
        VALUES (clock_timestamp() AT TIME ZONE 'UTC', %s, %s, %s, %s, %s, %s, %s, %s)
    """, (origin, collection_environment(), requests.profiles, requests.battlelogs, requests.rankings,
          received, added, status))
