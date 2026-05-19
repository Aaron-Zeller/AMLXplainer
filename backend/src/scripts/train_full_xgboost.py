from __future__ import annotations

import math
import os
from datetime import datetime

import numpy as np
import psycopg2
import xgboost as xgb

from models.db import get_database_url
from services.ml_model import (
    CATEGORICAL_FEATURES,
    FALSE_NEGATIVE_COST,
    HASH_BUCKETS_BY_FEATURE,
    DatasetSplit,
    build_column_feature_keys,
    calculate_recall_biased_threshold,
    save_model_artifact,
    stable_bucket,
)


BATCH_SIZE = 100_000
NUM_BOOST_ROUND = int(os.getenv("FULL_XGB_NUM_BOOST_ROUND", "160"))
QUERY_COLUMNS = [
    "id",
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
]


def log(message: str) -> None:
    print(message, flush=True)


def get_dataset_split_and_positive_count() -> tuple[DatasetSplit, int]:
    with psycopg2.connect(get_database_url()) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                    min(id),
                    max(id),
                    count(*),
                    sum(case when is_laundering then 1 else 0 end)
                from transactions
                """,
            )
            min_id, max_id, record_count, positive_count = cursor.fetchone()

    min_id = int(min_id or 0)
    max_id = int(max_id or 0)
    return (
        DatasetSplit(
            min_id=min_id,
            split_id=min_id + ((max_id - min_id) // 2),
            max_id=max_id,
            record_count=int(record_count or 0),
        ),
        int(positive_count or 0),
    )


def numeric_timestamp_value(value: datetime) -> float:
    return (value.hour * 60 + value.minute) / (24 * 60)


def fill_feature_matrix(rows: list[tuple[object, ...]]) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    matrix = np.zeros((len(rows), len(build_column_feature_keys())), dtype=np.float32)
    labels = np.zeros(len(rows), dtype=np.float32)
    weights = np.ones(len(rows), dtype=np.float32)
    ids = np.zeros(len(rows), dtype=np.int64)

    for row_index, row in enumerate(rows):
        (
            transaction_id,
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
        ) = row

        ids[row_index] = int(transaction_id)
        matrix[row_index, 0] = numeric_timestamp_value(timestamp)
        matrix[row_index, 1] = math.log1p(max(float(amount_received), 0.0))
        matrix[row_index, 2] = math.log1p(max(float(amount_paid), 0.0))

        categorical_values = {
            "fromBank": from_bank,
            "fromAccount": from_account,
            "fromCountry": from_country,
            "toBank": to_bank,
            "toAccount": to_account,
            "toCountry": to_country,
            "receivingCurrency": receiving_currency,
            "paymentCurrency": payment_currency,
            "paymentFormat": payment_format,
        }
        column_index = 3
        for feature_key in CATEGORICAL_FEATURES:
            bucket_count = HASH_BUCKETS_BY_FEATURE[feature_key]
            bucket_index = stable_bucket(str(categorical_values[feature_key]), bucket_count)
            matrix[row_index, column_index + bucket_index] = 1.0
            column_index += bucket_count

        if is_laundering:
            labels[row_index] = 1.0
            weights[row_index] = FALSE_NEGATIVE_COST

    return matrix, labels, weights, ids


class TransactionDataIter(xgb.DataIter):
    def __init__(self, *, batch_size: int, cache_prefix: str):
        super().__init__(cache_prefix=cache_prefix, release_data=True)
        self.batch_size = batch_size
        self.connection = None
        self.cursor = None
        self.rows_seen = 0

    def reset(self) -> None:
        if self.cursor is not None:
            self.cursor.close()
        if self.connection is not None:
            self.connection.close()

        self.connection = psycopg2.connect(get_database_url())
        self.cursor = self.connection.cursor(name="full_xgboost_training_cursor")
        self.cursor.itersize = self.batch_size
        self.cursor.execute(f"select {', '.join(QUERY_COLUMNS)} from transactions order by id")
        self.rows_seen = 0

    def next(self, input_data) -> int:
        rows = self.cursor.fetchmany(self.batch_size)
        if not rows:
            return 0

        matrix, labels, weights, _ = fill_feature_matrix(rows)
        self.rows_seen += len(rows)
        if self.rows_seen % 1_000_000 < self.batch_size:
            log(f"streamed {self.rows_seen:,} training rows")
        input_data(data=matrix, label=labels, weight=weights)
        return 1


class TrainingProgressCallback(xgb.callback.TrainingCallback):
    def after_iteration(self, model, epoch: int, evals_log) -> bool:
        iteration = epoch + 1
        if iteration == 1 or iteration % 10 == 0 or iteration == NUM_BOOST_ROUND:
            log(f"completed boosting round {iteration}/{NUM_BOOST_ROUND}")
        return False


def iter_prediction_batches(batch_size: int):
    with psycopg2.connect(get_database_url()) as connection:
        with connection.cursor(name="full_xgboost_prediction_cursor") as cursor:
            cursor.itersize = batch_size
            cursor.execute(f"select {', '.join(QUERY_COLUMNS)} from transactions order by id")
            while True:
                rows = cursor.fetchmany(batch_size)
                if not rows:
                    break
                matrix, labels, _, ids = fill_feature_matrix(rows)
                yield matrix, labels, ids


def main() -> int:
    dataset_split, positive_count = get_dataset_split_and_positive_count()
    if dataset_split.record_count == 0:
        raise RuntimeError("No transactions found. Ingest the medium dataset before training.")

    log(f"training full XGBoost model on {dataset_split.record_count:,} rows")
    log(f"boosting rounds={NUM_BOOST_ROUND}")
    log(f"false negative cost multiplier={FALSE_NEGATIVE_COST}")
    training_iter = TransactionDataIter(
        batch_size=BATCH_SIZE,
        cache_prefix="/tmp/xgb_full_dataset_cache",
    )
    dtrain = xgb.ExtMemQuantileDMatrix(training_iter, max_bin=256)
    negative_count = dataset_split.record_count - positive_count
    scale_pos_weight = negative_count / max(positive_count, 1)
    booster = xgb.train(
        {
            "objective": "binary:logistic",
            "eval_metric": "aucpr",
            "max_depth": 4,
            "eta": 0.08,
            "subsample": 0.85,
            "colsample_bytree": 0.85,
            "min_child_weight": 8,
            "lambda": 2.0,
            "alpha": 0.3,
            "scale_pos_weight": scale_pos_weight,
            "tree_method": "hist",
            "seed": 42,
        },
        dtrain,
        num_boost_round=NUM_BOOST_ROUND,
        callbacks=[TrainingProgressCallback()],
        verbose_eval=False,
    )

    log("calculating full-dataset training threshold")
    scores = np.empty(dataset_split.record_count, dtype=np.float32)
    labels = np.empty(dataset_split.record_count, dtype=np.float32)
    offset = 0
    min_training_id = None
    max_training_id = None
    for matrix, batch_labels, ids in iter_prediction_batches(BATCH_SIZE):
        batch_scores = booster.predict(xgb.DMatrix(matrix))
        batch_size = len(batch_scores)
        scores[offset : offset + batch_size] = batch_scores
        labels[offset : offset + batch_size] = batch_labels
        min_training_id = int(ids[0]) if min_training_id is None else min_training_id
        max_training_id = int(ids[-1])
        offset += batch_size
        if offset % 1_000_000 < batch_size:
            log(f"scored {offset:,} training rows")

    threshold = calculate_recall_biased_threshold(labels, scores)
    storage_path = save_model_artifact(
        booster,
        threshold=threshold,
        column_feature_keys=build_column_feature_keys(),
        positive_train_count=int(labels.sum()),
        negative_train_count=int(len(labels) - labels.sum()),
        training_min_id=min_training_id or dataset_split.min_id,
        training_max_id=max_training_id or dataset_split.max_id,
        dataset_split=dataset_split,
        dashboard_sample_only=False,
        max_positive_train=None,
        max_negative_train=None,
    )
    log(f"saved full-dataset model to {storage_path}")
    log(f"threshold={threshold}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
