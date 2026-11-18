from typing import Annotated

from fastapi import APIRouter, HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, HttpUrl, StringConstraints

from ..db import database
from ..repositories.seasons import calendar_revision, list_seasons, update_season


router = APIRouter()
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class SeasonInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: Label
    label: Label
    starts_at: AwareDatetime
    source_url: HttpUrl
    date_only: bool


@router.get("/api/seasons")
def seasons():
    with database() as (_, cursor):
        return {"seasons": list_seasons(cursor), "revision": calendar_revision(cursor)}


@router.post("/api/seasons")
def save_season(data: SeasonInput):
    if data.source_url.scheme != "https" or len(str(data.source_url)) > 400:
        raise HTTPException(422, "Informe uma fonte HTTPS com até 400 caracteres.")
    with database() as (_, cursor):
        try:
            rows = update_season(cursor, data.id, data.starts_at, data.label, str(data.source_url), data.date_only)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        return {"seasons": rows, "revision": calendar_revision(cursor)}
