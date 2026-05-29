from aiogram.types import Update
from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/telegram", tags=["telegram"])


@router.post("/webhook")
async def telegram_webhook(request: Request) -> dict[str, bool]:
    settings = request.app.state.settings
    secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
    if secret != settings.telegram_webhook_secret.get_secret_value():
        raise HTTPException(status_code=403, detail="Invalid Telegram secret token")

    payload = await request.json()
    update = Update.model_validate(payload, context={"bot": request.app.state.bot})
    await request.app.state.dispatcher.feed_update(request.app.state.bot, update)
    return {"ok": True}
