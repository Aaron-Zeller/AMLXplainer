from __future__ import annotations

from collections.abc import Iterable

from psycopg2.extras import execute_values
from sqlmodel import Session, select

from models.db import engine
from models.schemas import Transaction
from services.amlworld import (
    build_dashboard_sample_keys,
    get_ingestion_paths,
    iter_normalized_rows,
)
from services.dashboard_api import refresh_global_alert_queue_cache, refresh_global_dashboard_summary_cache


INSERT_COLUMNS = [
    "record_key",
    "timestamp",
    "from_bank",
    "from_account",
    "from_country",
    "to_bank",
    "to_account",
    "to_country",
    "amount_received",
    "receiving_currency",
    "amount_paid",
    "payment_currency",
    "payment_format",
    "is_laundering",
    "predicted_alert",
    "model_score",
    "is_dashboard_sample",
]


def batched(rows: Iterable[dict[str, object]], batch_size: int) -> Iterable[list[dict[str, object]]]:
    batch: list[dict[str, object]] = []
    for row in rows:
      batch.append(row)
      if len(batch) >= batch_size:
          yield batch
          batch = []

    if batch:
        yield batch


def ingest_amlworld_into_database(
    *,
    batch_size: int = 5_000,
    max_rows: int | None = None,
    replace_existing: bool = False,
    skip_if_existing: bool = True,
) -> int:
    ingestion_paths = get_ingestion_paths()

    if not ingestion_paths.raw_input.exists():
        raise FileNotFoundError(f"AML CSV not found: {ingestion_paths.raw_input}")

    if not ingestion_paths.bank_mapping_input.exists():
        raise FileNotFoundError(f"Bank mapping CSV not found: {ingestion_paths.bank_mapping_input}")

    with Session(engine) as session:
        if not replace_existing and skip_if_existing:
            existing_count = int(session.exec(select(Transaction.id)).first() is not None)
            if existing_count:
                return 0

    dashboard_sample_keys = build_dashboard_sample_keys(
        ingestion_paths.raw_input,
        max_rows=max_rows,
    )

    if replace_existing:
        with engine.begin() as connection:
            connection.exec_driver_sql("DROP TABLE IF EXISTS transactions")
            connection.exec_driver_sql("DROP TABLE IF EXISTS transaction")
            connection.exec_driver_sql("DROP TABLE IF EXISTS global_dashboard_baseline_cache")
            connection.exec_driver_sql("DROP TABLE IF EXISTS global_alert_queue_cache")

        from models.db import create_db_and_tables

        create_db_and_tables()

    raw_connection = engine.raw_connection()
    total_inserted = 0
    try:
        with raw_connection.cursor() as cursor:
            insert_sql = f"""
                INSERT INTO transactions ({", ".join(INSERT_COLUMNS)})
                VALUES %s
                ON CONFLICT (record_key) DO NOTHING
            """

            for batch in batched(
                iter_normalized_rows(
                    ingestion_paths.raw_input,
                    ingestion_paths.bank_mapping_input,
                    dashboard_sample_keys=dashboard_sample_keys,
                    max_rows=max_rows,
                ),
                batch_size,
            ):
                values = [tuple(row[column] for column in INSERT_COLUMNS) for row in batch]
                execute_values(cursor, insert_sql, values, page_size=batch_size)
                inserted_count = cursor.rowcount if cursor.rowcount > 0 else 0
                raw_connection.commit()
                total_inserted += inserted_count
                print(f"Inserted {total_inserted} AMLworld rows")
    finally:
        raw_connection.close()

    with Session(engine) as session:
        refresh_global_dashboard_summary_cache(session)
        refresh_global_alert_queue_cache(session)

    return total_inserted
