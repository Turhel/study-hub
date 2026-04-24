from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


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
    discipline: str | None = None
    strategic_discipline: str | None = None
    subarea: str | None = None
    due_date: str
    title: str
    description: str | None = None


class TodayRiskBlockItem(BaseModel):
    id: int
    name: str
    discipline: str | None = None
    strategic_discipline: str | None = None
    subarea: str | None = None
    score: float
    status: str
    title: str
    description: str | None = None


class TodayForgottenSubjectItem(BaseModel):
    id: int
    subject: str
    discipline: str | None = None
    strategic_discipline: str | None = None
    subarea: str | None = None
    days_without_contact: int
    title: str
    description: str | None = None


class TodayStartingPointItem(BaseModel):
    discipline: str
    strategic_discipline: str | None = None
    subarea: str | None = None
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


class StudyPlanSummary(BaseModel):
    total_questions: int
    focus_count: int


class StudyPlanItem(BaseModel):
    discipline: str
    strategic_discipline: str | None = None
    subarea: str | None = None
    block_id: int
    block_name: str
    subject_id: int
    subject_name: str
    planned_questions: int
    completed_today: int
    remaining_today: int
    progress_ratio: float
    execution_status: Literal["nao_iniciado", "em_andamento", "concluido"]
    priority_score: float
    primary_reason: str
    planned_mode: str
    roadmap_node_id: str | None = None
    roadmap_mapped: bool = False
    roadmap_mapping_source: Literal["override", "heuristic", "unmapped"] | None = None
    roadmap_mapping_confidence: float | None = None
    roadmap_mapping_reason: str | None = None
    roadmap_status: Literal[
        "entry",
        "available",
        "blocked_required",
        "blocked_cross_required",
        "reviewable",
    ] | None = None
    roadmap_reason: str | None = None


class StudyPlanTodayResponse(BaseModel):
    summary: StudyPlanSummary
    items: list[StudyPlanItem]


class StudyGuidePreferences(BaseModel):
    daily_minutes: int = Field(ge=15, le=360)
    intensity: Literal["leve", "normal", "forte"]
    max_focus_count: int = Field(ge=1, le=5)
    max_questions: int = Field(ge=1, le=80)
    include_reviews: bool
    include_new_content: bool


class StudyGuidePreferencesResponse(StudyGuidePreferences):
    updated_at: str


class StudyPlanRecalculateResponse(BaseModel):
    replaced_plan_id: int | None = None
    plan: StudyPlanTodayResponse


class QuestionAttemptBulkCreate(BaseModel):
    date: str | None = None
    discipline: str
    block_id: int
    subject_id: int
    source: str | None = None
    quantity: int
    correct_count: int
    difficulty_bank: str = "media"
    difficulty_personal: str | None = None
    elapsed_seconds: int | None = None
    confidence: str | None = None
    error_type: str | None = None
    notes: str | None = None
    study_mode: Literal["guided", "free"] = "guided"


class QuestionAttemptBulkCreateResponse(BaseModel):
    created_attempts: int
    block_id: int
    subject_id: int
    mastery_status: str | None = None
    mastery_score: float | None = None
    next_review_date: str | None = None
    impact_message: str | None = None


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


class EssayCorrectionRequest(BaseModel):
    theme: str
    essay_text: str
    student_goal: str | None = None
    mode: Literal["score_only", "detailed", "teach"] = "detailed"


class EssayScoreRange(BaseModel):
    min: int
    max: int


class EssayCompetencyResult(BaseModel):
    score: int
    comment: str


class EssayCorrectionResponse(BaseModel):
    estimated_score_range: EssayScoreRange
    competencies: dict[str, EssayCompetencyResult]
    strengths: list[str]
    weaknesses: list[str]
    improvement_plan: list[str]
    confidence_note: str


class EssayCorrectionCreateRequest(BaseModel):
    theme: str
    essay_text: str
    student_goal: str | None = None
    mode: Literal["score_only", "detailed", "teach"] = "detailed"


class EssaySubmissionResponse(BaseModel):
    id: int
    theme: str
    essay_text: str
    created_at: str


class EssayCorrectionStoredResponse(BaseModel):
    id: int
    submission: EssaySubmissionResponse
    provider: str
    model: str
    prompt_name: str
    prompt_hash: str
    mode: Literal["score_only", "detailed", "teach"]
    estimated_score_range: EssayScoreRange
    competencies: dict[str, EssayCompetencyResult]
    strengths: list[str]
    weaknesses: list[str]
    improvement_plan: list[str]
    confidence_note: str
    tokens_input: int
    tokens_output: int
    tokens_total: int
    created_at: str


