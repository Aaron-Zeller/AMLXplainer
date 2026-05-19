import hashlib
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from starlette.responses import StreamingResponse
from sqlalchemy import func
from sqlmodel import select

from models.db import get_session
from models.schemas import (
    AlertListResponse,
    AveragedShapWaterfallResponse,
    DashboardSummaryResponse,
    DashboardTransactionsResponse,
    MlResultsResponse,
    Transaction,
    TransactionPublic,
)
from services.dashboard_api import (
    build_filtered_transaction_statement,
    get_cached_global_alerts,
    get_alerts,
    get_cached_global_dashboard_summary,
    get_dashboard_summary,
    refresh_global_alert_queue_cache,
    refresh_global_dashboard_summary_cache,
    serialize_transaction,
)
from services.ml_model import (
    FEATURE_KEYS,
    build_averaged_randomized_feature_waterfall,
    build_ml_results,
    get_dataset_split,
    get_or_train_model,
)

router = APIRouter(prefix="/transactions", tags=["Transactions"])


def hash_inference_rows(rows: list[Transaction]) -> str:
    digest = hashlib.sha256()
    for row in rows:
        digest.update(
            "|".join(
                [
                    row.record_key,
                    "1" if row.is_laundering else "0",
                    "1" if row.predicted_alert else "0",
                    f"{row.model_score:.6f}",
                ],
            ).encode("utf-8"),
        )
        digest.update(b"\n")
    return digest.hexdigest()


def resolve_ml_observation(
    session,
    *,
    transaction_id: int | None,
    record_key: str | None,
    row_index: int | None,
) -> Transaction:
    if transaction_id is not None:
        record = session.get(Transaction, transaction_id)
    elif record_key is not None:
        record = session.exec(select(Transaction).where(Transaction.record_key == record_key)).first()
    else:
        record = session.exec(
            select(Transaction)
            .order_by(Transaction.id)
            .offset(row_index or 0)
            .limit(1),
        ).first()

    if record is None:
        raise HTTPException(status_code=404, detail="Transaction observation not found.")

    return record


def build_ml_transaction_statement(
    *,
    timestamp_min: datetime | None,
    timestamp_max: datetime | None,
    time_start: str | None,
    time_end: str | None,
    from_bank: list[str] | None,
    from_account: list[str] | None,
    from_country: list[str] | None,
    to_bank: list[str] | None,
    to_account: list[str] | None,
    to_country: list[str] | None,
    receiving_currency: list[str] | None,
    payment_currency: list[str] | None,
    payment_format: list[str] | None,
    amount_received_min: float | None,
    amount_received_max: float | None,
    amount_paid_min: float | None,
    amount_paid_max: float | None,
    dashboard_sample_only: bool,
):
    return build_filtered_transaction_statement(
        timestamp_min=timestamp_min,
        timestamp_max=timestamp_max,
        time_start=time_start,
        time_end=time_end,
        from_bank=from_bank,
        from_account=from_account,
        from_country=from_country,
        to_bank=to_bank,
        to_account=to_account,
        to_country=to_country,
        receiving_currency=receiving_currency,
        payment_currency=payment_currency,
        payment_format=payment_format,
        amount_received_min=amount_received_min,
        amount_received_max=amount_received_max,
        amount_paid_min=amount_paid_min,
        amount_paid_max=amount_paid_max,
        dashboard_sample_only=dashboard_sample_only,
    )


