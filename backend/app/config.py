import os
import re

from .domain import tag


def service_token():
    return os.getenv("BRAWL_SERVICE_TOKEN", "").strip()


def collection_environment():
    environment = os.getenv("BRAWL_ENVIRONMENT", "production").strip()
    if environment not in {"development", "production"}:
        raise RuntimeError("Use development ou production em BRAWL_ENVIRONMENT.")
    return environment


def initial_account():
    configured = os.getenv("BRAWL_PLAYER_TAG", "").strip()
    if not configured:
        return None
    try:
        return tag(configured)
    except ValueError as exc:
        raise RuntimeError("Configure BRAWL_PLAYER_TAG com uma tag válida.") from exc


def collection_interval():
    seconds = int(os.getenv("BRAWL_COLLECTION_INTERVAL_SECONDS", "300"))
    if seconds != 0 and seconds < 60:
        raise ValueError("BRAWL_COLLECTION_INTERVAL_SECONDS deve ser 0 ou de pelo menos 60 segundos.")
    return seconds


def meta_min_elo():
    value = int(os.getenv("BRAWL_META_MIN_ELO", "8250"))
    if value < 1:
        raise ValueError("BRAWL_META_MIN_ELO precisa ser positivo.")
    return value


def meta_batch_size():
    value = int(os.getenv("BRAWL_META_PLAYERS_PER_RUN", "10"))
    if not 1 <= value <= 100:
        raise ValueError("BRAWL_META_PLAYERS_PER_RUN precisa estar entre 1 e 100.")
    return value


def meta_regions():
    configured = os.getenv("BRAWL_META_REGIONS", "global")
    regions = tuple(dict.fromkeys(
        "global" if value.strip().lower() == "global" else value.strip().upper()
        for value in configured.split(",") if value.strip()
    ))
    if not regions or any(region != "global" and not re.fullmatch(r"[A-Z]{2}", region) for region in regions):
        raise ValueError("Use global ou códigos de país de duas letras em BRAWL_META_REGIONS, separados por vírgula.")
    return regions
