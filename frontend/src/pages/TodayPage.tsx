import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useStudyTimer } from "../components/StudyTimer";
import {
  getActiveMockExam,
  getStudyPlanCalendar,
  getStudyPlanToday,
  getSystemCapabilities,
  getTodayActivity,
  getUserEnergySettings,
  saveQuestionAttemptsBulk,
  saveUserEnergySettings,
} from "../lib/api";
import type {
  QuestionAttemptBulkPayload,
  QuestionAttemptBulkResponse,
  StudyPlanItem,
} from "../lib/types";

type DisciplineIconKind =
  | "atom"
  | "brazil"
  | "calculating"
  | "geography"
  | "hieroglyph"
  | "leave"
  | "networking"
  | "philosopher"
  | "physics";
type FocusLane = "advance" | "maintenance" | "recovery";

type AttemptForm = {
  quantity: number;
  correct_count: number;
  source: string;
  difficulty_bank: "facil" | "media" | "dificil";
  elapsed_seconds: string;
  confidence: "" | "baixa" | "media" | "alta";
  error_type: string;
  notes: string;
};

function studyPlanTodayLocalDateKey(): string {
  return new Date().toLocaleDateString("en-CA");
}

const defaultAttemptForm: AttemptForm = {
  quantity: 10,
  correct_count: 0,
  source: "",
  difficulty_bank: "media",
  elapsed_seconds: "",
  confidence: "media",
  error_type: "",
  notes: "",
};

const disciplineVisualMap: Record<string, { icon: DisciplineIconKind; toneClassName: string }> = {
  "Linguagens e Codigos": { icon: "hieroglyph", toneClassName: "today-discipline-card-languages" },
  Linguagens: { icon: "hieroglyph", toneClassName: "today-discipline-card-languages" },
  "Ciencias Humanas": { icon: "philosopher", toneClassName: "today-discipline-card-humanas" },
  Humanas: { icon: "philosopher", toneClassName: "today-discipline-card-humanas" },
  Geografia: { icon: "geography", toneClassName: "today-discipline-card-humanas" },
  Historia: { icon: "hieroglyph", toneClassName: "today-discipline-card-humanas" },
  "Historia do Brasil": { icon: "brazil", toneClassName: "today-discipline-card-humanas" },
  Sociologia: { icon: "networking", toneClassName: "today-discipline-card-humanas" },
  Filosofia: { icon: "philosopher", toneClassName: "today-discipline-card-humanas" },
  "Filosofia/Sociologia": { icon: "philosopher", toneClassName: "today-discipline-card-humanas" },
  "Matematica e suas Tecnologias": { icon: "calculating", toneClassName: "today-discipline-card-math" },
  Matematica: { icon: "calculating", toneClassName: "today-discipline-card-math" },
  "Ciencias da Natureza": { icon: "atom", toneClassName: "today-discipline-card-nature" },
  Natureza: { icon: "atom", toneClassName: "today-discipline-card-nature" },
  Biologia: { icon: "leave", toneClassName: "today-discipline-card-nature" },
  Quimica: { icon: "atom", toneClassName: "today-discipline-card-nature" },
  Fisica: { icon: "physics", toneClassName: "today-discipline-card-nature" },
  Redacao: { icon: "hieroglyph", toneClassName: "today-discipline-card-writing" },
};

function normalizeDisciplineKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function visualForDiscipline(value: string): { icon: DisciplineIconKind; toneClassName: string } {
  return disciplineVisualMap[normalizeDisciplineKey(value)] ?? {
    icon: "hieroglyph",
    toneClassName: "today-discipline-card-default",
  };
}

