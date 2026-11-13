"""Collect explicitly selected accounts and exit."""
import argparse
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path

import psycopg

from ..config import collection_environment
from ..db import database, prepare_collection
from ..domain import tag
from ..repositories.accounts import find_player
from ..services.collection import collect_account
from ..services.credentials import stored_token
from ..services.supercell import CollectionError
from .collect_meta import main as collect_meta


LOG = logging.getLogger("brawl.cron")


def collect_selected(requested=None, *, check=False):
    if requested is None:
        requested = (os.getenv("BRAWL_SCHEDULED_PLAYER_TAGS", "").strip()
                     or os.getenv("BRAWL_SCHEDULED_PLAYER_TAG", "").strip())
    if not requested:
        if check:
            LOG.error("Informe as tags a monitorar.")
            return 1
        LOG.info("Coleta pessoal agendada desativada. Configure BRAWL_SCHEDULED_PLAYER_TAGS.")
        return 0
    try:
        tags = list(dict.fromkeys(tag(value) for value in requested.split(",")))
        collection_environment()
        prepare_collection()
        with database() as (_, cursor):
            missing = [player for player in tags if find_player(cursor, player) is None]
            if missing:
                LOG.error("Cadastre estas contas em Contas e dados: %s.", ", ".join(missing))
                return 1
            if check:
                stored_token(cursor)
        if check:
            LOG.info("Banco, contas e chave cadastrada verificados. Contas: %s.", ", ".join(tags))
            return 0
        failed = False
        for player in tags:
            try:
                result = collect_account(player, scheduled=True)
            except CollectionError as error:
                LOG.error("%s: coleta falhou (HTTP %s): %s", player, error.status_code, error.detail)
                failed = True
                if error.status_code in (403, 429, 503):
                    break
                continue
            if result is None:
                LOG.info("Coleta em pausa ou em execução no servidor.")
                break
            LOG.info("%s: %s recebidas, %s novas.", player, result["received"], result["added"])
        return int(failed)
    except CollectionError as error:
        LOG.error("Verificação da coleta falhou (HTTP %s): %s", error.status_code, error.detail)
    except ValueError:
        LOG.error("Use uma lista de tags válidas, separadas por vírgula.")
    except psycopg.Error:
        LOG.error("Falha de conexão ou persistência no PostgreSQL.")
    except RuntimeError as error:
        LOG.error("%s", error)
    return 1


def main(requested=None, *, personal_only=False, check=False):
    personal_status = collect_selected(requested, check=check)
    if not (check or personal_only) and os.getenv("BRAWL_META_COLLECT", "").strip() == "1":
        return max(personal_status, collect_meta())
    return personal_status


def cli():
    parser = argparse.ArgumentParser(description="Atualiza as contas selecionadas na coleta pessoal.")
    parser.add_argument("--tags", help="Tags separadas por vírgula, cadastradas em Contas e dados.")
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--environment", choices=("development", "production"))
    parser.add_argument("--log-file", type=Path)
    parser.add_argument("--personal-only", action="store_true")
    parser.add_argument("--check", action="store_true", help="Verifica banco, contas e credencial cadastrada.")
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
    if args.environment:
        os.environ["BRAWL_ENVIRONMENT"] = args.environment
    return main(args.tags, personal_only=args.personal_only, check=args.check)


if __name__ == "__main__":
    raise SystemExit(cli())
