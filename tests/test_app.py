import importlib

from fastapi.testclient import TestClient


def test_healthz(monkeypatch) -> None:
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://loyalty:loyalty@localhost:5432/loyalty_test",
    )
    monkeypatch.setenv("BOT_TOKEN", "123456:test-token")
    monkeypatch.setenv("BOT_USERNAME", "test_loyalty_bot")
    monkeypatch.setenv("WEBHOOK_BASE_URL", "https://example.com")
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "test-webhook-secret")
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-for-signing")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-password")

    config = importlib.import_module("app.core.config")
    config.get_settings.cache_clear()
    main = importlib.import_module("app.main")

    with TestClient(main.create_app()) as client:
        response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
