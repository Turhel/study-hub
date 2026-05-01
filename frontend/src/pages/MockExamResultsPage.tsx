import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { getMockExamResults } from "../lib/api";
import type { MockExamQuestion } from "../lib/types";

type SortMode = "question" | "difficulty" | "time" | "accuracy";
type FilterMode = "all" | "correct" | "wrong" | "skipped" | "unanswered";

function formatTri(value: number | null | undefined): string {
  if (value == null) return "-";
  return value.toFixed(1);
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${Math.round(value * 100)}%`;
}

function formatSeconds(value: number | null | undefined): string {
  if (value == null) return "-";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}m${String(seconds).padStart(2, "0")}s`;
}

function difficultyLabel(value: number | null | undefined): string {
  if (value == null) return "-";
  if (value <= 20) return "Dificil";
  if (value <= 55) return "Media";
  return "Facil";
}

function rowState(question: MockExamQuestion): "correct" | "wrong" | "skipped" | "neutral" {
  if (question.skipped) return "skipped";
  if (question.is_correct === true) return "correct";
  if (question.is_correct === false) return "wrong";
  return "neutral";
}

function trendLabel(values: Array<number | null | undefined>): string {
  const numeric = values.filter((value): value is number => typeof value === "number");
  if (numeric.length < 2) return "estavel";
  const delta = numeric[numeric.length - 1] - numeric[0];
  if (delta < -5) return "melhorando";
  if (delta > 5) return "piorando";
  return "estavel";
}

