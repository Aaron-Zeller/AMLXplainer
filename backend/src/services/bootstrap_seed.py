from __future__ import annotations

import csv
import json
import os
from datetime import datetime
from pathlib import Path

from sqlalchemy import text
from sqlmodel import Session, select

from models.schemas import Transaction
from services.dashboard_api import refresh_global_alert_queue_cache, refresh_global_dashboard_summary_cache


ASSET_DIRS = [
    Path(__file__).resolve().parents[1] / "assets",
    Path(__file__).resolve().parents[2] / "assets",
]


def resolve_asset_path(filename: str) -> Path:
    for asset_dir in ASSET_DIRS:
        candidate = asset_dir / filename
        if candidate.exists():
            return candidate

    return ASSET_DIRS[0] / filename


def get_bootstrap_seed_path() -> Path:
    configured_path = os.getenv("BOOTSTRAP_SAMPLE_PATH")
    if configured_path:
        return Path(configured_path)

    return resolve_asset_path("ibm_aml_frontend_sample.json")


def get_dashboard_sample_csv_path() -> Path:
    configured_path = os.getenv("BOOTSTRAP_DASHBOARD_SAMPLE_CSV_PATH")
    if configured_path:
        return Path(configured_path)

    return resolve_asset_path("dashboard_sample.csv")


def build_record_key(record: dict[str, object]) -> str:
    return "|".join(
        [
            str(record["timestamp"]),
            str(record["fromBank"]),
            str(record["fromAccount"]),
            str(record["toBank"]),
            str(record["toAccount"]),
            str(record["amountPaid"]),
            str(record["paymentCurrency"]),
        ],
    )


def parse_csv_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "t", "true", "yes"}


def parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def build_transaction_from_csv_row(row: dict[str, str]) -> Transaction:
    return Transaction(
        id=int(row["id"]),
        record_key=row["record_key"],
        timestamp=parse_timestamp(row["timestamp"]),
        from_bank=row["from_bank"],
        from_account=row["from_account"],
        from_country=row["from_country"],
        to_bank=row["to_bank"],
        to_account=row["to_account"],
        to_country=row["to_country"],
        amount_received=float(row["amount_received"]),
        receiving_currency=row["receiving_currency"],
        amount_paid=float(row["amount_paid"]),
        payment_currency=row["payment_currency"],
        payment_format=row["payment_format"],
        is_laundering=parse_csv_bool(row["is_laundering"]),
        predicted_alert=parse_csv_bool(row["predicted_alert"]),
        model_score=float(row["model_score"]),
        is_dashboard_sample=parse_csv_bool(row["is_dashboard_sample"]),
    )


