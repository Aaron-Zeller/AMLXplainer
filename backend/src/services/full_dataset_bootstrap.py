from __future__ import annotations

import os
import threading

from sqlalchemy import func
from sqlmodel import Session, select

from models.db import engine
from models.schemas import Transaction
from services.amlworld import count_raw_transaction_rows, get_ingestion_paths
from services.ingest_runtime import ingest_amlworld_into_database


_bootstrap_lock = threading.Lock()
_bootstrap_started = False


def should_bootstrap_full_dataset() -> bool:
    return os.getenv("BOOTSTRAP_FULL_DATASET_ON_EMPTY_DB", "true").lower() in {"1", "true", "yes"}


def maybe_start_full_dataset_bootstrap() -> bool:
    global _bootstrap_started

    if not should_bootstrap_full_dataset():
        return False

    ingestion_paths = get_ingestion_paths()
    if not ingestion_paths.raw_input.exists() or not ingestion_paths.bank_mapping_input.exists():
        return False

    with _bootstrap_lock:
        if _bootstrap_started:
            return False

        with Session(engine) as session:
            sample_count = int(
                session.exec(
                    select(func.count()).select_from(Transaction).where(Transaction.is_dashboard_sample.is_(True)),
                ).one(),
            )
            total_count = int(session.exec(select(func.count()).select_from(Transaction)).one())

        source_row_count = count_raw_transaction_rows(ingestion_paths.raw_input)
        if total_count >= source_row_count:
            return False

        _bootstrap_started = True

    thread = threading.Thread(target=_run_full_dataset_bootstrap, daemon=True)
    thread.start()
    return True


def _run_full_dataset_bootstrap() -> None:
    try:
        total_inserted = ingest_amlworld_into_database(replace_existing=False, skip_if_existing=False)
        print(f"Completed background AMLworld bootstrap with {total_inserted} inserted rows.")
    except Exception as error:  # pragma: no cover - operational logging path
        print(f"Full AMLworld bootstrap failed: {error}")
