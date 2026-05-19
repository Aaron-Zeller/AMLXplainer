from __future__ import annotations

import json
import math
import hashlib
import os
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
import xgboost as xgb
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.sql import Select
from sqlmodel import Session, select

from models.db import get_session
from models.schemas import (
    AveragedShapWaterfallResponse,
    ConfusionMatrixResponse,
    MlPredictionCache,
    MlBatchInfoResponse,
    MlModelInfoResponse,
    MlRecordPredictionResponse,
    MlResultsResponse,
    MlRocPointResponse,
    MlRocResponse,
    MlShapPointResponse,
    MlShapRowResponse,
    MlWaterfallContributionResponse,
)
from models.schemas import Transaction
from services.dashboard_api import serialize_transaction

FEATURE_KEYS = [
    "timestamp",
    "fromBank",
    "fromAccount",
    "fromCountry",
    "toBank",
    "toAccount",
    "toCountry",
    "amountReceived",
    "receivingCurrency",
    "amountPaid",
    "paymentCurrency",
    "paymentFormat",
]
NUMERIC_FEATURES = {"timestamp", "amountReceived", "amountPaid"}
CATEGORICAL_FEATURES = [feature for feature in FEATURE_KEYS if feature not in NUMERIC_FEATURES]
ALERT_THRESHOLD = 0.5
DEFAULT_FRAUD_ALERT_THRESHOLD = 0.55
THRESHOLD_OPTIMIZATION_BETA = 2.0
FALSE_NEGATIVE_COST_MULTIPLIER = 2.0
FEATURE_REMOVAL_IMPUTATION_ROUNDS = 16
FEATURE_REMOVAL_BACKGROUND_LIMIT = 512


def optional_float_from_env(name: str) -> float | None:
    value = os.getenv(name)
    if value in (None, ""):
        return None

    parsed_value = float(value)
    return min(max(parsed_value, 0.0), 1.0)


def optional_positive_int_from_env(name: str) -> int | None:
    value = os.getenv(name)
    if value in (None, ""):
        return None

    parsed_value = int(value)
    return parsed_value if parsed_value > 0 else None


def optional_positive_float_from_env(name: str) -> float | None:
    value = os.getenv(name)
    if value in (None, ""):
        return None

    parsed_value = float(value)
    return parsed_value if parsed_value > 0 else None


MAX_POSITIVE_TRAIN = optional_positive_int_from_env("MAX_POSITIVE_TRAIN")
MAX_NEGATIVE_TRAIN = optional_positive_int_from_env("MAX_NEGATIVE_TRAIN")
ML_PREDICTION_CACHE_WARMUP_LIMIT = optional_positive_int_from_env("ML_PREDICTION_CACHE_WARMUP_LIMIT") or 20_000
ALERT_THRESHOLD_OVERRIDE = optional_float_from_env("ALERT_THRESHOLD_OVERRIDE")
DEFAULT_ALERT_THRESHOLD = optional_float_from_env("DEFAULT_ALERT_THRESHOLD") or DEFAULT_FRAUD_ALERT_THRESHOLD
FALSE_NEGATIVE_COST = optional_positive_float_from_env("FALSE_NEGATIVE_COST") or FALSE_NEGATIVE_COST_MULTIPLIER
NUMERIC_VARIANCE_FLOORS = {
    "timestamp": 24 * 60 * 24 * 60,
    "amountReceived": 0.25,
    "amountPaid": 0.25,
}
HASH_BUCKETS_BY_FEATURE = {
    "fromBank": 64,
    "fromAccount": 128,
    "fromCountry": 8,
    "toBank": 64,
    "toAccount": 128,
    "toCountry": 8,
    "receivingCurrency": 16,
    "paymentCurrency": 16,
    "paymentFormat": 16,
}
MODEL_ARTIFACT_DIR = Path(os.getenv("MODEL_ARTIFACT_DIR", "/tmp/xai_iml_models"))
BUNDLED_MODEL_ARTIFACT_DIRS = [
    Path(__file__).resolve().parents[1] / "assets" / "models",
    Path(__file__).resolve().parents[2] / "assets" / "models",
]
_model_cache_lock = threading.Lock()
_model_cache: dict[tuple[bool, int], XGBoostFraudModel] = {}
_dataset_split_cache_lock = threading.Lock()
_dataset_split_cache: tuple[float, DatasetSplit] | None = None
DATASET_SPLIT_CACHE_SECONDS = optional_positive_int_from_env("DATASET_SPLIT_CACHE_SECONDS") or 30
_prediction_cache_warmup_lock = threading.Lock()
_prediction_cache_warmup_started = False


def normalize_active_feature_keys(feature_keys: list[str] | None) -> list[str]:
    if feature_keys is None:
        return FEATURE_KEYS

    known_features = set(FEATURE_KEYS)
    normalized_keys = []
    seen_keys = set()

    for feature_key in feature_keys:
        if feature_key not in known_features or feature_key in seen_keys:
            continue

        normalized_keys.append(feature_key)
        seen_keys.add(feature_key)

    return normalized_keys


@dataclass(frozen=True)
class Prediction:
    score: float
    base_value: float
    contributions: dict[str, float]
    normalized_values: dict[str, float]


@dataclass(frozen=True)
class DatasetSplit:
    min_id: int
    split_id: int
    max_id: int
    record_count: int


