from datetime import timedelta

from app.core.security import (
    make_web_session_token,
    normalize_phone,
    verify_web_session_token,
)


def test_normalize_phone_accepts_russian_local_prefix() -> None:
    assert normalize_phone("8 (999) 123-45-67") == "+79991234567"


def test_web_session_round_trip(settings) -> None:
    token = make_web_session_token(
        settings,
        subject="42",
        role="customer",
        expires_in=timedelta(minutes=5),
    )

    assert verify_web_session_token(settings, token) == {"sub": "42", "role": "customer"}
