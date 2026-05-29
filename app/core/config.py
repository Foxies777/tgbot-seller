from functools import lru_cache
from typing import Literal

from pydantic import AnyUrl, Field, SecretStr, field_validator
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

    secret_key: SecretStr = Field(min_length=16)
    admin_password: SecretStr = Field(min_length=8)
    admin_session_cookie: str = "loyalty_admin"

    default_earn_percent: int = Field(default=5, ge=0, le=100)
    max_redeem_percent: int = Field(default=50, ge=0, le=100)
    point_ttl_days: int = Field(default=365, ge=1)
    seller_telegram_ids: list[int] = Field(default_factory=list)

    @field_validator("seller_telegram_ids", mode="before")
    @classmethod
    def parse_seller_ids(cls, value: str | list[int] | None) -> list[int]:
        if value in (None, ""):
            return []
        if isinstance(value, list):
            return value
        return [int(item.strip()) for item in value.split(",") if item.strip()]

    @property
    def webhook_url(self) -> str:
        base_url = str(self.webhook_base_url).rstrip("/")
        return f"{base_url}/telegram/webhook"


@lru_cache
def get_settings() -> Settings:
    return Settings()
