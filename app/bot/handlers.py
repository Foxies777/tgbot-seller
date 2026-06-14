from decimal import Decimal, InvalidOperation

from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.types import Message
from sqlalchemy import select

from app.bot.helpers import (
    build_customer_deep_link,
    build_qr_file,
    ensure_customer,
    get_or_create_seller,
)
from app.bot.states import SaleFlow
from app.core.config import Settings
from app.core.security import generate_idempotency_key, verify_qr_payload
from app.db.session import async_session_factory
from app.models import User
from app.services.loyalty import InsufficientPointsError, LoyaltyService, RedeemDisabledError

router = Router()


@router.message(Command("start"))
async def start(
    message: Message,
    command: CommandObject,
    state: FSMContext,
    settings: Settings,
) -> None:
    if message.from_user is None:
        return

    payload = command.args or ""
    if payload.startswith("customer_"):
        await _start_sale_from_payload(message, payload.removeprefix("customer_"), state, settings)
        return

    async with async_session_factory() as session:
        user = await ensure_customer(session, message.from_user)
        await session.commit()

    await message.answer(
        "Вы зарегистрированы в бонусной системе.\n"
        f"Ваш баланс: {user.balance_points} баллов.\n\n"
        "Команды: /balance, /qr"
    )


@router.message(Command("balance"))
async def balance(message: Message) -> None:
    if message.from_user is None:
        return
    async with async_session_factory() as session:
        user = await ensure_customer(session, message.from_user)
        await session.commit()
    await message.answer(f"Ваш баланс: {user.balance_points} баллов.")


@router.message(Command("qr"))
async def qr(message: Message, settings: Settings) -> None:
    if message.from_user is None:
        return
    async with async_session_factory() as session:
        user = await ensure_customer(session, message.from_user)
        link = build_customer_deep_link(settings, user.id)
        await session.commit()

    await message.answer_photo(
        build_qr_file(link),
        caption="Покажите этот QR-код продавцу для начисления или списания баллов.",
    )


@router.message(SaleFlow.waiting_amount)
async def sale_amount(message: Message, state: FSMContext) -> None:
    amount_minor = _parse_amount_minor(message.text or "")
    if amount_minor is None:
        await message.answer("Введите сумму покупки числом, например: 1250.50")
        return

    await state.update_data(amount_minor=amount_minor)
    await state.set_state(SaleFlow.waiting_redeem_points)
    await message.answer(
        "Сколько баллов списать? Отправьте 0, если списание не нужно.\n"
        "Бонусы начислятся автоматически с суммы после списания."
    )


@router.message(SaleFlow.waiting_redeem_points)
async def complete_sale(message: Message, state: FSMContext, settings: Settings) -> None:
    if message.from_user is None:
        return
    try:
        requested_points = int((message.text or "").strip())
    except ValueError:
        await message.answer("Введите количество баллов целым числом (0 — без списания).")
        return
    if requested_points < 0:
        await message.answer("Количество баллов не может быть отрицательным.")
        return

    data = await state.get_data()
    async with async_session_factory() as session:
        seller = await get_or_create_seller(session, settings, message.from_user)
        if seller is None:
            await message.answer("У вас нет прав продавца.")
            return
        service = LoyaltyService(session, settings)
        try:
            result = await service.process_purchase(
                user_id=int(data["customer_id"]),
                seller_id=seller.id,
                purchase_amount_minor=int(data["amount_minor"]),
                redeem_points=requested_points,
                idempotency_key=generate_idempotency_key(
                    "purchase",
                    seller.telegram_id,
                    data["customer_id"],
                    data["amount_minor"],
                    requested_points,
                ),
            )
        except InsufficientPointsError:
            await session.rollback()
            await message.answer("Недостаточно баллов для списания.")
            return
        except RedeemDisabledError:
            await session.rollback()
            await message.answer("Списание баллов отключено.")
            return
        user = await session.get(User, int(data["customer_id"]))
        await session.commit()

    redeemed = abs(result.redeem_transaction.points_delta) if result.redeem_transaction else 0
    earned = result.earn_transaction.points_delta if result.earn_transaction else 0
    balance_after = result.primary_transaction.balance_after

    await state.clear()
    parts: list[str] = []
    if redeemed > 0:
        parts.append(f"списано {redeemed}")
    if earned > 0:
        parts.append(f"начислено {earned}")
    summary = ", ".join(parts) if parts else "операция выполнена"
    await message.answer(f"Покупка проведена: {summary}. Новый баланс: {balance_after}.")
    if user is not None:
        await message.bot.send_message(
            user.telegram_id,
            f"Покупка обработана: {summary}. Баланс: {balance_after}.",
        )


async def _start_sale_from_payload(
    message: Message,
    token: str,
    state: FSMContext,
    settings: Settings,
) -> None:
    if message.from_user is None:
        return
    customer_id = verify_qr_payload(settings, token)
    if customer_id is None:
        await message.answer("QR-код недействителен.")
        return

    async with async_session_factory() as session:
        seller = await get_or_create_seller(session, settings, message.from_user)
        if seller is None:
            await message.answer(
                "Этот QR-код предназначен для продавца. Обратитесь к администратору."
            )
            return
        result = await session.execute(select(User).where(User.id == customer_id))
        customer = result.scalar_one_or_none()
        await session.commit()

    if customer is None:
        await message.answer("Клиент не найден.")
        return

    await state.set_state(SaleFlow.waiting_amount)
    await state.update_data(customer_id=customer.id)
    await message.answer(
        f"Клиент: {customer.full_name}\n"
        f"Баланс: {customer.balance_points} баллов.\n\n"
        "Введите сумму покупки."
    )


def _parse_amount_minor(value: str) -> int | None:
    normalized = value.strip().replace(",", ".")
    try:
        amount = Decimal(normalized)
    except InvalidOperation:
        return None
    if amount <= 0:
        return None
    return int(amount * 100)
