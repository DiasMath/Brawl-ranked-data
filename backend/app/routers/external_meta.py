from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from ..db import database
from ..repositories.external_meta import coverage, latest_snapshot, save_current_snapshot, saved_maps, saved_patches
from ..services.draftmeta import fetch_draft_suggestions, fetch_snapshot
from ..services.supercell import CollectionError


router = APIRouter()


class ExternalMetaRequest(BaseModel):
    map: str = Field(default="", max_length=100)


BrawlerName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
MapName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class DraftSuggestionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    map: MapName
    our_picks: list[BrawlerName] = Field(max_length=3)
    enemy_picks: list[BrawlerName] = Field(max_length=3)
    bans: list[BrawlerName] = Field(max_length=6)
    first_pick: bool

    @model_validator(mode="after")
    def validate_turn(self):
        names = [name.casefold() for name in self.our_picks + self.enemy_picks + self.bans]
        if len(set(names)) != len(names):
            raise ValueError("Há brawlers repetidos na composição.")
        first, second = ("blue", "red") if self.first_pick else ("red", "blue")
        turn_order = (first, second, second, first, first, second)
        picks = len(self.our_picks) + len(self.enemy_picks)
        if (picks >= len(turn_order) or turn_order[picks] != "blue"
                or turn_order[:picks].count("blue") != len(self.our_picks)):
            raise ValueError("A composição precisa corresponder à vez da equipe azul.")
        return self


@router.post("/api/meta/draft-suggest")
def draft_suggestions(request: DraftSuggestionRequest):
    return fetch_draft_suggestions(request.map, request.our_picks, request.enemy_picks, request.bans, request.first_pick)


@router.get("/api/meta/external")
def read_external_meta(map: str = Query(default="", max_length=100), patch: date | None = None):
    scope = map.strip()
    with database() as (_, cursor):
        return {"snapshot": latest_snapshot(cursor, scope, patch), "patches": saved_patches(cursor, scope),
                "coverage": coverage(cursor, patch), "saved_maps": saved_maps(cursor)}


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
        if not save_current_snapshot(cursor, scope, payload, snapshot):
            raise CollectionError(502, "O DraftMeta retornou um patch anterior à última leitura salva.")
        return {"snapshot": latest_snapshot(cursor, scope), "patches": saved_patches(cursor, scope), "cached": False}
