from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.bot.dispatcher import create_bot, create_dispatcher
from app.bot.routes import router as telegram_router
from app.core.config import get_settings
from app.web.routes import router as web_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    bot = create_bot(settings)
    dispatcher = create_dispatcher(settings)
    app.state.settings = settings
    app.state.bot = bot
    app.state.dispatcher = dispatcher
    if settings.app_env == "production":
        await bot.set_webhook(
            settings.webhook_url,
            secret_token=settings.telegram_webhook_secret.get_secret_value(),
        )
    yield
    if settings.app_env == "production":
        await bot.delete_webhook()
    await bot.session.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)
    app.mount("/static", StaticFiles(directory="app/static"), name="static")
    app.include_router(telegram_router)
    app.include_router(web_router)
    return app


app = create_app()
