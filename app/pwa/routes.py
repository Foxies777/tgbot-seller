from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse

router = APIRouter()

PWA_INDEX = Path("app/static/pwa/index.html")
PWA_SERVICE_WORKER = Path("app/static/pwa/sw.js")


@router.get("/")
async def root():
    return RedirectResponse("/app", status_code=303)


@router.get("/app")
@router.get("/register")
@router.get("/seller")
@router.get("/admin")
@router.get("/qr/{token}")
async def pwa_index():
    if PWA_INDEX.exists():
        return FileResponse(PWA_INDEX)
    return HTMLResponse(
        "<h1>Bonus Loyalty PWA</h1>"
        "<p>Frontend build is not available. Run the Vite dev server from frontend/.</p>",
        status_code=503,
    )


@router.get("/sw.js")
async def service_worker():
    if PWA_SERVICE_WORKER.exists():
        return FileResponse(
            PWA_SERVICE_WORKER,
            media_type="application/javascript",
            headers={"Service-Worker-Allowed": "/"},
        )
    return HTMLResponse("", status_code=404)
