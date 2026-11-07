"""IceStation UB API.  Run:  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --timeout-graceful-shutdown 2   Docs: /docs"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import DATA_DIR, get_settings
from .database import SessionLocal, get_db
from .models import ParkingReport
from .routers import community, orbital, parking
from .schemas import HealthOut
from .seed import init
from .services import gemini_status, satellite as sat, weather
from .services.lot_state import campus_now, get_state
from .services.realtime import hub
from .services.vision.detectors import get_detector
from .timeutil import utcnow

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("icestation")
settings = get_settings()


async def expiry_loop() -> None:
    """Every 30 s: expire hazards and tell clients when crew parking reports age out."""
    last_live = None
    while True:
        try:
            with SessionLocal() as db:
                from .services.hazards import active_hazards
                before = len(active_hazards(db))
                live = db.scalar(select(func.count(ParkingReport.id)).where(ParkingReport.expires_at > utcnow()))
                if last_live is not None and live < last_live:
                    hub.publish("lots")
                last_live = live
                after = len(active_hazards(db))
                if after != before:
                    hub.publish("hazards")
        except Exception as exc:  # never let the loop die
            log.warning("expiry loop: %s", exc)
        await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init()
    for sub in ("uploads", "satellite", "samples"):
        (DATA_DIR / sub).mkdir(parents=True, exist_ok=True)
    if not any((DATA_DIR / "samples").glob("*.jpg")):
        from scripts.generate_samples import SAMPLES, make_lot, make_walkway
        for args in SAMPLES:
            make_lot(*args)
        make_walkway()
    task = asyncio.create_task(expiry_loop())
    yield
    task.cancel()


app = FastAPI(title="IceStation UB API", version="1.0.0", lifespan=lifespan,
              description="Mission control for UB North Campus parking and winter safety. Hackathon prototype.")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_origin_regex=settings.cors_origin_regex or None,
                   allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

for r in (parking.router, orbital.weather_router, orbital.satellite_router, orbital.system_router,
          community.hazard_router, community.crew_router, community.notif_router):
    app.include_router(r)

for sub in ("uploads", "satellite", "samples"):
    (DATA_DIR / sub).mkdir(parents=True, exist_ok=True)
    app.mount(f"/media/{sub}", StaticFiles(directory=DATA_DIR / sub), name=f"media-{sub}")


@app.exception_handler(ValueError)
async def value_error_handler(_: Request, exc: ValueError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.get("/api/health", response_model=HealthOut, tags=["system"])
def health(db: Session = Depends(get_db)):
    listing, _ = sat.live_listing()
    wx = weather.current()
    now, simulated = campus_now()
    return {
        "status": "ok", "app": settings.app_name, "mode": get_state(db).mode,
        "vision_detector": getattr(get_detector(), "name", "unknown"),
        "gemini_configured": gemini_status(),
        "satellite_source": "goes19_live" if listing else "simulated",
        "weather_source": wx["source"], "simulated_clock": simulated, "time_campus": now.strftime("%H:%M"),
    }


@app.websocket("/ws")
async def ws(websocket: WebSocket):
    await hub.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(websocket)
