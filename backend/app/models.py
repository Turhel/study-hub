from __future__ import annotations

from datetime import date, datetime

from sqlmodel import Field, SQLModel


class Subject(SQLModel, table=True):
    __tablename__ = "subjects"

    id: int | None = Field(default=None, primary_key=True)
    disciplina: str = Field(index=True)
    assunto: str = Field(index=True)
    subassunto: str | None = None
    competencia: str | None = None
    habilidade: str | None = None
    prioridade_enem: int = Field(default=3, ge=1, le=5)
    ativo: bool = True


class Block(SQLModel, table=True):
    __tablename__ = "blocks"

    id: int | None = Field(default=None, primary_key=True)
    nome: str = Field(index=True)
    disciplina: str = Field(index=True)
    descricao: str | None = None
    ordem: int = 0
    status: str = Field(default="em_andamento", index=True)


class BlockSubject(SQLModel, table=True):
    __tablename__ = "block_subjects"

    id: int | None = Field(default=None, primary_key=True)
    block_id: int = Field(foreign_key="blocks.id", index=True)
    subject_id: int = Field(foreign_key="subjects.id", index=True)


class QuestionAttempt(SQLModel, table=True):
    __tablename__ = "question_attempts"

    id: int | None = Field(default=None, primary_key=True)
    data: date = Field(default_factory=date.today, index=True)
    source: str | None = None
    disciplina: str = Field(index=True)
    block_id: int | None = Field(default=None, foreign_key="blocks.id", index=True)
    subject_id: int | None = Field(default=None, foreign_key="subjects.id", index=True)
    dificuldade_banco: str = Field(default="media", index=True)
    dificuldade_pessoal: str | None = None
    acertou: bool = Field(index=True)
    tempo_segundos: int | None = Field(default=None, ge=0)
    confianca: int | None = Field(default=None, ge=1, le=5)
    tipo_erro: str | None = Field(default=None, index=True)
    observacoes: str | None = None


class Review(SQLModel, table=True):
    __tablename__ = "reviews"

    id: int | None = Field(default=None, primary_key=True)
    subject_id: int | None = Field(default=None, foreign_key="subjects.id", index=True)
    block_id: int | None = Field(default=None, foreign_key="blocks.id", index=True)
    ultima_data: date | None = Field(default=None, index=True)
    proxima_data: date = Field(index=True)
    status: str = Field(default="pendente", index=True)
    resultado: str | None = None
    intervalo_dias: int = Field(default=1, ge=1)


class BlockMastery(SQLModel, table=True):
    __tablename__ = "block_mastery"

    id: int | None = Field(default=None, primary_key=True)
    block_id: int = Field(foreign_key="blocks.id", index=True, unique=True)
    facil_total: int = Field(default=0, ge=0)
    facil_acertos: int = Field(default=0, ge=0)
    media_total: int = Field(default=0, ge=0)
    media_acertos: int = Field(default=0, ge=0)
    dificil_total: int = Field(default=0, ge=0)
    dificil_acertos: int = Field(default=0, ge=0)
    status: str = Field(default="em_andamento", index=True)
    score_domino: float = Field(default=0.0, ge=0.0, le=1.0)


class BlockProgress(SQLModel, table=True):
    __tablename__ = "block_progress"

    id: int | None = Field(default=None, primary_key=True)
    block_id: int = Field(foreign_key="blocks.id", index=True, unique=True)
    status: str = Field(default="future_locked", index=True)
    user_decision: str = Field(default="continue_current", index=True)
    unlocked_at: date | None = Field(default=None, index=True)
    approved_at: date | None = Field(default=None, index=True)


class SubjectProgress(SQLModel, table=True):
    __tablename__ = "subject_progress"

    id: int | None = Field(default=None, primary_key=True)
    subject_id: int = Field(foreign_key="subjects.id", index=True, unique=True)
    status: str = Field(default="locked", index=True)
    unlocked_at: date | None = Field(default=None, index=True)
    first_seen_at: date | None = Field(default=None, index=True)
    last_seen_at: date | None = Field(default=None, index=True)
    last_attempt_at: date | None = Field(default=None, index=True)
    last_review_at: date | None = Field(default=None, index=True)


