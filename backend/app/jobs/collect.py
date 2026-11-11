"""Collect registered players and exit. Render supplies the schedule."""
import logging

import psycopg

from ..config import api_token
from ..db import database, prepare_collection
from ..repositories.accounts import list_accounts
from ..services.collection import collect_account
from ..services.supercell import CollectionError


LOG = logging.getLogger("brawl.cron")


def main():
    if not api_token():
        LOG.error("Configure BRAWL_API_TOKEN no cron.")
        return 1
    try:
        prepare_collection()
        with database() as (_, cursor):
            players = list_accounts(cursor)
        if not players:
            LOG.info("Nenhuma conta monitorada.")
            return 0
        failed = False
        for player in players:
            tag = player["tag"]
            try:
                result = collect_account(tag, scheduled=True)
            except CollectionError as exc:
                LOG.error("Coleta de %s falhou (HTTP %s): %s", tag, exc.status_code, exc.detail)
                failed = True
                if exc.status_code in (401, 403, 429):
                    break
                continue
            if result is None:
                LOG.info("Coleta em pausa ou em execução no servidor.")
                break
            LOG.info("%s: %s recebidas, %s novas.", tag, result["received"], result["added"])
        return int(failed)
    except psycopg.Error:
        LOG.error("Falha de conexão ou persistência no PostgreSQL.")
        return 1
    except RuntimeError as exc:
        LOG.error("%s", exc)
        return 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    raise SystemExit(main())
