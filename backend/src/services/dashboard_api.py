from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import case, func, or_
from sqlalchemy.sql import Select
from sqlmodel import Session, select

from models.schemas import (
    AlertListResponse,
    AlertPreviewResponse,
    ConfusionMatrixResponse,
    GlobalDashboardBaselineCache,
    GlobalAlertQueueCache,
    DashboardSummaryResponse,
    MetricCardResponse,
    Transaction,
    TransactionPublic,
)

GLOBAL_ALERT_CACHE_LIMIT = 1000


def serialize_transaction(transaction: Transaction) -> TransactionPublic:
    return TransactionPublic(
        id=transaction.id or 0,
        recordKey=transaction.record_key,
        timestamp=transaction.timestamp,
        fromBank=transaction.from_bank,
        fromAccount=transaction.from_account,
        fromCountry=transaction.from_country,
        toBank=transaction.to_bank,
        toAccount=transaction.to_account,
        toCountry=transaction.to_country,
        amountReceived=transaction.amount_received,
        receivingCurrency=transaction.receiving_currency,
        amountPaid=transaction.amount_paid,
        paymentCurrency=transaction.payment_currency,
        paymentFormat=transaction.payment_format,
        isLaundering=transaction.is_laundering,
        predictedAlert=transaction.predicted_alert,
        modelScore=transaction.model_score,
    )


def build_filtered_transaction_statement(
    *,
    timestamp_min: datetime | None = None,
    timestamp_max: datetime | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
    from_bank: list[str] | None = None,
    from_account: list[str] | None = None,
    from_country: list[str] | None = None,
    to_bank: list[str] | None = None,
    to_account: list[str] | None = None,
    to_country: list[str] | None = None,
    receiving_currency: list[str] | None = None,
    payment_currency: list[str] | None = None,
    payment_format: list[str] | None = None,
    amount_received_min: float | None = None,
    amount_received_max: float | None = None,
    amount_paid_min: float | None = None,
    amount_paid_max: float | None = None,
    predicted_alert: bool | None = None,
    dashboard_sample_only: bool = False,
) -> Select[tuple[Transaction]]:
    statement = select(Transaction)

    if timestamp_min is not None:
        statement = statement.where(Transaction.timestamp >= timestamp_min)
    if timestamp_max is not None:
        statement = statement.where(Transaction.timestamp <= timestamp_max)

    if from_bank:
        statement = statement.where(Transaction.from_bank.in_(from_bank))
    if from_account:
        statement = statement.where(Transaction.from_account.in_(from_account))
    if from_country:
        statement = statement.where(Transaction.from_country.in_(from_country))
    if to_bank:
        statement = statement.where(Transaction.to_bank.in_(to_bank))
    if to_account:
        statement = statement.where(Transaction.to_account.in_(to_account))
    if to_country:
        statement = statement.where(Transaction.to_country.in_(to_country))
    if receiving_currency:
        statement = statement.where(Transaction.receiving_currency.in_(receiving_currency))
    if payment_currency:
        statement = statement.where(Transaction.payment_currency.in_(payment_currency))
    if payment_format:
        statement = statement.where(Transaction.payment_format.in_(payment_format))

    if amount_received_min is not None:
        statement = statement.where(Transaction.amount_received >= amount_received_min)
    if amount_received_max is not None:
        statement = statement.where(Transaction.amount_received <= amount_received_max)
    if amount_paid_min is not None:
        statement = statement.where(Transaction.amount_paid >= amount_paid_min)
    if amount_paid_max is not None:
        statement = statement.where(Transaction.amount_paid <= amount_paid_max)

    if predicted_alert is not None:
        statement = statement.where(Transaction.predicted_alert.is_(predicted_alert))
    if dashboard_sample_only:
        statement = statement.where(Transaction.is_dashboard_sample.is_(True))

    if time_start == "00:00" and time_end == "23:59":
        time_start = None
        time_end = None

    if time_start and time_end:
        start_hours, start_minutes = [int(part) for part in time_start.split(":", maxsplit=1)]
        end_hours, end_minutes = [int(part) for part in time_end.split(":", maxsplit=1)]
        start_total = start_hours * 60 + start_minutes
        end_total = end_hours * 60 + end_minutes
        timestamp_utc = func.timezone("UTC", Transaction.timestamp)
        transaction_minutes = (
            func.extract("hour", timestamp_utc) * 60 + func.extract("minute", timestamp_utc)
        )

        if start_total <= end_total:
            statement = statement.where(
                transaction_minutes >= start_total,
                transaction_minutes <= end_total,
            )
        else:
            statement = statement.where(
                or_(transaction_minutes >= start_total, transaction_minutes <= end_total),
            )

    return statement


