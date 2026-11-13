from contextlib import contextmanager
import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

from .config import initial_account


ROOT = Path(__file__).resolve().parent


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
        cursor.execute("CREATE SCHEMA IF NOT EXISTS brawl_secrets")
        for statement in schema.split(";"):
            if statement.strip():
                cursor.execute(statement)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("SELECT version FROM schema_migrations")
        applied = {row["version"] for row in cursor.fetchall()}
        for migration in sorted((ROOT / "migrations").glob("*.sql")):
            if migration.stem not in applied:
                cursor.execute(migration.read_text(encoding="utf-8"))
                cursor.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (migration.stem,))
        player = initial_account()
        if player:
            cursor.execute("INSERT INTO tracked_accounts (player_tag) VALUES (%s) ON CONFLICT DO NOTHING", (player,))
        cursor.execute("""
            INSERT INTO tracked_accounts (player_tag)
            SELECT player_tag FROM account_profile
            ON CONFLICT DO NOTHING
        """)
        connection.commit()
