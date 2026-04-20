from __future__ import annotations

from datetime import date

from sqlmodel import Field, SQLModel


class Subject(SQLModel, table=True):
    __tablename__ = "subjects"

    id: int | None = Field(default=None, primary_key=True)
    disciplina: str = Field(min_length=1, max_length=80, index=True)
    assunto: str = Field(min_length=1, max_length=120, index=True)
    subassunto: str | None = None
    competencia: str | None = None
    habilidade: str | None = None
    prioridade_enem: int = Field(default=3, ge=1, le=5)
    ativo: bool = True


class Block(SQLModel, table=True):
    __tablename__ = "blocks"

    id: int | None = Field(default=None, primary_key=True)
    nome: str = Field(min_length=1, max_length=120, index=True)
    disciplina: str = Field(min_length=1, max_length=80, index=True)
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
    disciplina: str = Field(min_length=1, max_length=80, index=True)
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


class MockExam(SQLModel, table=True):
    __tablename__ = "mock_exams"

    id: int | None = Field(default=None, primary_key=True)
    data: date = Field(default_factory=date.today, index=True)
    tipo: str = Field(min_length=1, max_length=80)
    area: str = Field(min_length=1, max_length=80, index=True)
    total_questoes: int = Field(ge=1)
    total_acertos: int = Field(ge=0)
    facil_erros: int = Field(default=0, ge=0)
    tempo_total_min: int | None = Field(default=None, ge=0)
    observacoes: str | None = None


class Essay(SQLModel, table=True):
    __tablename__ = "essays"

    id: int | None = Field(default=None, primary_key=True)
    data: date = Field(default_factory=date.today, index=True)
    tema: str = Field(min_length=1, max_length=200, index=True)
    texto: str | None = None
    c1: int = Field(default=0, ge=0, le=200)
    c2: int = Field(default=0, ge=0, le=200)
    c3: int = Field(default=0, ge=0, le=200)
    c4: int = Field(default=0, ge=0, le=200)
    c5: int = Field(default=0, ge=0, le=200)
    total: int = Field(default=0, ge=0, le=1000)
    observacoes: str | None = None
