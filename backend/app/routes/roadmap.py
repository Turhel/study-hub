from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas import (
    ApiErrorResponse,
    RoadmapDisciplineItem,
    RoadmapDisciplineSummaryResponse,
    RoadmapDryRunResponse,
    RoadmapEdgeResponse,
    RoadmapNodeResponse,
    RoadmapSummaryResponse,
    RoadmapValidationResponse,
)
from app.services.roadmap_diff_service import get_roadmap_dry_run
from app.services.roadmap_query_service import (
    RoadmapQueryError,
    get_roadmap_discipline_summary,
    get_roadmap_edges_by_discipline,
    get_roadmap_nodes_by_discipline,
    get_roadmap_summary,
    list_roadmap_disciplines,
)
from app.services.roadmap_validation_service import validate_roadmap_csvs


router = APIRouter(prefix="/api/roadmap")


@router.get("/validation", response_model=RoadmapValidationResponse)
def get_roadmap_validation_route() -> RoadmapValidationResponse:
    return validate_roadmap_csvs()


@router.get("/summary", response_model=RoadmapSummaryResponse)
def get_roadmap_summary_route() -> RoadmapSummaryResponse:
    return get_roadmap_summary()


@router.get("/dry-run", response_model=RoadmapDryRunResponse)
def get_roadmap_dry_run_route() -> RoadmapDryRunResponse:
    return get_roadmap_dry_run()


@router.get(
    "/discipline/{discipline}/summary",
    response_model=RoadmapDisciplineSummaryResponse,
    responses={404: {"model": ApiErrorResponse}},
)
def get_roadmap_discipline_summary_route(discipline: str) -> RoadmapDisciplineSummaryResponse:
    try:
        return get_roadmap_discipline_summary(discipline)
    except RoadmapQueryError as exc:
        raise HTTPException(status_code=404, detail={"code": "roadmap_discipline_not_found", "message": str(exc)}) from exc


@router.get("/disciplines", response_model=list[RoadmapDisciplineItem])
def get_roadmap_disciplines_route() -> list[RoadmapDisciplineItem]:
    return list_roadmap_disciplines()


@router.get(
    "/nodes/{discipline}",
    response_model=list[RoadmapNodeResponse],
    responses={404: {"model": ApiErrorResponse}},
)
def get_roadmap_nodes_route(discipline: str) -> list[RoadmapNodeResponse]:
    try:
        return get_roadmap_nodes_by_discipline(discipline)
    except RoadmapQueryError as exc:
        raise HTTPException(status_code=404, detail={"code": "roadmap_discipline_not_found", "message": str(exc)}) from exc


@router.get(
    "/edges/{discipline}",
    response_model=list[RoadmapEdgeResponse],
    responses={404: {"model": ApiErrorResponse}},
)
def get_roadmap_edges_route(discipline: str) -> list[RoadmapEdgeResponse]:
    try:
        return get_roadmap_edges_by_discipline(discipline)
    except RoadmapQueryError as exc:
        raise HTTPException(status_code=404, detail={"code": "roadmap_discipline_not_found", "message": str(exc)}) from exc