class TimerSession(SQLModel, table=True):
    __tablename__ = "timer_sessions"

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    discipline: str = Field(index=True)
    block_name: str
    subject_name: str = Field(index=True)
    mode: str
    planned_questions: int = Field(ge=1)
    target_seconds_per_question: int = Field(ge=1)
    total_elapsed_seconds: int = Field(ge=0)
    completed_count: int = Field(default=0, ge=0)
    skipped_count: int = Field(default=0, ge=0)
    overtime_count: int = Field(default=0, ge=0)
    average_seconds_completed: int = Field(default=0, ge=0)
    difficulty_general: str
    volume_perceived: str
    notes: str | None = None


class TimerSessionItem(SQLModel, table=True):
    __tablename__ = "timer_session_items"

    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="timer_sessions.id", index=True)
    question_number: int = Field(ge=1)
    status: str = Field(index=True)
    elapsed_seconds: int = Field(ge=0)
    exceeded_target: bool = Field(default=False, index=True)
    completed_at: datetime | None = Field(default=None, index=True)


class StudyCapacity(SQLModel, table=True):
    __tablename__ = "study_capacity"

    id: int | None = Field(default=None, primary_key=True)
    current_load_level: int = Field(default=2, ge=1, le=5)
    recent_fatigue_score: float = Field(default=0.25, ge=0.0, le=1.0)
    recent_completion_rate: float = Field(default=0.70, ge=0.0, le=1.0)
    recent_overtime_rate: float = Field(default=0.20, ge=0.0, le=1.0)
    daily_minutes: int = Field(default=90, ge=15, le=360)
    intensity: str = Field(default="normal", index=True)
    max_focus_count: int = Field(default=3, ge=1, le=5)
    max_questions: int = Field(default=35, ge=1, le=80)
    include_reviews: bool = Field(default=True)
    include_new_content: bool = Field(default=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class StudyEvent(SQLModel, table=True):
    __tablename__ = "study_events"

    id: int | None = Field(default=None, primary_key=True)
    event_type: str = Field(index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    discipline: str | None = Field(default=None, index=True)
    strategic_discipline: str | None = Field(default=None, index=True)
    subarea: str | None = Field(default=None, index=True)
    block_id: int | None = Field(default=None, foreign_key="blocks.id", index=True)
    subject_id: int | None = Field(default=None, foreign_key="subjects.id", index=True)
    title: str
    description: str
    metadata_json: str = Field(default="{}")


class DailyStudyPlan(SQLModel, table=True):
    __tablename__ = "daily_study_plan"

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    total_planned_questions: int = Field(default=0, ge=0)
    status: str = Field(default="active", index=True)


class DailyStudyPlanItem(SQLModel, table=True):
    __tablename__ = "daily_study_plan_items"

    id: int | None = Field(default=None, primary_key=True)
    plan_id: int = Field(foreign_key="daily_study_plan.id", index=True)
    discipline: str = Field(index=True)
    block_id: int = Field(foreign_key="blocks.id", index=True)
    subject_id: int = Field(foreign_key="subjects.id", index=True)
    planned_questions: int = Field(ge=1)
    priority_score: float = Field(ge=0.0)
    primary_reason: str
    planned_mode: str = Field(default="aprendizado", index=True)


class MockExam(SQLModel, table=True):
    __tablename__ = "mock_exams"

    id: int | None = Field(default=None, primary_key=True)
    data: date = Field(default_factory=date.today, index=True)
    tipo: str
    area: str = Field(index=True)
    total_questoes: int = Field(ge=1)
    total_acertos: int = Field(ge=0)
    facil_erros: int = Field(default=0, ge=0)
    tri_score: float | None = Field(default=None, ge=0)
    tempo_total_min: int | None = Field(default=None, ge=0)
    observacoes: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class LessonContent(SQLModel, table=True):
    __tablename__ = "lesson_contents"

    id: int | None = Field(default=None, primary_key=True)
    roadmap_node_id: str | None = Field(default=None, foreign_key="roadmap_nodes.node_id", index=True)
    subject_id: int | None = Field(default=None, foreign_key="subjects.id", index=True)
    title: str = Field(index=True)
    body_markdown: str
    youtube_url: str | None = None
    extra_links_json: str | None = None
    notes: str | None = None
    is_published: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class Essay(SQLModel, table=True):
    __tablename__ = "essays"

    id: int | None = Field(default=None, primary_key=True)
    data: date = Field(default_factory=date.today, index=True)
    tema: str = Field(index=True)
    texto: str | None = None
    c1: int = Field(default=0, ge=0, le=200)
    c2: int = Field(default=0, ge=0, le=200)
    c3: int = Field(default=0, ge=0, le=200)
    c4: int = Field(default=0, ge=0, le=200)
    c5: int = Field(default=0, ge=0, le=200)
    total: int = Field(default=0, ge=0, le=1000)
    observacoes: str | None = None


class EssaySubmission(SQLModel, table=True):
    __tablename__ = "essay_submissions"

    id: int | None = Field(default=None, primary_key=True)
    theme: str = Field(index=True)
    essay_text: str
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class EssayCorrection(SQLModel, table=True):
    __tablename__ = "essay_corrections"

    id: int | None = Field(default=None, primary_key=True)
    essay_submission_id: int = Field(foreign_key="essay_submissions.id", index=True)
    provider: str = Field(index=True)
    model: str = Field(index=True)
    prompt_name: str
    prompt_hash: str = Field(index=True)
    mode: str = Field(index=True)
    estimated_score_min: int = Field(ge=0, le=1000)
    estimated_score_max: int = Field(ge=0, le=1000)
    c1_score: int = Field(ge=0, le=200)
    c1_comment: str
    c2_score: int = Field(ge=0, le=200)
    c2_comment: str
    c3_score: int = Field(ge=0, le=200)
    c3_comment: str
    c4_score: int = Field(ge=0, le=200)
    c4_comment: str
    c5_score: int = Field(ge=0, le=200)
    c5_comment: str
    strengths_json: str
    weaknesses_json: str
    improvement_plan_json: str
    confidence_note: str
    tokens_input: int = Field(default=0, ge=0)
    tokens_output: int = Field(default=0, ge=0)
    tokens_total: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class EssayStudySession(SQLModel, table=True):
    __tablename__ = "essay_study_sessions"

    id: int | None = Field(default=None, primary_key=True)
    essay_submission_id: int = Field(foreign_key="essay_submissions.id", index=True)
    essay_correction_id: int = Field(foreign_key="essay_corrections.id", index=True)
    provider: str = Field(index=True)
    model: str = Field(index=True)
    prompt_name: str
    prompt_hash: str = Field(index=True)
    status: str = Field(default="active", index=True)
    tokens_total: int = Field(default=0, ge=0)
    started_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    ended_at: datetime | None = Field(default=None, index=True)


class EssayStudyMessage(SQLModel, table=True):
    __tablename__ = "essay_study_messages"

    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="essay_study_sessions.id", index=True)
    role: str = Field(index=True)
    content: str
    tokens_estimated: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class RoadmapNode(SQLModel, table=True):
    __tablename__ = "roadmap_nodes"

    id: int | None = Field(default=None, primary_key=True)
    node_id: str = Field(index=True, unique=True)
    disciplina_estrategica: str = Field(index=True)
    disciplina: str = Field(index=True)
    materia: str = Field(index=True)
    conteudo: str = Field(index=True)
    subunidade: str | None = None
    descricao_curta: str | None = None
    tamanho_pedagogico: str
    expected_contacts_min: int = Field(default=1, ge=0)
    expected_contacts_target: int = Field(default=1, ge=0)
    cadencia_base: str
    frequencia_base: str
    peso_recorrencia: float = Field(default=1.0, ge=0.0)
    peso_estrategico: float = Field(default=1.0, ge=0.0)
    tipo_no: str = Field(index=True)
    free_mode: bool = Field(default=True, index=True)
    ativo: bool = Field(default=True, index=True)
    observacoes: str | None = None


class RoadmapEdge(SQLModel, table=True):
    __tablename__ = "roadmap_edges"

    id: int | None = Field(default=None, primary_key=True)
    from_node_id: str = Field(index=True)
    to_node_id: str = Field(index=True)
    relation_type: str = Field(index=True)
    strength: float = Field(default=1.0, ge=0.0)
    notes: str | None = None


class RoadmapBlockMap(SQLModel, table=True):
    __tablename__ = "roadmap_block_map"

    id: int | None = Field(default=None, primary_key=True)
    disciplina: str = Field(index=True)
    block_number: int = Field(index=True, ge=1)
    node_id: str = Field(index=True)
    role_in_block: str = Field(index=True)
    sequence_in_block: int = Field(default=1, ge=1)


class RoadmapRule(SQLModel, table=True):
    __tablename__ = "roadmap_rules"

    id: int | None = Field(default=None, primary_key=True)
    rule_key: str = Field(index=True, unique=True)
    rule_value: str
    notes: str | None = None
