import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, File, Header, HTTPException, Request, Response, UploadFile, status
from pydantic import ValidationError
from PIL import Image, ImageOps
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError

from app.api.deps import (
    AdminIdDep,
    CustomerIdDep,
    SellerIdDep,
    SessionDep,
    SettingsDep,
    clear_role_cookie,
    set_role_cookie,
)
from app.core.qr_lifetime import get_qr_expires_at, get_qr_ttl_seconds
from app.core.security import (
    generate_customer_access_code,
    hash_customer_access_code,
    hash_password,
    normalize_phone,
    random_idempotency_key,
    sign_qr_payload,
    verify_password,
    verify_qr_payload,
)
from app.models import (
    Admin,
    Consent,
    LoyaltySettings,
    OfferDismissal,
    Seller,
    SpecialOffer,
    Transaction,
    User,
)
from app.models.enums import SpecialOfferStatus, UserStatus
from app.schemas.api import (
    AdminLoginRequest,
    CustomerLoginRequest,
    CustomerProfile,
    CustomerQrResponse,
    CustomerRegisterRequest,
    CustomerRegisterResponse,
    ExpirePointsResponse,
    LoyaltySettingsResponse,
    LoyaltySettingsUpdate,
    PhoneRequest,
    SaleRequest,
    SaleResponse,
    SellerAdminResponse,
    SellerCreateRequest,
    SellerCustomerResponse,
    SellerLoginRequest,
    SessionResponse,
    SpecialOfferCreateRequest,
    SpecialOfferResponse,
    TransactionResponse,
    UploadResponse,
    VerifyCodeRequest,
    VerifyQrRequest,
)
from app.services.customer_codes import issue_code, resolve_code
from app.services.loyalty import InsufficientPointsError, LoyaltyService, RedeemDisabledError

router = APIRouter(prefix="/api/v1")

OFFER_IMAGE_SIZE = (1080, 1080)
OfferImageFile = Annotated[UploadFile, File(...)]