class EssayStudySessionCreateRequest(BaseModel):
    essay_correction_id: int


class EssayStudyMessageCreateRequest(BaseModel):
    content: str


class EssayStudyMessageResponse(BaseModel):
    id: int
    role: Literal["system", "user", "assistant"]
    content: str
    tokens_estimated: int
    created_at: str


class EssayStudySessionResponse(BaseModel):
    id: int
    essay_submission_id: int
    essay_correction_id: int
    provider: str
    model: str
    prompt_name: str
    prompt_hash: str
    tokens_input: int
    tokens_output: int
    status: Literal["active", "closed", "token_limit_reached"]
    tokens_total: int
    token_limit: int
    can_accept_messages: bool
    messages_count: int
    started_at: str
    ended_at: str | None = None
    messages: list[EssayStudyMessageResponse]


class EssayStudySessionListItem(BaseModel):
    id: int
    essay_submission_id: int
    essay_correction_id: int
    provider: str
    model: str
    prompt_name: str
    prompt_hash: str
    status: Literal["active", "closed", "token_limit_reached"]
    tokens_input: int
    tokens_output: int
    tokens_total: int
    token_limit: int
    can_accept_messages: bool
    messages_count: int
    started_at: str
    ended_at: str | None = None


class EssayStudySessionCloseResponse(BaseModel):
    id: int
    status: Literal["closed", "token_limit_reached"]
    ended_at: str


class ApiErrorDetail(BaseModel):
    code: str
    message: str


class ApiErrorResponse(BaseModel):
    detail: ApiErrorDetail


class SystemCapabilitiesDatabase(BaseModel):
    dialect: str
    using_remote_database: bool


class SystemCapabilitiesLLM(BaseModel):
    enabled: bool
    provider: str
    model: str


class SystemCapabilitiesFeatures(BaseModel):
    essay_correction_enabled: bool
    essay_study_enabled: bool


class SystemCapabilitiesResponse(BaseModel):
    machine_profile: str
    database: SystemCapabilitiesDatabase
    llm: SystemCapabilitiesLLM
    features: SystemCapabilitiesFeatures


class ActivityItem(BaseModel):
    type: Literal["question_attempt_bulk", "review_upsert", "daily_plan_generated", "block_progress_decision"]
    created_at: str
    title: str
    description: str
    discipline: str | None = None
    strategic_discipline: str | None = None
    subarea: str | None = None
    block_id: int | None = None
    subject_id: int | None = None
    metadata: dict[str, Any]


class ActivityTodayResponse(BaseModel):
    date: str
    question_attempts_registered: int
    subjects_studied_today: int
    blocks_impacted_today: int
    reviews_generated_today: int
    progression_decisions_today: int
    studied_subject_ids: list[int]
    impacted_block_ids: list[int]


class FreeStudyRoadmapNodeBrief(BaseModel):
    node_id: str
    discipline: str
    subject_area: str
    content: str
    subunit: str | None = None
    relation_type: Literal["required", "recommended", "cross_required", "cross_support"] | None = None
    strength: float | None = None
    notes: str | None = None


class FreeStudySubjectCatalogItem(BaseModel):
    subject_id: int
    subject_name: str
    block_id: int | None = None
    block_name: str | None = None
    roadmap_node_id: str | None = None
    roadmap_mapped: bool
    roadmap_status: Literal[
        "entry",
        "available",
        "blocked_required",
        "blocked_cross_required",
        "reviewable",
    ] | None = None
    free_study_allowed: bool
    warning_level: Literal["none", "low", "medium", "high"]
    warning_message: str | None = None


class FreeStudyCatalogSubarea(BaseModel):
    subarea: str
    subjects: list[FreeStudySubjectCatalogItem]


class FreeStudyCatalogDiscipline(BaseModel):
    discipline: str
    strategic_discipline: str
    subareas: list[FreeStudyCatalogSubarea]


class FreeStudyCatalogResponse(BaseModel):
    disciplines: list[FreeStudyCatalogDiscipline]