def should_use_dataset_total_count_for_ml(
    *,
    dashboard_sample_only: bool,
    timestamp_min: datetime | None,
    timestamp_max: datetime | None,
    time_start: str | None,
    time_end: str | None,
    from_bank: list[str] | None,
    from_account: list[str] | None,
    from_country: list[str] | None,
    to_bank: list[str] | None,
    to_account: list[str] | None,
    to_country: list[str] | None,
    receiving_currency: list[str] | None,
    payment_currency: list[str] | None,
    payment_format: list[str] | None,
    amount_received_min: float | None,
    amount_received_max: float | None,
    amount_paid_min: float | None,
    amount_paid_max: float | None,
) -> bool:
    return not dashboard_sample_only and has_no_active_filters(
        timestamp_min=timestamp_min,
        timestamp_max=timestamp_max,
        time_start=time_start,
        time_end=time_end,
        from_bank=from_bank,
        from_account=from_account,
        from_country=from_country,
        to_bank=to_bank,
        to_account=to_account,
        to_country=to_country,
        receiving_currency=receiving_currency,
        payment_currency=payment_currency,
        payment_format=payment_format,
        amount_received_min=amount_received_min,
        amount_received_max=amount_received_max,
        amount_paid_min=amount_paid_min,
        amount_paid_max=amount_paid_max,
    )


def should_use_cached_global_summary(
    *,
    timestamp_min: datetime | None,
    timestamp_max: datetime | None,
    time_start: str | None,
    time_end: str | None,
    from_bank: list[str] | None,
    from_account: list[str] | None,
    from_country: list[str] | None,
    to_bank: list[str] | None,
    to_account: list[str] | None,
    to_country: list[str] | None,
    receiving_currency: list[str] | None,
    payment_currency: list[str] | None,
    payment_format: list[str] | None,
    amount_received_min: float | None,
    amount_received_max: float | None,
    amount_paid_min: float | None,
    amount_paid_max: float | None,
) -> bool:
    return all(
        value in (None, [], ())
        for value in (
            timestamp_min,
            timestamp_max,
            from_bank,
            from_account,
            from_country,
            to_bank,
            to_account,
            to_country,
            receiving_currency,
            payment_currency,
            payment_format,
            amount_received_min,
            amount_received_max,
            amount_paid_min,
            amount_paid_max,
        )
    ) and (time_start in (None, "00:00")) and (time_end in (None, "23:59"))


def has_no_active_filters(
    *,
    timestamp_min: datetime | None,
    timestamp_max: datetime | None,
    time_start: str | None,
    time_end: str | None,
    from_bank: list[str] | None,
    from_account: list[str] | None,
    from_country: list[str] | None,
    to_bank: list[str] | None,
    to_account: list[str] | None,
    to_country: list[str] | None,
    receiving_currency: list[str] | None,
    payment_currency: list[str] | None,
    payment_format: list[str] | None,
    amount_received_min: float | None,
    amount_received_max: float | None,
    amount_paid_min: float | None,
    amount_paid_max: float | None,
) -> bool:
    return should_use_cached_global_summary(
        timestamp_min=timestamp_min,
        timestamp_max=timestamp_max,
        time_start=time_start,
        time_end=time_end,
        from_bank=from_bank,
        from_account=from_account,
        from_country=from_country,
        to_bank=to_bank,
        to_account=to_account,
        to_country=to_country,
        receiving_currency=receiving_currency,
        payment_currency=payment_currency,
        payment_format=payment_format,
        amount_received_min=amount_received_min,
        amount_received_max=amount_received_max,
        amount_paid_min=amount_paid_min,
        amount_paid_max=amount_paid_max,
    )


@router.post("/", response_model=TransactionPublic)
def create_transaction(transaction: Transaction):
    with get_session() as session:
        session.add(transaction)
        session.commit()
        session.refresh(transaction)
        return serialize_transaction(transaction)


@router.post("/batch", response_model=list[TransactionPublic])
def create_transactions(transactions: list[Transaction]):
    with get_session() as session:
        session.add_all(transactions)
        session.commit()
        for transaction in transactions:
            session.refresh(transaction)
        return [serialize_transaction(transaction) for transaction in transactions]