@router.post("/auth/customer/register", response_model=CustomerRegisterResponse)
async def register_customer(
    payload: CustomerRegisterRequest,
    request: Request,
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
):
    if not payload.consent_accepted:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Personal data consent is required")
    phone_normalized = normalize_phone(payload.phone)
    result = await session.execute(select(User).where(User.phone_normalized == phone_normalized))
    user = result.scalar_one_or_none()
    access_code: str | None = None
    if user is None:
        for _ in range(10):
            candidate = generate_customer_access_code()
            code_hash = hash_customer_access_code(settings, candidate)
            existing = await session.execute(
                select(User.id).where(User.access_code_hash == code_hash)
            )
            if existing.scalar_one_or_none() is None:
                access_code = candidate
                break
        if access_code is None:
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "Could not generate access code",
            )
        user = User(
            full_name=payload.full_name.strip(),
            phone=payload.phone,
            phone_normalized=phone_normalized,
            birth_date=payload.birth_date,
            balance_points=0,
            access_code_hash=hash_customer_access_code(settings, access_code),
            status=UserStatus.active,
        )
        session.add(user)
        await session.flush()
    else:
        user.full_name = payload.full_name.strip()
        user.phone = payload.phone
        user.birth_date = payload.birth_date

    if payload.password:
        user.password_hash = hash_password(payload.password)

    session.add(
        Consent(
            user_id=user.id,
            version=settings.consent_version,
            accepted_at=datetime.now(UTC),
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    )
    await LoyaltyService(session, settings).grant_welcome_bonus(
        user_id=user.id,
        idempotency_key=f"welcome:{user.id}",
    )
    await session.commit()
    set_role_cookie(response, settings, role="customer", subject=user.id)
    return CustomerRegisterResponse(role="customer", id=user.id, access_code=access_code)


@router.post("/auth/customer/login", response_model=SessionResponse)
async def customer_login(
    payload: CustomerLoginRequest,
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
):
    user: User | None = None
    if payload.access_code:
        code_hash = hash_customer_access_code(settings, payload.access_code)
        result = await session.execute(select(User).where(User.access_code_hash == code_hash))
        user = result.scalar_one_or_none()
    elif payload.phone and payload.password:
        phone_normalized = normalize_phone(payload.phone)
        result = await session.execute(
            select(User).where(User.phone_normalized == phone_normalized)
        )
        user = result.scalar_one_or_none()
        if user is None or user.password_hash is None or not verify_password(
            payload.password, user.password_hash
        ):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid phone or password")

    if user is None or user.status != UserStatus.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    set_role_cookie(response, settings, role="customer", subject=user.id)
    return SessionResponse(role="customer", id=user.id)


@router.post("/auth/customer/request-code")
async def request_customer_code(payload: PhoneRequest) -> dict[str, str]:
    normalize_phone(payload.phone)
    return {"status": "ok", "message": "MVP code is 000000 until SMS provider is connected"}


@router.post("/auth/customer/verify-code", response_model=SessionResponse)
async def verify_customer_code(
    payload: VerifyCodeRequest,
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
):
    if payload.code != "000000":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid code")
    phone_normalized = normalize_phone(payload.phone)
    result = await session.execute(select(User).where(User.phone_normalized == phone_normalized))
    user = result.scalar_one_or_none()
    if user is None or user.status != UserStatus.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    set_role_cookie(response, settings, role="customer", subject=user.id)
    return SessionResponse(role="customer", id=user.id)


@router.post("/auth/seller/login", response_model=SessionResponse)
async def seller_login(
    payload: SellerLoginRequest,
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
):
    seller = await _find_seller_for_login(session, payload.phone.strip())
    if (
        seller is None
        or not seller.is_active
        or seller.password_hash is None
        or not verify_password(payload.password, seller.password_hash)
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    set_role_cookie(response, settings, role="seller", subject=seller.id)
    return SessionResponse(role="seller", id=seller.id)


@router.post("/auth/admin/login", response_model=SessionResponse)
async def admin_login(
    payload: AdminLoginRequest,
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
):
    result = await session.execute(
        select(Admin).where(Admin.username == payload.username, Admin.is_active.is_(True))
    )
    admin = result.scalar_one_or_none()
    if admin is None or not verify_password(payload.password, admin.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    set_role_cookie(response, settings, role="admin", subject=admin.id)
    return SessionResponse(role="admin", id=admin.id)


@router.post("/auth/logout")
async def logout(response: Response, settings: SettingsDep) -> dict[str, str]:
    clear_role_cookie(response, settings)
    return {"status": "ok"}


@router.get("/customer/me", response_model=CustomerProfile)
async def customer_me(customer_id: CustomerIdDep, session: SessionDep, settings: SettingsDep):
    user = await _get_active_user(session, customer_id)
    return CustomerProfile(
        id=user.id,
        full_name=user.full_name,
        phone=user.phone,
        birth_date=user.birth_date,
        balance_points=user.balance_points,
        qr_token=sign_qr_payload(settings, user.id),
    )


@router.get("/customer/me/qr", response_model=CustomerQrResponse)
async def customer_qr(customer_id: CustomerIdDep, session: SessionDep, settings: SettingsDep):
    user = await _get_active_user(session, customer_id)
    expires_at = get_qr_expires_at(settings)
    ttl = get_qr_ttl_seconds(settings)
    qr_token = sign_qr_payload(settings, user.id, expires_at=expires_at)
    short_code = issue_code(user.id, qr_token, ttl)
    return CustomerQrResponse(
        qr_token=qr_token,
        short_code=short_code,
        expires_at=expires_at,
        ttl_seconds=ttl,
    )


@router.get("/customer/transactions", response_model=list[TransactionResponse])
async def customer_transactions(customer_id: CustomerIdDep, session: SessionDep):
    await _get_active_user(session, customer_id)
    result = await session.execute(
        select(Transaction)
        .where(Transaction.user_id == customer_id)
        .order_by(desc(Transaction.created_at))
        .limit(100)
    )
    return [_transaction_response(transaction) for transaction in result.scalars()]


@router.get("/customer/offers/active", response_model=list[SpecialOfferResponse])
async def active_offers(customer_id: CustomerIdDep, session: SessionDep):
    now = datetime.now(UTC)
    dismissed = select(OfferDismissal.offer_id).where(OfferDismissal.user_id == customer_id)
    result = await session.execute(
        select(SpecialOffer)
        .where(
            SpecialOffer.status == SpecialOfferStatus.active,
            SpecialOffer.starts_at <= now,
            SpecialOffer.ends_at >= now,
            SpecialOffer.id.not_in(dismissed),
        )
        .order_by(desc(SpecialOffer.created_at))
    )
    return [_offer_response(offer) for offer in result.scalars()]


@router.post("/customer/offers/{offer_id}/dismiss")
async def dismiss_offer(offer_id: int, customer_id: CustomerIdDep, session: SessionDep):
    session.add(OfferDismissal(user_id=customer_id, offer_id=offer_id))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
    return {"status": "ok"}


@router.post("/seller/customers/verify", response_model=SellerCustomerResponse)
@router.post("/seller/qr/verify", response_model=SellerCustomerResponse, include_in_schema=False)
async def verify_seller_qr(
    payload: VerifyQrRequest,
    seller_id: SellerIdDep,
    session: SessionDep,
    settings: SettingsDep,
):
    await _get_active_seller(session, seller_id)
    user = await _user_from_qr_value(session, settings, payload.qr_value)
    max_redeem = None
    if payload.purchase_amount_minor is not None:
        loyalty_settings = await LoyaltyService(session, settings).get_settings()
        max_redeem = min(
            user.balance_points,
            LoyaltyService.calculate_max_redeem_points(
                payload.purchase_amount_minor,
                loyalty_settings.max_redeem_percent,
            ),
        )
    return _seller_customer_response(user, max_redeem)


async def _parse_sale_request(request: Request) -> SaleRequest:
    raw = await request.body()
    if not raw:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Empty body")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid JSON") from exc
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid JSON") from exc
    if not isinstance(data, dict):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "JSON body must be an object")
    try:
        return SaleRequest.model_validate(data)
    except ValidationError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()) from exc