export default function MockExamResultsPage() {
  const params = useParams<{ id: string }>();
  const examId = Number(params.id);
  const [sortMode, setSortMode] = useState<SortMode>("question");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");

  const resultsQuery = useQuery({
    queryKey: ["mock-exam-results", examId],
    queryFn: () => getMockExamResults(examId),
    enabled: Number.isFinite(examId) && examId > 0,
    retry: false,
  });

  const filteredQuestions = useMemo(() => {
    const rows = [...(resultsQuery.data?.questions ?? [])];
    const visible = rows.filter((question) => {
      if (areaFilter !== "all" && (question.area ?? question.discipline ?? "Geral") !== areaFilter) return false;
      if (filterMode === "correct") return question.is_correct === true;
      if (filterMode === "wrong") return question.is_correct === false;
      if (filterMode === "skipped") return question.skipped;
      if (filterMode === "unanswered") return !question.user_answer && !question.skipped;
      return true;
    });

    visible.sort((left, right) => {
      if (sortMode === "difficulty") return (right.difficulty_percent ?? -1) - (left.difficulty_percent ?? -1);
      if (sortMode === "time") return (right.time_seconds ?? -1) - (left.time_seconds ?? -1);
      if (sortMode === "accuracy") return Number(left.is_correct === true) - Number(right.is_correct === true);
      return left.question_number - right.question_number;
    });
    return visible;
  }, [areaFilter, filterMode, resultsQuery.data?.questions, sortMode]);

  if (resultsQuery.isLoading) {
    return (
      <main className="today-page mock-exam-results-page">
        <section className="today-subjects-shell today-functional-shell mock-exams-shell">
          <section className="today-panel app-empty-card">
            <strong>Carregando resultados...</strong>
            <p>Estamos montando o gabarito detalhado do simulado.</p>
          </section>
        </section>
      </main>
    );
  }

  if (resultsQuery.isError || !resultsQuery.data) {
    return (
      <main className="today-page mock-exam-results-page">
        <section className="today-subjects-shell today-functional-shell mock-exams-shell">
          <section className="today-panel app-empty-card">
            <strong>Resultados indisponiveis.</strong>
            <p>Este simulado ainda nao respondeu agora.</p>
            <Link className="app-secondary-action" to="/mock-exams">Voltar para simulados</Link>
          </section>
        </section>
      </main>
    );
  }

  const results = resultsQuery.data;
  const exam = results.exam;
  const areas = ["all", ...Array.from(new Set(results.questions.map((question) => question.area ?? question.discipline ?? "Geral")))];
  const timeTrend = trendLabel(results.by_area.map((item) => item.avg_time_seconds));

  return (
    <main className="today-page mock-exam-results-page">
      <section className="today-subjects-shell today-functional-shell mock-exams-shell mock-exam-results-shell">
        <section className="today-panel mock-exam-results-hero">
          <div>
            <p className="today-eyebrow">Resultados do simulado</p>
            <h1>{exam.title}</h1>
            <p>{exam.area} · {exam.mode === "external" ? "modo externo" : "modo interno"}</p>
          </div>
          <div className="mock-exam-run-hero-actions">
            <Link className="app-secondary-action" to="/mock-exams">Voltar</Link>
            <Link className="app-secondary-action" to={`/mock-exams/${exam.id}/run`}>Voltar para prova</Link>
          </div>
        </section>

        <section className="mock-exam-results-score-grid">
          <article className="today-panel mock-exam-score-card is-main">
            <span>{results.official_tri_score != null ? "Nota TRI informada" : "Estimativa TRI geral"}</span>
            <strong>{formatTri(results.official_tri_score ?? results.overall_area_average_score)}</strong>
            <small>{results.official_tri_score != null ? "valor informado manualmente" : "media das areas com nota"}</small>
          </article>
          {results.by_area.map((item) => (
            <article key={item.area} className="today-panel mock-exam-score-card">
              <span>{item.area}</span>
              <strong>{formatTri(item.estimated_tri_score)}</strong>
              <small>Estimativa TRI</small>
            </article>
          ))}
        </section>

        <section className="today-panel mock-exam-results-summary-grid">
          <article className="mock-exam-metric-pill"><span>Acuracia geral</span><strong>{formatPercent(results.accuracy)}</strong></article>
          <article className="mock-exam-metric-pill"><span>Respondidas</span><strong>{results.answered_count}</strong></article>
          <article className="mock-exam-metric-pill"><span>Puladas</span><strong>{results.skipped_count}</strong></article>
          <article className="mock-exam-metric-pill"><span>Tempo medio correto</span><strong>{formatSeconds(results.avg_time_correct_seconds)}</strong></article>
          <article className="mock-exam-metric-pill"><span>Leitura do tempo</span><strong>{timeTrend}</strong></article>
        </section>

        <section className="today-panel mock-exam-results-table-panel">
          <div className="today-section-heading">
            <div>
              <p className="today-eyebrow">Gabarito de respostas</p>
              <h2>Detalhe por questao</h2>
            </div>
            <div className="mock-exam-results-filters">
              <label>
                Ordenar
                <select className="app-input" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                  <option value="question">Questao</option>
                  <option value="difficulty">Dificuldade</option>
                  <option value="time">Tempo</option>
                  <option value="accuracy">Erro/acerto</option>
                </select>
              </label>
              <label>
                Area
                <select className="app-input" value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>
                  {areas.map((area) => <option key={area} value={area}>{area === "all" ? "Todas" : area}</option>)}
                </select>
              </label>
              <label>
                Estado
                <select className="app-input" value={filterMode} onChange={(event) => setFilterMode(event.target.value as FilterMode)}>
                  <option value="all">Todos</option>
                  <option value="correct">Corretas</option>
                  <option value="wrong">Erradas</option>
                  <option value="skipped">Puladas</option>
                  <option value="unanswered">Sem resposta</option>
                </select>
              </label>
            </div>
          </div>

          <div className="mock-exam-results-table">
            <div className="mock-exam-results-header">
              <span>#</span>
              <span>Questao</span>
              <span>Gabarito</span>
              <span>Sua resposta</span>
              <span>Area</span>
              <span>Resolucao</span>
              <span>% acertaram</span>
              <span>Dificuldade</span>
              <span>Tempo</span>
            </div>
            {filteredQuestions.map((question) => (
              <article key={question.id} className={`mock-exam-results-row is-${rowState(question)}`}>
                <span>{question.question_number}</span>
                <span>{question.question_code || `Q${question.question_number}`}</span>
                <span>{question.correct_answer || "-"}</span>
                <span>{question.skipped ? "Pulada" : question.user_answer || "Nao respondida"}</span>
                <span>{question.area ?? question.discipline ?? "Geral"}</span>
                <span>{question.source_type === "internal" ? "Disponivel apos prova" : "-"}</span>
                <span>{question.difficulty_percent == null ? "-" : `${Math.round(question.difficulty_percent)}%`}</span>
                <span>{difficultyLabel(question.difficulty_percent)}</span>
                <span>{formatSeconds(question.time_seconds)}</span>
              </article>
            ))}
            {filteredQuestions.length === 0 ? (
              <div className="mock-exam-empty-chart">
                <strong>Nenhuma questao nesta leitura.</strong>
                <p>Tente abrir o filtro de area ou de estado.</p>
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
