import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import {
  getStudyGuidePreferences,
  getStudyPlanToday,
  recalculateStudyPlanToday,
  resetStudyData,
  saveStudyGuidePreferences,
} from "../lib/api";
import type {
  ResetStudyDataResponse,
  StudyGuideIntensity,
  StudyGuidePreferencesPayload,
} from "../lib/types";

type PreferencesForm = StudyGuidePreferencesPayload;

const RESET_CONFIRMATION_TEXT = "RESETAR ESTUDOS";

const defaultPreferences: PreferencesForm = {
  daily_minutes: 90,
  intensity: "normal",
  max_focus_count: 3,
  max_questions: 35,
  include_reviews: true,
  include_new_content: true,
};

const intensityDescriptions: Record<StudyGuideIntensity, string> = {
  leve: "Carga mais segura para manter consistencia sem se esmagar.",
  normal: "Equilibrio entre volume, revisao e conteudo novo.",
  forte: "Puxa mais questoes e focos quando voce quer acelerar.",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Nao foi possivel completar a acao.";
}

function GuideIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="8" y="9" width="32" height="28" rx="8" className="today-icon-fill-gold" />
      <path d="M15 18h18M15 24h18M15 30h10" className="today-icon-line-dark" />
      <path d="M33 12v24" className="today-icon-line-soft" />
    </svg>
  );
}