@router.post("/seller/sales", response_model=SaleResponse)
async def create_sale(
    request: Request,
    seller_id: SellerIdDep,
    session: SessionDep,
    settings: SettingsDep,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    payload = await _parse_sale_request(request)
    seller = await _get_active_seller(session, seller_id)
    user = await _user_from_qr_value(session, settings, payload.customer_token)
    key = idempotency_key or random_idempotency_key("sale-api")
    service = LoyaltyService(session, settings)
    try:
        result = await service.process_purchase(
            user_id=user.id,
            seller_id=seller.id,
            purchase_amount_minor=payload.purchase_amount_minor,
            redeem_points=payload.resolved_redeem_points(),
            idempotency_key=key,
        )
    except InsufficientPointsError as error:
        await session.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Insufficient points") from error
    except RedeemDisabledError as error:
        await session.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Redeem is disabled") from error
    except ValueError as error:
        await session.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error
    await session.commit()
    earned_points = result.earn_transaction.points_delta if result.earn_transaction else 0
    redeemed_points = (
        abs(result.redeem_transaction.points_delta) if result.redeem_transaction else 0
    )
    return SaleResponse(
        transaction=_transaction_response(result.primary_transaction),
        earned_points=earned_points,
        redeemed_points=redeemed_points,
        is_duplicate=result.is_duplicate,
    )


@router.post("/seller/customers", response_model=SellerCustomerResponse)
async def create_customer_by_seller(
    payload: CustomerRegisterRequest,
    request: Request,
    seller_id: SellerIdDep,
    session: SessionDep,
    settings: SettingsDep,
):
    await _get_active_seller(session, seller_id)
    session_response = Response()
    await register_customer(payload, request, session_response, session, settings)
    phone_normalized = normalize_phone(payload.phone)
    result = await session.execute(select(User).where(User.phone_normalized == phone_normalized))
    user = result.scalar_one()
    return _seller_customer_response(user)


@router.get("/admin/settings", response_model=LoyaltySettingsResponse)
async def get_admin_settings(_admin_id: AdminIdDep, session: SessionDep, settings: SettingsDep):
    loyalty_settings = await LoyaltyService(session, settings).get_settings()
    return _settings_response(loyalty_settings)


@router.put("/admin/settings", response_model=LoyaltySettingsResponse)
async def update_admin_settings(
    payload: LoyaltySettingsUpdate,
    _admin_id: AdminIdDep,
    session: SessionDep,
    settings: SettingsDep,
):
    loyalty_settings = await LoyaltyService(session, settings).get_settings()
    loyalty_settings.earn_percent = payload.earn_percent
    loyalty_settings.max_redeem_percent = payload.max_redeem_percent
    loyalty_settings.point_ttl_days = payload.point_ttl_days
    loyalty_settings.redeem_enabled = payload.redeem_enabled
    loyalty_settings.welcome_bonus_enabled = payload.welcome_bonus_enabled
    loyalty_settings.welcome_bonus_points = payload.welcome_bonus_points
    await session.commit()
    return _settings_response(loyalty_settings)


@router.get("/admin/sellers", response_model=list[SellerAdminResponse])
async def list_api_sellers(_admin_id: AdminIdDep, session: SessionDep):
    result = await session.execute(
        select(Seller).order_by(desc(Seller.is_active), desc(Seller.id))
    )
    return [_seller_admin_response(seller) for seller in result.scalars()]


@router.post("/admin/sellers", response_model=SellerAdminResponse)
async def create_api_seller(
    payload: SellerCreateRequest,
    _admin_id: AdminIdDep,
    session: SessionDep,
):
    phone_normalized = normalize_phone(payload.phone)
    result = await session.execute(
        select(Seller).where(Seller.phone_normalized == phone_normalized)
    )
    seller = result.scalar_one_or_none()
    if seller is None:
        seller = Seller(
            full_name=payload.full_name.strip(),
            phone=payload.phone,
            phone_normalized=phone_normalized,
            password_hash=hash_password(payload.password),
            is_active=True,
        )
        session.add(seller)
        await session.flush()
    else:
        seller.full_name = payload.full_name.strip()
        seller.phone = payload.phone
        seller.password_hash = hash_password(payload.password)
        seller.is_active = True
    await session.commit()
    await session.refresh(seller)
    return _seller_admin_response(seller)


@router.delete("/admin/sellers/{seller_id}", response_model=SellerAdminResponse)
async def deactivate_api_seller(
    seller_id: int,
    _admin_id: AdminIdDep,
    session: SessionDep,
):
    seller = await session.get(Seller, seller_id)
    if seller is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Seller not found")
    if not seller.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Seller is already inactive")
    seller.is_active = False
    await session.commit()
    await session.refresh(seller)
    return _seller_admin_response(seller)


@router.get("/admin/transactions", response_model=list[TransactionResponse])
async def admin_transactions(_admin_id: AdminIdDep, session: SessionDep):
    result = await session.execute(
        select(Transaction).order_by(desc(Transaction.created_at)).limit(200)
    )
    return [_transaction_response(transaction) for transaction in result.scalars()]


@router.post("/admin/offers/upload", response_model=UploadResponse)
async def upload_offer_image(
    _admin_id: AdminIdDep,
    settings: SettingsDep,
    file: OfferImageFile,
):
    if file.content_type != "image/png":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only PNG files are supported")
    upload_dir = Path(settings.upload_dir) / "offers"
    upload_dir.mkdir(parents=True, exist_ok=True)
    image = Image.open(file.file)
    image = image.convert("RGBA")
    if image.size != OFFER_IMAGE_SIZE:
        image = ImageOps.fit(image, OFFER_IMAGE_SIZE)
    filename = f"{uuid4().hex}.png"
    path = upload_dir / filename
    image.save(path, format="PNG")
    return UploadResponse(image_path=f"/static/uploads/offers/{filename}")


@router.post("/admin/offers", response_model=SpecialOfferResponse)
async def create_offer(
    payload: SpecialOfferCreateRequest,
    _admin_id: AdminIdDep,
    session: SessionDep,
):
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "ends_at must be after starts_at")
    offer = SpecialOffer(
        title=payload.title.strip(),
        text=payload.text.strip(),
        image_path=payload.image_path,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        status=SpecialOfferStatus(payload.status),
    )
    session.add(offer)
    await session.commit()
    await session.refresh(offer)
    return _offer_response(offer)


