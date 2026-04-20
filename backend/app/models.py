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
    status: str = Field(default="locked", index=True)
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


class MockExam(SQLModel, table=True):
    __tablename__ = "mock_exams"

    id: int | None = Field(default=None, primary_key=True)
    data: date = Field(default_factory=date.today, index=True)
    tipo: str
    area: str = Field(index=True)
    total_questoes: int = Field(ge=1)
    total_acertos: int = Field(ge=0)
    facil_erros: int = Field(default=0, ge=0)
    tempo_total_min: int | None = Field(default=None, ge=0)
    observacoes: str | None = None


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