def seed_from_dashboard_sample_csv(session: Session, sample_path: Path) -> bool:
    with sample_path.open(newline="") as csv_file:
        rows = [row for row in csv.DictReader(csv_file)]

    if not rows:
        return False

    has_data = session.exec(select(Transaction.id).limit(1)).first() is not None
    if not has_data:
        session.add_all([build_transaction_from_csv_row(row) for row in rows])
        session.commit()
        session.exec(
            text(
                "SELECT setval(pg_get_serial_sequence('transactions', 'id'), "
                "COALESCE((SELECT MAX(id) FROM transactions), 1), true)",
            ),
        )
        session.commit()
        refresh_global_dashboard_summary_cache(session)
        refresh_global_alert_queue_cache(session)
        return True

    upsert_statement = text(
        """
        INSERT INTO transactions (
            record_key,
            timestamp,
            from_bank,
            from_account,
            from_country,
            to_bank,
            to_account,
            to_country,
            amount_received,
            receiving_currency,
            amount_paid,
            payment_currency,
            payment_format,
            is_laundering,
            predicted_alert,
            model_score,
            is_dashboard_sample
        )
        VALUES (
            :record_key,
            :timestamp,
            :from_bank,
            :from_account,
            :from_country,
            :to_bank,
            :to_account,
            :to_country,
            :amount_received,
            :receiving_currency,
            :amount_paid,
            :payment_currency,
            :payment_format,
            :is_laundering,
            :predicted_alert,
            :model_score,
            :is_dashboard_sample
        )
        ON CONFLICT (record_key) DO UPDATE SET
            timestamp = EXCLUDED.timestamp,
            from_bank = EXCLUDED.from_bank,
            from_account = EXCLUDED.from_account,
            from_country = EXCLUDED.from_country,
            to_bank = EXCLUDED.to_bank,
            to_account = EXCLUDED.to_account,
            to_country = EXCLUDED.to_country,
            amount_received = EXCLUDED.amount_received,
            receiving_currency = EXCLUDED.receiving_currency,
            amount_paid = EXCLUDED.amount_paid,
            payment_currency = EXCLUDED.payment_currency,
            payment_format = EXCLUDED.payment_format,
            is_laundering = EXCLUDED.is_laundering,
            predicted_alert = EXCLUDED.predicted_alert,
            model_score = EXCLUDED.model_score,
            is_dashboard_sample = TRUE
        """,
    )
    session.execute(
        upsert_statement,
        [
            {
                "record_key": row["record_key"],
                "timestamp": parse_timestamp(row["timestamp"]),
                "from_bank": row["from_bank"],
                "from_account": row["from_account"],
                "from_country": row["from_country"],
                "to_bank": row["to_bank"],
                "to_account": row["to_account"],
                "to_country": row["to_country"],
                "amount_received": float(row["amount_received"]),
                "receiving_currency": row["receiving_currency"],
                "amount_paid": float(row["amount_paid"]),
                "payment_currency": row["payment_currency"],
                "payment_format": row["payment_format"],
                "is_laundering": parse_csv_bool(row["is_laundering"]),
                "predicted_alert": parse_csv_bool(row["predicted_alert"]),
                "model_score": float(row["model_score"]),
                "is_dashboard_sample": parse_csv_bool(row["is_dashboard_sample"]),
            }
            for row in rows
        ],
    )
    session.commit()
    refresh_global_dashboard_summary_cache(session)
    refresh_global_alert_queue_cache(session)
    return True


def seed_from_legacy_json_sample(session: Session, sample_path: Path) -> bool:
    sample_records = json.loads(sample_path.read_text())
    transactions = [
        Transaction(
            record_key=build_record_key(record),
            timestamp=datetime.fromisoformat(str(record["timestamp"]).replace("Z", "+00:00")),
            from_bank=str(record["fromBank"]),
            from_account=str(record["fromAccount"]),
            from_country=str(record["fromCountry"]),
            to_bank=str(record["toBank"]),
            to_account=str(record["toAccount"]),
            to_country=str(record["toCountry"]),
            amount_received=float(record["amountReceived"]),
            receiving_currency=str(record["receivingCurrency"]),
            amount_paid=float(record["amountPaid"]),
            payment_currency=str(record["paymentCurrency"]),
            payment_format=str(record["paymentFormat"]),
            is_laundering=bool(record["isLaundering"]),
            predicted_alert=bool(record["predictedAlert"]),
            model_score=float(record["modelScore"]),
            is_dashboard_sample=True,
        )
        for record in sample_records
    ]

    session.add_all(transactions)
    session.commit()
    refresh_global_dashboard_summary_cache(session)
    refresh_global_alert_queue_cache(session)
    return True


def maybe_seed_from_sample(session: Session) -> bool:
    csv_sample_path = get_dashboard_sample_csv_path()
    if csv_sample_path.exists():
        dashboard_positive_count = int(
            session.exec(
                select(Transaction.id)
                .where(Transaction.is_dashboard_sample.is_(True))
                .where(Transaction.is_laundering.is_(True))
                .limit(1),
            ).first()
            is not None,
        )
        if dashboard_positive_count:
            return False

        return seed_from_dashboard_sample_csv(session, csv_sample_path)

    has_data = session.exec(select(Transaction.id).limit(1)).first() is not None
    if has_data:
        return False

    sample_path = get_bootstrap_seed_path()
    if not sample_path.exists():
        return False

    return seed_from_legacy_json_sample(session, sample_path)
