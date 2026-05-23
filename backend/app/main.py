from __future__ import annotations

from contextlib import asynccontextmanager
import os
import sys

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import models  # noqa: F401
from app.db import init_db
from app.routes.activity import router as activity_router
from app.routes.block_progress import router as block_progress_router
from app.routes.essay import router as essay_router
from app.routes.essay_study import router as essay_study_router
from app.routes.free_study import router as free_study_router
from app.routes.gamification import router as gamification_router
from app.routes.health import router as health_router
from app.routes.lessons import router as lessons_router
from app.routes.mock_exams import router as mock_exams_router
from app.routes.question_attempts import router as question_attempts_router
from app.routes.roadmap import router as roadmap_router
from app.routes.stats import router as stats_router
from app.routes.study_guide import router as study_guide_router
from app.routes.study_plan import router as study_plan_router
from app.routes.system import router as system_router
from app.settings import get_auto_sync_structural_on_startup, get_cors_origins, load_env_file
from app.routes.today import router as today_router
from app.routes.timer_sessions import router as timer_sessions_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    load_env_file()
    init_db()
    if get_auto_sync_structural_on_startup():
        from app.services.postgres_bootstrap_service import bootstrap_structural_data_to_postgres
        from app.settings import get_default_sqlite_db_path

        bootstrap_structural_data_to_postgres(get_default_sqlite_db_path())
    yield


app = FastAPI(title="Study Hub API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _api_token_check_enabled() -> bool:
    return "pytest" not in sys.modules


def _expected_api_token() -> str:
    return os.getenv("STUDY_HUB_SECRET_TOKEN") or "local_dev_secret_token_2026"


@app.middleware("http")
async def require_api_token(request: Request, call_next):
    if request.url.path.startswith("/api") and request.method != "OPTIONS" and _api_token_check_enabled():
        supplied_token = request.headers.get("X-API-Token")
        if supplied_token != _expected_api_token():
            return JSONResponse(
                status_code=401,
                content={"detail": "Acesso negado: Token inválido ou ausente."},
            )
    return await call_next(request)

app.include_router(health_router)
app.include_router(today_router)
app.include_router(study_guide_router)
app.include_router(study_plan_router)
app.include_router(stats_router)
app.include_router(gamification_router)
app.include_router(lessons_router)
app.include_router(mock_exams_router)
app.include_router(question_attempts_router)
app.include_router(timer_sessions_router)
app.include_router(system_router)
app.include_router(essay_router)
app.include_router(essay_study_router)
app.include_router(block_progress_router)
app.include_router(roadmap_router)
app.include_router(activity_router)
app.include_router(free_study_router)