class XGBoostFraudModel:
    def __init__(
        self,
        *,
        booster: xgb.Booster,
        threshold: float,
        column_feature_keys: list[str],
        positive_train_count: int,
        negative_train_count: int,
        training_min_id: int | None,
        training_max_id: int | None,
        storage_path: str | None,
    ):
        self.booster = booster
        self.threshold = threshold
        self.column_feature_keys = column_feature_keys
        self.positive_train_count = positive_train_count
        self.negative_train_count = negative_train_count
        self.training_min_id = training_min_id
        self.training_max_id = training_max_id
        self.storage_path = storage_path
        self._cache_key: str | None = None

    @property
    def trained_record_count(self) -> int:
        return self.positive_train_count + self.negative_train_count

    @property
    def alert_threshold(self) -> float:
        return calculate_effective_alert_threshold(self.threshold)

    def predict_many(
        self,
        transactions: list[Transaction],
        *,
        active_feature_keys: list[str] | None = None,
        background_transactions: list[Transaction] | None = None,
        imputation_rounds: int = FEATURE_REMOVAL_IMPUTATION_ROUNDS,
    ) -> list[Prediction]:
        normalized_active_feature_keys = normalize_active_feature_keys(active_feature_keys)
        active_feature_key_set = set(normalized_active_feature_keys)
        omitted_feature_keys = [feature_key for feature_key in FEATURE_KEYS if feature_key not in active_feature_key_set]
        matrix, _ = build_feature_matrix(transactions)
        prediction_matrices = [matrix]

        if omitted_feature_keys and background_transactions:
            prediction_matrices = build_feature_removal_imputation_matrices(
                matrix,
                transactions=transactions,
                background_transactions=background_transactions,
                omitted_feature_keys=omitted_feature_keys,
                imputation_rounds=imputation_rounds,
            )

        probability_sum = np.zeros(len(transactions), dtype=np.float64)
        contribution_sum = np.zeros((len(transactions), len(self.column_feature_keys) + 1), dtype=np.float64)

        for prediction_matrix in prediction_matrices:
            dmatrix = xgb.DMatrix(prediction_matrix)
            probability_sum += self.booster.predict(dmatrix)
            contribution_sum += self.booster.predict(dmatrix, pred_contribs=True)

        prediction_count = max(len(prediction_matrices), 1)
        probabilities = probability_sum / prediction_count
        contributions = contribution_sum / prediction_count
        predictions = []

        for row_index, transaction in enumerate(transactions):
            contribution_by_feature = {feature_key: 0.0 for feature_key in FEATURE_KEYS}
            for column_index, feature_key in enumerate(self.column_feature_keys):
                if feature_key not in active_feature_key_set:
                    continue

                contribution_by_feature[feature_key] += float(contributions[row_index, column_index])

            predictions.append(
                Prediction(
                    score=float(probabilities[row_index]),
                    base_value=float(contributions[row_index, -1]),
                    contributions=contribution_by_feature,
                    normalized_values={
                        feature_key: normalize_prediction_feature_value(transaction, feature_key)
                        for feature_key in FEATURE_KEYS
                    },
                ),
            )

        return predictions

    @property
    def cache_key(self) -> str:
        if self._cache_key is not None:
            return self._cache_key

        model_mtime_ns = None
        if self.storage_path:
            try:
                model_mtime_ns = Path(self.storage_path).stat().st_mtime_ns
            except OSError:
                model_mtime_ns = None

        payload = json.dumps(
            {
                "modelType": "xgboost_hist_binary_classifier",
                "storagePath": self.storage_path,
                "modelMtimeNs": model_mtime_ns,
                "trainedRecordCount": self.trained_record_count,
                "trainingMinId": self.training_min_id,
                "trainingMaxId": self.training_max_id,
                "columns": self.column_feature_keys,
            },
            sort_keys=True,
        )
        self._cache_key = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        return self._cache_key


def train_xgboost_fraud_model(
    session: Session,
    *,
    dashboard_sample_only: bool,
    dataset_split: DatasetSplit,
) -> XGBoostFraudModel:
    positive_statement = select(Transaction).where(Transaction.is_laundering.is_(True))
    negative_statement = select(Transaction).where(Transaction.is_laundering.is_(False))

    positive_statement = positive_statement.order_by(Transaction.id)
    negative_statement = negative_statement.order_by(Transaction.id.desc())
    if MAX_POSITIVE_TRAIN is not None:
        positive_statement = positive_statement.limit(MAX_POSITIVE_TRAIN)
    if MAX_NEGATIVE_TRAIN is not None:
        negative_statement = negative_statement.limit(MAX_NEGATIVE_TRAIN)

    positives = session.exec(positive_statement).all()
    negatives = session.exec(negative_statement).all()

    if not positives or not negatives:
        fallback_rows = session.exec(select(Transaction).order_by(Transaction.id).limit(2000)).all()
        positives = [row for row in fallback_rows if row.is_laundering]
        negatives = [row for row in fallback_rows if not row.is_laundering]

    if not positives or not negatives:
        raise ValueError("ML model needs at least one fraud and one non-fraud transaction to train.")

    training_rows = positives + negatives
    labels = np.array([1 if row.is_laundering else 0 for row in training_rows], dtype=np.float32)
    matrix, column_feature_keys = build_feature_matrix(training_rows)
    positive_count = int(labels.sum())
    negative_count = int(len(labels) - positive_count)
    scale_pos_weight = negative_count / max(positive_count, 1)
    training_weights = np.where(labels == 1, FALSE_NEGATIVE_COST, 1.0).astype(np.float32)
    dtrain = xgb.DMatrix(matrix, label=labels, weight=training_weights)
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
        num_boost_round=160,
        verbose_eval=False,
    )
    train_scores = booster.predict(dtrain)
    threshold = calculate_recall_biased_threshold(labels, train_scores)
    storage_path = save_model_artifact(
        booster,
        threshold=threshold,
        column_feature_keys=column_feature_keys,
        positive_train_count=positive_count,
        negative_train_count=negative_count,
        training_min_id=min(row.id or 0 for row in training_rows),
        training_max_id=max(row.id or 0 for row in training_rows),
        dataset_split=dataset_split,
        dashboard_sample_only=dashboard_sample_only,
        max_positive_train=MAX_POSITIVE_TRAIN,
        max_negative_train=MAX_NEGATIVE_TRAIN,
    )

    return XGBoostFraudModel(
        booster=booster,
        threshold=threshold,
        column_feature_keys=column_feature_keys,
        positive_train_count=positive_count,
        negative_train_count=negative_count,
        training_min_id=min(row.id or 0 for row in training_rows),
        training_max_id=max(row.id or 0 for row in training_rows),
        storage_path=storage_path,
    )


def get_or_train_model(
    session: Session,
    *,
    dashboard_sample_only: bool,
    dataset_split: DatasetSplit,
) -> XGBoostFraudModel:
    cache_key = (dashboard_sample_only, dataset_split.max_id)

    with _model_cache_lock:
        cached_model = _model_cache.get(cache_key)
        if cached_model is not None:
            return cached_model

        persisted_model = load_model_artifact(
            dataset_split=dataset_split,
            dashboard_sample_only=dashboard_sample_only,
        )
        if persisted_model is not None:
            _model_cache[cache_key] = persisted_model
            return persisted_model

        model = train_xgboost_fraud_model(
            session,
            dashboard_sample_only=dashboard_sample_only,
            dataset_split=dataset_split,
        )
        _model_cache[cache_key] = model
        return model


