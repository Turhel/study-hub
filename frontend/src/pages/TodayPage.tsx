import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useStudyTimer } from "../components/StudyTimer";
import {
  createStudyGuideCalendarEvent,
  getActiveMockExam,
  getStudyGuideCalendarProjection,
  getStudyPlanCalendar,
  getStudyPlanToday,
  getSystemCapabilities,
  getTodayActivity,
  getUserEnergySettings,
  saveQuestionAttemptsBulk,
  saveUserEnergySettings,
} from "../lib/api";
import type {
  CalendarEventPayload,
  QuestionAttemptBulkPayload,
  QuestionAttemptBulkResponse,
  SmartCalendarProjectionDay,
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
type CalendarEventForm = {
  event_type: CalendarEventPayload["event_type"];
  start_date: string;
  end_date: string;
  description: string;
};

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

function localDateKey(date: Date): string {
  return date.toLocaleDateString("en-CA");
}

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

function shortWeekday(dateKey: string): string {
  return parseDateKey(dateKey).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}

function shortDayMonth(dateKey: string): string {
  return parseDateKey(dateKey).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function buildCalendarGrid(anchorDate: Date): Array<{ date: Date; key: string; inCurrentMonth: boolean }> {
  const firstDay = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      date,
      key: localDateKey(date),
      inCurrentMonth: date.getMonth() === anchorDate.getMonth(),
    };
  });
}

function calendarEventLabel(value: CalendarEventPayload["event_type"]): string {
  if (value === "PROVAS_ACADEMICAS") return "Semana de Provas";
  if (value === "VIAGEM_DESCANSO") return "Viagem / Descanso";
  if (value === "SIMULADO_PROG") return "Simulado programado";
  return value;
}

