from __future__ import annotations

import csv
import hashlib
import json
import math
import random
from datetime import datetime, timezone
from pathlib import Path

MOCKUP_ROOT = Path(__file__).resolve().parents[1]
RAW_INPUT = MOCKUP_ROOT / "data_sources" / "ibm_transactions_for_aml.csv"
BANK_MAPPING_INPUT = MOCKUP_ROOT / "data_sources" / "bank_id_mapping.csv"
OUTPUT_PATH = MOCKUP_ROOT / "frontend" / "public" / "ibm_aml_frontend_sample.json"
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


def canonicalize_bank_id(bank_id: str) -> str:
    normalized = bank_id.strip()
    digits_only = normalized.lstrip("0")
    return digits_only or "0"


def load_bank_name_mapping() -> dict[str, str]:
    if not BANK_MAPPING_INPUT.exists():
        return {}

    with BANK_MAPPING_INPUT.open(newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        return {
            canonicalize_bank_id(row["Bank ID"]): row["Bank Name"].strip()
            for row in reader
            if row.get("Bank ID") and row.get("Bank Name")
        }


BANK_NAME_BY_ID = load_bank_name_mapping()


def stable_int(*parts: str) -> int:
    payload = "||".join(parts).encode("utf-8")
    return int(hashlib.sha256(payload).hexdigest()[:16], 16)


def stable_unit(*parts: str) -> float:
    return stable_int(*parts) / float(16**16 - 1)


def bank_to_country(bank_code: str) -> str:
    return COUNTRIES[stable_int(bank_code) % len(COUNTRIES)]


def to_iso_timestamp(raw_timestamp: str) -> str:
    parsed = datetime.strptime(raw_timestamp, "%Y/%m/%d %H:%M")
    return parsed.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_currency(raw_currency: str) -> str:
    return CURRENCY_CODE_MAP.get(raw_currency, raw_currency)


def resolve_bank_name(bank_id: str) -> str:
    normalized_bank_id = canonicalize_bank_id(bank_id)
    return BANK_NAME_BY_ID.get(normalized_bank_id, f"Bank {normalized_bank_id}")


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


def normalize_row(row: dict[str, str]) -> dict[str, object]:
    timestamp = to_iso_timestamp(row["Timestamp"])
    from_bank_id = row["From Bank"].strip()
    to_bank_id = row["To Bank"].strip()
    from_bank = resolve_bank_name(from_bank_id)
    to_bank = resolve_bank_name(to_bank_id)
    from_country = bank_to_country(from_bank_id)
    to_country = bank_to_country(to_bank_id)
    amount_received = float(row["Amount Received"])
    amount_paid = float(row["Amount Paid"])
    actual_positive = row["Is Laundering"] == "1"
    row_id = "|".join(
        [
            row["Timestamp"],
            from_bank_id,
            row["From Account"],
            to_bank_id,
            row["To Account"],
            row["Amount Paid"],
            row["Payment Currency"],
        ]
    )
    predicted_alert, model_score = derive_model_outputs(
        row_id=row_id,
        amount_paid=amount_paid,
        payment_format=row["Payment Format"],
        actual_positive=actual_positive,
    )

    return {
        "timestamp": timestamp,
        "fromBank": from_bank,
        "fromAccount": row["From Account"],
        "fromCountry": from_country,
        "toBank": to_bank,
        "toAccount": row["To Account"],
        "toCountry": to_country,
        "amountReceived": round(amount_received, 2),
        "receivingCurrency": normalize_currency(row["Receiving Currency"]),
        "amountPaid": round(amount_paid, 2),
        "paymentCurrency": normalize_currency(row["Payment Currency"]),
        "paymentFormat": row["Payment Format"],
        "isLaundering": actual_positive,
        "predictedAlert": predicted_alert,
        "modelScore": model_score,
    }


def build_frontend_dataset() -> tuple[list[dict[str, object]], dict[str, int]]:
    rng = random.Random(42)
    positives: list[dict[str, object]] = []
    negative_sample: list[dict[str, object]] = []
    total_rows = 0
    total_positive = 0
    total_negative = 0

    with RAW_INPUT.open(newline="") as csv_file:
        reader = csv.DictReader(csv_file)

        for raw_row in reader:
            total_rows += 1
            normalized = normalize_row(raw_row)

            if normalized["isLaundering"]:
                total_positive += 1
                if len(positives) < TARGET_POSITIVE_SAMPLE:
                    positives.append(normalized)
                    continue

                replacement_index = rng.randint(0, total_positive - 1)
                if replacement_index < TARGET_POSITIVE_SAMPLE:
                    positives[replacement_index] = normalized
                continue

            total_negative += 1
            if len(negative_sample) < TARGET_NEGATIVE_SAMPLE:
                negative_sample.append(normalized)
                continue

            replacement_index = rng.randint(0, total_negative - 1)
            if replacement_index < TARGET_NEGATIVE_SAMPLE:
                negative_sample[replacement_index] = normalized

    records = positives + negative_sample
    records.sort(key=lambda record: str(record["timestamp"]))
    predicted_alerts = sum(1 for record in records if record["predictedAlert"])

    return records, {
        "total_rows": total_rows,
        "total_positive_rows": total_positive,
        "total_negative_rows": total_negative,
        "frontend_records": len(records),
        "frontend_positive_rows": len(positives),
        "frontend_negative_rows": len(negative_sample),
        "frontend_predicted_alerts": predicted_alerts,
    }


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    records, summary = build_frontend_dataset()

    with OUTPUT_PATH.open("w") as output_file:
        json.dump(records, output_file, separators=(",", ":"))

    print(json.dumps({"output": str(OUTPUT_PATH), **summary}, indent=2))


if __name__ == "__main__":
    main()
