from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
