import asyncio
from contextlib import suppress

from app.core.config import Settings
from app.db.session import async_session_factory
from app.services.loyalty import LoyaltyService


async def run_expiration_loop(settings: Settings, interval_seconds: int = 3600) -> None:
    while True:
        await asyncio.sleep(interval_seconds)
        async with async_session_factory() as session:
            await LoyaltyService(session, settings).expire_points()
            await session.commit()


async def stop_task(task: asyncio.Task[None]) -> None:
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task
