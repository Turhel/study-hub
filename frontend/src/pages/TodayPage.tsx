import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  getRecentActivity,
  getStudyGuidePreferences,
  getStudyPlanToday,
  getSystemCapabilities,
  getTodayActivity,
  recalculateStudyPlanToday,
  saveQuestionAttemptsBulk,
  saveStudyGuidePreferences,
} from "../lib/api";
import type {
  ActivityItem,
  QuestionAttemptBulkPayload,
  QuestionAttemptBulkResponse,
  StudyGuideIntensity,
  StudyGuidePreferencesPayload,
  StudyPlanItem,
} from "../lib/types";

type PreferencesForm = StudyGuidePreferencesPayload;
type DisciplineIconKind = "languages" | "humanas" | "math" | "nature" | "writing" | "default";
type MetricIconKind = "target" | "focus" | "questions" | "subjects";

type AttemptForm = {
  quantity: number;
  correct_count: number;
  source: string;
  difficulty_bank: "facil" | "media" | "dificil";
  difficulty_personal: "facil" | "media" | "dificil";
  elapsed_seconds: string;
  confidence: "" | "baixa" | "media" | "alta";
  error_type: string;
  notes: string;
};

const defaultPreferences: PreferencesForm = {
  daily_minutes: 90,
  intensity: "normal",
  max_focus_count: 3,
  max_questions: 35,
  include_reviews: true,
  include_new_content: true,
};

const defaultAttemptForm: AttemptForm = {
  quantity: 10,
  correct_count: 0,
  source: "",
  difficulty_bank: "media",
  difficulty_personal: "media",
  elapsed_seconds: "",
  confidence: "media",
  error_type: "",
  notes: "",
};

const disciplineVisualMap: Record<string, { icon: DisciplineIconKind; toneClassName: string }> = {
  "Linguagens e Codigos": { icon: "languages", toneClassName: "today-discipline-card-languages" },
  Linguagens: { icon: "languages", toneClassName: "today-discipline-card-languages" },
  "Ciencias Humanas": { icon: "humanas", toneClassName: "today-discipline-card-humanas" },
  Humanas: { icon: "humanas", toneClassName: "today-discipline-card-humanas" },
  Geografia: { icon: "humanas", toneClassName: "today-discipline-card-humanas" },
  Historia: { icon: "humanas", toneClassName: "today-discipline-card-humanas" },
  Sociologia: { icon: "humanas", toneClassName: "today-discipline-card-humanas" },
  Filosofia: { icon: "humanas", toneClassName: "today-discipline-card-humanas" },
  "Matematica e suas Tecnologias": { icon: "math", toneClassName: "today-discipline-card-math" },
  Matematica: { icon: "math", toneClassName: "today-discipline-card-math" },
  "Ciencias da Natureza": { icon: "nature", toneClassName: "today-discipline-card-nature" },
  Natureza: { icon: "nature", toneClassName: "today-discipline-card-nature" },
  Biologia: { icon: "nature", toneClassName: "today-discipline-card-nature" },
  Quimica: { icon: "nature", toneClassName: "today-discipline-card-nature" },
  Fisica: { icon: "nature", toneClassName: "today-discipline-card-nature" },
  Redacao: { icon: "writing", toneClassName: "today-discipline-card-writing" },
};

function normalizeDisciplineKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function visualForDiscipline(value: string): { icon: DisciplineIconKind; toneClassName: string } {
  return disciplineVisualMap[normalizeDisciplineKey(value)] ?? {
    icon: "default",
    toneClassName: "today-discipline-card-default",
  };
}