class FreeStudySubjectContextResponse(BaseModel):
    subject_id: int
    subject_name: str
    discipline: str
    strategic_discipline: str | None = None
    subarea: str | None = None
    block_id: int | None = None
    block_name: str | None = None
    roadmap_node_id: str | None = None
    roadmap_mapped: bool
    free_study_allowed: bool
    guided_status: Literal[
        "entry",
        "available",
        "blocked_required",
        "blocked_cross_required",
        "reviewable",
        "unmapped",
    ]
    warning_level: Literal["none", "low", "medium", "high"]
    warning_message: str | None = None
    direct_prerequisites: list[FreeStudyRoadmapNodeBrief]
    missing_required_nodes: list[FreeStudyRoadmapNodeBrief]
    missing_cross_required_nodes: list[FreeStudyRoadmapNodeBrief]
    missing_recommended_nodes: list[FreeStudyRoadmapNodeBrief]


class BlockProgressDecisionRequest(BaseModel):
    discipline: str
    block_id: int
    user_decision: Literal["continue_current", "mixed_transition", "advance_next"]


class BlockProgressDecisionResponse(BaseModel):
    discipline: str
    block_id: int
    saved_decision: Literal["continue_current", "mixed_transition", "advance_next"]
    current_status: str
    next_block_id: int | None = None
    message: str


class DisciplineBlockProgressItem(BaseModel):
    id: int
    name: str
    status: str


class DisciplineBlockProgressSnapshotResponse(BaseModel):
    discipline: str
    active_block: DisciplineBlockProgressItem | None = None
    next_block: DisciplineBlockProgressItem | None = None
    reviewable_blocks: list[DisciplineBlockProgressItem]
    saved_decision: Literal["continue_current", "mixed_transition", "advance_next"] | None = None
    ready_to_advance: bool
    message: str


class RoadmapDisciplineItem(BaseModel):
    discipline: str
    strategic_discipline: str
    node_count: int


class RoadmapNodeResponse(BaseModel):
    node_id: str
    strategic_discipline: str
    discipline: str
    subject_area: str
    content: str
    subunit: str | None = None
    short_description: str | None = None
    pedagogical_size: str
    expected_contacts_min: int
    expected_contacts_target: int
    cadence_base: str
    frequency_base: str
    recurrence_weight: float
    strategic_weight: float
    node_type: str
    free_mode: bool
    active: bool
    notes: str | None = None


class RoadmapEdgeResponse(BaseModel):
    from_node_id: str
    to_node_id: str
    relation_type: Literal["required", "recommended", "cross_required", "cross_support"]
    strength: float
    notes: str | None = None


class RoadmapImportSummary(BaseModel):
    nodes_created: int = 0
    nodes_updated: int = 0
    nodes_deleted: int = 0
    edges_created: int = 0
    edges_updated: int = 0
    edges_deleted: int = 0
    block_map_created: int = 0
    block_map_updated: int = 0
    block_map_deleted: int = 0
    rules_created: int = 0
    rules_updated: int = 0
    rules_deleted: int = 0
    disciplines_detected: list[str]


class RoadmapValidationIssue(BaseModel):
    severity: Literal["error", "warning"]
    file: str
    code: str
    message: str
    row: int | None = None
    node_id: str | None = None


class RoadmapValidationResponse(BaseModel):
    is_valid: bool
    errors_count: int
    warnings_count: int
    errors: list[RoadmapValidationIssue]
    warnings: list[RoadmapValidationIssue]


class RoadmapDisciplineSummaryResponse(BaseModel):
    discipline: str
    node_count: int
    edge_count: int
    subjects: list[str]
    blocks: list[int]
    initial_nodes: list[RoadmapNodeResponse]


class RoadmapSummaryResponse(BaseModel):
    discipline_count: int
    node_count: int
    edge_count: int
    block_count: int
    disciplines: list[RoadmapDisciplineSummaryResponse]


class RoadmapDryRunTypeSummary(BaseModel):
    to_create: int = 0
    to_update: int = 0
    only_in_db: int = 0


class RoadmapDryRunExamples(BaseModel):
    nodes_to_create: list[str] = Field(default_factory=list)
    nodes_to_update: list[str] = Field(default_factory=list)
    nodes_only_in_db: list[str] = Field(default_factory=list)
    edges_to_create: list[str] = Field(default_factory=list)
    edges_to_update: list[str] = Field(default_factory=list)
    edges_only_in_db: list[str] = Field(default_factory=list)
    block_map_to_create: list[str] = Field(default_factory=list)
    block_map_to_update: list[str] = Field(default_factory=list)
    block_map_only_in_db: list[str] = Field(default_factory=list)
    rules_to_create: list[str] = Field(default_factory=list)
    rules_to_update: list[str] = Field(default_factory=list)
    rules_only_in_db: list[str] = Field(default_factory=list)