function protectionLabel(value: string): string {
  if (value === "provas_academicas") return "Provas academicas";
  if (value === "viagem_descanso") return "Descanso programado";
  return "Normal";
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

const defaultCalendarEventForm: CalendarEventForm = {
  event_type: "PROVAS_ACADEMICAS",
  start_date: studyPlanTodayLocalDateKey(),
  end_date: studyPlanTodayLocalDateKey(),
  description: "",
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
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [calendarEventForm, setCalendarEventForm] = useState<CalendarEventForm>(defaultCalendarEventForm);
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
  const smartCalendarQuery = useQuery({
    queryKey: ["study-guide-calendar-projection"],
    queryFn: getStudyGuideCalendarProjection,
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
  const createCalendarEventMutation = useMutation({
    mutationFn: createStudyGuideCalendarEvent,
    onSuccess: async () => {
      setSelectedCalendarDate(null);
      setCalendarEventForm(defaultCalendarEventForm);
      setFeedback("Evento salvo no calendario preditivo.");
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["study-guide-calendar-projection"], type: "active" }),
        queryClient.refetchQueries({ queryKey: ["user-energy-settings"], type: "active" }),
        queryClient.refetchQueries({ queryKey: studyPlanTodayQueryKey, type: "active" }),
        queryClient.refetchQueries({ queryKey: ["activity-today"], type: "active" }),
      ]);
    },
    onError: (error) => setFeedback(errorMessage(error)),
  });

  const planItems = planQuery.data?.items ?? [];
  const planSummary = planQuery.data?.summary;
  const calendarDays = calendarQuery.data?.days ?? [];
  const smartCalendarDays = smartCalendarQuery.data ?? [];
  const activityToday = activityTodayQuery.data;
  const attemptError = selectedItem ? attemptValidationMessage(attemptForm) : null;
  const energySettings = energySettingsQuery.data;
  const isLightDayMode = Boolean(energySettings?.mode_dia_leve);
  const todayProjection = smartCalendarDays.find((day) => day.date === studyPlanTodayLocalDateKey());
  const isCalendarAcademicExamMode = todayProjection?.status_protecao === "provas_academicas";
  const isTravelRestToday = todayProjection?.status_protecao === "viagem_descanso";
  const isAcademicExamMode = Boolean(energySettings?.mode_provas_academicas) || isCalendarAcademicExamMode;
  const isAdvanceSuspended = isLightDayMode || isAcademicExamMode || isTravelRestToday;
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
  const plannedQuestionsToday =
    planSummary?.total_questions ?? planItems.reduce((total, item) => total + item.planned_questions, 0);
  const remainingQuestionsToday = planItems.reduce((total, item) => total + Math.max(item.remaining_today, 0), 0);
  const completedPlanItemsToday = planItems.filter((item) => item.remaining_today <= 0).length;
  const isDailyPlanComplete = planItems.length > 0 && remainingQuestionsToday <= 0;
  const mockExamRecommendation = calendarDays.find((day) => day.mock_exam_recommendation.recommended)?.mock_exam_recommendation;
  const smartCalendarMap = useMemo(
    () => new Map(smartCalendarDays.map((day) => [day.date, day])),
    [smartCalendarDays],
  );
  const calendarGridDays = useMemo(() => buildCalendarGrid(new Date()), []);
  const selectedCalendarProjection = selectedCalendarDate ? smartCalendarMap.get(selectedCalendarDate) : null;
  const isSelectedDateProjected = Boolean(selectedCalendarProjection);

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

  function openCalendarDay(dateKey: string) {
    setSelectedCalendarDate(dateKey);
    setCalendarEventForm({
      ...defaultCalendarEventForm,
      start_date: dateKey,
      end_date: dateKey,
    });
  }

  function submitCalendarEvent() {
    if (!selectedCalendarDate) {
      return;
    }
    createCalendarEventMutation.mutate({
      event_type: calendarEventForm.event_type,
      start_date: selectedCalendarDate,
      end_date: selectedCalendarDate,
      description: null,
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
        <header className="grid gap-5 border-b border-white/10 pb-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-stretch">
          <div className="flex h-full min-h-[24rem] flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black tracking-[0.08em] text-white">HOJE</h1>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  {questionsDoneToday} / {dailyQuestionTarget} Questoes
                </p>
              </div>
              <span className="grid h-11 w-11 place-items-center rounded-full border border-sky-400 bg-sky-500 text-lg font-black text-white shadow-lg shadow-sky-950/40">
                T
              </span>
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
              {isTravelRestToday ? (
                <span className="rounded-full border border-emerald-400 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-300">
                  Descanso programado
                </span>
              ) : null}
            </div>
            <section className="flex flex-1 flex-col justify-between rounded-[1.75rem] border border-white/10 bg-slate-900/50 p-5 shadow-2xl shadow-black/10">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">Fazer agora</p>
                {isDailyPlanComplete ? (
                  <div className="mt-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <span className="rounded-full border border-emerald-400/50 px-3 py-1 text-xs font-black text-emerald-300">
                          Fechamento
                        </span>
                        <h2 className="mt-3 text-2xl font-black text-white">Dia concluido</h2>
                        <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-400">
                          Voce fez o essencial hoje. O calendario ja ajustou a proxima previsao sem criar carga extra.
                        </p>
                      </div>
                      <Link
                        to="/stats"
                        className="w-fit rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300"
                      >
                        Ver resumo
                      </Link>
                    </div>
                    <div className="mt-5 grid gap-2 sm:grid-cols-4">
                      <div className="rounded-2xl bg-slate-950/70 p-3">
                        <span className="text-xs font-semibold text-slate-500">Questoes</span>
                        <strong className="block text-lg text-white">
                          {questionsDoneToday} / {plannedQuestionsToday}
                        </strong>
                      </div>
                      <div className="rounded-2xl bg-slate-950/70 p-3">
                        <span className="text-xs font-semibold text-slate-500">Focos</span>
                        <strong className="block text-lg text-white">
                          {completedPlanItemsToday} / {planItems.length}
                        </strong>
                      </div>
                      <div className="rounded-2xl bg-slate-950/70 p-3">
                        <span className="text-xs font-semibold text-slate-500">Blocos</span>
                        <strong className="block text-lg text-white">{activityToday?.blocks_impacted_today ?? 0}</strong>
                      </div>
                      <div className="rounded-2xl bg-slate-950/70 p-3">
                        <span className="text-xs font-semibold text-slate-500">Revisoes</span>
                        <strong className="block text-lg text-white">{activityToday?.reviews_generated_today ?? 0}</strong>
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                      <Link
                        to="/free-study"
                        className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-xs font-bold text-slate-300 transition hover:border-sky-400 hover:text-white"
                      >
                        Modo Livre sem pressao
                      </Link>
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-950/20 px-3 py-1 text-xs font-bold text-emerald-200">
                        Teto do dia respeitado
                      </span>
                    </div>
                  </div>
                ) : isAdvanceSuspended ? (
                  <div className="mt-4">
                    <h2 className="text-2xl font-black text-white">Avanco suspenso</h2>
                    <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-400">
                      Hoje o sistema protege sua carga mental. Foque em revisoes criticas, RRs ou teoria ativa.
                    </p>
                  </div>
                ) : planQuery.isLoading ? (
                  <p className="mt-4 text-sm font-semibold text-slate-400">Carregando focos do dia...</p>
                ) : focusGroups.advance.length > 0 ? (
                  <div className="mt-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <span className="rounded-full border border-sky-400/50 px-3 py-1 text-xs font-black text-sky-300">
                          {eaereTag(focusGroups.advance[0].item)}
                        </span>
                        <h2 className="mt-3 max-w-3xl text-2xl font-black leading-tight text-white">
                          {focusGroups.advance[0].item.subject_name}
                        </h2>
                        <p className="mt-1 text-sm font-semibold text-slate-400">
                          {focusGroups.advance[0].item.discipline} / {focusGroups.advance[0].item.block_name}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="w-fit rounded-2xl bg-sky-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-sky-400"
                        onClick={() => openTrainingTimer(focusGroups.advance[0].item)}
                      >
                        Iniciar timer
                      </button>
                    </div>
                    <div className="mt-5 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-2xl bg-slate-950/70 p-3">
                        <span className="text-xs font-semibold text-slate-500">Meta</span>
                        <strong className="block text-lg text-white">{focusGroups.advance[0].item.planned_questions}</strong>
                      </div>
                      <div className="rounded-2xl bg-slate-950/70 p-3">
                        <span className="text-xs font-semibold text-slate-500">Feitas</span>
                        <strong className="block text-lg text-white">{focusGroups.advance[0].item.completed_today}</strong>
                      </div>
                      <div className="rounded-2xl bg-slate-950/70 p-3">
                        <span className="text-xs font-semibold text-slate-500">TRI</span>
                        <strong className="block text-lg text-white">{formatTri(focusGroups.advance[0].item.estimated_tri_score)}</strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm font-semibold text-slate-400">Sem bloco E1/E2 ativo agora.</p>
                )}
              </div>
              {focusGroups.advance.length > 1 && !isAdvanceSuspended && !isDailyPlanComplete ? (
                <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                  {focusGroups.advance.slice(1, 4).map(({ item }) => (
                    <span
                      key={`top-focus-${item.block_id}-${item.subject_id}`}
                      className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-xs font-bold text-slate-300"
                    >
                      {eaereTag(item)} · {item.subject_name}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>
          </div>

          <section className="rounded-[1.75rem] border border-white/10 bg-slate-900/70 p-4 shadow-2xl shadow-black/20">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">Calendario</p>
                <h2 className="text-base font-black text-white">
                  {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                </h2>
              </div>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-bold text-slate-300">
                7 dias
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-black uppercase text-slate-500">
              {["D", "S", "T", "Q", "Q", "S", "S"].map((label, index) => (
                <span key={`${label}-${index}`}>{label}</span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {calendarGridDays.map((calendarDay) => {
                const projection = smartCalendarMap.get(calendarDay.key);
                const isToday = calendarDay.key === studyPlanTodayLocalDateKey();
                return (
                  <button
                    key={calendarDay.key}
                    type="button"
                    className={[
                      "relative flex h-10 flex-col items-center justify-center rounded-xl border text-xs font-black transition",
                      calendarDay.inCurrentMonth ? "border-slate-800 text-slate-200 hover:border-sky-400" : "border-transparent text-slate-700",
                      selectedCalendarDate === calendarDay.key ? "bg-slate-800 ring-1 ring-sky-400" : "bg-slate-950/50",
                    ].join(" ")}
                    onClick={() => openCalendarDay(calendarDay.key)}
                  >
                    <span
                      className={
                        isToday
                          ? "grid h-6 w-6 place-items-center rounded-full bg-white text-slate-950"
                          : "grid h-6 w-6 place-items-center"
                      }
                    >
                      {calendarDay.date.getDate()}
                    </span>
                    {projection ? (
                      <span className="absolute bottom-1 flex items-center gap-1">
                        {projection.has_simulado ? <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> : null}
                        {projection.subjects_predicted.length > 0 ||
                        projection.revisoes_count > 0 ||
                        (projection.focus_subjects_predicted?.length ?? 0) > 0 ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                        ) : null}
                        {projection.plan_subjects_predicted?.length > 0 ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                        ) : null}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold text-slate-400">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400" /> Simulado</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" /> Previsao EAERE</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-300" /> Plano de hoje</span>
            </div>
            {smartCalendarQuery.isError ? (
              <p className="mt-3 text-xs font-semibold text-rose-300">Projecao indisponivel agora.</p>
            ) : null}
          </section>
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

      {selectedCalendarDate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/95 p-6 text-slate-100 shadow-2xl dark:bg-slate-950/95">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">Calendario preditivo</p>
                <h2 className="mt-1 text-2xl font-black text-white">
                  {shortWeekday(selectedCalendarDate)} · {shortDayMonth(selectedCalendarDate)}
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  {isSelectedDateProjected ? "Previsao visual, recalculada conforme voce executa o plano" : "Fora da janela preditiva atual"}
                </p>
              </div>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full border border-slate-800 text-sm font-black text-slate-400 transition hover:border-slate-500 hover:text-white"
                onClick={() => setSelectedCalendarDate(null)}
                aria-label="Fechar calendario preditivo"
              >
                X
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
              {selectedCalendarProjection?.status_protecao === "viagem_descanso" ? (
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Pauta de estudos estimada</p>
                  <p className="mt-3 text-base font-bold text-emerald-100">
                    Dia de descanso programado. Carga redistribuida sem acumulo.
                  </p>
                </div>
              ) : selectedCalendarProjection ? (
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">
                    Carga estimada: {selectedCalendarProjection.total_questoes_estimadas} questoes aproximadas para este dia
                  </p>
                  <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
                    Se voce concluir os focos anteriores, esta e a fila provavel do EAERE. Se sobrar pendencia, o calendario se ajusta e carrega o conteudo para frente.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">Pauta de estudos estimada</p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {selectedCalendarProjection.revisoes_count} revisao(oes) · {protectionLabel(selectedCalendarProjection.status_protecao)}
                      </p>
                    </div>
                    {selectedCalendarProjection.has_simulado ? (
                      <span className="w-fit rounded-full border border-rose-400/40 px-3 py-1 text-xs font-black uppercase tracking-wide text-rose-300">
                        Simulado
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-4">
                    {selectedCalendarProjection.plan_subjects_predicted?.length > 0 ? (
                      <div>
                        <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-amber-300">Plano ativo de hoje</p>
                        <ul className="mt-2 space-y-1.5">
                          {selectedCalendarProjection.plan_subjects_predicted.map((item, index) => (
                            <li
                              key={`plan-${item}-${index}`}
                              className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-950/20 px-3 py-2"
                            >
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-300/90" aria-hidden />
                              <span className="font-mono text-xs leading-relaxed text-amber-100/90">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {(selectedCalendarProjection.focus_subjects_predicted?.length ?? 0) > 0 ? (
                      <div>
                        <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-violet-300">
                          Plano ativo previsto
                        </p>
                        <p className="mt-1 text-[0.7rem] font-semibold text-violet-200/70">
                          Sequencia provavel se os dias anteriores forem executados.
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {selectedCalendarProjection.focus_subjects_predicted.map((item, index) => (
                            <li
                              key={`focus-${item}-${index}`}
                              className="flex items-start gap-2 rounded-lg border border-violet-400/20 bg-violet-950/20 px-3 py-2"
                            >
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-300/90" aria-hidden />
                              <span className="font-mono text-xs leading-relaxed text-violet-100/90">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div>
                      <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-sky-300">Revisoes previstas (EAERE)</p>
                      <ul className="mt-2 space-y-1.5">
                        {selectedCalendarProjection.subjects_predicted.length > 0 ? (
                          selectedCalendarProjection.subjects_predicted.map((item, index) => (
                            <li
                              key={`review-${item}-${index}`}
                              className="flex items-start gap-2 rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2"
                            >
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-sky-400/80" aria-hidden />
                              <span className="font-mono text-xs leading-relaxed text-slate-300">{item}</span>
                            </li>
                          ))
                        ) : (
                          <li className="rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2 font-mono text-xs leading-relaxed text-slate-500">
                            Nenhuma revisao prevista para este dia na simulacao atual.
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">Pauta de estudos estimada</p>
                  <p className="mt-3 font-mono text-xs leading-relaxed text-slate-500">
                    A previsao fina fica limitada aos proximos 7 dias. Voce ainda pode agendar um bloqueio para esta data.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">Agendar bloqueio/evento</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(["PROVAS_ACADEMICAS", "VIAGEM_DESCANSO"] as const).map((eventType) => {
                  const active = calendarEventForm.event_type === eventType;
                  return (
                    <button
                      key={eventType}
                      type="button"
                      className={[
                        "rounded-2xl border bg-slate-800 px-4 py-4 text-left transition hover:border-sky-400",
                        active ? "border-blue-500 shadow-lg shadow-blue-950/30" : "border-slate-700",
                      ].join(" ")}
                      onClick={() =>
                        setCalendarEventForm((current) => ({
                          ...current,
                          event_type: eventType,
                          start_date: selectedCalendarDate,
                          end_date: selectedCalendarDate,
                          description: "",
                        }))
                      }
                    >
                      <span className="block text-sm font-black text-white">
                        {eventType === "PROVAS_ACADEMICAS" ? "📚 Semana de Provas" : "✈️ Viagem / Descanso"}
                      </span>
                      <span className="mt-1 block text-xs font-semibold text-slate-400">
                        {eventType === "PROVAS_ACADEMICAS"
                          ? "Congela o avanco do edital neste dia."
                          : "Zera a carga e redistribui sem acumulo."}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  className="rounded-2xl bg-blue-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={createCalendarEventMutation.isPending}
                  onClick={submitCalendarEvent}
                >
                  {createCalendarEventMutation.isPending ? "Salvando..." : "Salvar evento"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

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


