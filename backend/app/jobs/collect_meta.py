"""Refresh one batch of the competitive sample."""
import logging

import psycopg

from ..config import collection_environment
from ..db import prepare_collection
from ..services.meta_tracker import collect_competitive_sample
from ..services.supercell import CollectionError


LOG = logging.getLogger("brawl.meta")


def main():
    try:
        collection_environment()
        prepare_collection()
        result = collect_competitive_sample()
        if result is None:
            LOG.info("Sem contas vencidas na fila, ou coleta em pausa ou em andamento.")
            return 0
        LOG.info("%(checked)s perfis lidos · %(qualified)s qualificados · %(added)s partidas novas · %(failed)s falhas", result)
        return 0
    except CollectionError as error:
        LOG.error("Coleta da Meta falhou (HTTP %s): %s", error.status_code, error.detail)
    except psycopg.Error:
        LOG.error("Falha de conexão ou persistência no PostgreSQL.")
    except (ValueError, RuntimeError) as error:
        LOG.error("%s", error)
    return 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    raise SystemExit(main())
