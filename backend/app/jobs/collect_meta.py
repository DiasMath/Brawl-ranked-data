"""Refresh one batch of the competitive sample."""
import argparse
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path

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


def cli():
    parser = argparse.ArgumentParser(description="Executa uma rodada da coleta da Meta.")
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--environment", choices=("development", "production"))
    parser.add_argument("--players-per-run", type=int, choices=range(1, 101), metavar="1-100")
    parser.add_argument("--regions")
    parser.add_argument("--log-file", type=Path)
    args = parser.parse_args()
    logging_options = {"level": logging.INFO, "format": "%(asctime)s %(levelname)s %(message)s"}
    if args.log_file:
        logging_options["handlers"] = [RotatingFileHandler(
            args.log_file, maxBytes=1_000_000, backupCount=2, encoding="utf-8",
        )]
    logging.basicConfig(**logging_options)
    if args.env_file:
        if not args.env_file.is_file():
            LOG.error("Arquivo de ambiente ausente: %s", args.env_file)
            return 1
        from dotenv import load_dotenv
        load_dotenv(args.env_file, override=True)
    if args.environment:
        os.environ["BRAWL_ENVIRONMENT"] = args.environment
    if args.players_per_run is not None:
        os.environ["BRAWL_META_PLAYERS_PER_RUN"] = str(args.players_per_run)
    if args.regions is not None:
        os.environ["BRAWL_META_REGIONS"] = args.regions
    return main()


if __name__ == "__main__":
    raise SystemExit(cli())
