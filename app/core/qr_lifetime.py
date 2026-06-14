from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.core.config import Settings


def get_qr_expires_at(settings: Settings, *, now: datetime | None = None) -> datetime:
    """Next local midnight in the configured QR timezone, as UTC."""
    current = now or datetime.now(UTC)
    if current.tzinfo is None:
        current = current.replace(tzinfo=UTC)

    tz = ZoneInfo(settings.qr_timezone)
    local_now = current.astimezone(tz)
    next_midnight_local = datetime.combine(
        local_now.date() + timedelta(days=1),
        time.min,
        tzinfo=tz,
    )
    return next_midnight_local.astimezone(UTC)


def get_qr_ttl_seconds(settings: Settings, *, now: datetime | None = None) -> int:
    current = now or datetime.now(UTC)
    if current.tzinfo is None:
        current = current.replace(tzinfo=UTC)
    expires_at = get_qr_expires_at(settings, now=current)
    return max(1, int((expires_at - current).total_seconds()))