@router.get("/admin/offers", response_model=list[SpecialOfferResponse])
async def list_offers(_admin_id: AdminIdDep, session: SessionDep):
    result = await session.execute(select(SpecialOffer).order_by(desc(SpecialOffer.created_at)))
    return [_offer_response(offer) for offer in result.scalars()]


@router.post("/admin/maintenance/expire-points", response_model=ExpirePointsResponse)
async def expire_points(_admin_id: AdminIdDep, session: SessionDep, settings: SettingsDep):
    transactions = await LoyaltyService(session, settings).expire_points()
    await session.commit()
    return ExpirePointsResponse(expired_transactions=len(transactions))


async def _find_seller_for_login(session: SessionDep, login: str) -> Seller | None:
    digits = "".join(char for char in login if char.isdigit())
    if len(digits) >= 10:
        try:
            phone_normalized = normalize_phone(login)
        except ValueError:
            phone_normalized = None
        if phone_normalized is not None:
            result = await session.execute(
                select(Seller).where(Seller.phone_normalized == phone_normalized)
            )
            seller = result.scalar_one_or_none()
            if seller is not None:
                return seller

    username = login.lstrip("@")
    result = await session.execute(select(Seller).where(Seller.username == username))
    seller = result.scalar_one_or_none()
    if seller is not None:
        return seller

    result = await session.execute(
        select(Seller).where(func.lower(Seller.full_name) == login.lower())
    )
    return result.scalar_one_or_none()


