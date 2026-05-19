import os

from sqlalchemy import text
from sqlmodel import SQLModel, Session, create_engine


def get_database_url() -> str:
    return (
        os.getenv("DATABASE_URL")
        or os.getenv("POSTGRES_URL")
        or "postgresql://postgres:postgres@localhost:5432/postgres"
    )


connect_args = {}
engine = create_engine(get_database_url(), echo=False, connect_args=connect_args)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    ensure_transaction_performance_indexes()


def ensure_transaction_performance_indexes() -> None:
    index_statements = [
        "CREATE INDEX IF NOT EXISTS ix_transactions_timestamp_id ON transactions (timestamp, id)",
        "CREATE INDEX IF NOT EXISTS ix_transactions_dashboard_sample_id ON transactions (is_dashboard_sample, id)",
        "CREATE INDEX IF NOT EXISTS ix_transactions_predicted_alert_id ON transactions (predicted_alert, id)",
        "CREATE INDEX IF NOT EXISTS ix_transactions_laundering_id ON transactions (is_laundering, id)",
        "CREATE INDEX IF NOT EXISTS ix_ml_prediction_cache_model_transaction ON ml_prediction_cache (model_cache_key, transaction_id)",
    ]

    with engine.begin() as connection:
        for statement in index_statements:
            connection.execute(text(statement))


def get_session() -> Session:
    return Session(engine)