def build_metrics_from_counts(
    *,
    total: int,
    true_positive: int,
    false_positive: int,
    false_negative: int,
    true_negative: int,
) -> list[MetricCardResponse]:
    accuracy = (true_positive + true_negative) / total if total > 0 else 0
    precision = true_positive / (true_positive + false_positive) if (true_positive + false_positive) > 0 else 0
    recall = true_positive / (true_positive + false_negative) if (true_positive + false_negative) > 0 else 0
    f1_score = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

    return [
        MetricCardResponse(label="Accuracy", value=f"{accuracy * 100:.1f}%", detail="Filtered selection"),
        MetricCardResponse(label="Precision", value=f"{precision * 100:.1f}%", detail="Filtered alerts"),
        MetricCardResponse(label="Recall", value=f"{recall * 100:.1f}%", detail="Filtered positives"),
        MetricCardResponse(label="F1 Score", value=f"{f1_score * 100:.1f}%", detail="Filtered balance"),
    ]


def build_dashboard_summary_response(
    *,
    total: int,
    alert_count: int,
    true_positive: int,
    false_positive: int,
    false_negative: int,
    true_negative: int,
    total_record_count: int,
) -> DashboardSummaryResponse:
    confusion_matrix = ConfusionMatrixResponse(
        total=total,
        alertCount=alert_count,
        truePositive=true_positive,
        falsePositive=false_positive,
        falseNegative=false_negative,
        trueNegative=true_negative,
    )

    return DashboardSummaryResponse(
        metrics=build_metrics_from_counts(
            total=confusion_matrix.total,
            true_positive=confusion_matrix.true_positive,
            false_positive=confusion_matrix.false_positive,
            false_negative=confusion_matrix.false_negative,
            true_negative=confusion_matrix.true_negative,
        ),
        confusionMatrix=confusion_matrix,
        filteredRecordCount=confusion_matrix.total,
        totalRecordCount=total_record_count,
    )


def compute_dashboard_summary_counts(session: Session, statement: Select[tuple[Transaction]]) -> dict[str, int]:
    subquery = statement.subquery()

    counts_row = session.exec(
        select(
            func.count().label("total"),
            func.coalesce(func.sum(case((subquery.c.predicted_alert.is_(True), 1), else_=0)), 0).label(
                "alert_count",
            ),
            func.coalesce(
                func.sum(
                    case(
                        ((subquery.c.predicted_alert.is_(True) & subquery.c.is_laundering.is_(True)), 1),
                        else_=0,
                    ),
                ),
                0,
            ).label("true_positive"),
            func.coalesce(
                func.sum(
                    case(
                        ((subquery.c.predicted_alert.is_(True) & subquery.c.is_laundering.is_(False)), 1),
                        else_=0,
                    ),
                ),
                0,
            ).label("false_positive"),
            func.coalesce(
                func.sum(
                    case(
                        ((subquery.c.predicted_alert.is_(False) & subquery.c.is_laundering.is_(True)), 1),
                        else_=0,
                    ),
                ),
                0,
            ).label("false_negative"),
            func.coalesce(
                func.sum(
                    case(
                        ((subquery.c.predicted_alert.is_(False) & subquery.c.is_laundering.is_(False)), 1),
                        else_=0,
                    ),
                ),
                0,
            ).label("true_negative"),
        ),
    ).one()

    return {
        "total": int(counts_row.total or 0),
        "alert_count": int(counts_row.alert_count or 0),
        "true_positive": int(counts_row.true_positive or 0),
        "false_positive": int(counts_row.false_positive or 0),
        "false_negative": int(counts_row.false_negative or 0),
        "true_negative": int(counts_row.true_negative or 0),
    }


