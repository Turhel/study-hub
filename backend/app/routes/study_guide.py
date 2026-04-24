from __future__ import annotations

from fastapi import APIRouter

from app.db import get_session
from app.schemas import StudyGuidePreferences, StudyGuidePreferencesResponse
from app.services.capacity_service import get_or_create_capacity, preferences_response, update_study_guide_preferences


router = APIRouter(prefix="/api/study-guide")


@router.get("/preferences", response_model=StudyGuidePreferencesResponse)
def read_study_guide_preferences() -> StudyGuidePreferencesResponse:
    with get_session() as session:
        capacity = get_or_create_capacity(session)
        return preferences_response(capacity)


@router.put("/preferences", response_model=StudyGuidePreferencesResponse)
def update_preferences(payload: StudyGuidePreferences) -> StudyGuidePreferencesResponse:
    with get_session() as session:
        return update_study_guide_preferences(session, payload)

