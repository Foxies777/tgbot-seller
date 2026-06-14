from app.api.routes import _extract_qr_token
from app.core.config import Settings
from app.core.security import sign_qr_payload, verify_qr_payload


def test_extract_qr_token_from_url(settings: Settings) -> None:
    token = sign_qr_payload(settings, 7)
    url = f"https://shop.example/qr/{token}?utm=1"
    extracted = _extract_qr_token(url)
    assert verify_qr_payload(settings, extracted) == 7


def test_extract_qr_token_raw(settings: Settings) -> None:
    token = sign_qr_payload(settings, 3)
    assert verify_qr_payload(settings, _extract_qr_token(token)) == 3