function DisciplineIcon({ kind }: { kind: DisciplineIconKind }) {
  if (kind === "math") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="9" y="23" width="24" height="24" rx="4" className="today-icon-fill-blue" />
        <path d="M17 23v24M25 23v24M9 31h24M9 39h24" className="today-icon-line-soft" />
        <path d="M34 47l12-26 12 26H34z" className="today-icon-fill-gold" />
        <path d="M42 35h8M46 27v14" className="today-icon-line-dark" />
        <circle cx="47" cy="18" r="12" className="today-icon-fill-coral" />
        <path d="M39 18h16M47 10v16" className="today-icon-line-dark" />
      </svg>
    );
  }
  if (kind === "humanas") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M12 25h40L32 12 12 25z" className="today-icon-fill-pink" />
        <path d="M16 28h32M20 28v19M30 28v19M44 28v19M16 48h32M12 54h40" className="today-icon-line-soft" />
        <circle cx="32" cy="21" r="3" className="today-icon-fill-gold" />
      </svg>
    );
  }
  if (kind === "nature") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="33" r="20" className="today-icon-fill-blue" />
        <path d="M14 34c7 4 11 4 18 0s11-4 18 0" className="today-icon-line-dark" />
        <path d="M20 28l7-8 7 8 5-5 7 9" className="today-icon-fill-green" />
        <circle cx="48" cy="15" r="4" className="today-icon-fill-gold" />
        <path d="M48 7v3M48 20v3M40 15h3M53 15h3" className="today-icon-line-soft" />
      </svg>
    );
  }
  if (kind === "languages") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="13" y="16" width="34" height="38" rx="5" className="today-icon-fill-gold" />
        <path d="M22 24h16M22 32h18M22 40h12" className="today-icon-line-dark" />
        <path d="M38 45l13-13 5 5-13 13-8 3 3-8z" className="today-icon-fill-coral" />
        <path d="M48 35l5 5" className="today-icon-line-dark" />
      </svg>
    );
  }
  if (kind === "writing") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="14" y="12" width="34" height="42" rx="5" className="today-icon-fill-blue" />
        <path d="M22 22h18M22 31h18M22 40h10" className="today-icon-line-soft" />
        <path d="M36 49l15-15 5 5-15 15-8 2 3-7z" className="today-icon-fill-gold" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M14 16h22a8 8 0 018 8v30H22a8 8 0 01-8-8V16z" className="today-icon-fill-blue" />
      <path d="M22 24h14M22 32h14M22 40h10" className="today-icon-line-soft" />
      <path d="M44 24h6v30h-6z" className="today-icon-fill-gold" />
    </svg>
  );
}

function MetricIcon({ kind }: { kind: MetricIconKind }) {
  if (kind === "target") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="17" className="today-icon-fill-blue" />
        <circle cx="24" cy="24" r="9" className="today-icon-fill-gold" />
        <circle cx="24" cy="24" r="3" className="today-icon-fill-coral" />
      </svg>
    );
  }
  if (kind === "focus") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="9" y="9" width="30" height="30" rx="8" className="today-icon-fill-pink" />
        <path d="M24 15v18M15 24h18" className="today-icon-line-soft" />
      </svg>
    );
  }
  if (kind === "questions") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="10" y="8" width="28" height="32" rx="5" className="today-icon-fill-gold" />
        <path d="M17 18h14M17 25h14M17 32h8" className="today-icon-line-dark" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="16" className="today-icon-fill-green" />
      <path d="M14 27c6-9 14-9 20 0M17 33c5-5 9-5 14 0" className="today-icon-line-dark" />
    </svg>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: number;
  detail: string;
  icon: MetricIconKind;
}) {
  return (
    <article className={`today-mini-card today-mini-card-${icon}`}>
      <div className="today-mini-card-main">
        <div>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
        <span className="today-mini-icon">
          <MetricIcon kind={icon} />
        </span>
      </div>
      <div className="today-mini-card-footer">
        <small>{detail}</small>
      </div>
    </article>
  );
}

function TodayGuidanceIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="17" className="today-icon-fill-blue" />
      <circle cx="24" cy="24" r="9" className="today-icon-fill-gold" />
      <circle cx="24" cy="24" r="3" className="today-icon-fill-coral" />
    </svg>
  );
}

function formatOptional(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Nao informado";
  }
  if (typeof value === "boolean") {
    return value ? "Sim" : "Nao";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Nao foi possivel completar a acao.";
}

function isActivityEmpty(activity?: ActivityItem[]): boolean {
  return !activity || activity.length === 0;
}

function buildAttemptPayload(item: StudyPlanItem, form: AttemptForm): QuestionAttemptBulkPayload {
  const elapsed = Number(form.elapsed_seconds);
  return {
    discipline: item.discipline,
    block_id: item.block_id,
    subject_id: item.subject_id,
    source: form.source.trim() || null,
    quantity: form.quantity,
    correct_count: form.correct_count,
    difficulty_bank: form.difficulty_bank,
    difficulty_personal: form.difficulty_personal,
    elapsed_seconds: Number.isFinite(elapsed) && elapsed > 0 ? elapsed : null,
    confidence: form.confidence || null,
    error_type: form.error_type.trim() || null,
    notes: form.notes.trim() || null,
    study_mode: "guided",
  };
}

