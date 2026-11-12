import asyncio
from contextlib import asynccontextmanager
from hmac import compare_digest

import psycopg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .config import collection_environment, collection_interval, service_token
from .db import prepare_collection
from .routers import accounts, analysis, collection, credentials
from .services.supercell import CollectionError


@asynccontextmanager
async def lifespan(_app):
    if len(service_token()) < 32:
        raise RuntimeError("Configure BRAWL_SERVICE_TOKEN com pelo menos 32 caracteres.")
    collection_interval()
    collection_environment()
    await asyncio.to_thread(prepare_collection)
    yield


app = FastAPI(title="Brawl Ranked Data", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
app.include_router(accounts.router)
app.include_router(collection.router)
app.include_router(credentials.router)
app.include_router(analysis.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.middleware("http")
async def access_control(request: Request, call_next):
    if request.url.path == "/health" and request.method in {"GET", "HEAD"}:
        return await call_next(request)
    expected = service_token()
    received = request.headers.get("authorization", "").encode()
    if not expected or not compare_digest(received, ("Bearer " + expected).encode()):
        return JSONResponse({"detail": "Acesso privado."}, status_code=401, headers={"Cache-Control": "no-store"})
    response = await call_next(request)
    response.headers["Cache-Control"] = "private, no-store"
    return response


@app.exception_handler(CollectionError)
async def collection_error(_request, error):
    return JSONResponse({"detail": error.detail}, status_code=error.status_code, headers=error.headers)


@app.exception_handler(psycopg.Error)
async def db_error(_request, _exception):
    return JSONResponse({"detail": "PostgreSQL indisponível. Confira a conexão do backend com o banco de dados."}, 503)
