from __future__ import annotations

import csv
import hashlib
import math
import os
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

UTC = timezone.utc


REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_RAW_INPUT = REPO_ROOT / "mockup" / "data_sources" / "HI-Medium_Trans.csv"
DEFAULT_BANK_MAPPING_INPUT = REPO_ROOT / "mockup" / "data_sources" / "bank_id_mapping.csv"
DEFAULT_CONTAINER_RAW_INPUT = Path("/usr/src/data_sources/HI-Medium_Trans.csv")
DEFAULT_CONTAINER_FALLBACK_RAW_INPUT = Path("/usr/src/data_sources/ibm_transactions_for_aml.csv")
FALLBACK_CONTAINER_RAW_INPUT = Path("/data_sources/ibm_transactions_for_aml.csv")
DEFAULT_CONTAINER_BANK_MAPPING_INPUT = Path("/usr/src/data_sources/bank_id_mapping.csv")
FALLBACK_CONTAINER_BANK_MAPPING_INPUT = Path("/data_sources/bank_id_mapping.csv")
TARGET_POSITIVE_SAMPLE = 250
TARGET_NEGATIVE_SAMPLE = 4300
ALERT_THRESHOLD = 0.56
COUNTRIES = ["CH", "DE", "SG", "GB", "AE", "US", "HK", "NL"]
CURRENCY_CODE_MAP = {
    "Australian Dollar": "AUD",
    "Brazil Real": "BRL",
    "Canadian Dollar": "CAD",
    "Euro": "EUR",
    "Mexican Peso": "MXN",
    "Pound Sterling": "GBP",
    "Ruble": "RUB",
    "Rupee": "INR",
    "Saudi Riyal": "SAR",
    "Swiss Franc": "CHF",
    "US Dollar": "USD",
    "Yen": "JPY",
    "Yuan": "CNY",
}


@dataclass(frozen=True)
class IngestionPaths:
    raw_input: Path
    bank_mapping_input: Path


def get_ingestion_paths() -> IngestionPaths:
    raw_input_env = os.getenv("AMLWORLD_CSV_PATH")
    bank_mapping_env = os.getenv("BANK_MAPPING_CSV_PATH")

    raw_input = Path(raw_input_env).expanduser().resolve() if raw_input_env else DEFAULT_RAW_INPUT
    bank_mapping_input = (
        Path(bank_mapping_env).expanduser().resolve()
        if bank_mapping_env
        else DEFAULT_BANK_MAPPING_INPUT
    )

    if not raw_input.exists() and DEFAULT_CONTAINER_RAW_INPUT.exists():
        raw_input = DEFAULT_CONTAINER_RAW_INPUT
    if not raw_input.exists() and DEFAULT_CONTAINER_FALLBACK_RAW_INPUT.exists():
        raw_input = DEFAULT_CONTAINER_FALLBACK_RAW_INPUT
    if not raw_input.exists() and FALLBACK_CONTAINER_RAW_INPUT.exists():
        raw_input = FALLBACK_CONTAINER_RAW_INPUT
    if not bank_mapping_input.exists() and DEFAULT_CONTAINER_BANK_MAPPING_INPUT.exists():
        bank_mapping_input = DEFAULT_CONTAINER_BANK_MAPPING_INPUT
    if not bank_mapping_input.exists() and FALLBACK_CONTAINER_BANK_MAPPING_INPUT.exists():
        bank_mapping_input = FALLBACK_CONTAINER_BANK_MAPPING_INPUT

    return IngestionPaths(raw_input=raw_input, bank_mapping_input=bank_mapping_input)


def canonicalize_bank_id(bank_id: str) -> str:
    normalized = bank_id.strip()
    digits_only = normalized.lstrip("0")
    return digits_only or "0"


