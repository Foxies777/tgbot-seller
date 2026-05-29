from collections.abc import Awaitable, Callable
from typing import Any

from aiogram import BaseMiddleware, Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import TelegramObject

from app.bot.handlers import router
from app.core.config import Settings


class SettingsMiddleware(BaseMiddleware):
    def __init__(self, settings: Settings):
        self.settings = settings

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        data["settings"] = self.settings
        return await handler(event, data)


def create_bot(settings: Settings) -> Bot:
    return Bot(token=settings.bot_token.get_secret_value())


def create_dispatcher(settings: Settings) -> Dispatcher:
    dispatcher = Dispatcher(storage=MemoryStorage())
    dispatcher.update.middleware(SettingsMiddleware(settings))
    dispatcher.include_router(router)
    return dispatcher