function visualForFocus(item: StudyPlanItem): { icon: DisciplineIconKind; toneClassName: string } {
  const searchable = normalizeDisciplineKey(
    `${item.strategic_discipline ?? ""} ${item.discipline ?? ""} ${item.block_name ?? ""} ${item.subject_name ?? ""}`,
  ).toLowerCase();

  if (searchable.includes("multiplo") || searchable.includes("divisor") || searchable.includes("matemat")) {
    return { icon: "calculating", toneClassName: "today-discipline-card-math" };
  }
  if (searchable.includes("fisic")) {
    return { icon: "physics", toneClassName: "today-discipline-card-nature" };
  }
  if (searchable.includes("quimic")) {
    return { icon: "atom", toneClassName: "today-discipline-card-nature" };
  }
  if (searchable.includes("biolog")) {
    return { icon: "leave", toneClassName: "today-discipline-card-nature" };
  }
  if (searchable.includes("geograf")) {
    return { icon: "geography", toneClassName: "today-discipline-card-humanas" };
  }
  if (searchable.includes("brasil")) {
    return { icon: "brazil", toneClassName: "today-discipline-card-humanas" };
  }
  if (searchable.includes("filosof")) {
    return { icon: "philosopher", toneClassName: "today-discipline-card-humanas" };
  }
  if (searchable.includes("sociolog")) {
    return { icon: "networking", toneClassName: "today-discipline-card-humanas" };
  }
  return visualForDiscipline(item.strategic_discipline || item.discipline);
}

function DisciplineIcon({ kind }: { kind: DisciplineIconKind }) {
  return <img src={`/discipline-icons/${kind}.png`} alt="" loading="lazy" decoding="async" />;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Nao foi possivel completar a acao.";
}

function plannedModeLabel(value: string | null | undefined): string {
  if (!value) return "Nao informado";
  if (value === "aprendizado") return "Aprendizado";
  if (value === "revisao") return "Revisao";
  if (value === "consolidacao") return "Consolidacao";
  return value;
}

function focusLane(item: StudyPlanItem): FocusLane {
  const searchText = [
    item.planned_mode,
    item.primary_reason,
    item.roadmap_reason,
    item.roadmap_status,
    item.subject_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\bex\d*\b/.test(searchText) || /\ba1\b/.test(searchText) || searchText.includes("recupera")) {
    return "recovery";
  }
  if (/\brr\d*\b/.test(searchText) || /\br[1-9]\b/.test(searchText) || searchText.includes("revis")) {
    return "maintenance";
  }
  return "advance";
}

