from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.enums import SpecialOfferStatus


class LoyaltySettings(TimestampMixin, Base):
    __tablename__ = "loyalty_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    earn_percent: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    max_redeem_percent: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    point_ttl_days: Mapped[int] = mapped_column(Integer, default=365, nullable=False)
    redeem_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    welcome_bonus_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    welcome_bonus_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class HolidayBonus(TimestampMixin, Base):
    __tablename__ = "holiday_bonuses"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    earn_percent: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class SpecialOffer(TimestampMixin, Base):
    __tablename__ = "special_offers"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    image_path: Mapped[str] = mapped_column(String(512), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[SpecialOfferStatus] = mapped_column(
        String(32),
        default=SpecialOfferStatus.draft,
        nullable=False,
    )


class OfferDismissal(TimestampMixin, Base):
    __tablename__ = "offer_dismissals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    offer_id: Mapped[int] = mapped_column(ForeignKey("special_offers.id"), index=True)
