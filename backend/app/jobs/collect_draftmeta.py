"""Refresh DraftMeta snapshots for the whole published Ranked map pool."""
import argparse
from contextlib import contextmanager
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


class DatabaseStepError(Exception):
    def __init__(self, step, error):
        self.step = step
        self.error = error
        super().__init__(step)


@contextmanager
def database_step(step):
    try:
        yield
    except (psycopg.Error, RuntimeError) as error:
        raise DatabaseStepError(step, error) from error


def database_diagnostic(error):
    code = getattr(error, "sqlstate", None)
    if isinstance(error, RuntimeError):
        return "configuração do backend inválida (confira DATABASE_URL e BRAWL_PLAYER_TAG)", False
    if code in {"28P01", "28000"}:
        return "autenticação do banco recusada", False
    if code == "42501":
        return "usuário do banco sem permissão para a operação", False
    if code in {"53300", "57P01", "57P02", "57P03"} or (code and code.startswith("08")):
        return "conexão indisponível, interrompida ou temporariamente limitada", True
    # libpq may have no SQLSTATE before the connection is established.
    # Inspect the message without logging it, since it may include connection details.
    message = str(error).casefold()
    if not code and isinstance(error, psycopg.OperationalError):
        if any(part in message for part in ("authentication failed", "tenant or user not found", "wrong password")):
            return "autenticação ou identificação do usuário/pooler recusada", False
        if any(part in message for part in ("certificate", "ssl error", "ssl is not enabled")):
            return "falha na negociação TLS com o banco", False
        if any(part in message for part in ("could not translate host name", "getaddrinfo", "name or service not known")):
            return "falha na resolução do endereço do banco", True
        if any(part in message for part in ("timeout", "timed out", "connection refused", "connection reset",
                                            "server closed the connection", "network is unreachable")):
            return "tempo de conexão excedido ou conexão interrompida", True
    return "falha de conexão ou persistência", False


def log_database_failure(failure, *, retrying=False):
    error = failure.error
    diagnosis, _ = database_diagnostic(error)
    LOG.log(logging.WARNING if retrying else logging.ERROR,
            "PostgreSQL · %s · %s (%s, SQLSTATE %s).%s", failure.step, diagnosis,
            type(error).__name__, getattr(error, "sqlstate", None) or "indisponível",
            " Nova tentativa em 5 segundos." if retrying else "")


def collect_pool(cursor, connection):
    with draftmeta_session() as client:
        maps = ranked_pool(client)
        changes = client.call("meta_changes", update="latest")
        general = read_tier(client, changes)
        patch = general["patch_date"]
        results = [{"name": name, "status": "pending"} for name in maps]
        with database_step("gravação da Meta geral"):
            if not save_current_snapshot(cursor, "", general, latest_snapshot(cursor, "")):
                raise CollectionError(502, "O DraftMeta retornou um patch ou período anterior ao salvo.")
            save_coverage(cursor, patch, results)
            connection.commit()
        limited = None
        for entry in results:
            name = entry["name"]
            sleep(1.25)
            snapshot = None
            try:
                snapshot = read_tier(client, changes, name)
            except httpx.HTTPStatusError as error:
                LOG.warning("%s: HTTP %s.", name, error.response.status_code)
                if error.response.status_code == 429:
                    limited = error
            except (httpx.RequestError, ValueError, KeyError, TypeError, AttributeError) as error:
                LOG.warning("%s: dados indisponíveis (%s).", name, type(error).__name__)
            with database_step(f"gravação do mapa {name}"):
                saved = snapshot is not None and save_current_snapshot(cursor, name, snapshot, latest_snapshot(cursor, name))
                if snapshot is not None and not saved:
                    LOG.warning("%s: patch ou período anterior ao salvo.", name)
                entry["status"] = "updated" if saved else "unavailable"
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
    for attempt in range(2):
        fetching = False
        try:
            with database_step("preparação do banco e das migrações"):
                prepare_collection()
            with database_step("conexão e bloqueio da coleta"):
                with database() as (connection, cursor):
                    cursor.execute("SELECT pg_try_advisory_lock(hashtextextended('brawl:external-meta', 0)) AS acquired")
                    if not cursor.fetchone()["acquired"]:
                        LOG.info("Já existe uma atualização do DraftMeta em andamento.")
                        return 0
                    connection.commit()
                    fetching = True
                    return collect_pool(cursor, connection)
        except DatabaseStepError as failure:
            _, transient = database_diagnostic(failure.error)
            retrying = attempt == 0 and not fetching and transient
            log_database_failure(failure, retrying=retrying)
            if retrying:
                sleep(5)
                continue
        except CollectionError as error:
            LOG.error("Falha na atualização do DraftMeta (HTTP %s): %s", error.status_code, error.detail)
        return 1
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
