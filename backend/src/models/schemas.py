from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field as PydanticField
from sqlalchemy import Column, JSON, UniqueConstraint
from sqlmodel import Field, SQLModel

class TestData(BaseModel):
    some_text: Optional[str] = None
    random_number: Optional[str] = None


class Transaction(SQLModel, table=True):
    __tablename__ = "transactions"

    id: int | None = Field(default=None, primary_key=True)
    record_key: str = Field(index=True, unique=True)
    timestamp: datetime = Field(index=True)
    from_bank: str = Field(index=True)
    from_account: str = Field(index=True)
    from_country: str = Field(index=True)
    to_bank: str = Field(index=True)
    to_account: str = Field(index=True)
    to_country: str = Field(index=True)
    amount_received: float
    receiving_currency: str = Field(index=True)
    amount_paid: float
    payment_currency: str = Field(index=True)
    payment_format: str = Field(index=True)
    is_laundering: bool = Field(index=True)
    predicted_alert: bool = Field(index=True)
    model_score: float = Field(index=True)
    is_dashboard_sample: bool = Field(default=False, index=True)


class GlobalDashboardBaselineCache(SQLModel, table=True):
    __tablename__ = "global_dashboard_baseline_cache"

    cache_key: str = Field(primary_key=True, default="global")
    total_record_count: int
    filtered_record_count: int
    alert_count: int
    true_positive: int
    false_positive: int
    false_negative: int
    true_negative: int
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class GlobalAlertQueueCache(SQLModel, table=True):
    __tablename__ = "global_alert_queue_cache"

    cache_key: str = Field(primary_key=True)
    position: int = Field(primary_key=True)
    alert_id: str
    severity: str
    confidence: float
    time_label: str
    route_label: str
    amount_label: str
    record_key: str = Field(index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class MlPredictionCache(SQLModel, table=True):
    __tablename__ = "ml_prediction_cache"
    __table_args__ = (UniqueConstraint("model_cache_key", "transaction_id"),)

    id: int | None = Field(default=None, primary_key=True)
    model_cache_key: str = Field(index=True)
    transaction_id: int = Field(index=True, foreign_key="transactions.id")
    model_score: float
    base_value: float
    contributions: dict[str, float] = Field(sa_column=Column(JSON, nullable=False))
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class TransactionPublic(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    record_key: str = PydanticField(alias="recordKey")
    timestamp: datetime
    from_bank: str = PydanticField(alias="fromBank")
    from_account: str = PydanticField(alias="fromAccount")
    from_country: str = PydanticField(alias="fromCountry")
    to_bank: str = PydanticField(alias="toBank")
    to_account: str = PydanticField(alias="toAccount")
    to_country: str = PydanticField(alias="toCountry")
    amount_received: float = PydanticField(alias="amountReceived")
    receiving_currency: str = PydanticField(alias="receivingCurrency")
    amount_paid: float = PydanticField(alias="amountPaid")
    payment_currency: str = PydanticField(alias="paymentCurrency")
    payment_format: str = PydanticField(alias="paymentFormat")
    is_laundering: bool = PydanticField(alias="isLaundering")
    predicted_alert: bool = PydanticField(alias="predictedAlert")
    model_score: float = PydanticField(alias="modelScore")


class DashboardTransactionsResponse(BaseModel):
    records: list[TransactionPublic]
    total_record_count: int = PydanticField(alias="totalRecordCount")
    dashboard_sample_count: int = PydanticField(alias="dashboardSampleCount")


class MetricCardResponse(BaseModel):
    label: str
    value: str
    detail: str


class ConfusionMatrixResponse(BaseModel):
    total: int
    alert_count: int = PydanticField(alias="alertCount")
    true_positive: int = PydanticField(alias="truePositive")
    false_positive: int = PydanticField(alias="falsePositive")
    false_negative: int = PydanticField(alias="falseNegative")
    true_negative: int = PydanticField(alias="trueNegative")


class DashboardSummaryResponse(BaseModel):
    metrics: list[MetricCardResponse]
    confusion_matrix: ConfusionMatrixResponse = PydanticField(alias="confusionMatrix")
    filtered_record_count: int = PydanticField(alias="filteredRecordCount")
    total_record_count: int = PydanticField(alias="totalRecordCount")


class AlertPreviewResponse(BaseModel):
    id: str
    severity: str
    confidence: float
    time_label: str = PydanticField(alias="timeLabel")
    route_label: str = PydanticField(alias="routeLabel")
    amount_label: str = PydanticField(alias="amountLabel")
    record: TransactionPublic


class AlertListResponse(BaseModel):
    alerts: list[AlertPreviewResponse]
    filtered_alert_count: int = PydanticField(alias="filteredAlertCount")
    total_filtered_record_count: int = PydanticField(alias="totalFilteredRecordCount")


class MlShapPointResponse(BaseModel):
    shap_value: float = PydanticField(alias="shapValue")
    feature_value: float = PydanticField(alias="featureValue")
    jitter: float


class MlShapRowResponse(BaseModel):
    feature_key: str = PydanticField(alias="featureKey")
    importance: float
    points: list[MlShapPointResponse]


class MlWaterfallContributionResponse(BaseModel):
    feature_key: str = PydanticField(alias="featureKey")
    contribution: float
    start: float
    end: float


class MlRecordPredictionResponse(BaseModel):
    record_key: str = PydanticField(alias="recordKey")
    model_score: float = PydanticField(alias="modelScore")
    predicted_alert: bool = PydanticField(alias="predictedAlert")
    base_value: float = PydanticField(alias="baseValue")
    waterfall: list[MlWaterfallContributionResponse]


class MlRocPointResponse(BaseModel):
    threshold: float
    false_positive_rate: float = PydanticField(alias="falsePositiveRate")
    true_positive_rate: float = PydanticField(alias="truePositiveRate")


class MlRocResponse(BaseModel):
    auc: float
    points: list[MlRocPointResponse]


class MlModelInfoResponse(BaseModel):
    model_type: str = PydanticField(alias="modelType")
    model_storage_path: str | None = PydanticField(alias="modelStoragePath")
    trained_record_count: int = PydanticField(alias="trainedRecordCount")
    positive_train_count: int = PydanticField(alias="positiveTrainCount")
    negative_train_count: int = PydanticField(alias="negativeTrainCount")
    training_min_id: int | None = PydanticField(alias="trainingMinId")
    training_max_id: int | None = PydanticField(alias="trainingMaxId")
    threshold: float
    feature_keys: list[str] = PydanticField(alias="featureKeys")


class MlBatchInfoResponse(BaseModel):
    batch_number: int = PydanticField(alias="batchNumber")
    batch_size: int = PydanticField(alias="batchSize")
    offset: int
    next_cursor_id: int | None = PydanticField(alias="nextCursorId")
    inference_min_id: int | None = PydanticField(alias="inferenceMinId")
    inference_max_id: int | None = PydanticField(alias="inferenceMaxId")
    returned_record_count: int = PydanticField(alias="returnedRecordCount")
    total_filtered_record_count: int = PydanticField(alias="totalFilteredRecordCount")
    total_batch_count: int = PydanticField(alias="totalBatchCount")
    has_next_batch: bool = PydanticField(alias="hasNextBatch")


class MlResultsResponse(BaseModel):
    model: MlModelInfoResponse
    batch: MlBatchInfoResponse
    records: list[TransactionPublic]
    predictions: list[MlRecordPredictionResponse]
    shap: list[MlShapRowResponse]
    roc: MlRocResponse
    confusion_matrix: ConfusionMatrixResponse = PydanticField(alias="confusionMatrix")
    metrics: list[MetricCardResponse]
    filtered_record_count: int = PydanticField(alias="filteredRecordCount")
    total_filtered_record_count: int = PydanticField(alias="totalFilteredRecordCount")


class AveragedShapWaterfallResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    model: MlModelInfoResponse
    record: TransactionPublic
    randomized_feature: str = PydanticField(alias="randomizedFeature")
    iterations: int
    seed: int | None
    averaged_explanation: MlRecordPredictionResponse = PydanticField(alias="averagedExplanation")
    waterfall_plot: list[MlWaterfallContributionResponse] = PydanticField(alias="waterfallPlot")
