import re

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from ..db import database
from ..services.credentials import credential_cipher, credential_status, store_token
from ..services.supercell import fetch, official_client


router = APIRouter()


@router.get("/api/supercell/credential")
def supercell_credential():
    with database() as (_, cursor):
        return credential_status(cursor)


def validate_and_store(token):
    cipher = credential_cipher()
    with official_client(token) as client:
        fetch(client, "brawlers")
    with database() as (_, cursor):
        store_token(cursor, token, cipher)
        return credential_status(cursor)


@router.post("/api/supercell/credential")
async def save_supercell_credential(request: Request):
    try:
        payload = await request.json()
    except ValueError:
        payload = None
    token = payload.get("token") if isinstance(payload, dict) else None
    if not isinstance(token, str):
        raise HTTPException(422, "Informe a chave da Supercell.")
    token = token.strip()
    if not 1 <= len(token) <= 4096 or not re.fullmatch(r"[A-Za-z0-9._~+/-]+=*", token):
        raise HTTPException(422, "Formato inválido. Cole apenas a chave emitida pela Supercell.")
    return await run_in_threadpool(validate_and_store, token)
