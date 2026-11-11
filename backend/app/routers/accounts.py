from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..db import database
from ..domain import tag
from ..repositories.accounts import find_player, list_accounts, save_account


router = APIRouter()


class AccountInput(BaseModel):
    tag: str = Field(min_length=3, max_length=30)


def require_player(cursor, requested):
    try:
        player = find_player(cursor, requested)
    except ValueError as exc:
        raise HTTPException(422, "Informe uma tag de jogador válida.") from exc
    if not player:
        raise HTTPException(404, "Cadastre ou selecione uma conta monitorada.")
    return player


@router.get("/api/accounts")
def accounts():
    with database() as (_, cursor):
        return list_accounts(cursor)


@router.post("/api/accounts")
def register_account(data: AccountInput):
    try:
        player = tag(data.tag)
    except ValueError as exc:
        raise HTTPException(422, "Informe uma tag de jogador válida.") from exc
    with database() as (_, cursor):
        save_account(cursor, player)
        return next(row for row in list_accounts(cursor) if row["tag"] == player)
