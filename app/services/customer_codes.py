from __future__ import annotations

import secrets
from dataclasses import dataclass
from threading import Lock
from time import time

_store: dict[str, _CodeEntry] = {}
_lock = Lock()


@dataclass
class _CodeEntry:
    user_id: int
    qr_token: str
    expires_at: float


def _cleanup(now: float | None = None) -> None:
    current = now if now is not None else time()
    expired = [code for code, entry in _store.items() if entry.expires_at <= current]
    for code in expired:
        del _store[code]


def issue_code(user_id: int, qr_token: str, ttl_seconds: int) -> str:
    current = time()
    with _lock:
        _cleanup(current)
        for _ in range(100):
            code = f"{secrets.randbelow(1_000_000):06d}"
            if code not in _store:
                _store[code] = _CodeEntry(user_id, qr_token, current + ttl_seconds)
                return code
    raise RuntimeError("Could not allocate short code")


def resolve_code(code: str) -> tuple[int, str] | None:
    current = time()
    with _lock:
        _cleanup(current)
        entry = _store.get(code)
        if entry is None or entry.expires_at <= current:
            return None
        return entry.user_id, entry.qr_token