@router.get("/", response_model=list[TransactionPublic])
def read_transactions(
    timestamp_gt: Annotated[datetime | None, Query(description="Return transactions with timestamp greater than this value")] = None,
    timestamp_lt: Annotated[datetime | None, Query(description="Return transactions with timestamp lower than this value")] = None,
    time_start: Annotated[str | None, Query(alias="timeStart")] = None,
    time_end: Annotated[str | None, Query(alias="timeEnd")] = None,
    from_bank: Annotated[list[str] | None, Query(alias="fromBank")] = None,
    from_account: Annotated[list[str] | None, Query(alias="fromAccount")] = None,
    from_country: Annotated[list[str] | None, Query(alias="fromCountry")] = None,
    to_bank: Annotated[list[str] | None, Query(alias="toBank")] = None,
    to_account: Annotated[list[str] | None, Query(alias="toAccount")] = None,
    to_country: Annotated[list[str] | None, Query(alias="toCountry")] = None,
    receiving_currency: Annotated[list[str] | None, Query(alias="receivingCurrency")] = None,
    payment_currency: Annotated[list[str] | None, Query(alias="paymentCurrency")] = None,
    payment_format: Annotated[list[str] | None, Query(alias="paymentFormat")] = None,
    amount_received_min: Annotated[float | None, Query(alias="amountReceivedMin")] = None,
    amount_received_max: Annotated[float | None, Query(alias="amountReceivedMax")] = None,
    amount_paid_min: Annotated[float | None, Query(alias="amountPaidMin")] = None,
    amount_paid_max: Annotated[float | None, Query(alias="amountPaidMax")] = None,
    predicted_alert: Annotated[bool | None, Query(description="Filter by predicted alert flag", alias="predictedAlert")] = None,
    dashboard_sample_only: Annotated[
        bool,
        Query(description="Only return the curated dashboard sample subset"),
    ] = False,
    limit: Annotated[int, Query(ge=1, le=1000, description="Maximum number of records to return")] = 100,
    offset: Annotated[int, Query(ge=0, description="Number of records to skip before returning records")] = 0,
):
    with get_session() as session:
        statement = build_filtered_transaction_statement(
            timestamp_min=timestamp_gt,
            timestamp_max=timestamp_lt,
            time_start=time_start,
            time_end=time_end,
            from_bank=from_bank,
            from_account=from_account,
            from_country=from_country,
            to_bank=to_bank,
            to_account=to_account,
            to_country=to_country,
            receiving_currency=receiving_currency,
            payment_currency=payment_currency,
            payment_format=payment_format,
            amount_received_min=amount_received_min,
            amount_received_max=amount_received_max,
            amount_paid_min=amount_paid_min,
            amount_paid_max=amount_paid_max,
            predicted_alert=predicted_alert,
            dashboard_sample_only=dashboard_sample_only,
        )
        statement = statement.order_by(Transaction.timestamp).offset(offset).limit(limit)
        transactions = session.exec(statement).all()
        return [serialize_transaction(transaction) for transaction in transactions]


@router.get("/dashboard-records", response_model=DashboardTransactionsResponse)
def read_dashboard_records(
    limit: Annotated[
        int,
        Query(ge=100, le=10000, description="Maximum number of dashboard records to return"),
    ] = 5000,
    offset: Annotated[int, Query(ge=0, description="Number of dashboard records to skip")] = 0,
):
    with get_session() as session:
        statement = (
            select(Transaction)
            .where(Transaction.is_dashboard_sample.is_(True))
            .order_by(Transaction.timestamp)
            .offset(offset)
            .limit(limit)
        )
        records = session.exec(statement).all()
        total_record_count = session.exec(select(func.count()).select_from(Transaction)).one()
        dashboard_sample_count = session.exec(
            select(func.count()).select_from(Transaction).where(Transaction.is_dashboard_sample.is_(True)),
        ).one()

        return DashboardTransactionsResponse(
            records=[serialize_transaction(record) for record in records],
            totalRecordCount=total_record_count,
            dashboardSampleCount=dashboard_sample_count,
        )


