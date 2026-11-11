"""Run one collection and exit. Render supplies the schedule."""
import logging

import psycopg

from ..config import account, api_token
from ..db import prepare_collection
from ..services.collection import collect_account
from ..services.supercell import CollectionError


LOG = logging.getLogger("brawl.cron")


def main():
    try:
        account()
        if not api_token():
            LOG.error("Configure BRAWL_API_TOKEN no cron.")
            return 1
        prepare_collection()
        result = collect_account(scheduled=True)
    except CollectionError as exc:
        LOG.error("Coleta falhou (HTTP %s): %s", exc.status_code, exc.detail)
        return 1
    except psycopg.Error:
        LOG.error("Falha de conexão ou persistência no PostgreSQL.")
        return 1
    except RuntimeError as exc:
        LOG.error("%s", exc)
        return 1
    if result is None:
        LOG.info("Coleta em pausa ou em execução no servidor.")
    else:
        LOG.info("Coleta concluída: %s recebidas, %s novas.", result["received"], result["added"])
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    raise SystemExit(main())
