from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import UserStatus


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(64))
    full_name: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32))
    phone_normalized: Mapped[str | None] = mapped_column(String(32), unique=True, index=True)
    birth_date: Mapped[date | None] = mapped_column(Date)
    balance_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    access_code_hash: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[UserStatus] = mapped_column(
        String(32),
        default=UserStatus.active,
        nullable=False,
    )

    transactions = relationship("Transaction", back_populates="user")


class Consent(TimestampMixin, Base):
    __tablename__ = "consents"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(Text)