@router.get("/dashboard-summary", response_model=DashboardSummaryResponse)
def read_dashboard_summary(
    timestamp_min: Annotated[datetime | None, Query(alias="timestampMin")] = None,
    timestamp_max: Annotated[datetime | None, Query(alias="timestampMax")] = None,
    time_start: Annotated[str | None, Query(alias="timeStart")] = None,
    time_end: Annotated[str | None, Query(alias="timeEnd")] = None,
    from_bank: Annotated[list[str] | None, Query(alias="fromBank")] = None,
    from_account: Annotated[list[str] | None, Query(alias="fromAccount")] = None,
    from_country: Annotated[list[str] | None, Query(alias="fromCountry")] = None,
    to_bank: Annotated[list[str] | None, Query(alias="toBank")] = None,
    to_account: Annotated[list[str] | None, Query(alias="toAccount")] = None,
    to_country: Annotated[list[str] | None, Query(alias="toCountry")] = None,
    receiving_currency: Annotated[list[str] | None, Query(alias="receivingCurrency")] = None,
    payment_currency: Annotated[list[str] | None, Query(alias="paymentCurrency")] = None,
    payment_format: Annotated[list[str] | None, Query(alias="paymentFormat")] = None,
    amount_received_min: Annotated[float | None, Query(alias="amountReceivedMin")] = None,
    amount_received_max: Annotated[float | None, Query(alias="amountReceivedMax")] = None,
    amount_paid_min: Annotated[float | None, Query(alias="amountPaidMin")] = None,
    amount_paid_max: Annotated[float | None, Query(alias="amountPaidMax")] = None,
):
    with get_session() as session:
        if should_use_cached_global_summary(
            timestamp_min=timestamp_min,
            timestamp_max=timestamp_max,
            time_start=time_start,
            time_end=time_end,
            from_bank=from_bank,
            from_account=from_account,
            from_country=from_country,
            to_bank=to_bank,
            to_account=to_account,
            to_country=to_country,
            receiving_currency=receiving_currency,
            payment_currency=payment_currency,
            payment_format=payment_format,
            amount_received_min=amount_received_min,
            amount_received_max=amount_received_max,
            amount_paid_min=amount_paid_min,
            amount_paid_max=amount_paid_max,
        ):
            return get_cached_global_dashboard_summary(session) or refresh_global_dashboard_summary_cache(session)

        statement = build_filtered_transaction_statement(
            timestamp_min=timestamp_min,
            timestamp_max=timestamp_max,
            time_start=time_start,
            time_end=time_end,
            from_bank=from_bank,
            from_account=from_account,
            from_country=from_country,
            to_bank=to_bank,
            to_account=to_account,
            to_country=to_country,
            receiving_currency=receiving_currency,
            payment_currency=payment_currency,
            payment_format=payment_format,
            amount_received_min=amount_received_min,
            amount_received_max=amount_received_max,
            amount_paid_min=amount_paid_min,
            amount_paid_max=amount_paid_max,
        )
        return get_dashboard_summary(session, statement)


