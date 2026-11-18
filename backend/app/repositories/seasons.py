from datetime import UTC, datetime

from psycopg.types.json import Jsonb

from ..domain import iso


def list_seasons(cursor):
    cursor.execute("SELECT id, label, starts_at, ends_at, source_url, date_only FROM ranked_seasons ORDER BY starts_at")
    return [{**row, "starts_at": iso(row["starts_at"]), "ends_at": iso(row["ends_at"])}
            for row in cursor.fetchall()]


def calendar_revision(cursor):
    cursor.execute("""
        SELECT md5(COALESCE(string_agg(
            id || '|' || label || '|' || starts_at::text || '|' || ends_at::text || '|' ||
            source_url || '|' || date_only::text, ';' ORDER BY starts_at, id), '')) AS revision
        FROM ranked_seasons
    """)
    return cursor.fetchone()["revision"]


def update_season(cursor, season_id, starts_at, label, source_url, date_only):
    cursor.execute("SELECT pg_advisory_xact_lock(hashtextextended('brawl:season-calendar', 0))")
    rows = list_seasons(cursor)
    position = next((index for index, row in enumerate(rows) if row["id"] == season_id), None)
    if position is None:
        raise ValueError("Temporada não encontrada no calendário.")
    current = rows[position]
    start = starts_at.astimezone(UTC).replace(tzinfo=None)
    end = datetime.fromisoformat(current["ends_at"].replace("Z", "+00:00")).replace(tzinfo=None)
    previous = rows[position - 1] if position else None
    previous_start = datetime.fromisoformat(previous["starts_at"].replace("Z", "+00:00")).replace(tzinfo=None) if previous else None
    if start >= end or (previous_start is not None and start <= previous_start):
        raise ValueError("O início deve ficar entre o início da temporada anterior e o fim desta temporada.")
    if previous:
        cursor.execute("UPDATE ranked_seasons SET ends_at=%s WHERE id=%s", (start, previous["id"]))
    cursor.execute("""
        UPDATE ranked_seasons SET starts_at=%s, label=%s, source_url=%s, date_only=%s WHERE id=%s
    """, (start, label, source_url, date_only, season_id))
    updated = list_seasons(cursor)
    cursor.execute("""
        INSERT INTO ranked_season_changes (season_id, previous_value, next_value) VALUES (%s,%s,%s)
    """, (season_id, Jsonb(rows), Jsonb(updated)))
    return updated
