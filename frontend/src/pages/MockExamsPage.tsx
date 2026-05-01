import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { createMockExam, deleteMockExam, getMockExams, getMockExamSummary, updateMockExam } from "../lib/api";
import type { MockExam, MockExamArea, MockExamMode, MockExamPayload } from "../lib/types";

const areaOptions: Array<{ value: MockExamArea; label: string }> = [
  { value: "Geral", label: "Geral" },
  { value: "Linguagens", label: "Linguagens" },
  { value: "Humanas", label: "Humanas" },
  { value: "Natureza", label: "Natureza" },
  { value: "Matematica", label: "Matemática" },
  { value: "Redacao", label: "Redação" },
];

type MockExamFormState = {
  exam_date: string;
  title: string;
  area: MockExamArea;
  mode: MockExamMode;
  total_questions: string;
  correct_count: string;
  tri_score: string;
  duration_minutes: string;
  notes: string;
};

const emptyForm: MockExamFormState = {
  exam_date: new Date().toISOString().slice(0, 10),
  title: "",
  area: "Geral",
  mode: "external",
  total_questions: "90",
  correct_count: "",
  tri_score: "",
  duration_minutes: "",
  notes: "",
};

type MetricPillProps = {
  label: string;
  value: string;
};

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Sem data";
  }
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) {
    return "-";
  }
  return `${Math.round(value * 100)}%`;
}

function formatTri(value: number | null | undefined): string {
  if (value == null) {
    return "-";
  }
  return value.toFixed(1);
}

function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) {
    return "-";
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours <= 0) {
    return `${remaining}min`;
  }
  return `${hours}h${String(remaining).padStart(2, "0")}min`;
}

function formatMode(mode: MockExamMode): string {
  return mode === "internal" ? "interno" : "externo";
}

function formatStatus(status: MockExam["status"]): string {
  if (status === "finished") {
    return "finalizado";
  }
  if (status === "in_progress") {
    return "em andamento";
  }
  return "rascunho";
}

function MetricPill({ label, value }: MetricPillProps) {
  return (
    <article className="mock-exam-metric-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formFromExam(exam: MockExam | null): MockExamFormState {
  if (!exam) {
    return emptyForm;
  }
  return {
    exam_date: exam.exam_date,
    title: exam.title,
    area: exam.area,
    mode: exam.mode,
    total_questions: String(exam.total_questions),
    correct_count: String(exam.correct_count),
    tri_score: exam.tri_score == null ? "" : String(exam.tri_score),
    duration_minutes: exam.duration_minutes == null ? "" : String(exam.duration_minutes),
    notes: exam.notes ?? "",
  };
}

function buildPayload(form: MockExamFormState): MockExamPayload {
  return {
    exam_date: form.exam_date,
    title: form.title.trim(),
    area: form.area,
    mode: form.mode,
    total_questions: Number(form.total_questions),
    correct_count: Number(form.correct_count),
    tri_score: form.tri_score.trim() ? Number(form.tri_score) : null,
    duration_minutes: form.duration_minutes.trim() ? Number(form.duration_minutes) : null,
    notes: form.notes.trim() || null,
  };
}

function validateForm(form: MockExamFormState): string | null {
  if (!form.exam_date) {
    return "Informe a data do simulado.";
  }
  if (!form.title.trim()) {
    return "Informe um titulo para o simulado.";
  }
  const totalQuestions = Number(form.total_questions);
  const correctCount = Number(form.correct_count);
  if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) {
    return "Total de questoes deve ser maior que zero.";
  }
  if (!Number.isFinite(correctCount) || correctCount < 0) {
    return "Acertos nao pode ser negativo.";
  }
  if (correctCount > totalQuestions) {
    return "Acertos nao pode ser maior que o total de questoes.";
  }
  if (form.tri_score.trim() && !Number.isFinite(Number(form.tri_score))) {
    return "A nota TRI precisa ser numerica.";
  }
  if (form.duration_minutes.trim() && !Number.isFinite(Number(form.duration_minutes))) {
    return "A duracao precisa ser numerica.";
  }
  return null;
}

