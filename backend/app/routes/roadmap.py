from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas import ApiErrorResponse, RoadmapDisciplineItem, RoadmapEdgeResponse, RoadmapNodeResponse
from app.services.roadmap_query_service import (
    RoadmapQueryError,
    get_roadmap_edges_by_discipline,
    get_roadmap_nodes_by_discipline,
    list_roadmap_disciplines,
)


router = APIRouter(prefix="/api/roadmap")


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