class RoadmapDryRunResponse(BaseModel):
    summary: dict[str, int]
    types: dict[str, RoadmapDryRunTypeSummary]
    by_discipline: dict[str, dict[str, int]]
    examples: RoadmapDryRunExamples


class RoadmapNodeBrief(BaseModel):
    node_id: str
    discipline: str
    subject_area: str
    content: str
    subunit: str | None = None


class RoadmapDependencyItem(BaseModel):
    node: RoadmapNodeBrief
    relation_type: Literal["required", "recommended", "cross_required", "cross_support"]
    strength: float
    notes: str | None = None


class RoadmapNodeExplainResponse(BaseModel):
    node_id: str
    discipline: str
    subject_area: str
    content: str
    subunit: str | None = None
    incoming_dependencies: list[RoadmapDependencyItem]
    required_dependencies: list[RoadmapDependencyItem]
    cross_required_dependencies: list[RoadmapDependencyItem]
    recommended_dependencies: list[RoadmapDependencyItem]
    cross_support_dependencies: list[RoadmapDependencyItem]
    outgoing_dependents: list[RoadmapDependencyItem]
    classification: Literal[
        "entry",
        "available_if_prereqs_met",
        "blocked_by_required",
        "blocked_by_cross_required",
    ]
    message: str


class RoadmapDependentNodeResponse(BaseModel):
    node: RoadmapNodeBrief
    direct_dependents: list[RoadmapDependencyItem]
    second_level_dependents: list[RoadmapDependencyItem] = Field(default_factory=list)


class RoadmapEntryPathItem(BaseModel):
    nodes: list[RoadmapNodeBrief]
    relation_types: list[str] = Field(default_factory=list)


class RoadmapNodeDepthItem(BaseModel):
    node: RoadmapNodeBrief
    depth: int | None = None


class RoadmapDisciplineEntryPathsResponse(BaseModel):
    discipline: str
    entry_nodes: list[RoadmapNodeBrief]
    nodes_without_required_dependencies: list[RoadmapNodeBrief]
    suggested_paths: list[RoadmapEntryPathItem]
    node_depths: list[RoadmapNodeDepthItem]


class RoadmapMappingSubjectBrief(BaseModel):
    subject_id: int
    discipline: str
    subject: str
    subsubject: str | None = None
    label: str


class RoadmapMappingNodeBrief(BaseModel):
    node_id: str
    discipline: str
    subject_area: str
    content: str
    subunit: str | None = None
    label: str


class RoadmapMappingCandidate(BaseModel):
    node: RoadmapMappingNodeBrief
    score: float
    matched_terms: list[str] = Field(default_factory=list)


class RoadmapMappingSubjectAuditItem(BaseModel):
    subject: RoadmapMappingSubjectBrief
    status: Literal["mapped", "unmapped", "ambiguous"]
    mapping_source: Literal["override", "heuristic", "unmapped"] | None = None
    mapping_confidence: float | None = None
    mapping_reason: str | None = None
    relevant_candidate_count: int = 0
    mapped_node_id: str | None = None
    best_candidates: list[RoadmapMappingCandidate] = Field(default_factory=list)


class RoadmapMappingDisciplineSummary(BaseModel):
    discipline: str
    total_subjects: int
    mapped_subjects: int
    override_mapped_subjects: int = 0
    heuristic_mapped_subjects: int = 0
    unmapped_subjects: int
    ambiguous_subjects: int
    coverage_percent: float


class RoadmapMappingCoverageResponse(BaseModel):
    total_subjects: int
    mapped_subjects: int
    override_mapped_subjects: int = 0
    heuristic_mapped_subjects: int = 0
    unmapped_subjects: int
    ambiguous_subjects: int
    coverage_percent: float
    disciplines: list[RoadmapMappingDisciplineSummary]


class RoadmapMappingGapsResponse(BaseModel):
    discipline: str | None = None
    unmapped_subjects: list[RoadmapMappingSubjectAuditItem]
    roadmap_nodes_without_subject: list[RoadmapMappingNodeBrief]
    ambiguous_subjects: list[RoadmapMappingSubjectAuditItem]


class RoadmapMappingDisciplineResponse(BaseModel):
    discipline: str
    total_subjects: int
    mapped_subjects: int
    override_mapped_subjects: int = 0
    heuristic_mapped_subjects: int = 0
    unmapped_subjects: int
    ambiguous_subjects: int
    coverage_percent: float
    mapped_examples: list[RoadmapMappingSubjectAuditItem]
    unmapped_examples: list[RoadmapMappingSubjectAuditItem]
    ambiguous_examples: list[RoadmapMappingSubjectAuditItem]