def should_use_prediction_cache(active_feature_keys: list[str]) -> bool:
    return active_feature_keys == FEATURE_KEYS


def load_cached_predictions(
    session: Session,
    records: list[Transaction],
    *,
    model_cache_key: str,
) -> dict[int, Prediction]:
    record_ids = [record.id for record in records if record.id is not None]
    if not record_ids:
        return {}

    cache_rows = session.exec(
        select(MlPredictionCache).where(
            MlPredictionCache.model_cache_key == model_cache_key,
            MlPredictionCache.transaction_id.in_(record_ids),
        ),
    ).all()
    record_by_id = {record.id: record for record in records if record.id is not None}
    predictions: dict[int, Prediction] = {}

    for cache_row in cache_rows:
        record = record_by_id.get(cache_row.transaction_id)
        if record is None:
            continue

        predictions[cache_row.transaction_id] = Prediction(
            score=cache_row.model_score,
            base_value=cache_row.base_value,
            contributions={feature_key: float(cache_row.contributions.get(feature_key, 0.0)) for feature_key in FEATURE_KEYS},
            normalized_values={
                feature_key: normalize_prediction_feature_value(record, feature_key)
                for feature_key in FEATURE_KEYS
            },
        )

    return predictions


def save_prediction_cache(
    session: Session,
    records: list[Transaction],
    predictions: list[Prediction],
    *,
    model_cache_key: str,
) -> None:
    rows = []
    now = datetime.utcnow()

    for record, prediction in zip(records, predictions, strict=True):
        if record.id is None:
            continue

        rows.append(
            {
                "model_cache_key": model_cache_key,
                "transaction_id": record.id,
                "model_score": prediction.score,
                "base_value": prediction.base_value,
                "contributions": prediction.contributions,
                "updated_at": now,
            },
        )

    if not rows:
        return

    statement = insert(MlPredictionCache).values(rows)
    update_columns = {
        "model_score": statement.excluded.model_score,
        "base_value": statement.excluded.base_value,
        "contributions": statement.excluded.contributions,
        "updated_at": statement.excluded.updated_at,
    }
    session.exec(
        statement.on_conflict_do_update(
            index_elements=["model_cache_key", "transaction_id"],
            set_=update_columns,
        ),
    )
    session.commit()


def get_or_compute_predictions(
    session: Session,
    model: XGBoostFraudModel,
    records: list[Transaction],
    *,
    active_feature_keys: list[str],
    background_transactions: list[Transaction] | None,
) -> list[Prediction]:
    if not should_use_prediction_cache(active_feature_keys):
        return model.predict_many(
            records,
            active_feature_keys=active_feature_keys,
            background_transactions=background_transactions,
        )

    cached_predictions = load_cached_predictions(session, records, model_cache_key=model.cache_key)
    missing_records = [record for record in records if record.id not in cached_predictions]

    if missing_records:
        missing_predictions = model.predict_many(missing_records)
        save_prediction_cache(
            session,
            missing_records,
            missing_predictions,
            model_cache_key=model.cache_key,
        )
        for record, prediction in zip(missing_records, missing_predictions, strict=True):
            if record.id is not None:
                cached_predictions[record.id] = prediction

    return [
        cached_predictions[record.id]
        for record in records
        if record.id is not None and record.id in cached_predictions
    ]


def should_warm_prediction_cache() -> bool:
    return os.getenv("WARM_ML_PREDICTION_CACHE_ON_STARTUP", "true").lower() in {"1", "true", "yes"}


def maybe_start_prediction_cache_warmup() -> bool:
    global _prediction_cache_warmup_started

    if not should_warm_prediction_cache():
        return False

    with _prediction_cache_warmup_lock:
        if _prediction_cache_warmup_started:
            return False
        _prediction_cache_warmup_started = True

    thread = threading.Thread(target=_run_prediction_cache_warmup, daemon=True)
    thread.start()
    return True


def _run_prediction_cache_warmup() -> None:
    try:
        with get_session() as session:
            dataset_split = get_dataset_split(session)
            model = get_or_train_model(
                session,
                dashboard_sample_only=False,
                dataset_split=dataset_split,
            )
            cached_count = int(
                session.exec(
                    select(func.count())
                    .select_from(MlPredictionCache)
                    .where(MlPredictionCache.model_cache_key == model.cache_key),
                ).one(),
            )
            if cached_count >= ML_PREDICTION_CACHE_WARMUP_LIMIT:
                print(f"ML prediction cache already warm for {cached_count} records.")
                return

            records = session.exec(
                select(Transaction).order_by(Transaction.id).limit(ML_PREDICTION_CACHE_WARMUP_LIMIT),
            ).all()
            get_or_compute_predictions(
                session,
                model,
                records,
                active_feature_keys=FEATURE_KEYS,
                background_transactions=None,
            )
            print(f"Warmed ML prediction cache for {len(records)} records.")
    except Exception as error:  # pragma: no cover - operational logging path
        print(f"ML prediction cache warmup failed: {error}")


