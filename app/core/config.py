from functools import lru_cache
from typing import Literal

from pydantic import AnyUrl, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "TGBot Seller Loyalty"
    app_env: Literal["local", "test", "production"] = "local"
    debug: bool = False

    database_url: str
    test_database_url: str | None = None

    bot_token: SecretStr
    bot_username: str = Field(min_length=3)
    webhook_base_url: AnyUrl
    telegram_webhook_secret: SecretStr = Field(min_length=16)

    secret_key: SecretStr = Field(default=SecretStr("change-this-signing-secret"), min_length=16)
    admin_session_cookie: str = "loyalty_admin"
    web_session_cookie: str = "loyalty_session"
    consent_version: str = "2026-06-02"
    upload_dir: str = "app/static/uploads"

    default_earn_percent: int = Field(default=5, ge=0, le=100)
    max_redeem_percent: int = Field(default=50, ge=0, le=100)
    point_ttl_days: int = Field(default=365, ge=1)
    session_ttl_hours: int = Field(default=24 * 30, ge=1)
    qr_timezone: str = Field(default="Europe/Moscow")

    @property
    def webhook_url(self) -> str:
        base_url = str(self.webhook_base_url).rstrip("/")
        return f"{base_url}/telegram/webhook"


@lru_cache
def get_settings() -> Settings:
    return Settings()
