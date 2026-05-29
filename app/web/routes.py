from datetime import date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    make_session_token,
    random_idempotency_key,
    verify_admin_password,
    verify_session_token,
)
from app.db.session import get_session
from app.models import AuditLog, HolidayBonus, LoyaltySettings, PromoCode, Transaction, User
from app.services.loyalty import InsufficientPointsError, LoyaltyService

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

SessionDep = Annotated[AsyncSession, Depends(get_session)]
RequiredStrForm = Annotated[str, Form(...)]
OptionalStrForm = Annotated[str, Form()]
RequiredIntForm = Annotated[int, Form(...)]
OptionalIntForm = Annotated[int | None, Form()]
BoolForm = Annotated[bool, Form()]
DateForm = Annotated[date, Form(...)]


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/scan", response_class=HTMLResponse)
async def scan(request: Request):
    return templates.TemplateResponse("scan.html", {"request": request})


@router.get("/admin/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request, "error": None})


@router.post("/admin/login")
async def login(request: Request, password: RequiredStrForm):
    settings = request.app.state.settings
    if not verify_admin_password(settings, password):
        return templates.TemplateResponse(
            "login.html",
            {"request": request, "error": "Неверный пароль"},
            status_code=401,
        )

    response = RedirectResponse("/admin", status_code=303)
    token = make_session_token(settings, "admin", timedelta(hours=12))
    response.set_cookie(
        settings.admin_session_cookie,
        token,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="lax",
        max_age=12 * 60 * 60,
    )
    return response


@router.post("/admin/logout")
async def logout(request: Request):
    response = RedirectResponse("/admin/login", status_code=303)
    response.delete_cookie(request.app.state.settings.admin_session_cookie)
    return response


@router.get("/admin", response_class=HTMLResponse)
async def admin_dashboard(
    request: Request,
    session: SessionDep,
):
    if not _is_admin(request):
        return RedirectResponse("/admin/login", status_code=303)

    loyalty_settings = await _get_or_create_settings(request, session)
    users_count = await session.scalar(select(func.count(User.id)))
    transactions = (
        await session.execute(select(Transaction).order_by(desc(Transaction.created_at)).limit(10))
    ).scalars()
    holidays = (
        await session.execute(select(HolidayBonus).order_by(desc(HolidayBonus.id)))
    ).scalars()
    promos = (await session.execute(select(PromoCode).order_by(desc(PromoCode.id)))).scalars()
    return templates.TemplateResponse(
        "admin.html",
        {
            "request": request,
            "settings": loyalty_settings,
            "users_count": users_count or 0,
            "transactions": list(transactions),
            "holidays": list(holidays),
            "promos": list(promos),
        },
    )


@router.get("/admin/transactions", response_class=HTMLResponse)
async def admin_transactions(
    request: Request,
    session: SessionDep,
):
    if not _is_admin(request):
        return RedirectResponse("/admin/login", status_code=303)

    transactions = (
        await session.execute(select(Transaction).order_by(desc(Transaction.created_at)).limit(100))
    ).scalars()
    return templates.TemplateResponse(
        "transactions.html",
        {"request": request, "transactions": list(transactions)},
    )


@router.post("/admin/settings")
async def update_settings(
    request: Request,
    earn_percent: RequiredIntForm,
    max_redeem_percent: RequiredIntForm,
    point_ttl_days: RequiredIntForm,
    session: SessionDep,
    redeem_enabled: BoolForm = False,
):
    if not _is_admin(request):
        return RedirectResponse("/admin/login", status_code=303)

    loyalty_settings = await _get_or_create_settings(request, session)
    old_value = {
        "earn_percent": loyalty_settings.earn_percent,
        "max_redeem_percent": loyalty_settings.max_redeem_percent,
        "point_ttl_days": loyalty_settings.point_ttl_days,
        "redeem_enabled": loyalty_settings.redeem_enabled,
    }
    loyalty_settings.earn_percent = earn_percent
    loyalty_settings.max_redeem_percent = max_redeem_percent
    loyalty_settings.point_ttl_days = point_ttl_days
    loyalty_settings.redeem_enabled = redeem_enabled
    session.add(
        AuditLog(
            actor_type="admin",
            actor_id="admin",
            action="settings.update",
            entity_type="loyalty_settings",
            entity_id=str(loyalty_settings.id),
            old_value=old_value,
            new_value={
                "earn_percent": earn_percent,
                "max_redeem_percent": max_redeem_percent,
                "point_ttl_days": point_ttl_days,
                "redeem_enabled": redeem_enabled,
            },
        )
    )
    await session.commit()
    return RedirectResponse("/admin", status_code=303)


@router.post("/admin/adjust")
async def adjust_balance(
    request: Request,
    user_id: RequiredIntForm,
    points_delta: RequiredIntForm,
    comment: RequiredStrForm,
    session: SessionDep,
):
    if not _is_admin(request):
        return RedirectResponse("/admin/login", status_code=303)

    try:
        await LoyaltyService(session, request.app.state.settings).adjust_points(
            user_id=user_id,
            points_delta=points_delta,
            actor_id="admin",
            idempotency_key=random_idempotency_key("admin-adjust"),
            comment=comment,
        )
        await session.commit()
    except InsufficientPointsError:
        await session.rollback()
    return RedirectResponse("/admin", status_code=303)


@router.post("/admin/holidays")
async def create_holiday(
    request: Request,
    title: RequiredStrForm,
    starts_on: DateForm,
    ends_on: DateForm,
    earn_percent: RequiredIntForm,
    session: SessionDep,
):
    if not _is_admin(request):
        return RedirectResponse("/admin/login", status_code=303)

    session.add(
        HolidayBonus(
            title=title,
            starts_on=starts_on,
            ends_on=ends_on,
            earn_percent=earn_percent,
        )
    )
    await session.commit()
    return RedirectResponse("/admin", status_code=303)


@router.post("/admin/promocodes")
async def create_promocode(
    request: Request,
    code: RequiredStrForm,
    points: RequiredIntForm,
    session: SessionDep,
    max_uses: OptionalIntForm = None,
    expires_at: OptionalStrForm = "",
):
    if not _is_admin(request):
        return RedirectResponse("/admin/login", status_code=303)

    session.add(
        PromoCode(
            code=code.strip().upper(),
            points=points,
            max_uses=max_uses,
            expires_at=datetime.fromisoformat(expires_at) if expires_at else None,
        )
    )
    await session.commit()
    return RedirectResponse("/admin", status_code=303)


def _is_admin(request: Request) -> bool:
    settings = request.app.state.settings
    token = request.cookies.get(settings.admin_session_cookie)
    if not token:
        return False
    return verify_session_token(settings, token) == "admin"


async def _get_or_create_settings(request: Request, session: AsyncSession) -> LoyaltySettings:
    result = await session.execute(select(LoyaltySettings).order_by(LoyaltySettings.id).limit(1))
    loyalty_settings = result.scalar_one_or_none()
    if loyalty_settings is not None:
        return loyalty_settings

    settings = request.app.state.settings
    loyalty_settings = LoyaltySettings(
        earn_percent=settings.default_earn_percent,
        max_redeem_percent=settings.max_redeem_percent,
        point_ttl_days=settings.point_ttl_days,
    )
    session.add(loyalty_settings)
    await session.flush()
    return loyalty_settings