function eaereTag(item: StudyPlanItem): string {
  const searchText = [item.planned_mode, item.primary_reason, item.roadmap_reason, item.roadmap_status]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  const explicitTag = searchText.match(/\b(RR\d+|EX\d+|EX|A1|E1|E2|R[1-9])\b/);
  if (explicitTag) return explicitTag[1];
  if (item.planned_mode === "aprendizado") return item.planned_questions <= 5 ? "E1" : "E2";
  if (item.planned_mode === "revisao") return "R";
  if (item.planned_mode === "consolidacao") return "EX";
  return plannedModeLabel(item.planned_mode);
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

function formatTri(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return value.toFixed(1);
}

function shouldShowAcademicExamsReminder(activatedAt: string | null | undefined): boolean {
  if (!activatedAt) {
    return false;
  }
  const normalized = /[zZ]|[+-]\d{2}:\d{2}$/.test(activatedAt) ? activatedAt : `${activatedAt}Z`;
  const activatedTime = new Date(normalized).getTime();
  if (!Number.isFinite(activatedTime)) {
    return false;
  }
  return Date.now() - activatedTime >= 7 * 24 * 60 * 60 * 1000;
}

function academicExamsReminderStorageKey(): string {
  return `study-hub:academic-exams-reminder:${new Date().toLocaleDateString("en-CA")}`;
}

export default function TodayPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedItem, setSelectedItem] = useState<StudyPlanItem | null>(null);
  const [attemptForm, setAttemptForm] = useState<AttemptForm>(defaultAttemptForm);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showAcademicExamsPopup, setShowAcademicExamsPopup] = useState(false);
  const { pendingCompletion, consumePendingCompletion } = useStudyTimer();

  const studyPlanTodayQueryKey = useMemo(
    () => ["study-plan-today", studyPlanTodayLocalDateKey()] as const,
    [],
  );

  const planQuery = useQuery({
    queryKey: studyPlanTodayQueryKey,
    queryFn: getStudyPlanToday,
    retry: false,
  });
  const capabilitiesQuery = useQuery({
    queryKey: ["system-capabilities"],
    queryFn: getSystemCapabilities,
    retry: false,
  });
  const calendarQuery = useQuery({
    queryKey: ["study-plan-calendar", 7],
    queryFn: () => getStudyPlanCalendar(7),
    retry: false,
  });
  const energySettingsQuery = useQuery({
    queryKey: ["user-energy-settings"],
    queryFn: getUserEnergySettings,
    retry: false,
  });
  const activityTodayQuery = useQuery({
    queryKey: ["activity-today"],
    queryFn: getTodayActivity,
    retry: false,
  });
  const activeMockExamQuery = useQuery({
    queryKey: ["mock-exam-active"],
    queryFn: getActiveMockExam,
    retry: false,
    refetchInterval: 15000,
  });

  const refreshTodayData = async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: studyPlanTodayQueryKey, type: "active" }),
      queryClient.refetchQueries({ queryKey: ["study-plan-calendar"], type: "active" }),
      queryClient.refetchQueries({ queryKey: ["user-energy-settings"], type: "active" }),
      queryClient.refetchQueries({ queryKey: ["activity-today"], type: "active" }),
      queryClient.refetchQueries({ queryKey: ["gamification-summary"], type: "active" }),
      queryClient.refetchQueries({ queryKey: ["stats-overview"], type: "active" }),
      queryClient.refetchQueries({ queryKey: ["stats-discipline"], type: "active" }),
    ]);
  };

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
          .join(" Â· ") || "Questoes registradas.",
      );
      await refreshTodayData();
    },
    onError: (error) => setFeedback(errorMessage(error)),
  });
  const updateEnergySettingsMutation = useMutation({
    mutationFn: saveUserEnergySettings,
    onSuccess: async (data) => {
      queryClient.setQueryData(["user-energy-settings"], data);
      setShowAcademicExamsPopup(false);
      setFeedback("Modo de protecao atualizado.");
      await refreshTodayData();
    },
    onError: (error) => setFeedback(errorMessage(error)),
  });

  const planItems = planQuery.data?.items ?? [];
  const planSummary = planQuery.data?.summary;
  const calendarDays = calendarQuery.data?.days ?? [];
  const activityToday = activityTodayQuery.data;
  const attemptError = selectedItem ? attemptValidationMessage(attemptForm) : null;
  const energySettings = energySettingsQuery.data;
  const isLightDayMode = Boolean(energySettings?.mode_dia_leve);
  const isAcademicExamMode = Boolean(energySettings?.mode_provas_academicas);
  const isAdvanceSuspended = isLightDayMode || isAcademicExamMode;
  const questionsDoneToday = activityToday?.question_attempts_registered ?? 0;
  const dailyQuestionTarget = energySettings?.current_daily_target_questions ?? planSummary?.total_questions ?? 0;

  const backendOffline = planQuery.isError && capabilitiesQuery.isError && energySettingsQuery.isError;
  const focusCards = useMemo(
    () =>
      planItems.map((item) => ({
        item,
        visual: visualForFocus(item),
      })),
    [planItems],
  );
  const focusGroups = useMemo(
    () =>
      focusCards.reduce<Record<FocusLane, typeof focusCards>>(
        (groups, focusCard) => {
          groups[focusLane(focusCard.item)].push(focusCard);
          return groups;
        },
        { advance: [], maintenance: [], recovery: [] },
      ),
    [focusCards],
  );
  const mockExamRecommendation = calendarDays.find((day) => day.mock_exam_recommendation.recommended)?.mock_exam_recommendation;

  useEffect(() => {
    if (!energySettings?.mode_provas_academicas) {
      setShowAcademicExamsPopup(false);
      return;
    }
    if (!shouldShowAcademicExamsReminder(energySettings.provas_activated_at)) {
      return;
    }
    if (localStorage.getItem(academicExamsReminderStorageKey()) === "dismissed") {
      return;
    }
    setShowAcademicExamsPopup(true);
  }, [energySettings]);

  function openAttemptModal(item: StudyPlanItem, elapsedSeconds?: number | null) {
    setSelectedItem(item);
    setAttemptForm({
      ...defaultAttemptForm,
      quantity: Math.max(item.remaining_today || item.planned_questions || 1, 1),
      correct_count: 0,
      elapsed_seconds: elapsedSeconds && elapsedSeconds > 0 ? String(elapsedSeconds) : "",
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
          questionCount: Math.max(item.remaining_today || item.planned_questions || 1, 1),
          mode: "prova",
          questionSource: "external",
          blockId: item.block_id,
          subjectId: item.subject_id,
        },
      },
    });
  }

  useEffect(() => {
    if (!pendingCompletion || pendingCompletion.context.mode !== "guided") {
      return;
    }

    const matchedItem =
      planItems.find((item) => item.subject_id === pendingCompletion.context.subject_id) ??
      planItems.find((item) => item.block_id === pendingCompletion.context.block_id);

    if (!matchedItem) {
      return;
    }

    openAttemptModal(matchedItem, pendingCompletion.elapsed_seconds);
    setFeedback("Timer finalizado. O tempo foi levado para o registro manual.");
    consumePendingCompletion();
  }, [consumePendingCompletion, pendingCompletion, planItems]);

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setSelectedItem(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedItem]);

  const activeMockExam = activeMockExamQuery.data?.exam ?? null;
  const activeMockExamSeconds = activeMockExamQuery.data?.seconds_remaining ?? 0;
  const shouldBlockForMockExam = Boolean(
    activeMockExam
      && (activeMockExam.status === "em_andamento" || activeMockExam.status === "in_progress")
      && activeMockExamSeconds > 0,
  );

  if (shouldBlockForMockExam && activeMockExam) {
    const minutes = Math.floor(activeMockExamSeconds / 60);
    const seconds = activeMockExamSeconds % 60;
    const formattedRemaining = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    return (
      <main className="today-page">
        <section className="today-subjects-shell today-functional-shell">
          <section className="today-panel today-modal today-modal-priority">
            <p className="today-eyebrow">Simulado em andamento</p>
            <h1>Voce saiu da tela de prova</h1>
            <p>
              Detectamos um simulado ativo. O relogio do ENEM continua correndo.
              Tempo restante: <strong>{formattedRemaining}</strong>.
            </p>
            <div className="today-action-row">
              <button
                type="button"
                className="app-primary-action app-primary-action-blue"
                onClick={() => navigate(`/mock-exams/${activeMockExam.id}/run`)}
              >
                Voltar para a tela do simulado
              </button>
            </div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"
      >
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-[0.08em] text-white">HOJE (EAERE)</h1>
            <p className="mt-1 text-sm font-semibold text-slate-400">
              {questionsDoneToday} / {dailyQuestionTarget} Questoes
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isLightDayMode ? (
              <span className="rounded-full border border-amber-400 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-300">
                Modo dia leve
              </span>
            ) : null}
            {isAcademicExamMode ? (
              <span className="rounded-full border border-purple-400 px-3 py-1 text-xs font-bold uppercase tracking-wide text-purple-300">
                Provas academicas
              </span>
            ) : null}
            <span className="grid h-11 w-11 place-items-center rounded-full border border-sky-400 bg-sky-500 text-lg font-black text-white shadow-lg shadow-sky-950/40">
              T
            </span>
          </div>
        </header>
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

        <section className="rounded-[2rem] border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-black/20 sm:p-7">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Avanco do edital</p>
              <h2 className="mt-1 text-3xl font-black text-white">Zona E1 / E2</h2>
            </div>
            <span className="text-sm font-semibold text-slate-400">{focusGroups.advance.length} bloco(s) ativos</span>
          </div>

          {isAdvanceSuspended ? (
            <article className="grid min-h-80 place-items-center rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-8 text-center">
              <div className="max-w-lg">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-slate-600 bg-slate-900 text-3xl text-slate-300">
                  shield
                </div>
                <h3 className="mt-5 text-2xl font-black text-white">Avanco do Edital suspenso hoje</h3>
                <p className="mt-2 text-base text-slate-400">
                  Avanco do Edital suspenso hoje para protecao da sua carga mental.
                </p>
                <Link
                  to="/lessons"
                  className="mt-6 inline-flex rounded-2xl bg-sky-500 px-6 py-3 text-sm font-black text-slate-950 shadow-lg shadow-sky-950/40 transition hover:bg-sky-400"
                >
                  Realizar Teoria
                </Link>
              </div>
            </article>
          ) : planQuery.isLoading ? (
            <article className="min-h-72 rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6 text-slate-400">
              Preparando focos EAERE...
            </article>
          ) : focusGroups.advance.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {focusGroups.advance.map(({ item, visual }) => (
                <article key={`${item.block_id}-${item.subject_id}`} className="rounded-[1.75rem] border border-slate-700 bg-slate-950 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="rounded-full border border-sky-400/50 px-3 py-1 text-xs font-black text-sky-300">
                        {eaereTag(item)}
                      </span>
                      <h3 className="mt-4 text-2xl font-black text-white">{item.subject_name}</h3>
                      <p className="mt-1 text-sm font-semibold text-slate-400">{item.discipline} / {item.block_name}</p>
                    </div>
                    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-slate-700 bg-slate-900 p-2">
                      <DisciplineIcon kind={visual.icon} />
                    </span>
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-2xl bg-slate-900 p-3">
                      <span className="text-slate-500">Meta</span>
                      <strong className="block text-lg text-white">{item.planned_questions}</strong>
                    </div>
                    <div className="rounded-2xl bg-slate-900 p-3">
                      <span className="text-slate-500">Feitas</span>
                      <strong className="block text-lg text-white">{item.completed_today}</strong>
                    </div>
                    <div className="rounded-2xl bg-slate-900 p-3">
                      <span className="text-slate-500">TRI</span>
                      <strong className="block text-lg text-white">{formatTri(item.estimated_tri_score)}</strong>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button type="button" className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-sky-400" onClick={() => openTrainingTimer(item)}>
                      Iniciar timer
                    </button>
                    <button type="button" className="rounded-2xl border border-slate-600 px-5 py-3 text-sm font-bold text-slate-200 transition hover:border-slate-300" onClick={() => openAttemptModal(item)}>
                      Registrar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <article className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-8 text-center text-slate-400">
              Nenhum bloco E1/E2 ativo agora.
            </article>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-[1.75rem] border border-white/10 bg-slate-900/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">Tiros Rapidos / RRs</p>
            <h3 className="mt-2 text-xl font-black text-white">Manutencao</h3>
            <div className="mt-4 space-y-3">
              {focusGroups.maintenance.length > 0 ? focusGroups.maintenance.slice(0, 3).map(({ item }) => (
                <button key={`${item.block_id}-${item.subject_id}`} type="button" onClick={() => openTrainingTimer(item)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 p-3 text-left transition hover:border-sky-400">
                  <span className="text-xs font-black text-sky-300">{eaereTag(item)}</span>
                  <strong className="mt-1 block text-sm text-white">{item.subject_name}</strong>
                  <small className="text-slate-500">{item.planned_questions} questoes</small>
                </button>
              )) : <p className="text-sm text-slate-500">Sem RR ou revisao imediata.</p>}
            </div>
          </article>

          <article className="rounded-[1.75rem] border border-amber-400/30 bg-amber-950/10 p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">Looping EX</p>
            <h3 className="mt-2 text-xl font-black text-white">Recuperacao</h3>
            <div className="mt-4 space-y-3">
              {focusGroups.recovery.length > 0 ? focusGroups.recovery.slice(0, 3).map(({ item }) => (
                <div key={`${item.block_id}-${item.subject_id}`} className="rounded-2xl border border-amber-400/20 bg-slate-950 p-3">
                  <span className="text-xs font-black text-amber-300">{eaereTag(item)}</span>
                  <strong className="mt-1 block text-sm text-white">{item.subject_name}</strong>
                  <small className="text-slate-500">score {formatTri(item.estimated_tri_score)}</small>
                  <Link to="/lessons" className="mt-3 inline-flex rounded-xl border border-amber-300/50 px-3 py-2 text-xs font-black text-amber-200">
                    Estudar Teoria A1
                  </Link>
                </div>
              )) : <p className="text-sm text-slate-500">Nenhum bloco em EX agora.</p>}
            </div>
          </article>

          <article className="rounded-[1.75rem] border border-white/10 bg-slate-900/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">Metricas minimas</p>
            <h3 className="mt-2 text-xl font-black text-white">Pulso do dia</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-950 p-3">
                <span className="text-xs text-slate-500">Assuntos</span>
                <strong className="block text-xl text-white">{activityToday?.subjects_studied_today ?? 0}</strong>
              </div>
              <div className="rounded-2xl bg-slate-950 p-3">
                <span className="text-xs text-slate-500">Blocos</span>
                <strong className="block text-xl text-white">{activityToday?.blocks_impacted_today ?? 0}</strong>
              </div>
              <div className="rounded-2xl bg-slate-950 p-3">
                <span className="text-xs text-slate-500">Revisoes</span>
                <strong className="block text-xl text-white">{activityToday?.reviews_generated_today ?? 0}</strong>
              </div>
              <div className="rounded-2xl bg-slate-950 p-3">
                <span className="text-xs text-slate-500">Focos</span>
                <strong className="block text-xl text-white">{planSummary?.focus_count ?? 0}</strong>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              {mockExamRecommendation?.title ?? "Sem simulado sugerido agora."}
            </p>
          </article>
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
                <span>Dificuldade TRI/base da lista</span>
                <select
                  className="app-input dark:bg-slate-900 dark:text-zinc-100 dark:border-slate-700"
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
                <span>Confianca</span>
                <select
                  className="app-input dark:bg-slate-900 dark:text-zinc-100 dark:border-slate-700"
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

      {showAcademicExamsPopup ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <section className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-950 p-6 text-slate-100 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
            <p className="today-eyebrow">Protecao cognitiva</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Semana de provas ainda ativa</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Voce esta em semana de provas academicas ha mais de 7 dias. Deseja desativar o modo de protecao para
              retomar o avanco do edital do ENEM?
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className="rounded-2xl border border-slate-600 bg-slate-900 px-4 py-3 font-bold text-slate-100 transition hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                onClick={() => {
                  localStorage.setItem(academicExamsReminderStorageKey(), "dismissed");
                  setShowAcademicExamsPopup(false);
                }}
              >
                Manter Ativo
              </button>
              <button
                type="button"
                className="rounded-2xl border border-sky-300 bg-sky-400 px-4 py-3 font-bold text-slate-950 shadow-lg transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={updateEnergySettingsMutation.isPending}
                onClick={() => updateEnergySettingsMutation.mutate({ mode_provas_academicas: false })}
              >
                {updateEnergySettingsMutation.isPending ? "Desativando..." : "Desativar e Retomar"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}


