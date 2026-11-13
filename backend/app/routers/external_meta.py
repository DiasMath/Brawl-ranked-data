from datetime import date

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from ..db import database
from ..repositories.external_meta import latest_snapshot, save_snapshot, saved_patches
from ..services.draftmeta import fetch_snapshot
from ..services.supercell import CollectionError


router = APIRouter()


class ExternalMetaRequest(BaseModel):
    map: str = Field(default="", max_length=100)


@router.get("/api/meta/external")
def read_external_meta(map: str = Query(default="", max_length=100), patch: date | None = None):
    scope = map.strip()
    with database() as (_, cursor):
        return {"snapshot": latest_snapshot(cursor, scope, patch), "patches": saved_patches(cursor, scope)}


@router.post("/api/meta/external")
def refresh_external_meta(request: ExternalMetaRequest):
    scope = request.map.strip()
    with database() as (_, cursor):
        cursor.execute("SELECT pg_try_advisory_xact_lock(hashtextextended('brawl:external-meta', 0)) AS acquired")
        if not cursor.fetchone()["acquired"]:
            raise CollectionError(409, "Já existe uma atualização de estatísticas externas em andamento.")
        snapshot = latest_snapshot(cursor, scope)
        if snapshot and snapshot["fresh"]:
            return {"snapshot": snapshot, "patches": saved_patches(cursor, scope), "cached": True}
        payload = fetch_snapshot(scope or None)
        if snapshot and (payload["patch_date"], payload["end"]) < (snapshot["patch_date"], snapshot["end"]):
            raise CollectionError(502, "O DraftMeta retornou um patch anterior à última leitura salva.")
        save_snapshot(cursor, scope, payload)
        return {"snapshot": latest_snapshot(cursor, scope), "patches": saved_patches(cursor, scope), "cached": False}
