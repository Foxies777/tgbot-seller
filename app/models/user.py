from datetime import date

from sqlalchemy import BigInteger, Date, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import UserStatus


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(64))
    full_name: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32))
    birth_date: Mapped[date | None] = mapped_column(Date)
    balance_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[UserStatus] = mapped_column(
        String(32),
        default=UserStatus.active,
        nullable=False,
    )

    transactions = relationship("Transaction", back_populates="user")
