from datetime import timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import make_web_session_token, verify_web_session_token
from app.db.session import get_session

SessionDep = Annotated[AsyncSession, Depends(get_session)]


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


SettingsDep = Annotated[Settings, Depends(get_app_settings)]


def set_role_cookie(response: Response, settings: Settings, *, role: str, subject: int) -> None:
    token = make_web_session_token(
        settings,
        subject=str(subject),
        role=role,
        expires_in=timedelta(hours=settings.session_ttl_hours),
    )
    response.set_cookie(
        settings.web_session_cookie,
        token,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="lax",
        max_age=settings.session_ttl_hours * 60 * 60,
    )


def clear_role_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(settings.web_session_cookie)


def require_role(role: str):
    async def dependency(
        request: Request,
        settings: SettingsDep,
    ) -> int:
        token = request.cookies.get(settings.web_session_cookie)
        if token is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
        session = verify_web_session_token(settings, token)
        if session is None or session["role"] != role:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden")
        return int(session["sub"])

    return dependency


CustomerIdDep = Annotated[int, Depends(require_role("customer"))]
SellerIdDep = Annotated[int, Depends(require_role("seller"))]
AdminIdDep = Annotated[int, Depends(require_role("admin"))]
