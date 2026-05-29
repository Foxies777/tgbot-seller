from enum import StrEnum


class UserStatus(StrEnum):
    active = "active"
    blocked = "blocked"


class SellerRole(StrEnum):
    seller = "seller"
    admin = "admin"


class TransactionType(StrEnum):
    earn = "earn"
    redeem = "redeem"
    adjustment = "adjustment"
    expiration = "expiration"


class PromoCodeStatus(StrEnum):
    active = "active"
    disabled = "disabled"
