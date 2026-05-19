from __future__ import annotations

import argparse
from services.ingest_runtime import ingest_amlworld_into_database


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Load AMLworld CSV data into PostgreSQL.")
    parser.add_argument("--batch-size", type=int, default=5_000, help="Bulk insert batch size.")
    parser.add_argument(
        "--max-rows",
        type=int,
        default=None,
        help="Optional row limit for smoke testing the ingestion pipeline.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    total_inserted = ingest_amlworld_into_database(
        batch_size=args.batch_size,
        max_rows=args.max_rows,
        replace_existing=True,
    )
    print(f"Finished AMLworld ingestion. Inserted {total_inserted} rows.")


if __name__ == "__main__":
    main()
