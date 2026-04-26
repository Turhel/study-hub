import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

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

const intensityDescriptions: Record<StudyGuideIntensity, string> = {
  leve: "Carga mais segura para manter consistencia sem se esmagar.",
  normal: "Equilibrio entre volume, revisao e conteudo novo.",
  forte: "Puxa mais questoes e focos quando voce quer acelerar.",
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

function GuideIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="8" y="9" width="32" height="28" rx="8" className="today-icon-fill-gold" />
      <path d="M15 18h18M15 24h18M15 30h10" className="today-icon-line-dark" />
      <path d="M33 12v24" className="today-icon-line-soft" />
    </svg>
  );
}

function NextStepPanel({
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  secondaryTo,
}: {
  title: string;
  description: string;
  primaryLabel: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  secondaryTo?: string;
}) {
  return (
    <section className="app-next-step-panel">
      <div className="app-next-step-copy">
        <p className="today-eyebrow">Faca agora</p>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="app-next-step-actions">
        <button type="button" className="app-primary-action app-primary-action-blue" onClick={onPrimary}>
          {primaryLabel}
        </button>
        {secondaryLabel && secondaryTo ? (
          <Link className="app-secondary-action app-guidance-link" to={secondaryTo}>
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </section>
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

function ActivityList({ items }: { items?: ActivityItem[] }) {
  if (isActivityEmpty(items)) {
    return <p className="today-empty-copy">Nenhuma atividade recente ainda. Registre questoes para alimentar o historico.</p>;
  }

  function activityTypeLabel(type: string): string {
    const normalized = type.toLowerCase();
    if (normalized.includes("question")) return "Questoes";
    if (normalized.includes("review")) return "Revisao";
    if (normalized.includes("progress")) return "Progressao";
    if (normalized.includes("plan")) return "Plano";
    return "Atividade";
  }

  function relativeTime(value: string): string {
    const createdAt = new Date(value).getTime();
    const diffMs = Date.now() - createdAt;
    const diffMinutes = Math.max(Math.floor(diffMs / 60000), 0);

    if (diffMinutes < 1) return "agora";
    if (diffMinutes < 60) return `${diffMinutes} min atras`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} h atras`;

    return new Date(value).toLocaleDateString("pt-BR");
  }

  return (
    <div className="today-activity-list">
      {items?.slice(0, 6).map((item, index) => (
        <article
          key={`${item.created_at}-${item.type}-${index}`}
          className={`today-activity-item ${index === 0 ? "is-latest" : ""}`}
        >
          <div className="today-activity-copy">
            <div className="today-activity-meta">
              <span className="today-activity-type">{activityTypeLabel(item.type)}</span>
              <small>{relativeTime(item.created_at)}</small>
            </div>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
          </div>
          <span>{new Date(item.created_at).toLocaleDateString("pt-BR")}</span>
        </article>
      ))}
    </div>
  );
}

function activityHeadline(activityToday?: {
  question_attempts_registered?: number;
  subjects_studied_today?: number;
  blocks_impacted_today?: number;
  reviews_generated_today?: number;
  progression_decisions_today?: number;
}) {
  if (!activityToday) {
    return {
      title: "Aguardando dados de hoje",
      description: "Quando o backend responder, este card mostra o que ja andou e o que ainda esta em aberto.",
    };
  }

  if ((activityToday.question_attempts_registered ?? 0) === 0) {
    return {
      title: "Dia ainda sem registro",
      description: "O proximo passo para movimentar o estudo e registrar algumas questoes no foco do dia.",
    };
  }

  if ((activityToday.subjects_studied_today ?? 0) <= 1) {
    return {
      title: "Voce ja começou",
      description: "Ja houve execucao hoje. Agora vale decidir se fecha esse foco ou abre um segundo assunto.",
    };
  }

  return {
    title: "Dia em movimento",
    description: "Voce ja espalhou estudo por mais de um assunto. Agora vale usar isso para revisar estatisticas e manter o ritmo.",
  };
}

function ActivityMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <article className="today-activity-metric">
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{hint}</small>
    </article>
  );
}

export default function TodayPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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

  const savedPreferences = useMemo<PreferencesForm | null>(() => {
    if (!preferencesQuery.data) {
      return null;
    }

    const { updated_at: _updatedAt, ...payload } = preferencesQuery.data;
    return payload;
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
  const guideBusy = savePreferencesMutation.isPending || recalculateMutation.isPending;

  const backendOffline = planQuery.isError && capabilitiesQuery.isError && preferencesQuery.isError;
  const focusCards = useMemo(
    () =>
      planItems.map((item) => ({
        item,
        visual: visualForDiscipline(item.strategic_discipline || item.discipline),
      })),
    [planItems],
  );
  const nextStep = useMemo(() => {
    if (backendOffline) {
      return {
        title: "Recupere a conexao com o backend",
        description: "Sem backend voce perde plano, activity e registro. Assim que ele voltar, esta tela volta a te orientar.",
        primaryLabel: "Tentar novamente",
        onPrimary: () => {
          void refreshTodayData();
          void capabilitiesQuery.refetch();
          void preferencesQuery.refetch();
        },
        secondaryLabel: undefined,
        secondaryTo: undefined,
      };
    }

    if (planQuery.isLoading) {
      return {
        title: "Espere o plano carregar",
        description: "A prioridade do estudo depende do plano do dia. Quando ele responder, voce ja pode comecar pelo primeiro foco.",
        primaryLabel: "Atualizar plano",
        onPrimary: () => {
          void planQuery.refetch();
        },
        secondaryLabel: "Ver estatisticas",
        secondaryTo: "/stats",
      };
    }

    if (!hasPlanItems) {
      return {
        title: "Ajuste a carga e recalcule o plano",
        description: "Quando nao ha focos, o proximo passo util e salvar as preferencias do guia e pedir um novo plano.",
        primaryLabel: guideHasUnsavedChanges ? "Salvar e recalcular" : "Recalcular plano",
        onPrimary: () => {
          void applyGuideChanges();
        },
        secondaryLabel: "Ir para aulas",
        secondaryTo: "/lessons",
      };
    }

    if ((activityToday?.question_attempts_registered ?? 0) === 0) {
      return {
        title: `Comece por ${planItems[0]?.subject_name ?? "seu primeiro foco"}`,
        description: "Seu plano ja existe. O passo mais importante agora e fazer algumas questoes e registrar o resultado para o app aprender com voce.",
        primaryLabel: "Registrar questoes",
        onPrimary: () => openAttemptModal(planItems[0]),
        secondaryLabel: "Ver aulas",
        secondaryTo: "/lessons",
      };
    }

    return {
      title: "Feche o ciclo do estudo",
      description: "Voce ja registrou execucao hoje. Agora vale revisar activity e usar Estatisticas ou Aulas para decidir o proximo aprofundamento.",
      primaryLabel: "Abrir estatisticas",
      onPrimary: () => {
        window.location.assign("/stats");
      },
      secondaryLabel: "Ir para aulas",
      secondaryTo: "/lessons",
    };
  }, [
    activityToday?.question_attempts_registered,
    backendOffline,
    capabilitiesQuery,
    guideHasUnsavedChanges,
    hasPlanItems,
    planItems,
    planQuery,
    preferencesQuery,
  ]);
  const guideSummary = useMemo(() => {
    const toggles = [
      preferencesForm.include_reviews ? "com revisoes" : "sem revisoes",
      preferencesForm.include_new_content ? "com conteudo novo" : "sem conteudo novo",
    ];

    return `Hoje voce pediu ${preferencesForm.daily_minutes} min, intensidade ${preferencesForm.intensity}, ate ${preferencesForm.max_focus_count} focos e ate ${preferencesForm.max_questions} questoes, ${toggles.join(" e ")}.`;
  }, [preferencesForm]);
  const activitySummary = useMemo(() => activityHeadline(activityToday), [activityToday]);

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
      // Mutations already surface feedback to the UI.
    }
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

  function openTrainingTimer(item: StudyPlanItem) {
    navigate("/timer", {
      state: {
        timerPreset: {
          discipline: item.discipline,
          block: item.block_name,
          subject: item.subject_name,
          blockId: item.block_id,
          subjectId: item.subject_id,
          questionCount: Math.max(item.remaining_today || item.planned_questions || 1, 1),
          targetSecondsPerQuestion: 180,
          mode: "prova",
          questionSource: "external",
        },
      },
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
            <h1>Seu estudo de hoje</h1>
            <p>Ajuste a carga, execute os focos e registre o que fez.</p>
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

        <NextStepPanel
          title={nextStep.title}
          description={nextStep.description}
          primaryLabel={nextStep.primaryLabel}
          onPrimary={nextStep.onPrimary}
          secondaryLabel={nextStep.secondaryLabel}
          secondaryTo={nextStep.secondaryTo}
        />

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
                  <p className="today-eyebrow">Hoje</p>
                  <h2>Focos</h2>
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
                        : "Quando houver itens, eles aparecem aqui como seus proximos focos."}
                    </p>
                    <strong>{planQuery.isLoading ? "Carregando..." : "Ajuste o Guia ou recalcule o plano."}</strong>
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
                      <button type="button" className="today-register-button" onClick={() => openTrainingTimer(item)}>
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

                  <div className="today-focus-secondary-row">
                    <button type="button" className="today-focus-secondary-action" onClick={() => openAttemptModal(item)}>
                      Registrar manualmente
                    </button>
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
                  <p className="today-eyebrow">Carga</p>
                  <h2>Guia do dia</h2>
                </div>
                {preferencesQuery.isError ? <span className="today-inline-error">Nao carregou</span> : null}
              </div>

              <div className="today-guide-overview">
                <div>
                  <strong>Defina o ritmo antes de estudar</strong>
                  <p>Ajuste o volume e recalcule se quiser mudar o plano de hoje.</p>
                </div>
                <span className="today-guide-icon" aria-hidden="true">
                  <GuideIcon />
                </span>
              </div>

              <div className="today-guide-summary">
                <span className="today-guide-summary-label">Resumo atual</span>
                <p>{guideSummary}</p>
                {guideHasUnsavedChanges ? <small className="today-guide-dirty">Voce alterou o guia. Falta aplicar no plano.</small> : null}
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

            <section className="today-panel">
              <div className="today-section-head">
                <div>
                  <p className="today-eyebrow">Hoje</p>
                  <h2>Progresso</h2>
                </div>
                {activityTodayQuery.isError ? <span className="today-inline-error">Nao carregou</span> : null}
              </div>

              <div className="today-activity-overview">
                <div>
                  <strong>{activitySummary.title}</strong>
                  <p>{activitySummary.description}</p>
                </div>
              </div>

              <div className="today-activity-metrics-grid">
                <ActivityMetric
                  label="Questoes registradas"
                  value={activityToday?.question_attempts_registered ?? 0}
                  hint="Volume real ja salvo hoje."
                />
                <ActivityMetric
                  label="Assuntos estudados"
                  value={activityToday?.subjects_studied_today ?? 0}
                  hint="Quantos temas receberam atencao."
                />
                <ActivityMetric
                  label="Blocos impactados"
                  value={activityToday?.blocks_impacted_today ?? 0}
                  hint="Onde seu progresso mexeu na trilha."
                />
                <ActivityMetric
                  label="Revisoes geradas"
                  value={activityToday?.reviews_generated_today ?? 0}
                  hint="O que ja virou manutencao futura."
                />
              </div>

              <div className="today-activity-summary">
                <span>Decisoes de progressao: {activityToday?.progression_decisions_today ?? 0}</span>
              </div>
            </section>
          </aside>
        </section>

        <section className="today-panel">
          <div className="today-section-head">
            <div>
              <p className="today-eyebrow">Recentes</p>
              <h2>Historico do dia</h2>
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