async def _get_active_user(session: SessionDep, user_id: int) -> User:
    user = await session.get(User, user_id)
    if user is None or user.status != UserStatus.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    return user


async def _get_active_seller(session: SessionDep, seller_id: int) -> Seller:
    seller = await session.get(Seller, seller_id)
    if seller is None or not seller.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seller is inactive")
    return seller


async def _user_from_qr_value(session: SessionDep, settings: SettingsDep, qr_value: str) -> User:
    stripped = qr_value.strip()

    if stripped.isdigit() and len(stripped) == 6:
        resolved = resolve_code(stripped)
        if resolved is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired code")
        user_id, qr_token = resolved
        verified_id = verify_qr_payload(settings, qr_token)
        if verified_id != user_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid QR code")
        return await _get_active_user(session, user_id)

    token = _extract_qr_token(stripped)
    user_id = verify_qr_payload(settings, token)
    if user_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired QR code")
    return await _get_active_user(session, user_id)


def _extract_qr_token(qr_value: str) -> str:
    stripped = qr_value.strip()
    if "/qr/" in stripped:
        token = stripped.rstrip("/").rsplit("/", 1)[-1]
        token = token.split("?", 1)[0].split("#", 1)[0]
        return token
    if stripped.startswith("customer:"):
        return stripped.removeprefix("customer:")
    return stripped


def _transaction_response(transaction: Transaction) -> TransactionResponse:
    return TransactionResponse(
        id=transaction.id,
        transaction_type=str(transaction.transaction_type),
        purchase_amount_minor=transaction.purchase_amount_minor,
        points_delta=transaction.points_delta,
        balance_before=transaction.balance_before,
        balance_after=transaction.balance_after,
        comment=transaction.comment,
        created_at=transaction.created_at,
    )


def _seller_admin_response(seller: Seller) -> SellerAdminResponse:
    return SellerAdminResponse(
        id=seller.id,
        full_name=seller.full_name,
        phone=seller.phone,
        username=seller.username,
        telegram_id=seller.telegram_id,
        is_active=seller.is_active,
        created_at=seller.created_at,
    )


def _seller_customer_response(
    user: User,
    max_redeem_points: int | None = None,
) -> SellerCustomerResponse:
    return SellerCustomerResponse(
        id=user.id,
        full_name=user.full_name,
        phone=user.phone,
        balance_points=user.balance_points,
        max_redeem_points=max_redeem_points,
    )


def _settings_response(settings: LoyaltySettings) -> LoyaltySettingsResponse:
    return LoyaltySettingsResponse(
        earn_percent=settings.earn_percent,
        max_redeem_percent=settings.max_redeem_percent,
        point_ttl_days=settings.point_ttl_days,
        redeem_enabled=settings.redeem_enabled,
        welcome_bonus_enabled=settings.welcome_bonus_enabled,
        welcome_bonus_points=settings.welcome_bonus_points,
    )


def _offer_response(offer: SpecialOffer) -> SpecialOfferResponse:
    return SpecialOfferResponse(
        id=offer.id,
        title=offer.title,
        text=offer.text,
        image_path=offer.image_path,
        starts_at=offer.starts_at,
        ends_at=offer.ends_at,
        status=str(offer.status),
    )
