from datetime import timedelta

from app.core.config import Settings
from app.core.security import (
    make_session_token,
    sign_qr_payload,
    verify_qr_payload,
    verify_session_token,
)


def test_qr_token_roundtrip(settings: Settings) -> None:
    token = sign_qr_payload(settings, 42)

    assert verify_qr_payload(settings, token) == 42
    assert verify_qr_payload(settings, token + "broken") is None


def test_admin_session_roundtrip(settings: Settings) -> None:
    token = make_session_token(settings, "admin", timedelta(minutes=5))

    assert verify_session_token(settings, token) == "admin"
