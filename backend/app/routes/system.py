from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.db import get_database_backend
from app.schemas import (
    ResetStudyDataRequest,
    ResetStudyDataResponse,
    SystemCapabilitiesDatabase,
    SystemCapabilitiesFeatures,
    SystemCapabilitiesLLM,
    SystemCapabilitiesResponse,
)
from app.db import get_session
from app.settings import (
    get_essay_correction_enabled,
    get_essay_study_enabled,
    get_llm_enabled,
    get_llm_model_name,
    get_llm_provider_name,
    get_machine_profile,
)
from app.services.reset_service import reset_study_data


router = APIRouter(prefix="/api/system")


@router.get("/capabilities", response_model=SystemCapabilitiesResponse)
def get_system_capabilities() -> SystemCapabilitiesResponse:
    database_backend = get_database_backend()
    dialect = "postgresql" if database_backend == "postgres" else database_backend
    return SystemCapabilitiesResponse(
        machine_profile=get_machine_profile(),
        database=SystemCapabilitiesDatabase(
            dialect=dialect,
            using_remote_database=database_backend != "sqlite",
        ),
        llm=SystemCapabilitiesLLM(
            enabled=get_llm_enabled(),
            provider=get_llm_provider_name(),
            model=get_llm_model_name(),
        ),
        features=SystemCapabilitiesFeatures(
            essay_correction_enabled=get_essay_correction_enabled(),
            essay_study_enabled=get_essay_study_enabled(),
        ),
    )


@router.post("/reset-study-data", response_model=ResetStudyDataResponse)
def reset_system_study_data(payload: ResetStudyDataRequest) -> ResetStudyDataResponse:
    try:
        with get_session() as session:
            return reset_study_data(session, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "invalid_confirmation_text",
                "message": str(exc),
            },
        ) from exc