@router.get("/ml-results/fingerprint")
def read_ml_results_fingerprint(
    first_window_limit: Annotated[
        int,
        Query(ge=100, le=10000, description="Number of ordered inference rows to hash", alias="firstWindowLimit"),
    ] = 1000,
):
    with get_session() as session:
        dataset_split = get_dataset_split(session)
        model = get_or_train_model(
            session,
            dashboard_sample_only=False,
            dataset_split=dataset_split,
        )
        total_count = int(session.exec(select(func.count()).select_from(Transaction)).one())
        total_positive_count = int(
            session.exec(
                select(func.count())
                .select_from(Transaction)
                .where(Transaction.is_laundering.is_(True)),
            ).one(),
        )
        dashboard_sample_count = int(
            session.exec(
                select(func.count())
                .select_from(Transaction)
                .where(Transaction.is_dashboard_sample.is_(True)),
            ).one(),
        )
        dashboard_sample_positive_count = int(
            session.exec(
                select(func.count())
                .select_from(Transaction)
                .where(Transaction.is_dashboard_sample.is_(True))
                .where(Transaction.is_laundering.is_(True)),
            ).one(),
        )
        dashboard_sample_alert_count = int(
            session.exec(
                select(func.count())
                .select_from(Transaction)
                .where(Transaction.is_dashboard_sample.is_(True))
                .where(Transaction.predicted_alert.is_(True)),
            ).one(),
        )
        sample_bounds = session.exec(
            select(
                func.min(Transaction.id).label("min_id"),
                func.max(Transaction.id).label("max_id"),
            ).where(Transaction.is_dashboard_sample.is_(True)),
        ).one()
        first_window_rows = session.exec(
            select(Transaction)
            .where(Transaction.is_dashboard_sample.is_(True))
            .order_by(Transaction.id)
            .limit(first_window_limit),
        ).all()
        all_sample_rows = session.exec(
            select(Transaction)
            .where(Transaction.is_dashboard_sample.is_(True))
            .order_by(Transaction.id),
        ).all()

        return {
            "database": {
                "totalRecordCount": total_count,
                "totalPositiveCount": total_positive_count,
            },
            "dashboardSample": {
                "recordCount": dashboard_sample_count,
                "positiveCount": dashboard_sample_positive_count,
                "alertCount": dashboard_sample_alert_count,
                "minId": sample_bounds.min_id,
                "maxId": sample_bounds.max_id,
                "fingerprint": hash_inference_rows(all_sample_rows),
            },
            "firstInferenceWindow": {
                "limit": first_window_limit,
                "recordCount": len(first_window_rows),
                "positiveCount": sum(1 for row in first_window_rows if row.is_laundering),
                "alertCount": sum(1 for row in first_window_rows if row.predicted_alert),
                "minId": min((row.id or 0 for row in first_window_rows), default=None),
                "maxId": max((row.id or 0 for row in first_window_rows), default=None),
                "fingerprint": hash_inference_rows(first_window_rows),
            },
            "model": {
                "storagePath": model.storage_path,
                "trainedRecordCount": model.trained_record_count,
                "positiveTrainCount": model.positive_train_count,
                "negativeTrainCount": model.negative_train_count,
                "trainingMinId": model.training_min_id,
                "trainingMaxId": model.training_max_id,
                "threshold": model.alert_threshold,
                "cacheKey": model.cache_key,
            },
        }


