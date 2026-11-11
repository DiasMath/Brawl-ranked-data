import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from ..config import account, api_token, collection_interval
from ..db import database
from ..domain import iso, utc_now
from ..repositories.history import dataset, latest_run
from ..services.collection import collect_account


router = APIRouter()


@router.post("/api/sync")
def sync():
    return collect_account()


@router.get("/api/collection/status")
def collection_status():
    player = account()
    with database() as (_, cursor):
        last_attempt = latest_run(cursor, player)
        last_success = latest_run(cursor, player, successful=True)
        cursor.execute("SELECT MAX(played_at) AS latest FROM battles WHERE player_tag=%s", (player,))
        latest_battle = cursor.fetchone()["latest"]
        cursor.execute("SELECT last_possible_gap, retry_until FROM collection_state WHERE player_tag=%s", (player,))
        state = cursor.fetchone() or {}
    return {
        "player_tag": player, "configured": bool(api_token()), "interval_seconds": collection_interval(),
        "last_attempt": {**last_attempt, "started_at": iso(last_attempt["started_at"]),
                         "finished_at": iso(last_attempt["finished_at"])} if last_attempt else None,
        "last_success": iso(last_success["finished_at"]) if last_success else None,
        "last_battle": iso(latest_battle), "last_possible_gap": iso(state.get("last_possible_gap")),
        "retry_until": iso(state.get("retry_until")) if state.get("retry_until") and state["retry_until"] > utc_now() else None,
    }


@router.get("/api/collection/history")
def collection_history(after: int = 0):
    player = account()
    with database() as (_, cursor):
        cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        latest = latest_run(cursor, player, successful=True)
        run_id = latest["id"] if latest else 0
        snapshot = dataset(cursor, player, after_run=after if 0 < after <= run_id else 0, include_archive=True)
        return {"run_id": run_id, "snapshot": snapshot}


@router.get("/api/dataset")
def get_dataset():
    with database() as (_, cursor):
        return dataset(cursor, account())


@router.get("/api/export")
def export():
    with database() as (_, cursor):
        from fastapi.encoders import jsonable_encoder
        data = jsonable_encoder(dataset(cursor, account(), include_archive=True))
    return JSONResponse(data, headers={"Content-Disposition": 'attachment; filename="brawl-snapshot.json"'})


@router.get("/api/battles/{battle_id}")
def raw_battle(battle_id: str):
    with database() as (_, cursor):
        cursor.execute("SELECT raw FROM battles WHERE player_tag=%s AND id=%s", (account(), battle_id))
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(404, "Partida não encontrada.")
        return json.loads(row["raw"])
