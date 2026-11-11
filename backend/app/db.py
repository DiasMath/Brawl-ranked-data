from contextlib import contextmanager
import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row


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
        for statement in schema.split(";"):
            if statement.strip():
                cursor.execute(statement)
        connection.commit()
