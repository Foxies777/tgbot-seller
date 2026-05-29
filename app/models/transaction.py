from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import TransactionType


class Transaction(TimestampMixin, Base):
    __tablename__ = "transactions"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_transactions_idempotency_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    seller_id: Mapped[int | None] = mapped_column(ForeignKey("sellers.id"), index=True)
    transaction_type: Mapped[TransactionType] = mapped_column(String(32), index=True)
    purchase_amount_minor: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    points_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    balance_before: Mapped[int] = mapped_column(Integer, nullable=False)
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    user = relationship("User", back_populates="transactions")
    seller = relationship("Seller", back_populates="transactions")


class PointLot(TimestampMixin, Base):
    __tablename__ = "point_lots"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id"), index=True)
    original_points: Mapped[int] = mapped_column(Integer, nullable=False)
    remaining_points: Mapped[int] = mapped_column(Integer, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class IdempotencyKey(TimestampMixin, Base):
    __tablename__ = "idempotency_keys"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    transaction_id: Mapped[int | None] = mapped_column(ForeignKey("transactions.id"))
