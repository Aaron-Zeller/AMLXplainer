import os

from models.db import create_db_and_tables, get_session
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware import Middleware

from routes.dummy import router as dummy_router
from routes.transactions import router as transactions_router
from services.bootstrap_seed import maybe_seed_from_sample
from services.full_dataset_bootstrap import maybe_start_full_dataset_bootstrap
from services.ml_model import maybe_start_prediction_cache_warmup


def normalize_origin(origin: str) -> str:
    stripped = origin.strip()
    if not stripped:
        return stripped
    if stripped.startswith("http://") or stripped.startswith("https://"):
        return stripped
    return f"https://{stripped}"

origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:8003,http://127.0.0.1:8003",
).split(",")

cors_middleware = Middleware(
    CORSMiddleware,
    allow_origins=[normalize_origin(o) for o in origins if o.strip()],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app = FastAPI(
    title="XAI/IML'26 Backend API",
    version="1.0.0",
    middleware=[cors_middleware]
)

@app.on_event("startup")
def on_startup():
    create_db_and_tables()
    with get_session() as session:
        seeded_from_sample = maybe_seed_from_sample(session)
    started_full_bootstrap = maybe_start_full_dataset_bootstrap()
    maybe_start_prediction_cache_warmup()
    if started_full_bootstrap and seeded_from_sample:
        print("Seeded dashboard sample immediately while full AMLworld bootstrap runs in the background.")

app.include_router(dummy_router)
app.include_router(transactions_router)


@app.get("/health", tags=["Monitoring"])
async def health():
    return {"status": "ok"}