function PreferenceNumberInput({
  label,
  value,
  min,
  max,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  hint?: string;
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
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function renderCountEntries(counts: Record<string, number>) {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return <p className="today-empty-copy">Nenhuma contagem disponivel.</p>;
  }

  return (
    <div className="settings-count-grid">
      {entries.map(([key, value]) => (
        <article key={key} className="settings-count-card">
          <span>{key}</span>
          <strong>{value}</strong>
        </article>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [preferencesForm, setPreferencesForm] = useState<PreferencesForm>(defaultPreferences);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [resetPreferences, setResetPreferences] = useState(false);
  const [includeEssays, setIncludeEssays] = useState(false);
  const [resetPreview, setResetPreview] = useState<ResetStudyDataResponse | null>(null);

  const preferencesQuery = useQuery({
    queryKey: ["study-guide-preferences"],
    queryFn: getStudyGuidePreferences,
    retry: false,
  });

  useEffect(() => {
    if (!preferencesQuery.data) {
      return;
    }
    const { updated_at: _updatedAt, ...payload } = preferencesQuery.data;
    setPreferencesForm(payload);
  }, [preferencesQuery.data]);

  const savedPreferences = useMemo<PreferencesForm | null>(() => {
    if (!preferencesQuery.data) {
      return null;
    }
    const { updated_at: _updatedAt, ...payload } = preferencesQuery.data;
    return payload;
  }, [preferencesQuery.data]);

  const guideHasUnsavedChanges = useMemo(() => {
    if (!savedPreferences) {
      return false;
    }

    return (
      savedPreferences.daily_minutes !== preferencesForm.daily_minutes ||
      savedPreferences.intensity !== preferencesForm.intensity ||
      savedPreferences.max_focus_count !== preferencesForm.max_focus_count ||
      savedPreferences.max_questions !== preferencesForm.max_questions ||
      savedPreferences.include_reviews !== preferencesForm.include_reviews ||
      savedPreferences.include_new_content !== preferencesForm.include_new_content
    );
  }, [preferencesForm, savedPreferences]);

  const guideSummary = useMemo(() => {
    const toggles = [
      preferencesForm.include_reviews ? "com revisoes" : "sem revisoes",
      preferencesForm.include_new_content ? "com conteudo novo" : "sem conteudo novo",
    ];

    return `Hoje voce deixou ${preferencesForm.daily_minutes} min, intensidade ${preferencesForm.intensity}, ate ${preferencesForm.max_focus_count} focos e ate ${preferencesForm.max_questions} questoes, ${toggles.join(" e ")}.`;
  }, [preferencesForm]);

  const refreshStudyQueries = async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["study-plan-today"], type: "active" }),
      queryClient.refetchQueries({ queryKey: ["study-guide-preferences"], type: "active" }),
      queryClient.refetchQueries({ queryKey: ["activity-today"], type: "active" }),
      queryClient.refetchQueries({ queryKey: ["activity-recent"], type: "active" }),
      queryClient.refetchQueries({ queryKey: ["stats-overview"], type: "active" }),
      queryClient.refetchQueries({ queryKey: ["stats-discipline"], type: "active" }),
      queryClient.refetchQueries({ queryKey: ["gamification-summary"], type: "active" }),
      queryClient.refetchQueries({ queryKey: ["free-study-catalog"], type: "active" }),
    ]);
  };

  const savePreferencesMutation = useMutation({
    mutationFn: saveStudyGuidePreferences,
    onSuccess: (data) => {
      const { updated_at: _updatedAt, ...payload } = data;
      setPreferencesForm(payload);
      setFeedback("Preferencias salvas.");
      queryClient.setQueryData(["study-guide-preferences"], data);
    },
    onError: (error) => setFeedback(errorMessage(error)),
  });

  const recalculateMutation = useMutation({
    mutationFn: recalculateStudyPlanToday,
    onSuccess: async (data) => {
      const refreshedPlan = await queryClient.fetchQuery({
        queryKey: ["study-plan-today"],
        queryFn: getStudyPlanToday,
      });
      queryClient.setQueryData(["study-plan-today"], refreshedPlan ?? data.plan);
      setFeedback(data.replaced_plan_id ? "Plano recalculado e substituido." : "Plano recalculado.");
      await refreshStudyQueries();
    },
    onError: (error) => setFeedback(errorMessage(error)),
  });

  const previewResetMutation = useMutation({
    mutationFn: () =>
      resetStudyData({
        confirmation_text: RESET_CONFIRMATION_TEXT,
        dry_run: true,
        reset_preferences: resetPreferences,
        include_essays: includeEssays,
      }),
    onSuccess: (data) => {
      setResetPreview(data);
      setFeedback("Relatorio de dry-run carregado. Nada foi apagado.");
    },
    onError: (error) => setFeedback(errorMessage(error)),
  });

  const applyResetMutation = useMutation({
    mutationFn: () =>
      resetStudyData({
        confirmation_text: confirmationText,
        dry_run: false,
        reset_preferences: resetPreferences,
        include_essays: includeEssays,
      }),
    onSuccess: async (data) => {
      setResetPreview(data);
      setFeedback("Reset concluido. O app voltou para um estado limpo de estudo.");
      setConfirmationText("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["study-plan-today"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-today"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-recent"] }),
        queryClient.invalidateQueries({ queryKey: ["stats-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["stats-discipline"] }),
        queryClient.invalidateQueries({ queryKey: ["gamification-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["free-study-catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["study-guide-preferences"] }),
      ]);
      await refreshStudyQueries();
    },
    onError: (error) => setFeedback(errorMessage(error)),
  });

  const guideBusy = savePreferencesMutation.isPending || recalculateMutation.isPending;
  const canConfirmReset = confirmationText === RESET_CONFIRMATION_TEXT && !applyResetMutation.isPending;

  function updatePreference<K extends keyof PreferencesForm>(key: K, value: PreferencesForm[K]) {
    setPreferencesForm((current) => ({ ...current, [key]: value }));
  }

  async function applyGuideChanges() {
    try {
      if (guideHasUnsavedChanges) {
        await savePreferencesMutation.mutateAsync(preferencesForm);
      }
      await recalculateMutation.mutateAsync();
    } catch {
      // Mutations already surface feedback.
    }
  }

  return (
    <main className="today-page settings-page">
      <section className="today-subjects-shell today-functional-shell settings-shell">
        <section className="today-panel free-study-hero-panel">
          <div>
            <p className="today-eyebrow">Configuracoes</p>
            <h1>Ajuste seu guia de estudo e cuide dos dados com um reset seguro.</h1>
            <p>O que muda o ritmo do dia e o que limpa o historico agora mora aqui, sem poluir a TodayPage.</p>
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

        <div className="settings-grid">
          <section className="today-panel">
            <div className="today-section-head">
              <div>
                <p className="today-eyebrow">Guia do Dia</p>
                <h2>Preferencias de carga</h2>
              </div>
              {preferencesQuery.isError ? <span className="today-inline-error">Nao carregou</span> : null}
            </div>

            <div className="today-guide-overview">
              <div>
                <strong>Defina o ritmo antes de estudar</strong>
                <p>Ajuste o volume, salve e recalcule quando quiser reaplicar o plano de hoje.</p>
              </div>
              <span className="today-guide-icon" aria-hidden="true">
                <GuideIcon />
              </span>
            </div>

            <div className="today-guide-summary">
              <span className="today-guide-summary-label">Resumo atual</span>
              <p>{guideSummary}</p>
              {guideHasUnsavedChanges ? (
                <small className="today-guide-dirty">Voce alterou o guia. Falta aplicar no plano.</small>
              ) : null}
            </div>

            <div className="today-guide-summary today-guide-summary-secondary">
              <span className="today-guide-summary-label">Como isso afeta o plano</span>
              <p>Minutos e intensidade influenciam a carga. Focos max. e questoes max. funcionam como teto.</p>
              <p>O plano pode sugerir menos focos do que o limite quando isso fizer mais sentido pedagogico.</p>
            </div>

            <div className="today-preferences-grid">
              <PreferenceNumberInput
                label="Minutos"
                value={preferencesForm.daily_minutes}
                min={15}
                max={360}
                hint="Quanto tempo total voce quer dedicar hoje."
                onChange={(value) => updatePreference("daily_minutes", value)}
              />
              <PreferenceNumberInput
                label="Focos max."
                value={preferencesForm.max_focus_count}
                min={1}
                max={5}
                hint="Quantos assuntos diferentes podem entrar no plano."
                onChange={(value) => updatePreference("max_focus_count", value)}
              />
              <PreferenceNumberInput
                label="Questoes max."
                value={preferencesForm.max_questions}
                min={1}
                max={80}
                hint="Teto de questoes para o dia nao explodir."
                onChange={(value) => updatePreference("max_questions", value)}
              />
            </div>

            <div className="today-guide-section">
              <div className="today-guide-section-copy">
                <strong>Intensidade</strong>
                <p>Escolha o ritmo geral do dia. Isso muda o quanto o plano pressiona sua carga.</p>
              </div>
              <div className="today-intensity-grid" role="radiogroup" aria-label="Intensidade do guia">
                {(["leve", "normal", "forte"] as StudyGuideIntensity[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`today-intensity-card ${preferencesForm.intensity === option ? "is-active" : ""}`}
                    onClick={() => updatePreference("intensity", option)}
                    aria-pressed={preferencesForm.intensity === option}
                  >
                    <strong>{option}</strong>
                    <span>{intensityDescriptions[option]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="today-guide-section">
              <div className="today-guide-section-copy">
                <strong>O que entra no plano</strong>
                <p>Use estes toggles para dizer se hoje o plano pode trazer revisoes, conteudo novo ou os dois.</p>
              </div>
              <div className="today-toggle-stack">
                <label className="today-toggle-card">
                  <div>
                    <strong>Incluir revisoes</strong>
                    <span>Bom para consolidar e nao deixar materia vencer.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferencesForm.include_reviews}
                    onChange={(event) => updatePreference("include_reviews", event.target.checked)}
                  />
                </label>
                <label className="today-toggle-card">
                  <div>
                    <strong>Conteudo novo</strong>
                    <span>Bom quando voce quer continuar avancando na trilha.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferencesForm.include_new_content}
                    onChange={(event) => updatePreference("include_new_content", event.target.checked)}
                  />
                </label>
              </div>
            </div>

            <div className="today-guide-actions-note">
              <p>
                {guideHasUnsavedChanges
                  ? "Voce mudou o guia acima. Recalcular agora salva essas mudancas e reaplica o plano de hoje."
                  : "Salvar guarda. Recalcular usa o que ja esta salvo para montar o plano de hoje."}
              </p>
            </div>

            <div className="today-action-row">
              <button
                type="button"
                className="app-secondary-action"
                disabled={guideBusy}
                onClick={() => savePreferencesMutation.mutate(preferencesForm)}
              >
                {savePreferencesMutation.isPending ? "Salvando..." : "Salvar"}
              </button>
              <button
                type="button"
                className="app-primary-action app-primary-action-blue"
                disabled={guideBusy}
                onClick={() => {
                  void applyGuideChanges();
                }}
              >
                {recalculateMutation.isPending
                  ? "Recalculando..."
                  : savePreferencesMutation.isPending
                    ? "Salvando..."
                    : guideHasUnsavedChanges
                      ? "Salvar e recalcular"
                      : "Recalcular plano"}
              </button>
            </div>
          </section>

          <section className="today-panel settings-danger-panel">
            <div className="today-section-head">
              <div>
                <p className="today-eyebrow">Zona de perigo</p>
                <h2>Reset seguro dos estudos</h2>
              </div>
            </div>

            <div className="settings-danger-copy">
              <strong>Isso limpa historico de estudo, mas preserva a estrutura pedagogica.</strong>
              <p>Use o dry-run para ver o impacto antes. Subjects, blocks, roadmap e aulas continuam.</p>
            </div>

            <div className="today-toggle-stack">
              <label className="today-toggle-card">
                <div>
                  <strong>Resetar preferencias do Guia do Dia</strong>
                  <span>Volta para defaults seguros de carga e focos.</span>
                </div>
                <input
                  type="checkbox"
                  checked={resetPreferences}
                  onChange={(event) => setResetPreferences(event.target.checked)}
                />
              </label>
              <label className="today-toggle-card">
                <div>
                  <strong>Tambem apagar redacoes e chats</strong>
                  <span>Inclui submissao, correcao e estudo assistido de redacao.</span>
                </div>
                <input
                  type="checkbox"
                  checked={includeEssays}
                  onChange={(event) => setIncludeEssays(event.target.checked)}
                />
              </label>
            </div>

            <div className="today-action-row settings-danger-actions">
              <button
                type="button"
                className="app-secondary-action"
                disabled={previewResetMutation.isPending}
                onClick={() => previewResetMutation.mutate()}
              >
                {previewResetMutation.isPending ? "Carregando..." : "Ver o que sera apagado"}
              </button>
            </div>

            {resetPreview ? (
              <div className="settings-reset-report">
                <div className="today-guide-summary today-guide-summary-result">
                  <span className="today-guide-summary-label">
                    {resetPreview.dry_run ? "Dry-run" : "Ultimo reset executado"}
                  </span>
                  <p>
                    Preferencias resetadas: {resetPreview.preferences_reset ? "sim" : "nao"} | Redacoes apagadas:{" "}
                    {resetPreview.essays_deleted ? "sim" : "nao"}
                  </p>
                </div>

                <section className="settings-report-block">
                  <h3>Contagens apagadas</h3>
                  {renderCountEntries(resetPreview.deleted_counts)}
                </section>

                <section className="settings-report-block">
                  <h3>Contagens de reset</h3>
                  {renderCountEntries(resetPreview.reset_counts)}
                </section>

                <section className="settings-report-block">
                  <h3>Tabelas preservadas</h3>
                  <div className="settings-preserved-list">
                    {resetPreview.preserved_tables.map((tableName) => (
                      <span key={tableName}>{tableName}</span>
                    ))}
                  </div>
                </section>

                {resetPreview.warnings.length > 0 ? (
                  <section className="settings-report-block">
                    <h3>Warnings</h3>
                    <div className="settings-warning-list">
                      {resetPreview.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}

            <label className="today-form-field settings-confirmation-field">
              <span>Digite exatamente RESETAR ESTUDOS</span>
              <input
                className="app-input"
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                placeholder="RESETAR ESTUDOS"
              />
            </label>

            <div className="today-action-row settings-danger-actions">
              <button
                type="button"
                className="study-timer-action is-danger"
                disabled={!canConfirmReset}
                onClick={() => applyResetMutation.mutate()}
              >
                {applyResetMutation.isPending ? "Resetando..." : "Resetar estudos"}
              </button>
            </div>

            <div className="settings-back-link">
              <Link className="app-secondary-action app-guidance-link" to="/">
                Voltar para Hoje
              </Link>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
