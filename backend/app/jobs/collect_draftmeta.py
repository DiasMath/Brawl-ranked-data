"""Refresh DraftMeta snapshots for the whole published Ranked map pool."""
import argparse
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
from time import sleep

import httpx
import psycopg

from ..db import database, prepare_collection
from ..repositories.external_meta import latest_snapshot, save_coverage, save_current_snapshot
from ..services.draftmeta import draftmeta_session, ranked_pool, read_tier
from ..services.supercell import CollectionError


LOG = logging.getLogger("brawl.draftmeta")


def collect_pool(cursor, connection):
    with draftmeta_session() as client:
        maps = ranked_pool(client)
        changes = client.call("meta_changes", update="latest")
        general = read_tier(client, changes)
        patch = general["patch_date"]
        previous = latest_snapshot(cursor, "")
        if not save_current_snapshot(cursor, "", general, previous):
            raise CollectionError(502, "O DraftMeta retornou um patch ou período anterior ao salvo.")
        results = [{"name": name, "status": "pending"} for name in maps]
        save_coverage(cursor, patch, results)
        connection.commit()
        limited = None
        for entry in results:
            name = entry["name"]
            sleep(1.25)
            try:
                with connection.transaction():
                    snapshot = read_tier(client, changes, name)
                    if not save_current_snapshot(cursor, name, snapshot, latest_snapshot(cursor, name)):
                        raise ValueError("Patch ou período anterior ao salvo")
                entry["status"] = "updated"
            except httpx.HTTPStatusError as error:
                entry["status"] = "unavailable"
                LOG.warning("%s: HTTP %s.", name, error.response.status_code)
                if error.response.status_code == 429:
                    limited = error
            except (httpx.RequestError, ValueError, KeyError, TypeError, AttributeError) as error:
                entry["status"] = "unavailable"
                LOG.warning("%s: dados indisponíveis (%s).", name, type(error).__name__)
            save_coverage(cursor, patch, results)
            connection.commit()
            if limited:
                break
        if limited:
            raise limited
    updated = sum(entry["status"] == "updated" for entry in results)
    LOG.info("Patch %s · geral atualizado · %s de %s mapas atualizados.", patch, updated, len(results))
    return int(updated != len(results))


def main():
    try:
        prepare_collection()
        with database() as (connection, cursor):
            cursor.execute("SELECT pg_try_advisory_lock(hashtextextended('brawl:external-meta', 0)) AS acquired")
            if not cursor.fetchone()["acquired"]:
                LOG.info("Já existe uma atualização do DraftMeta em andamento.")
                return 0
            return collect_pool(cursor, connection)
    except CollectionError as error:
        LOG.error("Falha na atualização do DraftMeta (HTTP %s): %s", error.status_code, error.detail)
    except (psycopg.Error, RuntimeError):
        LOG.error("Falha de conexão ou persistência no PostgreSQL. Confira DATABASE_URL.")
    return 1


def cli():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--log-file", type=Path)
    args = parser.parse_args()
    options = {"level": logging.INFO, "format": "%(asctime)s %(levelname)s %(message)s"}
    if args.log_file:
        options["handlers"] = [RotatingFileHandler(args.log_file, maxBytes=1_000_000, backupCount=2, encoding="utf-8")]
    logging.basicConfig(**options)
    if args.env_file:
        if not args.env_file.is_file():
            LOG.error("Arquivo de ambiente ausente: %s", args.env_file)
            return 1
        from dotenv import load_dotenv
        load_dotenv(args.env_file, override=True)
    return main()


if __name__ == "__main__":
    raise SystemExit(cli())
