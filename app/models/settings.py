from datetime import date

from sqlalchemy import Boolean, Date, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class LoyaltySettings(TimestampMixin, Base):
    __tablename__ = "loyalty_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    earn_percent: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    max_redeem_percent: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    point_ttl_days: Mapped[int] = mapped_column(Integer, default=365, nullable=False)
    redeem_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class HolidayBonus(TimestampMixin, Base):
    __tablename__ = "holiday_bonuses"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    earn_percent: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