def get_dashboard_summary(session: Session, statement: Select[tuple[Transaction]]) -> DashboardSummaryResponse:
    counts = compute_dashboard_summary_counts(session, statement)
    total_record_count = int(session.exec(select(func.count()).select_from(Transaction)).one())

    return build_dashboard_summary_response(
        total=counts["total"],
        alert_count=counts["alert_count"],
        true_positive=counts["true_positive"],
        false_positive=counts["false_positive"],
        false_negative=counts["false_negative"],
        true_negative=counts["true_negative"],
        total_record_count=total_record_count,
    )


def get_cached_global_dashboard_summary(session: Session) -> DashboardSummaryResponse | None:
    cache_entry = session.get(GlobalDashboardBaselineCache, "global")

    if cache_entry is None:
        return None

    return build_dashboard_summary_response(
        total=cache_entry.filtered_record_count,
        alert_count=cache_entry.alert_count,
        true_positive=cache_entry.true_positive,
        false_positive=cache_entry.false_positive,
        false_negative=cache_entry.false_negative,
        true_negative=cache_entry.true_negative,
        total_record_count=cache_entry.total_record_count,
    )


def refresh_global_dashboard_summary_cache(session: Session) -> DashboardSummaryResponse:
    counts = compute_dashboard_summary_counts(session, select(Transaction))
    total_record_count = int(session.exec(select(func.count()).select_from(Transaction)).one())
    cache_entry = session.get(GlobalDashboardBaselineCache, "global")

    if cache_entry is None:
        cache_entry = GlobalDashboardBaselineCache(
            cache_key="global",
            total_record_count=total_record_count,
            filtered_record_count=counts["total"],
            alert_count=counts["alert_count"],
            true_positive=counts["true_positive"],
            false_positive=counts["false_positive"],
            false_negative=counts["false_negative"],
            true_negative=counts["true_negative"],
            updated_at=datetime.utcnow(),
        )
        session.add(cache_entry)
    else:
        cache_entry.total_record_count = total_record_count
        cache_entry.filtered_record_count = counts["total"]
        cache_entry.alert_count = counts["alert_count"]
        cache_entry.true_positive = counts["true_positive"]
        cache_entry.false_positive = counts["false_positive"]
        cache_entry.false_negative = counts["false_negative"]
        cache_entry.true_negative = counts["true_negative"]
        cache_entry.updated_at = datetime.utcnow()

    session.commit()

    return build_dashboard_summary_response(
        total=counts["total"],
        alert_count=counts["alert_count"],
        true_positive=counts["true_positive"],
        false_positive=counts["false_positive"],
        false_negative=counts["false_negative"],
        true_negative=counts["true_negative"],
        total_record_count=total_record_count,
    )


def get_alert_severity(confidence: float) -> str:
    if confidence >= 0.82:
        return "high"
    if confidence >= 0.68:
        return "medium"
    return "low"


def format_compact_number(value: float) -> str:
    absolute = abs(value)
    if absolute >= 1_000_000:
        return f"{value / 1_000_000:.1f} M"
    if absolute >= 1_000:
        return f"{value / 1_000:.1f} K"
    return f"{value:,.0f}"


def format_compact_amount(value: float, currency: str) -> str:
    return f"{format_compact_number(value)} {currency}"


def format_alert_time(timestamp: datetime) -> str:
    return timestamp.strftime("%b %d, %H:%M")