function attemptValidationMessage(form: AttemptForm): string | null {
  if (!Number.isFinite(form.quantity) || form.quantity <= 0) {
    return "Informe uma quantidade maior que zero.";
  }
  if (!Number.isFinite(form.correct_count) || form.correct_count < 0) {
    return "Acertos nao pode ser negativo.";
  }
  if (form.correct_count > form.quantity) {
    return "Acertos nao pode ser maior que a quantidade.";
  }
  const elapsed = Number(form.elapsed_seconds);
  if (form.elapsed_seconds.trim() && (!Number.isFinite(elapsed) || elapsed < 0)) {
    return "Tempo total deve ser zero ou maior.";
  }
  return null;
}

function PreferenceNumberInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="today-form-field">
      <span>{label}</span>
      <input
        className="app-input"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ActivityList({ items }: { items?: ActivityItem[] }) {
  if (isActivityEmpty(items)) {
    return <p className="today-empty-copy">Nenhuma atividade recente ainda. Registre questoes para alimentar o historico.</p>;
  }

  return (
    <div className="today-activity-list">
      {items?.slice(0, 6).map((item, index) => (
        <article key={`${item.created_at}-${item.type}-${index}`} className="today-activity-item">
          <div>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
          </div>
          <span>{new Date(item.created_at).toLocaleDateString("pt-BR")}</span>
        </article>
      ))}
    </div>
  );
}

