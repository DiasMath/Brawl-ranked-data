"""Collect one explicitly selected player and exit."""
import logging
import os

import psycopg

from ..config import collection_environment
from ..db import database, prepare_collection
from ..repositories.accounts import find_player
from ..services.collection import collect_account
from ..services.supercell import CollectionError


LOG = logging.getLogger("brawl.cron")


def main():
    requested = os.getenv("BRAWL_SCHEDULED_PLAYER_TAG", "").strip()
    if not requested:
        LOG.info("Coleta agendada desativada. Defina BRAWL_SCHEDULED_PLAYER_TAG para monitorar uma conta.")
        return 0
    try:
        collection_environment()
        prepare_collection()
        with database() as (_, cursor):
            player = find_player(cursor, requested)
        if not player:
            LOG.error("A tag do agendamento precisa estar cadastrada em Contas e dados.")
            return 1
        result = collect_account(player, scheduled=True)
        if result is None:
            LOG.info("Coleta em pausa ou em execução no servidor.")
            return 0
        LOG.info("%s: %s recebidas, %s novas.", player, result["received"], result["added"])
        return 0
    except CollectionError as exc:
        LOG.error("Coleta falhou (HTTP %s): %s", exc.status_code, exc.detail)
        return 1
    except ValueError:
        LOG.error("Configure BRAWL_SCHEDULED_PLAYER_TAG com uma tag válida.")
        return 1
    except psycopg.Error:
        LOG.error("Falha de conexão ou persistência no PostgreSQL.")
        return 1
    except RuntimeError as exc:
        LOG.error("%s", exc)
        return 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    raise SystemExit(main())
