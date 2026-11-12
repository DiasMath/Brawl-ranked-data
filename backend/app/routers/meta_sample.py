from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..db import database
from ..domain import tag, utc_now
from ..repositories.accounts import list_accounts
from ..repositories.history import retry_until
from ..services.credentials import stored_token
from ..services.meta_sample import choose_players, sample_players, sample_report, save_sample
from ..services.meta_tracker import enqueue_players, pause_tracker
from ..services.supercell import CollectionError, official_client


router = APIRouter()


class SampleRequest(BaseModel):
    tag: str = Field(default="", max_length=17)


@router.get("/api/meta/sample")
def read_sample():
    with database() as (_, cursor):
        return sample_report(cursor)


@router.post("/api/meta/sample")
def collect_sample(request: SampleRequest):
    try:
        requested = tag(request.tag) if request.tag.strip() else None
    except ValueError as error:
        raise HTTPException(422, "Informe uma tag pública válida.") from error

    with database() as (connection, cursor):
        cursor.execute("SELECT pg_try_advisory_xact_lock(hashtextextended('brawl:sync', 0)) AS acquired")
        if not cursor.fetchone()["acquired"]:
            raise CollectionError(409, "Já existe uma coleta em andamento.")
        until = retry_until(cursor)
        if until and until > utc_now():
            raise CollectionError(429, "A coleta está em pausa após limite da Supercell.")
        excluded = {account["tag"] for account in list_accounts(cursor)}
        if requested in excluded:
            raise HTTPException(422, "Escolha a tag de um jogador de fora das contas monitoradas.")
        key = stored_token(cursor)
        players = [requested] if requested else []
        try:
            with official_client(key) as client:
                if not requested:
                    players = choose_players(client, excluded)
                if not players:
                    raise CollectionError(502, "A classificação pública veio sem jogadores para a amostra.")
                battles, failed = sample_players(client, players)
        except CollectionError as error:
            if error.status_code == 429:
                pause_tracker(cursor, error)
                connection.commit()
            raise
        added = save_sample(cursor, battles)
        enqueue_players(cursor, players, utc_now())
        return {"players": len(players), "failed": failed, "received": len(battles), "added": added,
                "report": sample_report(cursor)}
