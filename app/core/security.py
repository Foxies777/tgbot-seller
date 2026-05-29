import base64
from datetime import UTC, datetime, timedelta
from hashlib import pbkdf2_hmac, sha256
from hmac import compare_digest
from secrets import token_bytes, token_urlsafe
from typing import Any

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.core.config import Settings

PASSWORD_HASH_ITERATIONS = 390_000


def _serializer(settings: Settings, salt: str) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.secret_key.get_secret_value(), salt=salt)


def sign_qr_payload(settings: Settings, user_id: int) -> str:
    return _serializer(settings, "customer-qr").dumps({"uid": user_id})


def verify_qr_payload(
    settings: Settings,
    token: str,
    max_age_seconds: int | None = None,
) -> int | None:
    try:
        payload: dict[str, Any] = _serializer(settings, "customer-qr").loads(
            token,
            max_age=max_age_seconds,
        )
    except (BadSignature, SignatureExpired):
        return None
    user_id = payload.get("uid")
    return int(user_id) if isinstance(user_id, int) else None


def make_session_token(settings: Settings, subject: str, expires_in: timedelta) -> str:
    expires_at = datetime.now(UTC) + expires_in
    return _serializer(settings, "admin-session").dumps(
        {"sub": subject, "exp": int(expires_at.timestamp())}
    )


def verify_session_token(settings: Settings, token: str) -> str | None:
    try:
        payload: dict[str, Any] = _serializer(settings, "admin-session").loads(token)
    except BadSignature:
        return None
    if int(payload.get("exp", 0)) < int(datetime.now(UTC).timestamp()):
        return None
    subject = payload.get("sub")
    return str(subject) if subject else None


def hash_password(password: str) -> str:
    salt = token_bytes(16)
    password_hash = pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    return "$".join(
        [
            "pbkdf2_sha256",
            str(PASSWORD_HASH_ITERATIONS),
            base64.urlsafe_b64encode(salt).decode("ascii"),
            base64.urlsafe_b64encode(password_hash).decode("ascii"),
        ]
    )


def verify_password(candidate: str, password_hash: str) -> bool:
    try:
        algorithm, iterations_raw, salt_raw, expected_raw = password_hash.split("$", 3)
        iterations = int(iterations_raw)
        salt = base64.urlsafe_b64decode(salt_raw.encode("ascii"))
        expected = base64.urlsafe_b64decode(expected_raw.encode("ascii"))
    except (ValueError, TypeError):
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    actual = pbkdf2_hmac("sha256", candidate.encode("utf-8"), salt, iterations)
    return compare_digest(actual, expected)


def generate_idempotency_key(*parts: object) -> str:
    digest = sha256(":".join(str(part) for part in parts).encode("utf-8")).hexdigest()
    return digest


def random_idempotency_key(prefix: str = "manual") -> str:
    return f"{prefix}:{token_urlsafe(24)}"