@router.get("/alerts", response_model=AlertListResponse)
def read_alerts(
    timestamp_min: Annotated[datetime | None, Query(alias="timestampMin")] = None,
    timestamp_max: Annotated[datetime | None, Query(alias="timestampMax")] = None,
    time_start: Annotated[str | None, Query(alias="timeStart")] = None,
    time_end: Annotated[str | None, Query(alias="timeEnd")] = None,
    from_bank: Annotated[list[str] | None, Query(alias="fromBank")] = None,
    from_account: Annotated[list[str] | None, Query(alias="fromAccount")] = None,
    from_country: Annotated[list[str] | None, Query(alias="fromCountry")] = None,
    to_bank: Annotated[list[str] | None, Query(alias="toBank")] = None,
    to_account: Annotated[list[str] | None, Query(alias="toAccount")] = None,
    to_country: Annotated[list[str] | None, Query(alias="toCountry")] = None,
    receiving_currency: Annotated[list[str] | None, Query(alias="receivingCurrency")] = None,
    payment_currency: Annotated[list[str] | None, Query(alias="paymentCurrency")] = None,
    payment_format: Annotated[list[str] | None, Query(alias="paymentFormat")] = None,
    amount_received_min: Annotated[float | None, Query(alias="amountReceivedMin")] = None,
    amount_received_max: Annotated[float | None, Query(alias="amountReceivedMax")] = None,
    amount_paid_min: Annotated[float | None, Query(alias="amountPaidMin")] = None,
    amount_paid_max: Annotated[float | None, Query(alias="amountPaidMax")] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    with get_session() as session:
        if has_no_active_filters(
            timestamp_min=timestamp_min,
            timestamp_max=timestamp_max,
            time_start=time_start,
            time_end=time_end,
            from_bank=from_bank,
            from_account=from_account,
            from_country=from_country,
            to_bank=to_bank,
            to_account=to_account,
            to_country=to_country,
            receiving_currency=receiving_currency,
            payment_currency=payment_currency,
            payment_format=payment_format,
            amount_received_min=amount_received_min,
            amount_received_max=amount_received_max,
            amount_paid_min=amount_paid_min,
            amount_paid_max=amount_paid_max,
        ):
            return get_cached_global_alerts(session, limit=limit, offset=offset) or refresh_global_alert_queue_cache(
                session,
                limit=max(limit + offset, 600),
            )

        statement = build_filtered_transaction_statement(
            timestamp_min=timestamp_min,
            timestamp_max=timestamp_max,
            time_start=time_start,
            time_end=time_end,
            from_bank=from_bank,
            from_account=from_account,
            from_country=from_country,
            to_bank=to_bank,
            to_account=to_account,
            to_country=to_country,
            receiving_currency=receiving_currency,
            payment_currency=payment_currency,
            payment_format=payment_format,
            amount_received_min=amount_received_min,
            amount_received_max=amount_received_max,
            amount_paid_min=amount_paid_min,
            amount_paid_max=amount_paid_max,
        )
        return get_alerts(session, statement, limit=limit, offset=offset)


@router.get("/ml-results", response_model=MlResultsResponse)
def read_ml_results(
    timestamp_min: Annotated[datetime | None, Query(alias="timestampMin")] = None,
    timestamp_max: Annotated[datetime | None, Query(alias="timestampMax")] = None,
    time_start: Annotated[str | None, Query(alias="timeStart")] = None,
    time_end: Annotated[str | None, Query(alias="timeEnd")] = None,
    from_bank: Annotated[list[str] | None, Query(alias="fromBank")] = None,
    from_account: Annotated[list[str] | None, Query(alias="fromAccount")] = None,
    from_country: Annotated[list[str] | None, Query(alias="fromCountry")] = None,
    to_bank: Annotated[list[str] | None, Query(alias="toBank")] = None,
    to_account: Annotated[list[str] | None, Query(alias="toAccount")] = None,
    to_country: Annotated[list[str] | None, Query(alias="toCountry")] = None,
    receiving_currency: Annotated[list[str] | None, Query(alias="receivingCurrency")] = None,
    payment_currency: Annotated[list[str] | None, Query(alias="paymentCurrency")] = None,
    payment_format: Annotated[list[str] | None, Query(alias="paymentFormat")] = None,
    amount_received_min: Annotated[float | None, Query(alias="amountReceivedMin")] = None,
    amount_received_max: Annotated[float | None, Query(alias="amountReceivedMax")] = None,
    amount_paid_min: Annotated[float | None, Query(alias="amountPaidMin")] = None,
    amount_paid_max: Annotated[float | None, Query(alias="amountPaidMax")] = None,
    dashboard_sample_only: Annotated[
        bool,
        Query(description="Only run ML inference over the curated dashboard sample", alias="dashboardSampleOnly"),
    ] = False,
    batch_number: Annotated[
        int,
        Query(ge=0, description="Inference batch number for paginated result sets", alias="batchNumber"),
    ] = 0,
    limit: Annotated[int, Query(ge=100, le=50000, description="Maximum inference records to return")] = 10000,
    offset: Annotated[int, Query(ge=0)] = 0,
    after_id: Annotated[
        int | None,
        Query(ge=0, description="Primary-key cursor for efficient indexed pagination", alias="afterId"),
    ] = None,
    feature_keys: Annotated[
        list[str] | None,
        Query(
            description="Optional active feature keys for counterfactual inference.",
            alias="featureKeys",
        ),
    ] = None,
):
    with get_session() as session:
        statement = build_ml_transaction_statement(
            timestamp_min=timestamp_min,
            timestamp_max=timestamp_max,
            time_start=time_start,
            time_end=time_end,
            from_bank=from_bank,
            from_account=from_account,
            from_country=from_country,
            to_bank=to_bank,
            to_account=to_account,
            to_country=to_country,
            receiving_currency=receiving_currency,
            payment_currency=payment_currency,
            payment_format=payment_format,
            amount_received_min=amount_received_min,
            amount_received_max=amount_received_max,
            amount_paid_min=amount_paid_min,
            amount_paid_max=amount_paid_max,
            dashboard_sample_only=dashboard_sample_only,
        )
        use_dataset_total_count = should_use_dataset_total_count_for_ml(
            dashboard_sample_only=dashboard_sample_only,
            timestamp_min=timestamp_min,
            timestamp_max=timestamp_max,
            time_start=time_start,
            time_end=time_end,
            from_bank=from_bank,
            from_account=from_account,
            from_country=from_country,
            to_bank=to_bank,
            to_account=to_account,
            to_country=to_country,
            receiving_currency=receiving_currency,
            payment_currency=payment_currency,
            payment_format=payment_format,
            amount_received_min=amount_received_min,
            amount_received_max=amount_received_max,
            amount_paid_min=amount_paid_min,
            amount_paid_max=amount_paid_max,
        )
        return build_ml_results(
            session,
            statement,
            limit=limit,
            offset=offset,
            batch_number=batch_number,
            dashboard_sample_only=dashboard_sample_only,
            after_id=after_id,
            use_dataset_total_count=use_dataset_total_count,
            feature_keys=feature_keys,
        )


@router.get("/ml-results/averaged-waterfall", response_model=AveragedShapWaterfallResponse)
def read_averaged_randomized_feature_waterfall(
    feature_key: Annotated[
        str,
        Query(description="Feature to randomise from the training distribution.", alias="featureKey"),
    ],
    transaction_id: Annotated[
        int | None,
        Query(ge=1, description="Transaction id of the observation to explain.", alias="transactionId"),
    ] = None,
    record_key: Annotated[
        str | None,
        Query(description="Record key of the observation to explain.", alias="recordKey"),
    ] = None,
    row_index: Annotated[
        int | None,
        Query(ge=0, description="Ordered row index of the observation to explain.", alias="rowIndex"),
    ] = 0,
    iterations: Annotated[
        int,
        Query(ge=1, le=512, description="Number of randomised SHAP recomputations to average."),
    ] = 64,
    seed: Annotated[
        int | None,
        Query(description="Optional random seed for reproducible feature sampling."),
    ] = None,
    feature_keys: Annotated[
        list[str] | None,
        Query(description="Optional active feature keys for the existing counterfactual inference path.", alias="featureKeys"),
    ] = None,
):
    if feature_key not in FEATURE_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown feature: {feature_key}")

    with get_session() as session:
        record = resolve_ml_observation(
            session,
            transaction_id=transaction_id,
            record_key=record_key,
            row_index=row_index,
        )
        return build_averaged_randomized_feature_waterfall(
            session,
            record,
            feature_key=feature_key,
            iterations=iterations,
            seed=seed,
            feature_keys=feature_keys,
        )


@router.get("/ml-results/stream")
def stream_ml_results(
    timestamp_min: Annotated[datetime | None, Query(alias="timestampMin")] = None,
    timestamp_max: Annotated[datetime | None, Query(alias="timestampMax")] = None,
    time_start: Annotated[str | None, Query(alias="timeStart")] = None,
    time_end: Annotated[str | None, Query(alias="timeEnd")] = None,
    from_bank: Annotated[list[str] | None, Query(alias="fromBank")] = None,
    from_account: Annotated[list[str] | None, Query(alias="fromAccount")] = None,
    from_country: Annotated[list[str] | None, Query(alias="fromCountry")] = None,
    to_bank: Annotated[list[str] | None, Query(alias="toBank")] = None,
    to_account: Annotated[list[str] | None, Query(alias="toAccount")] = None,
    to_country: Annotated[list[str] | None, Query(alias="toCountry")] = None,
    receiving_currency: Annotated[list[str] | None, Query(alias="receivingCurrency")] = None,
    payment_currency: Annotated[list[str] | None, Query(alias="paymentCurrency")] = None,
    payment_format: Annotated[list[str] | None, Query(alias="paymentFormat")] = None,
    amount_received_min: Annotated[float | None, Query(alias="amountReceivedMin")] = None,
    amount_received_max: Annotated[float | None, Query(alias="amountReceivedMax")] = None,
    amount_paid_min: Annotated[float | None, Query(alias="amountPaidMin")] = None,
    amount_paid_max: Annotated[float | None, Query(alias="amountPaidMax")] = None,
    dashboard_sample_only: Annotated[
        bool,
        Query(description="Only run ML inference over the curated dashboard sample", alias="dashboardSampleOnly"),
    ] = False,
    batch_size: Annotated[int, Query(ge=1, le=10000, alias="batchSize")] = 256,
    max_records: Annotated[int, Query(ge=100, le=100000, alias="maxRecords")] = 100000,
    after_id: Annotated[
        int | None,
        Query(ge=0, description="Primary-key cursor for efficient indexed pagination", alias="afterId"),
    ] = None,
    feature_keys: Annotated[
        list[str] | None,
        Query(description="Optional active feature keys for counterfactual inference.", alias="featureKeys"),
    ] = None,
):
    def build_statement(dashboard_sample_only_value: bool):
        return build_ml_transaction_statement(
            timestamp_min=timestamp_min,
            timestamp_max=timestamp_max,
            time_start=time_start,
            time_end=time_end,
            from_bank=from_bank,
            from_account=from_account,
            from_country=from_country,
            to_bank=to_bank,
            to_account=to_account,
            to_country=to_country,
            receiving_currency=receiving_currency,
            payment_currency=payment_currency,
            payment_format=payment_format,
            amount_received_min=amount_received_min,
            amount_received_max=amount_received_max,
            amount_paid_min=amount_paid_min,
            amount_paid_max=amount_paid_max,
            dashboard_sample_only=dashboard_sample_only_value,
        )

    def generate_results():
        emitted_records = 0
        cursor_id = after_id
        batch_number = 0
        total_filtered_record_count = None

        with get_session() as session:
            use_dataset_total_count = should_use_dataset_total_count_for_ml(
                dashboard_sample_only=dashboard_sample_only,
                timestamp_min=timestamp_min,
                timestamp_max=timestamp_max,
                time_start=time_start,
                time_end=time_end,
                from_bank=from_bank,
                from_account=from_account,
                from_country=from_country,
                to_bank=to_bank,
                to_account=to_account,
                to_country=to_country,
                receiving_currency=receiving_currency,
                payment_currency=payment_currency,
                payment_format=payment_format,
                amount_received_min=amount_received_min,
                amount_received_max=amount_received_max,
                amount_paid_min=amount_paid_min,
                amount_paid_max=amount_paid_max,
            )

            while emitted_records < max_records:
                current_limit = min(batch_size, max_records - emitted_records)
                statement = build_statement(dashboard_sample_only)

                payload = build_ml_results(
                    session,
                    statement,
                    limit=current_limit,
                    offset=0,
                    batch_number=batch_number,
                    dashboard_sample_only=dashboard_sample_only,
                    after_id=cursor_id,
                    total_filtered_record_count=total_filtered_record_count,
                    use_dataset_total_count=use_dataset_total_count,
                    feature_keys=feature_keys,
                )

                if total_filtered_record_count is None:
                    total_filtered_record_count = payload.total_filtered_record_count

                if not payload.records:
                    break

                emitted_records += len(payload.records)
                cursor_id = payload.batch.next_cursor_id
                batch_number += 1
                yield payload.model_dump_json(by_alias=True) + "\n"

                if not payload.batch.has_next_batch or cursor_id is None:
                    break

    return StreamingResponse(
        generate_results(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store"},
    )