def get_alerts(
    session: Session,
    statement: Select[tuple[Transaction]],
    *,
    limit: int,
    offset: int,
) -> AlertListResponse:
    alert_statement = (
        statement.where(Transaction.predicted_alert.is_(True))
        .order_by(Transaction.model_score.desc(), Transaction.timestamp)
        .offset(offset)
        .limit(limit)
    )
    alert_records = session.exec(alert_statement).all()
    filtered_alert_count = session.exec(
        select(func.count()).select_from(statement.where(Transaction.predicted_alert.is_(True)).subquery()),
    ).one()
    total_filtered_record_count = session.exec(
        select(func.count()).select_from(statement.subquery()),
    ).one()

    alerts = [
        AlertPreviewResponse(
            id="-".join(
                [
                    record.timestamp.isoformat(),
                    record.from_bank,
                    record.from_account,
                    record.to_bank,
                    record.to_account,
                    str(record.amount_paid),
                    record.payment_currency,
                ],
            ),
            severity=get_alert_severity(record.model_score),
            confidence=record.model_score,
            timeLabel=format_alert_time(record.timestamp),
            routeLabel=f"{record.from_country} -> {record.to_country}",
            amountLabel=format_compact_amount(record.amount_paid, record.payment_currency),
            record=serialize_transaction(record),
        )
        for record in alert_records
    ]

    return AlertListResponse(
        alerts=alerts,
        filteredAlertCount=int(filtered_alert_count),
        totalFilteredRecordCount=int(total_filtered_record_count),
    )


def refresh_global_alert_queue_cache(
    session: Session,
    *,
    limit: int = GLOBAL_ALERT_CACHE_LIMIT,
) -> AlertListResponse:
    response = get_alerts(session, select(Transaction), limit=limit, offset=0)

    existing_rows = session.exec(
        select(GlobalAlertQueueCache).where(GlobalAlertQueueCache.cache_key == "global"),
    ).all()
    for row in existing_rows:
        session.delete(row)

    timestamp = datetime.utcnow()
    for position, alert in enumerate(response.alerts):
        session.add(
            GlobalAlertQueueCache(
                cache_key="global",
                position=position,
                alert_id=alert.id,
                severity=alert.severity,
                confidence=alert.confidence,
                time_label=alert.time_label,
                route_label=alert.route_label,
                amount_label=alert.amount_label,
                record_key=alert.record.record_key,
                updated_at=timestamp,
            ),
        )

    session.commit()
    return response


def get_cached_global_alerts(
    session: Session,
    *,
    limit: int,
    offset: int,
) -> AlertListResponse | None:
    cached_rows = session.exec(
        select(GlobalAlertQueueCache)
        .where(GlobalAlertQueueCache.cache_key == "global")
        .order_by(GlobalAlertQueueCache.position),
    ).all()
    baseline_cache = session.get(GlobalDashboardBaselineCache, "global")
    total_record_count = int(
        baseline_cache.total_record_count
        if baseline_cache is not None
        else session.exec(select(func.count()).select_from(Transaction)).one(),
    )
    total_alert_count = int(
        baseline_cache.alert_count
        if baseline_cache is not None
        else session.exec(
            select(func.count()).select_from(Transaction).where(Transaction.predicted_alert.is_(True)),
        ).one(),
    )

    if not cached_rows:
        return None

    sliced_rows = cached_rows[offset : offset + limit]
    if not sliced_rows and offset > 0:
        return AlertListResponse(
            alerts=[],
            filteredAlertCount=total_alert_count,
            totalFilteredRecordCount=total_record_count,
        )

    record_keys = [row.record_key for row in sliced_rows]
    records = session.exec(
        select(Transaction).where(Transaction.record_key.in_(record_keys)),
    ).all()
    records_by_key = {record.record_key: record for record in records}

    alerts = [
        AlertPreviewResponse(
            id=row.alert_id,
            severity=row.severity,
            confidence=row.confidence,
            timeLabel=row.time_label,
            routeLabel=row.route_label,
            amountLabel=row.amount_label,
            record=serialize_transaction(records_by_key[row.record_key]),
        )
        for row in sliced_rows
        if row.record_key in records_by_key
    ]

    return AlertListResponse(
        alerts=alerts,
        filteredAlertCount=total_alert_count,
        totalFilteredRecordCount=total_record_count,
    )