def build_ml_results(
    session: Session,
    statement: Select[tuple[Transaction]],
    *,
    limit: int,
    offset: int,
    batch_number: int,
    dashboard_sample_only: bool,
    after_id: int | None = None,
    total_filtered_record_count: int | None = None,
    use_dataset_total_count: bool = False,
    feature_keys: list[str] | None = None,
) -> MlResultsResponse:
    active_feature_keys = normalize_active_feature_keys(feature_keys)
    dataset_split = get_dataset_split(session)
    model = get_or_train_model(
        session,
        dashboard_sample_only=False,
        dataset_split=dataset_split,
    )
    inference_statement = (
        statement.where(Transaction.is_dashboard_sample.is_(True))
        if dashboard_sample_only
        else statement
    )
    page_statement = inference_statement
    if after_id is not None:
        page_statement = page_statement.where(Transaction.id > after_id)
        offset = 0

    if total_filtered_record_count is None:
        total_filtered_record_count = (
            dataset_split.record_count
            if use_dataset_total_count
            else int(session.exec(select(func.count()).select_from(inference_statement.subquery())).one())
        )
    records = session.exec(
        page_statement.order_by(Transaction.id).offset(offset).limit(limit),
    ).all()
    background_records = (
        load_feature_removal_background_records(session)
        if len(active_feature_keys) < len(FEATURE_KEYS)
        else None
    )
    predictions = get_or_compute_predictions(
        session,
        model,
        records,
        active_feature_keys=active_feature_keys,
        background_transactions=background_records,
    )
    alert_threshold = model.alert_threshold
    prediction_responses = [
        build_prediction_response(record, prediction, alert_threshold=alert_threshold)
        for record, prediction in zip(records, predictions, strict=True)
    ]
    confusion_matrix = build_confusion_matrix(records, predictions, alert_threshold=alert_threshold)

    return MlResultsResponse(
        model=MlModelInfoResponse(
            modelType="xgboost_hist_binary_classifier",
            modelStoragePath=model.storage_path,
            trainedRecordCount=model.trained_record_count,
            positiveTrainCount=model.positive_train_count,
            negativeTrainCount=model.negative_train_count,
            trainingMinId=model.training_min_id,
            trainingMaxId=model.training_max_id,
            threshold=alert_threshold,
            featureKeys=active_feature_keys,
        ),
        batch=MlBatchInfoResponse(
            batchNumber=batch_number,
            batchSize=len(records),
            offset=offset,
            nextCursorId=max((record.id or 0 for record in records), default=None),
            inferenceMinId=min((record.id or 0 for record in records), default=None),
            inferenceMaxId=max((record.id or 0 for record in records), default=None),
            returnedRecordCount=len(records),
            totalFilteredRecordCount=total_filtered_record_count,
            totalBatchCount=max(1, math.ceil(total_filtered_record_count / max(limit, 1))),
            hasNextBatch=(
                len(records) == limit
                if after_id is not None
                else offset + len(records) < total_filtered_record_count
            ),
        ),
        records=[serialize_transaction(record) for record in records],
        predictions=prediction_responses,
        shap=build_global_shap_rows(predictions),
        roc=build_roc(records, predictions),
        confusionMatrix=confusion_matrix,
        metrics=build_ml_metrics(confusion_matrix),
        filteredRecordCount=len(records),
        totalFilteredRecordCount=total_filtered_record_count,
    )


def build_averaged_randomized_feature_waterfall(
    session: Session,
    record: Transaction,
    *,
    feature_key: str,
    iterations: int,
    seed: int | None,
    feature_keys: list[str] | None = None,
) -> AveragedShapWaterfallResponse:
    active_feature_keys = normalize_active_feature_keys(feature_keys)
    dataset_split = get_dataset_split(session)
    model = get_or_train_model(
        session,
        dashboard_sample_only=False,
        dataset_split=dataset_split,
    )
    background_records = (
        load_feature_removal_background_records(session)
        if len(active_feature_keys) < len(FEATURE_KEYS)
        else None
    )
    rng = np.random.default_rng(seed)
    sampled_values = sample_training_feature_values(
        session,
        model,
        feature_key=feature_key,
        sample_count=iterations,
        rng=rng,
    )
    perturbed_records = [
        copy_transaction_with_feature_value(record, feature_key, sampled_value)
        for sampled_value in sampled_values
    ]
    predictions = model.predict_many(
        perturbed_records,
        active_feature_keys=active_feature_keys,
        background_transactions=background_records,
    )
    averaged_prediction = average_predictions(predictions)
    explanation = build_prediction_response(
        record,
        averaged_prediction,
        alert_threshold=model.alert_threshold,
    )

    return AveragedShapWaterfallResponse(
        model=build_model_info_response(model, active_feature_keys=active_feature_keys),
        record=serialize_transaction(record),
        randomizedFeature=feature_key,
        iterations=len(predictions),
        seed=seed,
        averagedExplanation=explanation,
        waterfallPlot=explanation.waterfall,
    )


def build_model_info_response(
    model: XGBoostFraudModel,
    *,
    active_feature_keys: list[str],
) -> MlModelInfoResponse:
    return MlModelInfoResponse(
        modelType="xgboost_hist_binary_classifier",
        modelStoragePath=model.storage_path,
        trainedRecordCount=model.trained_record_count,
        positiveTrainCount=model.positive_train_count,
        negativeTrainCount=model.negative_train_count,
        trainingMinId=model.training_min_id,
        trainingMaxId=model.training_max_id,
        threshold=model.alert_threshold,
        featureKeys=active_feature_keys,
    )


