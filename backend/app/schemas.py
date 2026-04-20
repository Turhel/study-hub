from __future__ import annotations

from pydantic import BaseModel


class TodayMetrics(BaseModel):
    blocks: int
    subjects: int
    due_reviews: int
    forgotten_subjects: int


class TodayPriority(BaseModel):
    title: str
    description: str


class TodayReviewItem(BaseModel):
    id: int
    subject: str
    block: str | None = None
    due_date: str
    title: str
    description: str | None = None


class TodayRiskBlockItem(BaseModel):
    id: int
    name: str
    discipline: str | None = None
    score: float
    status: str
    title: str
    description: str | None = None


class TodayForgottenSubjectItem(BaseModel):
    id: int
    subject: str
    discipline: str | None = None
    days_without_contact: int
    title: str
    description: str | None = None


class TodayStartingPointItem(BaseModel):
    discipline: str
    block_id: int
    block_name: str
    subject_id: int
    subject_name: str
    reason: str
    title: str
    description: str | None = None


class TodayResponse(BaseModel):
    metrics: TodayMetrics
    priority: TodayPriority
    due_reviews: list[TodayReviewItem]
    risk_blocks: list[TodayRiskBlockItem]
    forgotten_subjects: list[TodayForgottenSubjectItem]
    starting_points: list[TodayStartingPointItem]


class TimerSessionItemCreate(BaseModel):
    question_number: int
    status: str
    elapsed_seconds: int
    exceeded_target: bool
    completed_at: str | None = None


class TimerSessionCreate(BaseModel):
    discipline: str
    block_name: str
    subject_name: str
    mode: str
    planned_questions: int
    target_seconds_per_question: int
    total_elapsed_seconds: int
    completed_count: int
    skipped_count: int
    overtime_count: int
    average_seconds_completed: int
    difficulty_general: str
    volume_perceived: str
    notes: str | None = None
    items: list[TimerSessionItemCreate]


class TimerSessionRecentItem(BaseModel):
    id: int
    created_at: str
    discipline: str
    block_name: str
    subject_name: str
    mode: str
    planned_questions: int
    completed_count: int
    skipped_count: int
    total_elapsed_seconds: int
    average_seconds_completed: int


class TimerSessionCreateResponse(BaseModel):
    id: int