export default function TodayPage() {
  const queryClient = useQueryClient();
  const [preferencesForm, setPreferencesForm] = useState<PreferencesForm>(defaultPreferences);
  const [selectedItem, setSelectedItem] = useState<StudyPlanItem | null>(null);
  const [attemptForm, setAttemptForm] = useState<AttemptForm>(defaultAttemptForm);
  const [feedback, setFeedback] = useState<string | null>(null);

  const planQuery = useQuery({
    queryKey: ["study-plan-today"],
    queryFn: getStudyPlanToday,
    retry: false,
  });
  const capabilitiesQuery = useQuery({
    queryKey: ["system-capabilities"],
    queryFn: getSystemCapabilities,
    retry: false,
  });
  const preferencesQuery = useQuery({
    queryKey: ["study-guide-preferences"],
    queryFn: getStudyGuidePreferences,
    retry: false,
  });
  const activityTodayQuery = useQuery({
    queryKey: ["activity-today"],
    queryFn: getTodayActivity,
    retry: false,
  });
  const recentActivityQuery = useQuery({
    queryKey: ["activity-recent", 30],
    queryFn: () => getRecentActivity(30),
    retry: false,
  });

  useEffect(() => {
    if (preferencesQuery.data) {
      const { updated_at: _updatedAt, ...payload } = preferencesQuery.data;
      setPreferencesForm(payload);
    }
  }, [preferencesQuery.data]);

  const refreshTodayData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["study-plan-today"] }),
      queryClient.invalidateQueries({ queryKey: ["activity-today"] }),
      queryClient.invalidateQueries({ queryKey: ["activity-recent"] }),
      queryClient.invalidateQueries({ queryKey: ["gamification-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["stats-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["stats-discipline"] }),
    ]);
  };

  const savePreferencesMutation = useMutation({
    mutationFn: saveStudyGuidePreferences,
    onSuccess: (data) => {
      const { updated_at: _updatedAt, ...payload } = data;
      setPreferencesForm(payload);
      setFeedback("Preferencias salvas. Recalcule o plano para aplicar agora.");
      queryClient.setQueryData(["study-guide-preferences"], data);
    },
    onError: (error) => setFeedback(errorMessage(error)),
  });

  const recalculateMutation = useMutation({
    mutationFn: recalculateStudyPlanToday,
    onSuccess: async (data) => {
      queryClient.setQueryData(["study-plan-today"], data.plan);
      setFeedback(data.replaced_plan_id ? "Plano recalculado e substituido." : "Plano recalculado.");
      await refreshTodayData();
    },
    onError: (error) => setFeedback(errorMessage(error)),
  });

  const registerAttemptsMutation = useMutation({
    mutationFn: ({ item, form }: { item: StudyPlanItem; form: AttemptForm }) =>
      saveQuestionAttemptsBulk(buildAttemptPayload(item, form)),
    onSuccess: async (data: QuestionAttemptBulkResponse) => {
      setSelectedItem(null);
      setAttemptForm(defaultAttemptForm);
      setFeedback(
        [
          `${data.created_attempts} questoes registradas`,
          data.impact_message,
          data.mastery_status ? `Dominio: ${data.mastery_status}` : null,
          data.mastery_score !== null && data.mastery_score !== undefined ? `Score: ${data.mastery_score.toFixed(2)}` : null,
          data.next_review_date ? `Proxima revisao: ${data.next_review_date}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Questoes registradas.",
      );
      await refreshTodayData();
    },
    onError: (error) => setFeedback(errorMessage(error)),
  });

  const planItems = planQuery.data?.items ?? [];
  const planSummary = planQuery.data?.summary;
  const hasPlanItems = planItems.length > 0;
  const capabilities = capabilitiesQuery.data;
  const activityToday = activityTodayQuery.data;
  const attemptError = selectedItem ? attemptValidationMessage(attemptForm) : null;

  const backendOffline = planQuery.isError && capabilitiesQuery.isError && preferencesQuery.isError;
  const focusCards = useMemo(
    () =>
      planItems.map((item) => ({
        item,
        visual: visualForDiscipline(item.strategic_discipline || item.discipline),
      })),
    [planItems],
  );

  function updatePreference<K extends keyof PreferencesForm>(key: K, value: PreferencesForm[K]) {
    setPreferencesForm((current) => ({ ...current, [key]: value }));
  }

  function openAttemptModal(item: StudyPlanItem) {
    setSelectedItem(item);
    setAttemptForm({
      ...defaultAttemptForm,
      quantity: Math.max(item.remaining_today || item.planned_questions || 1, 1),
      correct_count: 0,
    });
  }

  function submitAttempt() {
    if (!selectedItem) {
      return;
    }
    const validationMessage = attemptValidationMessage(attemptForm);
    if (validationMessage) {
      setFeedback(validationMessage);
      return;
    }
    registerAttemptsMutation.mutate({
      item: selectedItem,
      form: attemptForm,
    });
  }

  return (
    <main className="today-page">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="today-subjects-shell today-functional-shell"
      >
        <section className="today-panel today-status-panel">
          <div>
            <p className="today-eyebrow">Foco do dia</p>
            <h1>Plano de hoje</h1>
            <p>Use este painel para ajustar carga, registrar execucao e manter a trilha atualizada.</p>
          </div>

          <div className="today-capability-row">
            <span>{capabilities ? `Perfil: ${capabilities.machine_profile}` : "Perfil indisponivel"}</span>
            <span>{capabilities ? `Banco: ${capabilities.database.dialect}` : "Banco indisponivel"}</span>
            <span>{capabilities ? `LLM: ${capabilities.llm.enabled ? "ligado" : "desligado"}` : "LLM indisponivel"}</span>
          </div>
        </section>

        {backendOffline ? (
          <section className="today-panel today-error-panel">
            <strong>Backend offline</strong>
            <p>A TodayPage continua carregada, mas nao conseguiu acessar os dados locais agora.</p>
          </section>
        ) : null}

        {feedback ? (
          <section className="today-feedback" aria-live="polite">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback(null)}>
              Fechar
            </button>
          </section>
        ) : null}

        <section className="app-guidance-panel">
          <div className="app-guidance-head">
            <div>
              <h3>Comece por aqui</h3>
              <p>Foco do dia e a tela que organiza seu estudo. A ideia e simples: ver o plano, registrar execucao e usar isso para alimentar o resto do app.</p>
            </div>
            <span className="app-guidance-icon">
              <TodayGuidanceIcon />
            </span>
          </div>
          <div className="app-guidance-steps">
            <div className="app-guidance-step">
              <span className="app-guidance-step-index">1</span>
              <p>Confirme a carga do dia em Guia.</p>
            </div>
            <div className="app-guidance-step">
              <span className="app-guidance-step-index">2</span>
              <p>Abra um foco e registre as questoes feitas.</p>
            </div>
            <div className="app-guidance-step">
              <span className="app-guidance-step-index">3</span>
              <p>Depois use Estatisticas para revisar o que aconteceu e Aulas para aprofundar o que ficou fraco.</p>
            </div>
          </div>
          <div className="app-guidance-actions">
            <Link className="app-secondary-action app-guidance-link" to="/stats">
              Ver estatisticas
            </Link>
            <Link className="app-secondary-action app-guidance-link" to="/lessons">
              Ir para aulas
            </Link>
          </div>
        </section>

        <section className="today-summary-grid">
          <SummaryCard label="Total planejado" value={planSummary?.total_questions ?? 0} detail="questoes" icon="target" />
          <SummaryCard label="Focos" value={planSummary?.focus_count ?? 0} detail="ativos" icon="focus" />
          <SummaryCard label="Registradas hoje" value={activityToday?.question_attempts_registered ?? 0} detail="questoes" icon="questions" />
          <SummaryCard label="Assuntos hoje" value={activityToday?.subjects_studied_today ?? 0} detail="estudados" icon="subjects" />
        </section>

        <section className="today-content-grid">
          <section className="today-panel today-plan-panel">
            <div className="today-section-head">
              <div>
                <p className="today-eyebrow">Plano</p>
                <h2>Focos de hoje</h2>
              </div>
              {planQuery.isError ? <span className="today-inline-error">Nao carregou</span> : null}
            </div>

            {planQuery.isLoading || !hasPlanItems ? (
              <article className="today-focus-card today-discipline-card-default today-focus-empty-card">
                <div className="today-focus-main">
                  <div className="today-focus-copy">
                    <h3>{planQuery.isLoading ? "Preparando seus focos" : "Sem focos para exibir"}</h3>
                    <p>
                      {planQuery.isLoading
                        ? "Buscando plano, preferencias e progresso do dia."
                        : "Quando o backend retornar itens, eles aparecem aqui neste formato."}
                    </p>
                    <strong>{planQuery.isLoading ? "Carregando plano de hoje..." : "Ajuste preferencias ou recalcule o plano."}</strong>
                  </div>
                  <span className="today-card-illustration" aria-hidden="true">
                    <DisciplineIcon kind="default" />
                  </span>
                </div>
                <div className="today-focus-footer">
                  <div className="today-focus-score-block">
                    <div className="today-score-chip" aria-label="Prioridade indisponivel">
                      <span className="today-score-pill" />
                      <span className="today-score-info">i</span>
                    </div>
                    <span>Prioridade</span>
                  </div>
                  <div className="today-focus-count-block">
                    <strong>0</strong>
                    <span>Feitas</span>
                  </div>
                  <div className="today-focus-actions">
                    <button type="button" className="today-discipline-icon-button" disabled aria-label="Estatisticas indisponiveis">
                      <span className="today-discipline-chart" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    </button>
                    <button type="button" className="today-register-button" disabled>
                      Treinar
                    </button>
                  </div>
                </div>
              </article>
            ) : null}

            <div className="today-focus-list">
              {focusCards.map(({ item, visual }) => (
                <article key={`${item.block_id}-${item.subject_id}`} className={`today-focus-card ${visual.toneClassName}`}>
                  <div className="today-focus-main">
                    <div className="today-focus-copy">
                      <h3>{item.discipline}</h3>
                      <p>{item.block_name}</p>
                      <strong>{item.subject_name}</strong>
                    </div>
                    <span className="today-card-illustration" aria-hidden="true">
                      <DisciplineIcon kind={visual.icon} />
                    </span>
                  </div>

                  <div className="today-focus-footer">
                    <div className="today-focus-score-block">
                      <div className="today-score-chip" aria-label={`Prioridade ${formatOptional(item.priority_score)}`}>
                        <span className="today-score-pill" />
                        <span className="today-score-info">i</span>
                      </div>
                      <span>Prioridade</span>
                    </div>

                    <div className="today-focus-count-block">
                      <strong>{item.completed_today}</strong>
                      <span>Feitas</span>
                    </div>

                    <div className="today-focus-actions">
                      <Link className="today-discipline-icon-button" to={`/stats?discipline=${encodeURIComponent(item.discipline)}`} aria-label={`Ver estatisticas de ${item.discipline}`}>
                        <span className="today-discipline-chart" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                      </Link>
                      <button type="button" className="today-register-button" onClick={() => openAttemptModal(item)}>
                        Treinar
                      </button>
                    </div>
                  </div>

                  <div className="today-focus-metrics">
                    <span>{item.planned_questions} planejadas</span>
                    <span>{item.remaining_today} restantes</span>
                    <span>{item.planned_mode}</span>
                    <span>score {formatOptional(item.priority_score)}</span>
                  </div>

                  <dl className="today-roadmap-details">
                    <div>
                      <dt>Status roadmap</dt>
                      <dd>{formatOptional(item.roadmap_status)}</dd>
                    </div>
                    <div>
                      <dt>Node</dt>
                      <dd>{formatOptional(item.roadmap_node_id)}</dd>
                    </div>
                    <div>
                      <dt>Mapeado</dt>
                      <dd>{formatOptional(item.roadmap_mapped)}</dd>
                    </div>
                    <div>
                      <dt>Origem</dt>
                      <dd>{formatOptional(item.roadmap_mapping_source)}</dd>
                    </div>
                    <div>
                      <dt>Confianca</dt>
                      <dd>{formatOptional(item.roadmap_mapping_confidence)}</dd>
                    </div>
                    <div className="today-roadmap-wide">
                      <dt>Motivo</dt>
                      <dd>{formatOptional(item.roadmap_reason || item.primary_reason)}</dd>
                    </div>
                    <div className="today-roadmap-wide">
                      <dt>Mapeamento</dt>
                      <dd>{formatOptional(item.roadmap_mapping_reason)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <aside className="today-side-stack">
            <section className="today-panel">
              <div className="today-section-head">
                <div>
                  <p className="today-eyebrow">Guia</p>
                  <h2>Carga do dia</h2>
                </div>
                {preferencesQuery.isError ? <span className="today-inline-error">Nao carregou</span> : null}
              </div>

              <div className="today-preferences-grid">
                <PreferenceNumberInput
                  label="Minutos"
                  value={preferencesForm.daily_minutes}
                  min={15}
                  max={360}
                  onChange={(value) => updatePreference("daily_minutes", value)}
                />
                <label className="today-form-field">
                  <span>Intensidade</span>
                  <select
                    className="app-input"
                    value={preferencesForm.intensity}
                    onChange={(event) => updatePreference("intensity", event.target.value as StudyGuideIntensity)}
                  >
                    <option value="leve">Leve</option>
                    <option value="normal">Normal</option>
                    <option value="forte">Forte</option>
                  </select>
                </label>
                <PreferenceNumberInput
                  label="Focos max."
                  value={preferencesForm.max_focus_count}
                  min={1}
                  max={5}
                  onChange={(value) => updatePreference("max_focus_count", value)}
                />
                <PreferenceNumberInput
                  label="Questoes max."
                  value={preferencesForm.max_questions}
                  min={1}
                  max={80}
                  onChange={(value) => updatePreference("max_questions", value)}
                />
              </div>

              <div className="today-toggle-row">
                <label>
                  <input
                    type="checkbox"
                    checked={preferencesForm.include_reviews}
                    onChange={(event) => updatePreference("include_reviews", event.target.checked)}
                  />
                  Incluir revisoes
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={preferencesForm.include_new_content}
                    onChange={(event) => updatePreference("include_new_content", event.target.checked)}
                  />
                  Conteudo novo
                </label>
              </div>

              <div className="today-action-row">
                <button
                  type="button"
                  className="app-secondary-action"
                  disabled={savePreferencesMutation.isPending}
                  onClick={() => savePreferencesMutation.mutate(preferencesForm)}
                >
                  {savePreferencesMutation.isPending ? "Salvando..." : "Salvar"}
                </button>
                <button
                  type="button"
                  className="app-primary-action app-primary-action-blue"
                  disabled={recalculateMutation.isPending}
                  onClick={() => recalculateMutation.mutate()}
                >
                  {recalculateMutation.isPending ? "Recalculando..." : "Recalcular plano"}
                </button>
              </div>
            </section>

            <section className="today-panel">
              <div className="today-section-head">
                <div>
                  <p className="today-eyebrow">Activity</p>
                  <h2>Hoje</h2>
                </div>
                {activityTodayQuery.isError ? <span className="today-inline-error">Nao carregou</span> : null}
              </div>
              <div className="today-activity-summary">
                <span>Blocos: {activityToday?.blocks_impacted_today ?? 0}</span>
                <span>Revisoes: {activityToday?.reviews_generated_today ?? 0}</span>
                <span>Decisoes: {activityToday?.progression_decisions_today ?? 0}</span>
              </div>
            </section>
          </aside>
        </section>

        <section className="today-panel">
          <div className="today-section-head">
            <div>
              <p className="today-eyebrow">Historico</p>
              <h2>Atividades recentes</h2>
            </div>
            {recentActivityQuery.isError ? <span className="today-inline-error">Nao carregou</span> : null}
          </div>
          <ActivityList items={recentActivityQuery.data} />
        </section>
      </motion.section>

      {selectedItem ? (
        <div className="today-modal-backdrop" role="dialog" aria-modal="true">
          <section className="today-panel today-modal">
            <div className="today-section-head">
              <div>
                <p className="today-eyebrow">Registro manual</p>
                <h2>{selectedItem.subject_name}</h2>
              </div>
              <button type="button" className="today-close-button" onClick={() => setSelectedItem(null)}>
                Fechar
              </button>
            </div>

            <div className="today-preferences-grid">
              <PreferenceNumberInput
                label="Quantidade"
                value={attemptForm.quantity}
                min={1}
                max={200}
                onChange={(value) =>
                  setAttemptForm((current) => ({
                    ...current,
                    quantity: value,
                  }))
                }
              />
              <PreferenceNumberInput
                label="Acertos"
                value={attemptForm.correct_count}
                min={0}
                max={attemptForm.quantity}
                onChange={(value) =>
                  setAttemptForm((current) => ({
                    ...current,
                    correct_count: value,
                  }))
                }
              />
              <label className="today-form-field">
                <span>Fonte</span>
                <input
                  className="app-input"
                  value={attemptForm.source}
                  onChange={(event) => setAttemptForm((current) => ({ ...current, source: event.target.value }))}
                  placeholder="lista, prova, simulado..."
                />
              </label>
              <label className="today-form-field">
                <span>Tempo total (s)</span>
                <input
                  className="app-input"
                  type="number"
                  min={0}
                  value={attemptForm.elapsed_seconds}
                  onChange={(event) => setAttemptForm((current) => ({ ...current, elapsed_seconds: event.target.value }))}
                />
              </label>
              <label className="today-form-field">
                <span>Dificuldade banco</span>
                <select
                  className="app-input"
                  value={attemptForm.difficulty_bank}
                  onChange={(event) =>
                    setAttemptForm((current) => ({
                      ...current,
                      difficulty_bank: event.target.value as AttemptForm["difficulty_bank"],
                    }))
                  }
                >
                  <option value="facil">Facil</option>
                  <option value="media">Media</option>
                  <option value="dificil">Dificil</option>
                </select>
              </label>
              <label className="today-form-field">
                <span>Dificuldade pessoal</span>
                <select
                  className="app-input"
                  value={attemptForm.difficulty_personal}
                  onChange={(event) =>
                    setAttemptForm((current) => ({
                      ...current,
                      difficulty_personal: event.target.value as AttemptForm["difficulty_personal"],
                    }))
                  }
                >
                  <option value="facil">Facil</option>
                  <option value="media">Media</option>
                  <option value="dificil">Dificil</option>
                </select>
              </label>
              <label className="today-form-field">
                <span>Confianca</span>
                <select
                  className="app-input"
                  value={attemptForm.confidence}
                  onChange={(event) =>
                    setAttemptForm((current) => ({
                      ...current,
                      confidence: event.target.value as AttemptForm["confidence"],
                    }))
                  }
                >
                  <option value="">Nao informar</option>
                  <option value="baixa">Baixa</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                </select>
              </label>
              <label className="today-form-field">
                <span>Tipo de erro</span>
                <input
                  className="app-input"
                  value={attemptForm.error_type}
                  onChange={(event) => setAttemptForm((current) => ({ ...current, error_type: event.target.value }))}
                  placeholder="conceito, distracao..."
                />
              </label>
            </div>

            <label className="today-form-field today-form-wide">
              <span>Observacoes</span>
              <textarea
                className="app-input"
                value={attemptForm.notes}
                onChange={(event) => setAttemptForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>

            {attemptError ? <p className="today-form-error">{attemptError}</p> : null}

            <div className="today-action-row">
              <button type="button" className="app-secondary-action" onClick={() => setSelectedItem(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="app-primary-action app-primary-action-blue"
                disabled={registerAttemptsMutation.isPending || Boolean(attemptError)}
                onClick={submitAttempt}
              >
                {registerAttemptsMutation.isPending ? "Registrando..." : "Salvar questoes"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