def get_dataset_split(session: Session) -> DatasetSplit:
    global _dataset_split_cache

    now = time.monotonic()
    with _dataset_split_cache_lock:
        if _dataset_split_cache is not None:
            cached_at, cached_split = _dataset_split_cache
            if now - cached_at <= DATASET_SPLIT_CACHE_SECONDS:
                return cached_split

    bounds = session.exec(
        select(
            func.min(Transaction.id).label("min_id"),
            func.max(Transaction.id).label("max_id"),
            func.count(Transaction.id).label("record_count"),
        ),
    ).one()
    min_id = int(bounds.min_id or 0)
    max_id = int(bounds.max_id or 0)
    record_count = int(bounds.record_count or 0)
    split_id = min_id + ((max_id - min_id) // 2)
    dataset_split = DatasetSplit(min_id=min_id, split_id=split_id, max_id=max_id, record_count=record_count)
    with _dataset_split_cache_lock:
        _dataset_split_cache = (now, dataset_split)
    return dataset_split


def model_artifact_paths(
    *,
    dataset_split: DatasetSplit,
    dashboard_sample_only: bool,
    artifact_dir: Path = MODEL_ARTIFACT_DIR,
) -> tuple[Path, Path]:
    suffix = "dashboard_sample" if dashboard_sample_only else f"full_dataset_{dataset_split.max_id}"
    model_path = artifact_dir / f"xgboost_fraud_model_{suffix}.json"
    metadata_path = artifact_dir / f"xgboost_fraud_model_{suffix}.metadata.json"
    return model_path, metadata_path


def load_model_artifact(
    *,
    dataset_split: DatasetSplit,
    dashboard_sample_only: bool,
) -> XGBoostFraudModel | None:
    model_path = metadata_path = None
    allow_dataset_max_mismatch = False
    for artifact_dir in model_artifact_dirs():
        candidate_model_path, candidate_metadata_path = model_artifact_paths(
            dataset_split=dataset_split,
            dashboard_sample_only=dashboard_sample_only,
            artifact_dir=artifact_dir,
        )
        if candidate_model_path.exists() and candidate_metadata_path.exists():
            model_path = candidate_model_path
            metadata_path = candidate_metadata_path
            break

    if model_path is None or metadata_path is None:
        fallback_paths = find_latest_full_dataset_artifact()
        if fallback_paths is None or dashboard_sample_only:
            return None
        model_path, metadata_path = fallback_paths
        allow_dataset_max_mismatch = True

    return load_model_artifact_from_paths(
        model_path=model_path,
        metadata_path=metadata_path,
        dataset_split=dataset_split,
        dashboard_sample_only=dashboard_sample_only,
        allow_dataset_max_mismatch=allow_dataset_max_mismatch,
    )


def model_artifact_dirs() -> list[Path]:
    dirs = [MODEL_ARTIFACT_DIR]
    dirs.extend(directory for directory in BUNDLED_MODEL_ARTIFACT_DIRS if directory not in dirs)
    return dirs


def find_latest_full_dataset_artifact() -> tuple[Path, Path] | None:
    candidates: list[tuple[int, Path, Path]] = []
    for artifact_dir in model_artifact_dirs():
        if not artifact_dir.exists():
            continue
        for metadata_path in artifact_dir.glob("xgboost_fraud_model_full_dataset_*.metadata.json"):
            try:
                metadata = json.loads(metadata_path.read_text())
                dataset_max_id = int(metadata["datasetMaxId"])
            except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
                continue
            model_path = metadata_path.with_name(metadata_path.name.replace(".metadata.json", ".json"))
            if model_path.exists():
                candidates.append((dataset_max_id, model_path, metadata_path))

    if not candidates:
        return None

    _, model_path, metadata_path = max(candidates, key=lambda candidate: candidate[0])
    return model_path, metadata_path


def load_model_artifact_from_paths(
    *,
    model_path: Path,
    metadata_path: Path,
    dataset_split: DatasetSplit,
    dashboard_sample_only: bool,
    allow_dataset_max_mismatch: bool,
) -> XGBoostFraudModel | None:
    try:
        metadata = json.loads(metadata_path.read_text())
        if metadata.get("modelType") != "xgboost_hist_binary_classifier":
            return None
        if not allow_dataset_max_mismatch and metadata.get("datasetMaxId") != dataset_split.max_id:
            return None
        if bool(metadata.get("dashboardSampleOnly")) != dashboard_sample_only:
            return None
        positive_train_count = int(metadata["positiveTrainCount"])
        negative_train_count = int(metadata["negativeTrainCount"])
        trained_record_count = positive_train_count + negative_train_count
        metadata_record_count = int(metadata.get("datasetRecordCount") or 0)
        if metadata.get("trainingMode") == "full_dataset" and (
            metadata_record_count != trained_record_count
            or (not allow_dataset_max_mismatch and trained_record_count != dataset_split.record_count)
        ):
            return None

        column_feature_keys = metadata.get("columnFeatureKeys")
        if not isinstance(column_feature_keys, list) or not all(
            isinstance(feature_key, str) for feature_key in column_feature_keys
        ):
            return None

        booster = xgb.Booster()
        booster.load_model(model_path)
        return XGBoostFraudModel(
            booster=booster,
            threshold=float(metadata["threshold"]),
            column_feature_keys=column_feature_keys,
            positive_train_count=positive_train_count,
            negative_train_count=negative_train_count,
            training_min_id=metadata.get("trainingMinId"),
            training_max_id=metadata.get("trainingMaxId"),
            storage_path=str(model_path),
        )
    except (OSError, ValueError, KeyError, TypeError, xgb.core.XGBoostError):
        return None


def save_model_artifact(
    booster: xgb.Booster,
    *,
    threshold: float,
    column_feature_keys: list[str],
    positive_train_count: int,
    negative_train_count: int,
    training_min_id: int,
    training_max_id: int,
    dataset_split: DatasetSplit,
    dashboard_sample_only: bool,
    max_positive_train: int | None,
    max_negative_train: int | None,
) -> str | None:
    try:
        MODEL_ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
        model_path, metadata_path = model_artifact_paths(
            dataset_split=dataset_split,
            dashboard_sample_only=dashboard_sample_only,
        )
        booster.save_model(model_path)
        is_limited_training = max_positive_train is not None or max_negative_train is not None
        metadata_path.write_text(
            json.dumps(
                {
                    "modelType": "xgboost_hist_binary_classifier",
                    "threshold": threshold,
                    "columnFeatureKeys": column_feature_keys,
                    "positiveTrainCount": positive_train_count,
                    "negativeTrainCount": negative_train_count,
                    "trainingMinId": training_min_id,
                    "trainingMaxId": training_max_id,
                    "datasetMinId": dataset_split.min_id,
                    "datasetSplitId": dataset_split.split_id,
                    "datasetMaxId": dataset_split.max_id,
                    "datasetRecordCount": dataset_split.record_count,
                    "trainingMode": "capped_balanced_sample" if is_limited_training else "full_dataset",
                    "maxPositiveTrain": max_positive_train,
                    "maxNegativeTrain": max_negative_train,
                    "falseNegativeCost": FALSE_NEGATIVE_COST,
                    "dashboardSampleOnly": dashboard_sample_only,
                },
                indent=2,
            ),
        )
        return str(model_path)
    except OSError:
        return None


def sample_training_feature_values(
    session: Session,
    model: XGBoostFraudModel,
    *,
    feature_key: str,
    sample_count: int,
    rng: np.random.Generator,
) -> list[object]:
    if feature_key not in FEATURE_KEYS:
        raise KeyError(feature_key)

    positive_probability = model.positive_train_count / max(model.trained_record_count, 1)
    positive_sample_count = int(rng.binomial(sample_count, positive_probability))
    negative_sample_count = sample_count - positive_sample_count
    positive_offsets = rng.integers(0, max(model.positive_train_count, 1), size=positive_sample_count)
    negative_offsets = rng.integers(0, max(model.negative_train_count, 1), size=negative_sample_count)
    values = []
    values.extend(sample_training_class_feature_values(session, feature_key, True, positive_offsets.tolist()))
    values.extend(sample_training_class_feature_values(session, feature_key, False, negative_offsets.tolist()))

    if not values:
        fallback_offsets = list(range(sample_count))
        values.extend(sample_training_class_feature_values(session, feature_key, True, fallback_offsets))
        values.extend(sample_training_class_feature_values(session, feature_key, False, fallback_offsets))
    if not values:
        raise ValueError("No training rows available for SHAP feature randomisation.")

    rng.shuffle(values)
    if len(values) >= sample_count:
        return values[:sample_count]

    sampled_indexes = rng.integers(0, len(values), size=sample_count - len(values))
    return values + [values[int(index)] for index in sampled_indexes]


def sample_training_class_feature_values(
    session: Session,
    feature_key: str,
    is_laundering: bool,
    offsets: list[int],
) -> list[object]:
    if not offsets:
        return []

    order_column = Transaction.id if is_laundering else Transaction.id.desc()
    id_statement = select(Transaction.id).where(Transaction.is_laundering.is_(is_laundering)).order_by(order_column)
    if is_laundering and MAX_POSITIVE_TRAIN is not None:
        id_statement = id_statement.limit(MAX_POSITIVE_TRAIN)
    elif not is_laundering and MAX_NEGATIVE_TRAIN is not None:
        id_statement = id_statement.limit(MAX_NEGATIVE_TRAIN)
    statement = select(Transaction).where(Transaction.id.in_(id_statement)).order_by(order_column)

    rows = [
        session.exec(statement.offset(max(0, int(offset))).limit(1)).first()
        for offset in offsets
    ]
    return [transaction_feature_raw_value(row, feature_key) for row in rows if row is not None]


def transaction_feature_raw_value(transaction: Transaction, feature_key: str) -> object:
    return {
        "timestamp": transaction.timestamp,
        "fromBank": transaction.from_bank,
        "fromAccount": transaction.from_account,
        "fromCountry": transaction.from_country,
        "toBank": transaction.to_bank,
        "toAccount": transaction.to_account,
        "toCountry": transaction.to_country,
        "amountReceived": transaction.amount_received,
        "receivingCurrency": transaction.receiving_currency,
        "amountPaid": transaction.amount_paid,
        "paymentCurrency": transaction.payment_currency,
        "paymentFormat": transaction.payment_format,
    }[feature_key]


def copy_transaction_with_feature_value(
    transaction: Transaction,
    feature_key: str,
    value: object,
) -> Transaction:
    values = {
        "id": transaction.id,
        "record_key": transaction.record_key,
        "timestamp": transaction.timestamp,
        "from_bank": transaction.from_bank,
        "from_account": transaction.from_account,
        "from_country": transaction.from_country,
        "to_bank": transaction.to_bank,
        "to_account": transaction.to_account,
        "to_country": transaction.to_country,
        "amount_received": transaction.amount_received,
        "receiving_currency": transaction.receiving_currency,
        "amount_paid": transaction.amount_paid,
        "payment_currency": transaction.payment_currency,
        "payment_format": transaction.payment_format,
        "is_laundering": transaction.is_laundering,
        "predicted_alert": transaction.predicted_alert,
        "model_score": transaction.model_score,
        "is_dashboard_sample": transaction.is_dashboard_sample,
    }
    values[transaction_model_field_name(feature_key)] = value
    return Transaction(**values)


def transaction_model_field_name(feature_key: str) -> str:
    return {
        "timestamp": "timestamp",
        "fromBank": "from_bank",
        "fromAccount": "from_account",
        "fromCountry": "from_country",
        "toBank": "to_bank",
        "toAccount": "to_account",
        "toCountry": "to_country",
        "amountReceived": "amount_received",
        "receivingCurrency": "receiving_currency",
        "amountPaid": "amount_paid",
        "paymentCurrency": "payment_currency",
        "paymentFormat": "payment_format",
    }[feature_key]


def average_predictions(predictions: list[Prediction]) -> Prediction:
    if not predictions:
        raise ValueError("Cannot average an empty prediction set.")

    # This randomises one input feature for a fixed trained booster. It is not
    # retraining without the feature; model structure and learned splits remain unchanged.
    prediction_count = len(predictions)
    return Prediction(
        score=sum(prediction.score for prediction in predictions) / prediction_count,
        base_value=sum(prediction.base_value for prediction in predictions) / prediction_count,
        contributions={
            feature_key: sum(prediction.contributions[feature_key] for prediction in predictions) / prediction_count
            for feature_key in FEATURE_KEYS
        },
        normalized_values={
            feature_key: sum(prediction.normalized_values[feature_key] for prediction in predictions) / prediction_count
            for feature_key in FEATURE_KEYS
        },
    )


def build_prediction_response(
    record: Transaction,
    prediction: Prediction,
    *,
    alert_threshold: float,
) -> MlRecordPredictionResponse:
    running_total = prediction.base_value
    waterfall = []
    for feature_key, contribution in sorted(
        prediction.contributions.items(),
        key=lambda item: abs(item[1]),
        reverse=True,
    ):
        start = running_total
        end = start + contribution
        waterfall.append(
            MlWaterfallContributionResponse(
                featureKey=feature_key,
                contribution=round(contribution, 5),
                start=round(start, 5),
                end=round(end, 5),
            ),
        )
        running_total = end

    return MlRecordPredictionResponse(
        recordKey=record.record_key,
        modelScore=round(prediction.score, 5),
        predictedAlert=prediction.score >= alert_threshold,
        baseValue=round(prediction.base_value, 5),
        waterfall=waterfall,
    )


def build_global_shap_rows(predictions: list[Prediction]) -> list[MlShapRowResponse]:
    rows = []
    sampled_predictions = sample_predictions(predictions, 220)

    for feature_index, feature_key in enumerate(FEATURE_KEYS):
        points = [
            MlShapPointResponse(
                shapValue=round(prediction.contributions[feature_key], 5),
                featureValue=round(prediction.normalized_values[feature_key], 5),
                jitter=round(math.sin((point_index + 3) * 1.79 + feature_index) * 0.82, 5),
            )
            for point_index, prediction in enumerate(sampled_predictions)
        ]
        mean_magnitude = (
            sum(abs(prediction.contributions[feature_key]) for prediction in predictions) / len(predictions)
            if predictions
            else 0
        )
        rows.append(
            MlShapRowResponse(
                featureKey=feature_key,
                importance=round(mean_magnitude, 5),
                points=points,
            ),
        )

    return sorted(rows, key=lambda row: row.importance, reverse=True)


def build_confusion_matrix(
    records: list[Transaction],
    predictions: list[Prediction],
    *,
    alert_threshold: float,
) -> ConfusionMatrixResponse:
    true_positive = false_positive = false_negative = true_negative = alert_count = 0

    for record, prediction in zip(records, predictions, strict=True):
        predicted_alert = prediction.score >= alert_threshold

        if predicted_alert:
            alert_count += 1
        if predicted_alert and record.is_laundering:
            true_positive += 1
        if predicted_alert and not record.is_laundering:
            false_positive += 1
        if not predicted_alert and record.is_laundering:
            false_negative += 1
        if not predicted_alert and not record.is_laundering:
            true_negative += 1

    return ConfusionMatrixResponse(
        total=len(records),
        alertCount=alert_count,
        truePositive=true_positive,
        falsePositive=false_positive,
        falseNegative=false_negative,
        trueNegative=true_negative,
    )


def build_ml_metrics(confusion_matrix: ConfusionMatrixResponse) -> list[dict[str, str]]:
    total = confusion_matrix.total
    true_positive = confusion_matrix.true_positive
    false_positive = confusion_matrix.false_positive
    false_negative = confusion_matrix.false_negative
    true_negative = confusion_matrix.true_negative
    actual_positive = true_positive + false_negative
    predicted_positive = true_positive + false_positive
    accuracy = (true_positive + true_negative) / total if total > 0 else 0

    if actual_positive == 0:
        precision_value = "N/A"
        recall_value = "N/A"
        f1_value = "N/A"
    else:
        precision = true_positive / predicted_positive if predicted_positive > 0 else 0
        recall = true_positive / actual_positive
        f1_score = (2 * precision * recall) / (precision + recall) if precision + recall > 0 else 0
        precision_value = f"{precision:.3f}"
        recall_value = f"{recall * 100:.1f}%"
        f1_value = f"{f1_score:.3f}"

    return [
        {"label": "Accuracy", "value": f"{accuracy * 100:.1f}%", "detail": "Current selection"},
        {"label": "Precision", "value": precision_value, "detail": "Predicted alerts"},
        {"label": "Recall", "value": recall_value, "detail": "Known positives"},
        {"label": "F1 Score", "value": f1_value, "detail": "Evaluation balance"},
    ]


def build_roc(records: list[Transaction], predictions: list[Prediction]) -> MlRocResponse:
    points = []
    for threshold_index in range(21):
        threshold = threshold_index / 20
        true_positive = false_positive = false_negative = true_negative = 0

        for record, prediction in zip(records, predictions, strict=True):
            predicted_positive = prediction.score >= threshold
            if predicted_positive and record.is_laundering:
                true_positive += 1
            if predicted_positive and not record.is_laundering:
                false_positive += 1
            if not predicted_positive and record.is_laundering:
                false_negative += 1
            if not predicted_positive and not record.is_laundering:
                true_negative += 1

        true_positive_rate = (
            true_positive / (true_positive + false_negative)
            if true_positive + false_negative > 0
            else 0
        )
        false_positive_rate = (
            false_positive / (false_positive + true_negative)
            if false_positive + true_negative > 0
            else 0
        )
        points.append(
            MlRocPointResponse(
                threshold=threshold,
                falsePositiveRate=round(false_positive_rate, 5),
                truePositiveRate=round(true_positive_rate, 5),
            ),
        )

    sorted_points = sorted(points, key=lambda point: point.false_positive_rate)
    auc = 0.0
    for previous, current in zip(sorted_points, sorted_points[1:], strict=False):
        width = current.false_positive_rate - previous.false_positive_rate
        height = (current.true_positive_rate + previous.true_positive_rate) / 2
        auc += width * height

    return MlRocResponse(auc=round(auc, 5), points=points)


def calculate_effective_alert_threshold(stored_threshold: float) -> float:
    if ALERT_THRESHOLD_OVERRIDE is not None:
        return round(ALERT_THRESHOLD_OVERRIDE, 5)

    if stored_threshold <= 0 or stored_threshold >= 0.95:
        return round(DEFAULT_ALERT_THRESHOLD, 5)

    return round(stored_threshold, 5)


def calculate_recall_biased_threshold(labels: np.ndarray, scores: np.ndarray) -> float:
    return calculate_best_fbeta_threshold(labels, scores, beta=THRESHOLD_OPTIMIZATION_BETA)


def calculate_best_f1_threshold(labels: np.ndarray, scores: np.ndarray) -> float:
    return calculate_best_fbeta_threshold(labels, scores, beta=1.0)


def calculate_best_fbeta_threshold(labels: np.ndarray, scores: np.ndarray, *, beta: float) -> float:
    best_threshold = ALERT_THRESHOLD
    best_score = -1.0
    beta_squared = beta * beta

    for threshold in np.quantile(scores, np.linspace(0.50, 0.995, 100)):
        predicted_positive = scores >= threshold
        true_positive = int(((predicted_positive == 1) & (labels == 1)).sum())
        false_positive = int(((predicted_positive == 1) & (labels == 0)).sum())
        false_negative = int(((predicted_positive == 0) & (labels == 1)).sum())
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive > 0 else 0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative > 0 else 0
        fbeta = (
            ((1 + beta_squared) * precision * recall) / ((beta_squared * precision) + recall)
            if precision + recall > 0
            else 0
        )

        if fbeta > best_score:
            best_score = fbeta
            best_threshold = float(threshold)

    return calculate_effective_alert_threshold(best_threshold)


def build_feature_matrix(
    transactions: list[Transaction],
) -> tuple[np.ndarray, list[str]]:
    column_feature_keys = build_column_feature_keys()
    matrix = np.zeros((len(transactions), len(column_feature_keys)), dtype=np.float32)

    for row_index, transaction in enumerate(transactions):
        column_index = 0
        matrix[row_index, column_index] = numeric_feature_value(transaction, "timestamp") / (24 * 60)
        column_index += 1
        matrix[row_index, column_index] = numeric_feature_value(transaction, "amountReceived")
        column_index += 1
        matrix[row_index, column_index] = numeric_feature_value(transaction, "amountPaid")
        column_index += 1

        for feature_key in CATEGORICAL_FEATURES:
            bucket_count = HASH_BUCKETS_BY_FEATURE[feature_key]
            bucket_index = stable_bucket(categorical_feature_value(transaction, feature_key), bucket_count)
            matrix[row_index, column_index + bucket_index] = 1.0
            column_index += bucket_count

    return matrix, column_feature_keys


def load_feature_removal_background_records(session: Session) -> list[Transaction]:
    dashboard_sample_records = session.exec(
        select(Transaction)
        .where(Transaction.is_dashboard_sample.is_(True))
        .order_by(Transaction.id)
        .limit(FEATURE_REMOVAL_BACKGROUND_LIMIT),
    ).all()

    if dashboard_sample_records:
        return dashboard_sample_records

    return session.exec(
        select(Transaction)
        .order_by(Transaction.id)
        .limit(FEATURE_REMOVAL_BACKGROUND_LIMIT),
    ).all()


def build_feature_removal_imputation_matrices(
    base_matrix: np.ndarray,
    *,
    transactions: list[Transaction],
    background_transactions: list[Transaction],
    omitted_feature_keys: list[str],
    imputation_rounds: int,
) -> list[np.ndarray]:
    if not len(base_matrix) or not background_transactions:
        return [base_matrix]

    background_matrix, _ = build_feature_matrix(background_transactions)
    feature_slices = build_feature_column_slices()
    omitted_slices = [feature_slices[feature_key] for feature_key in omitted_feature_keys]
    seed = feature_removal_seed(transactions, omitted_feature_keys)
    rng = np.random.default_rng(seed)
    matrices = []

    for _ in range(max(1, imputation_rounds)):
        sampled_background_rows = rng.integers(0, len(background_transactions), size=len(transactions))
        imputed_matrix = base_matrix.copy()
        for feature_slice in omitted_slices:
            imputed_matrix[:, feature_slice] = background_matrix[sampled_background_rows, feature_slice]
        matrices.append(imputed_matrix)

    return matrices


def build_feature_column_slices() -> dict[str, slice]:
    slices = {}
    column_index = 0
    for feature_key in ["timestamp", "amountReceived", "amountPaid"]:
        slices[feature_key] = slice(column_index, column_index + 1)
        column_index += 1
    for feature_key in CATEGORICAL_FEATURES:
        bucket_count = HASH_BUCKETS_BY_FEATURE[feature_key]
        slices[feature_key] = slice(column_index, column_index + bucket_count)
        column_index += bucket_count

    return slices


def feature_removal_seed(transactions: list[Transaction], omitted_feature_keys: list[str]) -> int:
    seed_material = "|".join(
        [
            ",".join(omitted_feature_keys),
            str(len(transactions)),
            str(transactions[0].id if transactions else ""),
            str(transactions[-1].id if transactions else ""),
        ],
    )
    return int(hashlib.sha256(seed_material.encode("utf-8")).hexdigest()[:16], 16)


def build_column_feature_keys() -> list[str]:
    keys = ["timestamp", "amountReceived", "amountPaid"]

    for feature_key in CATEGORICAL_FEATURES:
        keys.extend([feature_key] * HASH_BUCKETS_BY_FEATURE[feature_key])

    return keys


def stable_bucket(value: str, bucket_count: int) -> int:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return int(digest[:12], 16) % bucket_count


def normalize_prediction_feature_value(transaction: Transaction, feature_key: str) -> float:
    if feature_key in NUMERIC_FEATURES:
        return normalize_numeric_feature(transaction, feature_key)

    return stable_bucket(categorical_feature_value(transaction, feature_key), HASH_BUCKETS_BY_FEATURE[feature_key]) / (
        HASH_BUCKETS_BY_FEATURE[feature_key] - 1
    )


def numeric_feature_value(transaction: Transaction, feature_key: str) -> float:
    if feature_key == "timestamp":
        timestamp = ensure_datetime(transaction.timestamp)
        return timestamp.hour * 60 + timestamp.minute
    if feature_key == "amountReceived":
        return math.log1p(max(transaction.amount_received, 0))
    if feature_key == "amountPaid":
        return math.log1p(max(transaction.amount_paid, 0))
    raise KeyError(feature_key)


def categorical_feature_value(transaction: Transaction, feature_key: str) -> str:
    return {
        "fromBank": transaction.from_bank,
        "fromAccount": transaction.from_account,
        "fromCountry": transaction.from_country,
        "toBank": transaction.to_bank,
        "toAccount": transaction.to_account,
        "toCountry": transaction.to_country,
        "receivingCurrency": transaction.receiving_currency,
        "paymentCurrency": transaction.payment_currency,
        "paymentFormat": transaction.payment_format,
    }[feature_key]


def normalize_numeric_feature(transaction: Transaction, feature_key: str) -> float:
    if feature_key == "timestamp":
        return numeric_feature_value(transaction, feature_key) / (24 * 60)
    if feature_key == "amountReceived":
        return min(transaction.amount_received / 150000, 1)
    if feature_key == "amountPaid":
        return min(transaction.amount_paid / 150000, 1)
    return 0.5


def sample_predictions(predictions: list[Prediction], max_samples: int) -> list[Prediction]:
    if len(predictions) <= max_samples:
        return predictions
    step = max(1, len(predictions) // max_samples)
    return predictions[::step][:max_samples]


def sigmoid(value: float) -> float:
    if value >= 0:
        scale = math.exp(-value)
        return 1 / (1 + scale)
    scale = math.exp(value)
    return scale / (1 + scale)


def ensure_datetime(value: datetime) -> datetime:
    return value