function MockExamLineChart({
  title,
  subtitle,
  values,
  colorClassName,
  formatter,
}: {
  title: string;
  subtitle: string;
  values: Array<{ label: string; value: number }>;
  colorClassName: string;
  formatter: (value: number) => string;
}) {
  if (values.length === 0) {
    return (
      <section className="stats-chart-card mock-exam-chart-card">
        <div className="stats-chart-head">
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="mock-exam-empty-chart">
          <strong>Sem pontos suficientes.</strong>
          <p>Registre pelo menos um simulado nesta leitura para ver a evolucao.</p>
        </div>
      </section>
    );
  }

  const maxValue = Math.max(...values.map((item) => item.value), 1);
  const height = 170;
  const width = Math.max(values.length * 88, 320);
  const paddingX = 20;
  const paddingTop = 16;
  const paddingBottom = 34;
  const chartHeight = height - paddingTop - paddingBottom;
  const stepX = values.length > 1 ? (width - paddingX * 2) / (values.length - 1) : 0;

  const points = values.map((item, index) => {
    const x = paddingX + index * stepX;
    const y = paddingTop + chartHeight - (item.value / maxValue) * chartHeight;
    return { x, y, ...item };
  });

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <section className="stats-chart-card mock-exam-chart-card">
      <div className="stats-chart-head">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="mock-exam-chart-scroll">
        <svg className="mock-exam-line-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <line x1={paddingX} y1={paddingTop + chartHeight} x2={width - paddingX} y2={paddingTop + chartHeight} className="mock-exam-chart-axis" />
          <path d={path} className={`mock-exam-line-path ${colorClassName}`} />
          {points.map((point) => (
            <g key={`${point.label}-${point.value}`}>
              <circle cx={point.x} cy={point.y} r="4.5" className={`mock-exam-line-point ${colorClassName}`}>
                <title>{`${point.label}: ${formatter(point.value)}`}</title>
              </circle>
              <text x={point.x} y={height - 10} textAnchor="middle" className="mock-exam-chart-label">
                {point.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}

function MockExamBarChart({ values }: { values: Array<{ label: string; value: number; title: string }> }) {
  if (values.length === 0) {
    return (
      <section className="stats-chart-card mock-exam-chart-card">
        <div className="stats-chart-head">
          <div>
            <h3>Acertos por simulado</h3>
            <p>Volume real de acertos nos registros mais recentes.</p>
          </div>
        </div>
        <div className="mock-exam-empty-chart">
          <strong>Sem barras para mostrar.</strong>
          <p>Assim que voce registrar simulados, esta visao passa a comparar os acertos.</p>
        </div>
      </section>
    );
  }

  const maxValue = Math.max(...values.map((item) => item.value), 1);

  return (
    <section className="stats-chart-card mock-exam-chart-card">
      <div className="stats-chart-head">
        <div>
          <h3>Acertos por simulado</h3>
          <p>Leitura simples do volume de acertos em cada prova.</p>
        </div>
      </div>
      <div className="mock-exam-bars">
        {values.map((item) => (
          <div key={item.title} className="mock-exam-bar-item">
            <div className="mock-exam-bar-track">
              <div className="mock-exam-bar-fill" style={{ height: `${Math.max((item.value / maxValue) * 100, 8)}%` }} title={`${item.title}: ${item.value} acertos`} />
            </div>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MockExamAreaChart({ values }: { values: Array<{ area: string; accuracy: number | null; total: number }> }) {
  if (values.length === 0) {
    return (
      <section className="stats-chart-card mock-exam-chart-card">
        <div className="stats-chart-head">
          <div>
            <h3>Media por area</h3>
            <p>Como cada area esta ficando na sua leitura recente.</p>
          </div>
        </div>
        <div className="mock-exam-empty-chart">
          <strong>Sem medias ainda.</strong>
          <p>Quando existirem simulados por area, esta comparacao aparece aqui.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="stats-chart-card mock-exam-chart-card">
      <div className="stats-chart-head">
        <div>
          <h3>Media por area</h3>
          <p>Acuracia media agregada por area registrada.</p>
        </div>
      </div>
      <div className="mock-exam-area-list">
        {values.map((item) => (
          <article key={item.area} className="mock-exam-area-row">
            <div>
              <strong>{item.area}</strong>
              <span>{item.total} simulados</span>
            </div>
            <div className="mock-exam-area-bar">
              <div className="mock-exam-area-bar-fill" style={{ width: `${Math.max((item.accuracy ?? 0) * 100, 3)}%` }} title={`${item.area}: ${formatPercent(item.accuracy)}`} />
            </div>
            <strong>{formatPercent(item.accuracy)}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function MockExamsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingExamId, setEditingExamId] = useState<number | null>(null);
  const [form, setForm] = useState<MockExamFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const examsQuery = useQuery({ queryKey: ["mock-exams"], queryFn: getMockExams, retry: false });
  const summaryQuery = useQuery({ queryKey: ["mock-exams-summary"], queryFn: getMockExamSummary, retry: false });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validation = validateForm(form);
      if (validation) {
        throw new Error(validation);
      }
      const payload = buildPayload(form);
      return editingExamId == null ? createMockExam(payload) : updateMockExam(editingExamId, payload);
    },
    onSuccess: async () => {
      setFeedback(editingExamId == null ? "Simulado salvo." : "Simulado atualizado.");
      setForm(emptyForm);
      setEditingExamId(null);
      setFormError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mock-exams"] }),
        queryClient.invalidateQueries({ queryKey: ["mock-exams-summary"] }),
      ]);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Nao foi possivel salvar o simulado.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (examId: number) => deleteMockExam(examId),
    onSuccess: async () => {
      setFeedback("Simulado excluido.");
      if (editingExamId != null) {
        setEditingExamId(null);
        setForm(emptyForm);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mock-exams"] }),
        queryClient.invalidateQueries({ queryKey: ["mock-exams-summary"] }),
      ]);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Nao foi possivel excluir o simulado.");
    },
  });

  const triChartValues = useMemo(
    () =>
      (examsQuery.data ?? [])
        .filter((exam) => exam.tri_score != null)
        .slice()
        .reverse()
        .map((exam) => ({ label: formatDate(exam.exam_date).slice(0, 5), value: exam.tri_score as number })),
    [examsQuery.data],
  );

  const correctChartValues = useMemo(
    () =>
      (examsQuery.data ?? [])
        .slice(0, 6)
        .reverse()
        .map((exam) => ({ label: formatDate(exam.exam_date).slice(0, 5), value: exam.correct_count, title: exam.title })),
    [examsQuery.data],
  );

  const areaChartValues = useMemo(
    () => (summaryQuery.data?.by_area ?? []).map((item) => ({ area: item.area, accuracy: item.average_accuracy, total: item.total_exams })),
    [summaryQuery.data],
  );

  return (
    <main className="today-page mock-exams-page">
      <section className="today-subjects-shell today-functional-shell mock-exams-shell">
        <section className="today-panel mock-exams-hero-panel">
          <div>
            <p className="today-eyebrow">Simulados</p>
            <h1>Registro e execucao de prova</h1>
            <p>O v1 continua aqui para registro manual. O v2 adiciona o modo prova, com grade de questoes, tempo por item e resultados detalhados.</p>
          </div>
        </section>

        {feedback ? (
          <section className="today-feedback">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback(null)}>
              Fechar
            </button>
          </section>
        ) : null}

        <section className="today-panel today-panel-wide mock-exams-summary-grid">
          <article className="today-stat-card mock-exam-summary-card">
            <span>Total de simulados</span>
            <strong>{summaryQuery.data?.total_exams ?? 0}</strong>
            <small>base registrada</small>
          </article>
          <article className="today-stat-card mock-exam-summary-card">
            <span>Media TRI ultimos 3</span>
            <strong>{summaryQuery.isLoading ? "..." : formatTri(summaryQuery.data?.last_three_average_tri)}</strong>
            <small>somente notas preenchidas</small>
          </article>
          <article className="today-stat-card mock-exam-summary-card">
            <span>Media de acerto ultimos 3</span>
            <strong>{summaryQuery.isLoading ? "..." : formatPercent(summaryQuery.data?.last_three_average_accuracy)}</strong>
            <small>janela recente</small>
          </article>
          <article className="today-stat-card mock-exam-summary-card">
            <span>Melhor TRI</span>
            <strong>{summaryQuery.isLoading ? "..." : formatTri(summaryQuery.data?.best_tri_score)}</strong>
            <small>melhor nota informada</small>
          </article>
        </section>

        {summaryQuery.isError ? (
          <section className="today-panel today-error-panel">
            <strong>Resumo indisponivel agora.</strong>
            <p>Os simulados podem continuar sendo registrados, mas os cards e graficos nao carregaram nesta tentativa.</p>
          </section>
        ) : null}

        <section className="mock-exams-layout">
          <section className="today-panel mock-exams-form-panel">
            <div className="today-section-heading">
              <div>
                <p className="today-eyebrow">{editingExamId == null ? "Novo simulado" : "Editar simulado"}</p>
                <h2>{editingExamId == null ? "Cadastrar resultado ou prova" : "Atualize este simulado"}</h2>
              </div>
            </div>

            <form
              className="mock-exams-form"
              onSubmit={(event) => {
                event.preventDefault();
                setFeedback(null);
                setFormError(null);
                saveMutation.mutate();
              }}
            >
              <div className="today-form-grid">
                <label className="today-form-field">
                  Titulo
                  <input className="app-input" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Simulado Natureza abril" />
                </label>
                <label className="today-form-field">
                  Data
                  <input type="date" className="app-input" value={form.exam_date} onChange={(event) => setForm((current) => ({ ...current, exam_date: event.target.value }))} />
                </label>
                <label className="today-form-field">
                  Area
                  <select className="app-input" value={form.area} onChange={(event) => setForm((current) => ({ ...current, area: event.target.value as MockExamArea }))}>
                    {areaOptions.map((area) => (
                      <option key={area.value} value={area.value}>
                        {area.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="today-form-field">
                  Modo
                  <select className="app-input" value={form.mode} onChange={(event) => setForm((current) => ({ ...current, mode: event.target.value as MockExamMode }))}>
                    <option value="external">Externo</option>
                    <option value="internal">Interno</option>
                  </select>
                </label>
                <label className="today-form-field">
                  Total de questoes
                  <input type="number" min={1} className="app-input" value={form.total_questions} onChange={(event) => setForm((current) => ({ ...current, total_questions: event.target.value }))} />
                </label>
                <label className="today-form-field">
                  Acertos
                  <input type="number" min={0} className="app-input" value={form.correct_count} onChange={(event) => setForm((current) => ({ ...current, correct_count: event.target.value }))} />
                </label>
                <label className="today-form-field">
                  Nota TRI informada
                  <input type="number" min={0} className="app-input" value={form.tri_score} onChange={(event) => setForm((current) => ({ ...current, tri_score: event.target.value }))} placeholder="Opcional" />
                </label>
                <label className="today-form-field">
                  Duracao (min)
                  <input type="number" min={0} className="app-input" value={form.duration_minutes} onChange={(event) => setForm((current) => ({ ...current, duration_minutes: event.target.value }))} placeholder="Opcional" />
                </label>
              </div>

              <label className="today-form-field">
                Observacoes
                <textarea className="app-input" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Contexto do simulado, sensacao de prova, gargalos..." />
              </label>

              {formError ? <p className="today-form-error">{formError}</p> : null}

              <p className="mock-exam-form-note">
                No modo externo, a prova pode ser executada dentro do app com placeholders de questoes, gabarito, resposta, tempo e dificuldade. Nao existe calculo de TRI oficial: qualquer nota exibida como estimativa vem separada da nota informada por voce.
              </p>

              <div className="today-action-row">
                {editingExamId != null ? (
                  <button type="button" className="app-secondary-action" onClick={() => { setEditingExamId(null); setForm(emptyForm); setFormError(null); }}>
                    Cancelar edicao
                  </button>
                ) : null}
                <button type="submit" className="app-primary-action app-primary-action-blue" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando..." : editingExamId == null ? "Salvar simulado" : "Atualizar simulado"}
                </button>
              </div>
            </form>
          </section>

          <section className="today-panel mock-exams-list-panel">
            <div className="today-section-heading">
              <div>
                <p className="today-eyebrow">Recentes</p>
                <h2>Ultimos simulados</h2>
              </div>
            </div>

            {examsQuery.isLoading ? (
              <div className="app-empty-card">
                <strong>Carregando simulados...</strong>
                <p>Assim que a lista responder, seus registros aparecem aqui.</p>
              </div>
            ) : examsQuery.isError ? (
              <div className="app-empty-card">
                <strong>Simulados indisponiveis.</strong>
                <p>O backend nao respondeu agora. Vale tentar de novo em instantes.</p>
              </div>
            ) : examsQuery.data && examsQuery.data.length > 0 ? (
              <div className="mock-exams-table">
                {examsQuery.data.map((exam) => (
                  <article key={exam.id} className="mock-exam-row">
                    <div className="mock-exam-row-main">
                      <div>
                        <strong>{exam.title}</strong>
                        <span>{formatDate(exam.exam_date)} - {exam.area} - {formatMode(exam.mode)}</span>
                      </div>
                      <div className="mock-exam-status-stack">
                        <span className="mock-exam-row-area-badge">{exam.area}</span>
                        <span className={`mock-exam-status-badge is-${exam.status}`}>{formatStatus(exam.status)}</span>
                      </div>
                    </div>
                    <div className="mock-exam-row-metrics">
                      <MetricPill label="Acertos" value={`${exam.correct_count}/${exam.total_questions}`} />
                      <MetricPill label="Acuracia" value={formatPercent(exam.accuracy)} />
                      <MetricPill label="TRI informada" value={formatTri(exam.tri_score)} />
                      <MetricPill label="Estimativa" value={formatTri(exam.estimated_tri_score)} />
                    </div>
                    {exam.notes ? (
                      <p className="mock-exam-row-notes" title={exam.notes}>{exam.notes}</p>
                    ) : null}
                    <div className="mock-exam-row-actions mock-exam-row-actions-wide">
                      <button type="button" className="app-primary-action app-primary-action-blue" onClick={() => navigate(`/mock-exams/${exam.id}/${exam.status === "finished" ? "results" : "run"}`)}>
                        {exam.status === "finished" ? "Ver resultados" : exam.status === "in_progress" ? "Continuar prova" : "Iniciar prova"}
                      </button>
                      <button type="button" className="app-secondary-action mock-exam-edit-button" onClick={() => { setEditingExamId(exam.id); setForm(formFromExam(exam)); setFormError(null); setFeedback(null); }}>
                        Editar
                      </button>
                      <button type="button" className="app-secondary-action mock-exam-delete-button" disabled={deleteMutation.isPending} onClick={() => { setFormError(null); setFeedback(null); deleteMutation.mutate(exam.id); }}>
                        Excluir
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="app-empty-card mock-exam-empty-state">
                <strong>Nenhum simulado ainda.</strong>
                <p>Comece registrando um resultado acima ou criando uma prova externa para executar no app.</p>
              </div>
            )}
          </section>
        </section>

        <section className="mock-exams-chart-grid">
          <MockExamLineChart title="Evolucao TRI" subtitle="So usa a nota que voce informar manualmente." values={triChartValues} colorClassName="is-tri" formatter={(value) => `${value.toFixed(0)} TRI`} />
          <MockExamBarChart values={correctChartValues} />
          <MockExamAreaChart values={areaChartValues} />
        </section>
      </section>
    </main>
  );
}
