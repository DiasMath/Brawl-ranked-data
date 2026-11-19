from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from ..db import database
from ..repositories.external_meta import coverage, latest_bans, latest_snapshot, save_bans, save_current_snapshot, saved_maps, saved_patches
from ..services.draftmeta import draftmeta_session, fetch_draft_suggestions, fetch_snapshot
from ..services.external_bans import read_bans
from ..services.supercell import CollectionError


router = APIRouter()


RankScope = Literal["masters", "all"]


class ExternalMetaRequest(BaseModel):
    map: str = Field(default="", max_length=100)
    rank: RankScope = "masters"


BrawlerName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
MapName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class DraftSuggestionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    map: MapName
    our_picks: list[BrawlerName] = Field(max_length=3)
    enemy_picks: list[BrawlerName] = Field(max_length=3)
    bans: list[BrawlerName] = Field(max_length=6)
    first_pick: bool
    rank: RankScope = "masters"

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
    return fetch_draft_suggestions(request.map, request.our_picks, request.enemy_picks, request.bans, request.first_pick, rank=request.rank)


@router.get("/api/meta/bans")
def read_external_bans(map: str = Query(default="", max_length=100), patch: date | None = None,
                       rank: RankScope = "masters"):
    with database() as (_, cursor):
        return {"snapshot": latest_bans(cursor, map.strip(), patch, rank=rank)}


@router.post("/api/meta/bans")
def refresh_external_bans(request: ExternalMetaRequest):
    scope = request.map.strip()
    with database() as (_, cursor):
        cursor.execute("SELECT pg_try_advisory_xact_lock(hashtextextended(%s,0)) AS acquired",
                       (f"brawl:external-bans:{request.rank}:{scope}",))
        if not cursor.fetchone()["acquired"]:
            raise CollectionError(409, "Já existe uma atualização de bans deste recorte.")
        previous = latest_bans(cursor, scope, rank=request.rank)
        if previous and previous["fresh"]:
            return {"snapshot": previous, "cached": True}
        with draftmeta_session() as client:
            changes = client.call("meta_changes", update="latest")
            payload = read_bans(client, changes, scope or None, rank=request.rank)
            save_bans(cursor, scope, payload)
        return {"snapshot": latest_bans(cursor, scope, rank=request.rank), "cached": False}


@router.get("/api/meta/external")
def read_external_meta(map: str = Query(default="", max_length=100), patch: date | None = None,
                       rank: RankScope = "masters"):
    scope = map.strip()
    with database() as (_, cursor):
        return {"snapshot": latest_snapshot(cursor, scope, patch, rank=rank), "patches": saved_patches(cursor, scope, rank=rank),
                "coverage": coverage(cursor, patch, rank=rank), "saved_maps": saved_maps(cursor, rank=rank)}


@router.post("/api/meta/external")
def refresh_external_meta(request: ExternalMetaRequest):
    scope = request.map.strip()
    rank = request.rank
    with database() as (_, cursor):
        cursor.execute("SELECT pg_try_advisory_xact_lock(hashtextextended('brawl:external-meta', 0)) AS acquired")
        if not cursor.fetchone()["acquired"]:
            raise CollectionError(409, "Já existe uma atualização de estatísticas externas em andamento.")
        snapshot = latest_snapshot(cursor, scope, rank=rank)
        if snapshot and snapshot["fresh"]:
            return {"snapshot": snapshot, "patches": saved_patches(cursor, scope, rank=rank), "cached": True}
        payload = fetch_snapshot(scope or None, rank=rank)
        if not save_current_snapshot(cursor, scope, payload, snapshot):
            raise CollectionError(502, "O DraftMeta retornou um patch anterior à última leitura salva.")
        return {"snapshot": latest_snapshot(cursor, scope, rank=rank), "patches": saved_patches(cursor, scope, rank=rank), "cached": False}
