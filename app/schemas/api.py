from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class CustomerRegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=10, max_length=32)
    birth_date: date
    consent_accepted: bool
    password: str | None = Field(default=None, min_length=8, max_length=128)


class CustomerLoginRequest(BaseModel):
    phone: str | None = Field(default=None, min_length=10, max_length=32)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    access_code: str | None = Field(default=None, min_length=6, max_length=16)

    @model_validator(mode="after")
    def validate_login_method(self) -> "CustomerLoginRequest":
        if self.access_code:
            return self
        if self.phone and self.password:
            return self
        raise ValueError("Provide phone and password or access code")


class PhoneRequest(BaseModel):
    phone: str = Field(min_length=10, max_length=32)


class VerifyCodeRequest(PhoneRequest):
    code: str = Field(min_length=4, max_length=12)


class SellerLoginRequest(BaseModel):
    phone: str = Field(
        min_length=2,
        max_length=255,
        description="Phone number, seller full name, or Telegram username",
    )
    password: str = Field(min_length=8, max_length=128)


class AdminLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=128)


class SessionResponse(BaseModel):
    role: Literal["customer", "seller", "admin"]
    id: int


class CustomerRegisterResponse(SessionResponse):
    access_code: str | None = None


class CustomerProfile(BaseModel):
    id: int
    full_name: str
    phone: str | None
    birth_date: date | None
    balance_points: int
    qr_token: str


class CustomerQrResponse(BaseModel):
    qr_token: str
    short_code: str
    expires_at: datetime
    ttl_seconds: int


class TransactionResponse(BaseModel):
    id: int
    transaction_type: str
    purchase_amount_minor: int
    points_delta: int
    balance_before: int
    balance_after: int
    comment: str | None
    created_at: datetime


class SellerCustomerResponse(BaseModel):
    id: int
    full_name: str
    phone: str | None
    balance_points: int
    max_redeem_points: int | None = None


class VerifyQrRequest(BaseModel):
    qr_value: str = Field(min_length=6)
    purchase_amount_minor: int | None = Field(default=None, gt=0)


class SaleRequest(BaseModel):
    customer_token: str = Field(min_length=6)
    purchase_amount_minor: int = Field(gt=0)
    action: Literal["earn", "redeem"]
    redeem_points: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def validate_redeem_points(self) -> "SaleRequest":
        if self.action == "redeem" and (self.redeem_points is None or self.redeem_points < 1):
            raise ValueError("redeem_points is required for redeem action")
        return self


class SaleResponse(BaseModel):
    transaction: TransactionResponse
    is_duplicate: bool


class LoyaltySettingsResponse(BaseModel):
    earn_percent: int
    max_redeem_percent: int
    point_ttl_days: int
    redeem_enabled: bool
    welcome_bonus_enabled: bool
    welcome_bonus_points: int


class LoyaltySettingsUpdate(BaseModel):
    earn_percent: int = Field(ge=0, le=100)
    max_redeem_percent: int = Field(ge=0, le=100)
    point_ttl_days: int = Field(ge=1)
    redeem_enabled: bool
    welcome_bonus_enabled: bool
    welcome_bonus_points: int = Field(ge=0)


class SellerCreateRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=10, max_length=32)
    password: str = Field(min_length=8, max_length=128)


class SpecialOfferCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    text: str = Field(min_length=2)
    image_path: str = Field(min_length=1, max_length=512)
    starts_at: datetime
    ends_at: datetime
    status: Literal["draft", "active", "archived"] = "draft"


class SpecialOfferResponse(BaseModel):
    id: int
    title: str
    text: str
    image_path: str
    starts_at: datetime
    ends_at: datetime
    status: str


class UploadResponse(BaseModel):
    image_path: str


class ExpirePointsResponse(BaseModel):
    expired_transactions: int
