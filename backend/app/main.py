from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401
from app.db import init_db
from app.routes.health import router as health_router
from app.routes.today import router as today_router
from app.routes.timer_sessions import router as timer_sessions_router


app = FastAPI(title="Study Hub API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(today_router)
app.include_router(timer_sessions_router)


@app.on_event("startup")
def on_startup() -> None:
    init_db()
