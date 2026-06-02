import time

from app.services.customer_codes import issue_code, resolve_code


def test_short_code_roundtrip() -> None:
    qr_token = "signed-token-example"
    code = issue_code(42, qr_token, ttl_seconds=60)

    assert len(code) == 6
    assert code.isdigit()

    resolved = resolve_code(code)
    assert resolved is not None
    assert resolved == (42, qr_token)


def test_short_code_expires() -> None:
    code = issue_code(7, "token", ttl_seconds=1)
    assert resolve_code(code) is not None
    time.sleep(1.1)
    assert resolve_code(code) is None
