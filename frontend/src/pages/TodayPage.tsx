import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

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

const disciplineVisualMap: Record<string, { icon: string; toneClassName: string }> = {
  "Linguagens e Codigos": { icon: "📝", toneClassName: "today-discipline-card-languages" },
  Linguagens: { icon: "📝", toneClassName: "today-discipline-card-languages" },
  "Ciencias Humanas": { icon: "🏛️", toneClassName: "today-discipline-card-humanas" },
  Humanas: { icon: "🏛️", toneClassName: "today-discipline-card-humanas" },
  Geografia: { icon: "🌍", toneClassName: "today-discipline-card-humanas" },
  Historia: { icon: "📜", toneClassName: "today-discipline-card-humanas" },
  Sociologia: { icon: "👥", toneClassName: "today-discipline-card-humanas" },
  Filosofia: { icon: "🤔", toneClassName: "today-discipline-card-humanas" },
  "Matematica e suas Tecnologias": { icon: "📐", toneClassName: "today-discipline-card-math" },
  Matematica: { icon: "📐", toneClassName: "today-discipline-card-math" },
  "Ciencias da Natureza": { icon: "🌿", toneClassName: "today-discipline-card-nature" },
  Natureza: { icon: "🌿", toneClassName: "today-discipline-card-nature" },
  Biologia: { icon: "🧬", toneClassName: "today-discipline-card-nature" },
  Quimica: { icon: "🧪", toneClassName: "today-discipline-card-nature" },
  Fisica: { icon: "⚡", toneClassName: "today-discipline-card-nature" },
  Redacao: { icon: "✍️", toneClassName: "today-discipline-card-writing" },
};

function normalizeDisciplineKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function visualForDiscipline(value: string): { icon: string; toneClassName: string } {
  return disciplineVisualMap[normalizeDisciplineKey(value)] ?? {
    icon: "📚",
    toneClassName: "today-discipline-card-default",
  };
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
    const quantity = Math.max(1, Number(attemptForm.quantity) || 1);
    const correct = Math.min(Math.max(0, Number(attemptForm.correct_count) || 0), quantity);
    registerAttemptsMutation.mutate({
      item: selectedItem,
      form: { ...attemptForm, quantity, correct_count: correct },
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

        <section className="today-summary-grid">
          <article className="today-mini-card">
            <span>Total planejado</span>
            <strong>{planSummary?.total_questions ?? 0}</strong>
            <small>questoes</small>
          </article>
          <article className="today-mini-card">
            <span>Focos</span>
            <strong>{planSummary?.focus_count ?? 0}</strong>
            <small>ativos</small>
          </article>
          <article className="today-mini-card">
            <span>Registradas hoje</span>
            <strong>{activityToday?.question_attempts_registered ?? 0}</strong>
            <small>questoes</small>
          </article>
          <article className="today-mini-card">
            <span>Assuntos hoje</span>
            <strong>{activityToday?.subjects_studied_today ?? 0}</strong>
            <small>estudados</small>
          </article>
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

            {planQuery.isLoading ? <p className="today-empty-copy">Carregando plano de hoje...</p> : null}

            {!planQuery.isLoading && !hasPlanItems ? (
              <p className="today-empty-copy">
                Nenhum foco elegivel no plano de hoje. Ajuste preferencias ou recalcule quando houver dados estruturais.
              </p>
            ) : null}

            <div className="today-focus-list">
              {focusCards.map(({ item, visual }) => (
                <article key={`${item.block_id}-${item.subject_id}`} className={`today-focus-card ${visual.toneClassName}`}>
                  <div className="today-focus-main">
                    <div>
                      <div className="today-focus-title-row">
                        <span aria-hidden="true">{visual.icon}</span>
                        <h3>{item.discipline}</h3>
                      </div>
                      <p>{item.block_name}</p>
                      <strong>{item.subject_name}</strong>
                    </div>
                    <button type="button" className="today-register-button" onClick={() => openAttemptModal(item)}>
                      Registrar questoes
                    </button>
                  </div>

                  <div className="today-focus-metrics">
                    <span>{item.planned_questions} planejadas</span>
                    <span>{item.completed_today} feitas</span>
                    <span>{item.remaining_today} restantes</span>
                    <span>{item.planned_mode}</span>
                    <span>prioridade {formatOptional(item.priority_score)}</span>
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
                    correct_count: Math.min(current.correct_count, value),
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
                    correct_count: Math.min(Math.max(value, 0), current.quantity),
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

            <div className="today-action-row">
              <button type="button" className="app-secondary-action" onClick={() => setSelectedItem(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="app-primary-action app-primary-action-blue"
                disabled={registerAttemptsMutation.isPending}
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
