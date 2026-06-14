from datetime import UTC, datetime

from app.core.config import Settings
from app.core.qr_lifetime import get_qr_expires_at, get_qr_ttl_seconds
from app.core.security import sign_qr_payload, verify_qr_payload


def test_qr_expires_at_next_midnight_moscow(settings: Settings) -> None:
    now = datetime(2026, 6, 9, 12, 30, tzinfo=UTC)
    expires_at = get_qr_expires_at(settings, now=now)

    assert expires_at == datetime(2026, 6, 9, 21, 0, tzinfo=UTC)
    assert get_qr_ttl_seconds(settings, now=now) == 8 * 60 * 60 + 30 * 60


def test_qr_token_roundtrip_with_daily_expiry(settings: Settings) -> None:
    now = datetime(2026, 6, 9, 20, 0, tzinfo=UTC)
    expires_at = get_qr_expires_at(settings, now=now)
    token = sign_qr_payload(settings, 11, expires_at=expires_at)

    assert verify_qr_payload(settings, token) == 11

    after_midnight = datetime(2026, 6, 9, 21, 1, tzinfo=UTC)
    assert get_qr_expires_at(settings, now=after_midnight) == datetime(2026, 6, 10, 21, 0, tzinfo=UTC)
