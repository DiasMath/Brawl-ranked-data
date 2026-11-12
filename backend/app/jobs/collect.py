"""Collect one explicitly selected player and exit."""
import logging
import os

import psycopg

from ..config import collection_environment
from ..db import database, prepare_collection
from ..repositories.accounts import find_player
from ..services.collection import collect_account
from ..services.supercell import CollectionError
from .collect_meta import main as collect_meta


LOG = logging.getLogger("brawl.cron")


def collect_selected():
    requested = os.getenv("BRAWL_SCHEDULED_PLAYER_TAG", "").strip()
    if not requested:
        LOG.info("Coleta pessoal agendada desativada. Defina BRAWL_SCHEDULED_PLAYER_TAG para monitorar uma conta.")
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


def main():
    personal_status = collect_selected()
    if os.getenv("BRAWL_META_COLLECT", "").strip() == "1":
        return max(personal_status, collect_meta())
    return personal_status


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    raise SystemExit(main())
