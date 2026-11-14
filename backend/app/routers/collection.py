import json

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from ..config import collection_interval
from ..db import database
from ..domain import iso, utc_now
from ..repositories.history import dataset, latest_run, retry_until, update_page
from ..services.collection import collect_account
from ..services.credentials import credential_status
from .accounts import require_player


router = APIRouter()


@router.post("/api/sync")
def sync(tag: str):
    with database() as (_, cursor):
        player = require_player(cursor, tag)
    return collect_account(player)


@router.get("/api/collection/status")
def collection_status(tag: str | None = None):
    with database() as (_, cursor):
        player = require_player(cursor, tag)
        last_attempt = latest_run(cursor, player)
        last_success = latest_run(cursor, player, successful=True)
        last_scheduled = latest_run(cursor, player, successful=True, scheduled=True)
        cursor.execute("SELECT MAX(played_at) AS latest FROM battles WHERE player_tag=%s", (player,))
        latest_battle = cursor.fetchone()["latest"]
        cursor.execute("SELECT MAX(e.recorded_at) AS latest FROM battle_evidence e "
                       "JOIN battles b ON b.id=e.battle_id WHERE b.player_tag=%s", (player,))
        latest_evidence = cursor.fetchone()["latest"]
        cursor.execute("SELECT last_possible_gap FROM collection_state WHERE player_tag=%s", (player,))
        state = cursor.fetchone() or {}
        waiting = retry_until(cursor)
        credential = credential_status(cursor)
    return {
        "player_tag": player, "configured": credential["configured"] and credential["encryption_configured"],
        "interval_seconds": collection_interval(),
        "last_attempt": {**last_attempt, "started_at": iso(last_attempt["started_at"]),
                         "finished_at": iso(last_attempt["finished_at"])} if last_attempt else None,
        "last_success": iso(last_success["finished_at"]) if last_success else None,
        "last_scheduled_success": iso(last_scheduled["finished_at"]) if last_scheduled else None,
        "last_battle": iso(latest_battle), "last_evidence": iso(latest_evidence),
        "last_possible_gap": iso(state.get("last_possible_gap")),
        "retry_until": iso(waiting) if waiting and waiting > utc_now() else None,
    }


@router.get("/api/collection/history")
def collection_history(after: int = 0, tag: str | None = None):
    with database() as (_, cursor):
        cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        player = require_player(cursor, tag)
        latest = latest_run(cursor, player, successful=True)
        run_id = latest["id"] if latest else 0
        snapshot = dataset(cursor, player, after_run=after if 0 < after <= run_id else 0,
                           include_archive=True, include_updates=False)
        return {"run_id": run_id, "snapshot": snapshot}


@router.get("/api/collection/updates")
def collection_updates(tag: str | None = None, before: int | None = Query(None, gt=0, le=999_999_999_999_999),
                       limit: int = Query(15, ge=1, le=100)):
    with database() as (_, cursor):
        return update_page(cursor, require_player(cursor, tag), before, limit)


@router.get("/api/dataset")
def get_dataset(tag: str | None = None):
    with database() as (_, cursor):
        return dataset(cursor, require_player(cursor, tag))


@router.get("/api/export")
def export(tag: str | None = None):
    with database() as (_, cursor):
        from fastapi.encoders import jsonable_encoder
        data = jsonable_encoder(dataset(cursor, require_player(cursor, tag), include_archive=True))
    return JSONResponse(data, headers={"Content-Disposition": 'attachment; filename="brawl-snapshot.json"'})


@router.get("/api/battles/{battle_id}")
def raw_battle(battle_id: str, tag: str | None = None):
    with database() as (_, cursor):
        cursor.execute("SELECT raw FROM battles WHERE player_tag=%s AND id=%s", (require_player(cursor, tag), battle_id))
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(404, "Partida não encontrada.")
        return json.loads(row["raw"])