def load_bank_name_mapping(bank_mapping_input: Path) -> dict[str, str]:
    if not bank_mapping_input.exists():
        return {}

    with bank_mapping_input.open(newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        return {
            canonicalize_bank_id(row["Bank ID"]): row["Bank Name"].strip()
            for row in reader
            if row.get("Bank ID") and row.get("Bank Name")
        }


def stable_int(*parts: str) -> int:
    payload = "||".join(parts).encode("utf-8")
    return int(hashlib.sha256(payload).hexdigest()[:16], 16)


def stable_unit(*parts: str) -> float:
    return stable_int(*parts) / float(16**16 - 1)


def bank_to_country(bank_code: str) -> str:
    return COUNTRIES[stable_int(bank_code) % len(COUNTRIES)]


def to_timestamp(raw_timestamp: str) -> datetime:
    parsed = datetime.strptime(raw_timestamp, "%Y/%m/%d %H:%M")
    return parsed.replace(tzinfo=UTC)


def normalize_currency(raw_currency: str) -> str:
    return CURRENCY_CODE_MAP.get(raw_currency, raw_currency)


def resolve_bank_name(bank_id: str, bank_name_by_id: dict[str, str]) -> str:
    normalized_bank_id = canonicalize_bank_id(bank_id)
    return bank_name_by_id.get(normalized_bank_id, f"Bank {normalized_bank_id}")


def build_record_key(row: dict[str, str]) -> str:
    return "|".join(
        [
            row["Timestamp"].strip(),
            row["From Bank"].strip(),
            row["From Account"].strip(),
            row["To Bank"].strip(),
            row["To Account"].strip(),
            row["Amount Paid"].strip(),
            row["Payment Currency"].strip(),
        ],
    )


def iter_raw_transaction_rows(raw_input: Path) -> Iterable[dict[str, str]]:
    with raw_input.open(newline="") as csv_file:
        reader = csv.reader(csv_file)
        raw_headers = next(reader)
        account_index = 0
        headers: list[str] = []

        for header in raw_headers:
            if header == "Account":
                account_index += 1
                headers.append("From Account" if account_index == 1 else "To Account")
                continue

            headers.append(header)

        for row in reader:
            yield dict(zip(headers, row, strict=False))


def count_raw_transaction_rows(raw_input: Path) -> int:
    with raw_input.open(newline="") as csv_file:
        return max(sum(1 for _ in csv_file) - 1, 0)


def derive_model_outputs(
    row_id: str,
    amount_paid: float,
    payment_format: str,
    actual_positive: bool,
) -> tuple[bool, float]:
    detection_roll = stable_unit(row_id, "detect")
    score_roll = stable_unit(row_id, "score")
    amount_component = min(math.log10(max(amount_paid, 1.0)) / 7.0, 1.0) * 0.06
    format_component = 0.03 if payment_format in {"Wire", "Cheque"} else 0.0

    if actual_positive:
        predicted_alert = detection_roll < 0.89
        base_score = 0.72 + score_roll * 0.24 if predicted_alert else 0.20 + score_roll * 0.24
    else:
        predicted_alert = detection_roll < 0.08
        base_score = 0.56 + score_roll * 0.18 if predicted_alert else 0.02 + score_roll * 0.34

    model_score = round(max(0.02, min(0.98, base_score + amount_component + format_component)), 4)
    predicted_alert = model_score >= ALERT_THRESHOLD
    return predicted_alert, model_score


def normalize_row(
    row: dict[str, str],
    bank_name_by_id: dict[str, str],
    dashboard_sample_keys: set[str] | None = None,
) -> dict[str, object]:
    record_key = build_record_key(row)
    from_bank_id = row["From Bank"].strip()
    to_bank_id = row["To Bank"].strip()
    actual_positive = row["Is Laundering"] == "1"
    amount_received = float(row["Amount Received"])
    amount_paid = float(row["Amount Paid"])
    predicted_alert, model_score = derive_model_outputs(
        row_id=record_key,
        amount_paid=amount_paid,
        payment_format=row["Payment Format"],
        actual_positive=actual_positive,
    )

    return {
        "record_key": record_key,
        "timestamp": to_timestamp(row["Timestamp"]),
        "from_bank": resolve_bank_name(from_bank_id, bank_name_by_id),
        "from_account": row["From Account"].strip(),
        "from_country": bank_to_country(from_bank_id),
        "to_bank": resolve_bank_name(to_bank_id, bank_name_by_id),
        "to_account": row["To Account"].strip(),
        "to_country": bank_to_country(to_bank_id),
        "amount_received": round(amount_received, 2),
        "receiving_currency": normalize_currency(row["Receiving Currency"].strip()),
        "amount_paid": round(amount_paid, 2),
        "payment_currency": normalize_currency(row["Payment Currency"].strip()),
        "payment_format": row["Payment Format"].strip(),
        "is_laundering": actual_positive,
        "predicted_alert": predicted_alert,
        "model_score": model_score,
        "is_dashboard_sample": record_key in (dashboard_sample_keys or set()),
    }


def build_dashboard_sample_keys(
    raw_input: Path,
    *,
    target_positive_sample: int = TARGET_POSITIVE_SAMPLE,
    target_negative_sample: int = TARGET_NEGATIVE_SAMPLE,
    max_rows: int | None = None,
) -> set[str]:
    rng = random.Random(42)
    positives: list[str] = []
    negatives: list[str] = []
    total_positive = 0
    total_negative = 0

    for index, row in enumerate(iter_raw_transaction_rows(raw_input)):
        if max_rows is not None and index >= max_rows:
            break

        record_key = build_record_key(row)
        is_positive = row["Is Laundering"] == "1"

        if is_positive:
            total_positive += 1
            if len(positives) < target_positive_sample:
                positives.append(record_key)
                continue

            replacement_index = rng.randint(0, total_positive - 1)
            if replacement_index < target_positive_sample:
                positives[replacement_index] = record_key
            continue

        total_negative += 1
        if len(negatives) < target_negative_sample:
            negatives.append(record_key)
            continue

        replacement_index = rng.randint(0, total_negative - 1)
        if replacement_index < target_negative_sample:
            negatives[replacement_index] = record_key

    return set(positives + negatives)


def iter_normalized_rows(
    raw_input: Path,
    bank_mapping_input: Path,
    *,
    dashboard_sample_keys: set[str] | None = None,
    max_rows: int | None = None,
) -> Iterable[dict[str, object]]:
    bank_name_by_id = load_bank_name_mapping(bank_mapping_input)

    for index, row in enumerate(iter_raw_transaction_rows(raw_input)):
        if max_rows is not None and index >= max_rows:
            break

        yield normalize_row(row, bank_name_by_id, dashboard_sample_keys)
