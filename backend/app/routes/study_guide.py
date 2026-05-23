from __future__ import annotations

from fastapi import APIRouter

from app.db import get_session
from app.schemas import (
    StudyGuidePreferences,
    StudyGuidePreferencesResponse,
    UserEnergySettingsResponse,
    UserEnergySettingsUpdate,
)
from app.services.capacity_service import (
    energy_settings_response,
    get_or_create_capacity,
    get_or_create_user_energy_settings,
    preferences_response,
    update_study_guide_preferences,
    update_user_energy_settings,
)


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


@router.get("/energy-settings", response_model=UserEnergySettingsResponse)
def read_user_energy_settings() -> UserEnergySettingsResponse:
    with get_session() as session:
        settings = get_or_create_user_energy_settings(session)
        return energy_settings_response(settings)


@router.put("/energy-settings", response_model=UserEnergySettingsResponse)
def update_energy_settings(payload: UserEnergySettingsUpdate) -> UserEnergySettingsResponse:
    with get_session() as session:
        return update_user_energy_settings(session, payload)

