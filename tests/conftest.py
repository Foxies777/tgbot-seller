import pytest

from app.core.config import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(
        database_url="postgresql+asyncpg://loyalty:loyalty@localhost:5432/loyalty_test",
        bot_token="123456:test-token",
        bot_username="test_loyalty_bot",
        webhook_base_url="https://example.com",
        telegram_webhook_secret="test-webhook-secret",
        secret_key="test-secret-key-for-signing",
        admin_password="admin-password",
    )
