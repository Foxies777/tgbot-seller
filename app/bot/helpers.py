from io import BytesIO

import qrcode
from aiogram.types import BufferedInputFile
from aiogram.types import User as TelegramUser
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import sign_qr_payload
from app.models import Seller, User


async def ensure_customer(session: AsyncSession, tg_user: TelegramUser) -> User:
    result = await session.execute(select(User).where(User.telegram_id == tg_user.id))
    user = result.scalar_one_or_none()
    if user is not None:
        user.username = tg_user.username
        user.full_name = tg_user.full_name
        return user

    user = User(
        telegram_id=tg_user.id,
        username=tg_user.username,
        full_name=tg_user.full_name,
    )
    session.add(user)
    await session.flush()
    return user


async def get_or_create_seller(
    session: AsyncSession,
    settings: Settings,
    tg_user: TelegramUser,
) -> Seller | None:
    result = await session.execute(select(Seller).where(Seller.telegram_id == tg_user.id))
    seller = result.scalar_one_or_none()
    if seller is not None:
        return seller if seller.is_active else None

    if tg_user.id not in settings.seller_telegram_ids:
        return None

    seller = Seller(
        telegram_id=tg_user.id,
        username=tg_user.username,
        full_name=tg_user.full_name,
    )
    session.add(seller)
    await session.flush()
    return seller


def build_customer_deep_link(settings: Settings, user_id: int) -> str:
    token = sign_qr_payload(settings, user_id)
    return f"https://t.me/{settings.bot_username}?start=customer_{token}"


def build_qr_file(content: str) -> BufferedInputFile:
    image = qrcode.make(content)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return BufferedInputFile(buffer.getvalue(), filename="loyalty-qr.png")
