import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { finishMockExam, getMockExamResults, updateMockExamQuestion } from "../lib/api";
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

function resolveArea(question: MockExamQuestion): string {
  return question.area ?? question.discipline ?? "Geral";
}

function FatigueCurveChart({ questions }: { questions: MockExamQuestion[] }) {
  const timedQuestions = questions
    .filter((question) => question.time_seconds != null)
    .sort((left, right) => left.question_number - right.question_number);

  if (timedQuestions.length === 0) {
    return (
      <div className="mock-exam-empty-chart">
        <strong>Sem telemetria de clique ainda.</strong>
        <p>Quando o Modo Maratona registrar respostas, a curva aparece aqui.</p>
      </div>
    );
  }

  const width = Math.max(timedQuestions.length * 34, 420);
  const height = 220;
  const paddingX = 28;
  const paddingTop = 22;
  const paddingBottom = 42;
  const chartHeight = height - paddingTop - paddingBottom;
  const maxSeconds = Math.max(...timedQuestions.map((question) => question.time_seconds ?? 0), 1);
  const stepX = timedQuestions.length > 1 ? (width - paddingX * 2) / (timedQuestions.length - 1) : 0;
  const points = timedQuestions.map((question, index) => ({
    question,
    x: paddingX + stepX * index,
    y: paddingTop + chartHeight - ((question.time_seconds ?? 0) / maxSeconds) * chartHeight,
  }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <div className="mock-exam-chart-scroll">
      <svg className="mock-exam-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Curva de fadiga de endurance">
        <line x1={paddingX} y1={paddingTop + chartHeight} x2={width - paddingX} y2={paddingTop + chartHeight} className="mock-exam-chart-axis" />
        <path d={path} className="mock-exam-line-path is-tri" />
        {points.map((point) => (
          <g key={point.question.id}>
            <circle cx={point.x} cy={point.y} r="4.5" className="mock-exam-line-point is-tri">
              <title>{`Questao ${point.question.question_number}: ${formatSeconds(point.question.time_seconds)}`}</title>
            </circle>
            <text x={point.x} y={height - 12} textAnchor="middle" className="mock-exam-chart-label">
              {point.question.question_number}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function MockExamResultsPage() {
  const params = useParams<{ id: string }>();
  const examId = Number(params.id);
  const queryClient = useQueryClient();
  const [sortMode, setSortMode] = useState<SortMode>("question");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [externalAnswerSheet, setExternalAnswerSheet] = useState("");

  const resultsQuery = useQuery({
    queryKey: ["mock-exam-results", examId],
    queryFn: () => getMockExamResults(examId),
    enabled: Number.isFinite(examId) && examId > 0,
    retry: false,
  });
  const applyExternalAnswersMutation = useMutation({
    mutationFn: async () => {
      const questions = resultsQuery.data?.questions ?? [];
      const answers = externalAnswerSheet.toUpperCase().match(/[A-E]/g) ?? [];
      if (answers.length === 0) {
        throw new Error("Cole pelo menos uma alternativa do gabarito externo.");
      }
      await Promise.all(
        questions.slice(0, answers.length).map((question, index) =>
          updateMockExamQuestion(examId, question.id, { correct_answer: answers[index] }),
        ),
      );
      await finishMockExam(examId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mock-exam-results", examId] }),
        queryClient.invalidateQueries({ queryKey: ["mock-exam", examId] }),
        queryClient.invalidateQueries({ queryKey: ["mock-exams"] }),
        queryClient.invalidateQueries({ queryKey: ["mock-exams-summary"] }),
      ]);
    },
  });

  const filteredQuestions = useMemo(() => {
    const rows = [...(resultsQuery.data?.questions ?? [])];
    const visible = rows.filter((question) => {
      if (areaFilter !== "all" && resolveArea(question) !== areaFilter) return false;
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
  const isPendingAnswerKey = exam.status === "aguardando_gabarito";
  const areas = ["all", ...Array.from(new Set(results.questions.map(resolveArea)))];
  const timeTrend = trendLabel(results.by_area.map((item) => item.avg_time_seconds));
  const externalAnswers = externalAnswerSheet.toUpperCase().match(/[A-E]/g) ?? [];

  return (
    <main className="today-page mock-exam-results-page">
      <section className="today-subjects-shell today-functional-shell mock-exams-shell mock-exam-results-shell">
        <section className="today-panel mock-exam-results-hero">
          <div>
            <p className="today-eyebrow">Resultados do simulado</p>
            <h1>{exam.title}</h1>
            <p>{exam.area} · {exam.mode === "external" ? "modo externo" : "modo interno"} · {isPendingAnswerKey ? "aguardando gabarito" : "corrigido"}</p>
          </div>
          <div className="mock-exam-run-hero-actions">
            <Link className="app-secondary-action" to="/mock-exams">Voltar</Link>
            <Link className="app-secondary-action" to={`/mock-exams/${exam.id}/run`}>Voltar para prova</Link>
          </div>
        </section>

        {isPendingAnswerKey ? (
          <section className="today-panel mock-exam-results-delta">
            <strong>Gabarito pendente</strong>
            <span>Suas respostas estao salvas. Cole o gabarito correto quando quiser para liberar acertos, TRI e leitura final.</span>
          </section>
        ) : null}

        <section className="mock-exam-results-score-grid">
          <article className="today-panel mock-exam-score-card is-main">
            <span>Estimativa TRI geral</span>
            <strong>{isPendingAnswerKey ? "Pendente" : formatTri(results.overall_area_average_score)}</strong>
            <small>{isPendingAnswerKey ? "aguardando gabarito externo" : "media das areas com nota. Nao e TRI oficial."}</small>
          </article>
          {results.official_tri_score != null ? (
            <article className="today-panel mock-exam-score-card">
              <span>Nota oficial informada</span>
              <strong>{formatTri(results.official_tri_score)}</strong>
              <small>valor externo informado manualmente</small>
            </article>
          ) : null}
          {results.by_area.map((item) => (
            <article key={item.area} className="today-panel mock-exam-score-card">
              <span>{item.area}</span>
              <strong>{formatTri(item.estimated_tri_score)}</strong>
              <small>Estimativa TRI</small>
            </article>
          ))}
        </section>

        {results.official_tri_score != null && results.overall_area_average_score != null ? (
          <section className="today-panel mock-exam-results-delta">
            <strong>Diferenca entre oficial e estimativa</strong>
            <span>{formatTri(results.official_tri_score - results.overall_area_average_score)} pontos</span>
          </section>
        ) : null}

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
              <p className="today-eyebrow">Endurance</p>
              <h2>Curva de Fadiga de Endurance</h2>
              <p>Eixo X por questao, eixo Y em segundos gastos ate o clique.</p>
            </div>
          </div>
          <FatigueCurveChart questions={results.questions} />
        </section>

        <section className="today-panel mock-exam-results-table-panel">
          <div className="today-section-heading">
            <div>
              <p className="today-eyebrow">Gabarito externo</p>
              <h2>{isPendingAnswerKey ? "Inserir gabarito para corrigir" : "Folha de conferencia"}</h2>
              <p>{isPendingAnswerKey ? "Pode ser hoje ou daqui a alguns dias. O sistema so corrige depois que voce aplicar o gabarito." : "Use esta grade para conferir rapidamente provas feitas no papel ou PDF."}</p>
            </div>
          </div>
          <label className="today-form-field">
            Lance o gabarito externo
            <textarea
              className="app-input"
              value={externalAnswerSheet}
              onChange={(event) => setExternalAnswerSheet(event.target.value)}
              placeholder="Ex.: A B C D E A C..."
            />
          </label>
          {applyExternalAnswersMutation.isError ? (
            <p className="today-form-error">
              {applyExternalAnswersMutation.error instanceof Error
                ? applyExternalAnswersMutation.error.message
                : "Nao foi possivel aplicar o gabarito externo."}
            </p>
          ) : null}
          <button
            type="button"
            className="app-primary-action app-primary-action-blue"
            disabled={applyExternalAnswersMutation.isPending || externalAnswers.length === 0}
            onClick={() => applyExternalAnswersMutation.mutate()}
          >
            {applyExternalAnswersMutation.isPending ? "Aplicando..." : isPendingAnswerKey ? "Aplicar gabarito e corrigir" : "Aplicar gabarito externo"}
          </button>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {results.questions.map((question, index) => {
              const externalAnswer = externalAnswers[index];
              return (
                <article key={question.id} className={`rounded-xl border p-3 text-center ${question.skipped ? "border-amber-400/40 bg-amber-500/10" : question.is_correct === true ? "border-emerald-400/40 bg-emerald-500/10" : question.is_correct === false ? "border-red-400/40 bg-red-500/10" : "border-white/10 bg-slate-900/60"}`}>
                  <strong className="block text-sm">Q{question.question_number}</strong>
                  <span className="block text-xs text-slate-300">{question.skipped ? "pulou" : question.user_answer || "-"}</span>
                  {externalAnswer ? <span className="mt-1 block text-xs text-sky-200">ext. {externalAnswer}</span> : null}
                </article>
              );
            })}
          </div>
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
                <span>{resolveArea(question)}</span>
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
