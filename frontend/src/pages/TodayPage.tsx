import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";

import { getRecentActivity, getStudyPlanToday, getToday, saveQuestionAttemptsBulk } from "../lib/api";
import type {
  ActivityItem,
  QuestionAttemptBulkPayload,
  StudyPlanItem,
  StudyPlanTodayResponse,
  TodayItem,
} from "../lib/types";

type RegisterFormState = {
  quantity: number;
  correctCount: number;
  source: string;
  difficultyBank: QuestionAttemptBulkPayload["difficulty_bank"];
  difficultyPersonal: QuestionAttemptBulkPayload["difficulty_personal"];
  averageSeconds: number;
  confidence: NonNullable<QuestionAttemptBulkPayload["confidence"]>;
  errorType: string;
  notes: string;
};

type SubjectPerformance = {
  discipline: string;
  planned: number;
  completed: number;
  accuracy: number;
  difficulty: number;
};

const defaultRegisterForm: RegisterFormState = {
  quantity: 8,
  correctCount: 0,
  source: "",
  difficultyBank: "media",
  difficultyPersonal: "media",
  averageSeconds: 180,
  confidence: "media",
  errorType: "",
  notes: "",
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(Math.round(value), 100));
}

function getLocalDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function groupPerformance(plan: StudyPlanTodayResponse | undefined): SubjectPerformance[] {
  if (!plan || plan.items.length === 0) {
    return [];
  }

  const maxScore = Math.max(...plan.items.map((item) => item.priority_score), 1);
  const grouped = plan.items.reduce<Record<string, SubjectPerformance>>((acc, item) => {
    const key = item.discipline || "Geral";
    const current = acc[key] ?? {
      discipline: key,
      planned: 0,
      completed: 0,
      accuracy: 0,
      difficulty: 0,
    };

    current.planned += item.planned_questions;
    current.completed += item.completed_today;
    current.difficulty = Math.max(current.difficulty, (item.priority_score / maxScore) * 100);
    acc[key] = current;
    return acc;
  }, {});

  return Object.values(grouped)
    .map((item) => ({
      ...item,
      accuracy: item.planned > 0 ? (item.completed / item.planned) * 100 : 0,
      difficulty: clampPercent(item.difficulty),
    }))
    .sort((a, b) => b.difficulty - a.difficulty)
    .slice(0, 5);
}

function HeroStudyCard({
  focus,
  isLoading,
  fallbackTitle,
  fallbackDescription,
  onRegister,
}: {
  focus: StudyPlanItem | undefined;
  isLoading: boolean;
  fallbackTitle: string;
  fallbackDescription: string;
  onRegister: (item: StudyPlanItem) => void;
}) {
  const title = focus ? focus.subject_name : isLoading ? "Carregando plano..." : fallbackTitle;
  const description = focus ? `${focus.block_name} / ${focus.discipline}` : fallbackDescription;
  const progress = focus ? clampPercent(focus.progress_ratio * 100) : 0;

  return (
    <section className="app-hero">
      <div className="min-w-0">
        <p className="text-sm font-semibold uppercase text-sky-300">Onde paramos?</p>
        <h1 className="mt-3 max-w-4xl text-3xl font-bold leading-tight text-white sm:text-5xl">
          {focus ? `Continuar: ${title}` : title}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">{description}</p>
      </div>

      <div className="flex flex-col gap-4 sm:min-w-72">
        <button className="app-primary-action" disabled={!focus} onClick={() => focus && onRegister(focus)}>
          Iniciar estudo
        </button>
        <div>
          <div className="flex items-center justify-between text-sm text-slate-400">
            <span>{focus ? `${focus.completed_today}/${focus.planned_questions} questoes hoje` : "Sem progresso"}</span>
            <span>{progress}%</span>
          </div>
          <div className="app-progress mt-2">
            <div className="app-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}

function ConsistencyWidget({ activity }: { activity: ActivityItem[] }) {
  const visibleWeeks = 12;
  const visibleDays = visibleWeeks * 7;
  const countsByDay = useMemo(() => {
    return activity.reduce<Record<string, number>>((acc, item) => {
      const parsed = new Date(item.created_at);
      if (!Number.isNaN(parsed.getTime())) {
        const key = getLocalDateKey(parsed);
        acc[key] = (acc[key] ?? 0) + 1;
      }
      return acc;
    }, {});
  }, [activity]);

  const days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: visibleDays }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (visibleDays - 1 - index));
      const key = getLocalDateKey(date);
      const count = countsByDay[key] ?? 0;
      return { key, count };
    });
  }, [countsByDay]);

  const activeDays = days.filter((day) => day.count > 0).length;
  const weeks = useMemo(() => {
    return Array.from({ length: visibleWeeks }, (_, weekIndex) => {
      const start = weekIndex * 7;
      return days.slice(start, start + 7);
    });
  }, [days]);
  const monthLabels = useMemo(() => {
    const seen = new Set<string>();
    return weeks.map((week) => {
      const firstDay = week[0];
      if (!firstDay) {
        return "";
      }

      const month = new Date(`${firstDay.key}T00:00:00`).toLocaleDateString("pt-BR", { month: "short" });
      if (seen.has(month)) {
        return "";
      }
      seen.add(month);
      return month.replace(".", "");
    });
  }, [weeks]);

  return (
    <section className="app-card lg:col-span-8">
      <CardHeader eyebrow="01" title="Ritmo de estudo" value={`${activeDays} dias ativos`} />

      <div className="mt-6 overflow-x-auto pb-1">
        <div className="min-w-[620px]">
          <div className="ml-8 grid grid-cols-12 gap-1.5 text-[11px] text-slate-500">
            {monthLabels.map((label, index) => (
              <span key={`${label}-${index}`} className="h-4 truncate">
                {label}
              </span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-[1.55rem_1fr] gap-2">
            <div className="grid grid-rows-7 gap-1.5 text-[10px] leading-3 text-slate-500">
              <span />
              <span>Seg</span>
              <span />
              <span>Qua</span>
              <span />
              <span>Sex</span>
              <span />
            </div>

            <div className="grid grid-cols-12 gap-1.5">
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-rows-7 gap-1.5">
                  {week.map((day) => {
                    const level =
                      day.count === 0
                        ? "bg-slate-800/90"
                        : day.count === 1
                          ? "bg-emerald-950"
                          : day.count === 2
                            ? "bg-emerald-700"
                            : "bg-emerald-400";

                    return (
                      <div
                        key={day.key}
                        className={`h-3 w-3 rounded-[3px] border border-black/20 ${level}`}
                        title={`${day.key}: ${day.count} atividade${day.count === 1 ? "" : "s"}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
        <span>Menos</span>
        <div className="flex gap-1">
          <span className="h-3 w-3 rounded-[3px] bg-slate-800" />
          <span className="h-3 w-3 rounded-[3px] bg-emerald-950" />
          <span className="h-3 w-3 rounded-[3px] bg-emerald-700" />
          <span className="h-3 w-3 rounded-[3px] bg-emerald-400" />
        </div>
        <span>Mais</span>
      </div>
    </section>
  );
}

function ReviewWidget({ reviews }: { reviews: TodayItem[] }) {
  const visibleReviews = reviews.slice(0, 3);

  return (
    <section className="app-card lg:col-span-4">
      <CardHeader eyebrow="02" title="Minhas revisoes" value={`${reviews.length} hoje`} />

      <div className="mt-5 space-y-3">
        {visibleReviews.length === 0 ? (
          <p className="app-empty-state">Nenhuma revisao vencida por enquanto.</p>
        ) : (
          visibleReviews.map((review, index) => (
            <div key={review.id ?? `${review.title}-${index}`} className="flex items-start gap-3 rounded-lg bg-white/[0.03] p-3">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">{review.title}</p>
                {review.description ? <p className="mt-1 truncate text-sm text-slate-500">{review.description}</p> : null}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function PerformanceWidget({ performance }: { performance: SubjectPerformance[] }) {
  const radarItems = performance.length > 0 ? performance : [{ discipline: "Sem dados", planned: 0, completed: 0, accuracy: 0, difficulty: 0 }];
  const center = 82;
  const radius = 58;
  const points = radarItems.map((item, index) => {
    const angle = (Math.PI * 2 * index) / radarItems.length - Math.PI / 2;
    const value = Math.max(item.accuracy, item.difficulty) / 100;
    return `${center + Math.cos(angle) * radius * value},${center + Math.sin(angle) * radius * value}`;
  });

  return (
    <section className="app-card lg:col-span-8">
      <CardHeader eyebrow="03" title="Desempenho por materia" value="TRI" />

      <div className="mt-5 grid gap-6 xl:grid-cols-[180px_1fr]">
        <svg className="mx-auto h-44 w-44 overflow-visible" viewBox="0 0 164 164" role="img" aria-label="Radar de desempenho">
          {[0.33, 0.66, 1].map((scale) => (
            <circle key={scale} cx={center} cy={center} r={radius * scale} fill="none" stroke="rgba(148,163,184,0.18)" />
          ))}
          {radarItems.map((_, index) => {
            const angle = (Math.PI * 2 * index) / radarItems.length - Math.PI / 2;
            return (
              <line
                key={index}
                x1={center}
                y1={center}
                x2={center + Math.cos(angle) * radius}
                y2={center + Math.sin(angle) * radius}
                stroke="rgba(148,163,184,0.16)"
              />
            );
          })}
          <polygon points={points.join(" ")} fill="rgba(56, 189, 248, 0.18)" stroke="#38bdf8" strokeWidth="2" />
        </svg>

        <div className="space-y-4">
          <div className="flex gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-2"><span className="h-2 w-4 rounded-full bg-rose-400" />Dificuldade</span>
            <span className="inline-flex items-center gap-2"><span className="h-2 w-4 rounded-full bg-sky-400" />Acuracia</span>
          </div>
          {performance.length === 0 ? (
            <p className="app-empty-state">O grafico aparece quando o plano diario tiver focos carregados.</p>
          ) : (
            performance.map((item) => (
              <div key={item.discipline}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase text-slate-200">{item.discipline}</p>
                  <p className="text-xs text-slate-500">
                    {item.completed}/{item.planned}
                  </p>
                </div>
                <div className="mt-2 grid gap-2">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-rose-400" style={{ width: `${item.difficulty}%` }} />
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-sky-400" style={{ width: `${clampPercent(item.accuracy)}%` }} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function PomodoroWidget() {
  const [seconds, setSeconds] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!isRunning || seconds <= 0) {
      return;
    }

    const timerId = window.setInterval(() => {
      setSeconds((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [isRunning, seconds]);

  useEffect(() => {
    if (seconds === 0) {
      setIsRunning(false);
    }
  }, [seconds]);

  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remainingSeconds = String(seconds % 60).padStart(2, "0");
  const progress = ((25 * 60 - seconds) / (25 * 60)) * 100;
  const tickMarks = Array.from({ length: 12 }, (_, index) => index);

  return (
    <section className="app-card lg:col-span-4">
      <CardHeader eyebrow="04" title="Cronometro Pomodoro" value={isRunning ? "ativo" : "pronto"} />

      <div className="mt-6 grid gap-6 sm:grid-cols-[140px_1fr] sm:items-center lg:grid-cols-1 xl:grid-cols-[140px_1fr]">
        <div className="pomodoro-ring" style={{ "--pomodoro-progress": `${progress}%` } as CSSProperties}>
          {tickMarks.map((tick) => (
            <span key={tick} className="pomodoro-tick" style={{ transform: `rotate(${tick * 30}deg)` }} />
          ))}
          <div className="pomodoro-face">
            <span className="pomodoro-hand" style={{ transform: `rotate(${progress * 3.6}deg)` }} />
            <span className="text-2xl font-bold text-white">
              {minutes}:{remainingSeconds}
            </span>
          </div>
        </div>

        <div>
          <p className="text-sm text-slate-500">Foco de 25 minutos</p>
          <button className="app-primary-action mt-4 w-full" onClick={() => setIsRunning((current) => !current)}>
            {isRunning ? "Pausar" : "Iniciar pomodoro"}
          </button>
          <button
            className="app-secondary-action mt-3 w-full"
            onClick={() => {
              setIsRunning(false);
              setSeconds(25 * 60);
            }}
          >
            Resetar
          </button>
        </div>
      </div>
    </section>
  );
}

function CardHeader({ eyebrow, title, value }: { eyebrow: string; title: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase text-slate-500">{eyebrow}</p>
        <h2 className="mt-1 text-base font-semibold text-white">{title}</h2>
      </div>
      <span className="rounded-full bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-400">{value}</span>
    </div>
  );
}

function RegisterQuestionsModal({
  item,
  onClose,
}: {
  item: StudyPlanItem;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RegisterFormState>({
    ...defaultRegisterForm,
    quantity: item.planned_questions,
    correctCount: Math.max(0, Math.round(item.planned_questions * 0.6)),
  });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      ...defaultRegisterForm,
      quantity: item.planned_questions,
      correctCount: Math.max(0, Math.round(item.planned_questions * 0.6)),
    });
    setMessage(null);
  }, [item]);

  const mutation = useMutation({
    mutationFn: saveQuestionAttemptsBulk,
    onSuccess: (response) => {
      setMessage(
        `Registradas ${response.created_attempts} questoes. Proxima revisao: ${response.next_review_date ?? "a definir"}.`,
      );
      queryClient.invalidateQueries({ queryKey: ["today"] });
      queryClient.invalidateQueries({ queryKey: ["study-plan-today"] });
      queryClient.invalidateQueries({ queryKey: ["activity-recent"] });
      window.setTimeout(onClose, 900);
    },
    onError: () => {
      setMessage("Nao foi possivel registrar agora.");
    },
  });

  function update<K extends keyof RegisterFormState>(key: K, value: RegisterFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Math.max(1, form.quantity);
    const correctCount = Math.min(Math.max(0, form.correctCount), quantity);

    mutation.mutate({
      date: new Date().toISOString().slice(0, 10),
      discipline: item.discipline,
      block_id: item.block_id,
      subject_id: item.subject_id,
      source: form.source.trim() || null,
      quantity,
      correct_count: correctCount,
      difficulty_bank: form.difficultyBank,
      difficulty_personal: form.difficultyPersonal,
      elapsed_seconds: form.averageSeconds > 0 ? form.averageSeconds : null,
      confidence: form.confidence,
      error_type: form.errorType.trim() || null,
      notes: form.notes.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <form className="app-card w-full max-w-lg" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-sky-300">Registro rapido</p>
            <h2 className="mt-2 text-xl font-semibold text-white">{item.subject_name}</h2>
            <p className="mt-1 text-sm text-slate-500">{item.discipline} / {item.block_name}</p>
          </div>
          <button type="button" className="app-secondary-action px-3 py-2 text-xs" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-400">
            Quantidade feita
            <input className="app-input mt-1" type="number" min={1} value={form.quantity} onChange={(event) => update("quantity", Number(event.target.value))} />
          </label>
          <label className="text-sm text-slate-400">
            Acertos
            <input className="app-input mt-1" type="number" min={0} max={form.quantity} value={form.correctCount} onChange={(event) => update("correctCount", Number(event.target.value))} />
          </label>
          <label className="text-sm text-slate-400">
            Fonte
            <input className="app-input mt-1" value={form.source} onChange={(event) => update("source", event.target.value)} placeholder="Lista, livro, simulado..." />
          </label>
          <label className="text-sm text-slate-400">
            Tempo medio por questao
            <input className="app-input mt-1" type="number" min={0} value={form.averageSeconds} onChange={(event) => update("averageSeconds", Number(event.target.value))} />
          </label>
          <label className="text-sm text-slate-400">
            Dificuldade do banco
            <select className="app-input mt-1" value={form.difficultyBank} onChange={(event) => update("difficultyBank", event.target.value as RegisterFormState["difficultyBank"])}>
              <option value="facil">Facil</option>
              <option value="media">Media</option>
              <option value="dificil">Dificil</option>
            </select>
          </label>
          <label className="text-sm text-slate-400">
            Dificuldade pessoal
            <select className="app-input mt-1" value={form.difficultyPersonal} onChange={(event) => update("difficultyPersonal", event.target.value as RegisterFormState["difficultyPersonal"])}>
              <option value="facil">Facil</option>
              <option value="media">Media</option>
              <option value="dificil">Dificil</option>
            </select>
          </label>
          <label className="text-sm text-slate-400">
            Confianca
            <select className="app-input mt-1" value={form.confidence} onChange={(event) => update("confidence", event.target.value as RegisterFormState["confidence"])}>
              <option value="baixa">Baixa</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </label>
          <label className="text-sm text-slate-400">
            Erro mais comum
            <input className="app-input mt-1" value={form.errorType} onChange={(event) => update("errorType", event.target.value)} placeholder="conceito, atencao, tempo..." />
          </label>
        </div>

        <label className="mt-3 block text-sm text-slate-400">
          Observacoes
          <textarea className="app-input mt-1 min-h-20 resize-none" value={form.notes} onChange={(event) => update("notes", event.target.value)} />
        </label>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">{message}</p>
          <button type="submit" className="app-primary-action px-4 py-2 text-sm" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar registro"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function TodayPage() {
  const [registeringItem, setRegisteringItem] = useState<StudyPlanItem | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["today"],
    queryFn: getToday,
  });
  const { data: studyPlan, isLoading: isStudyPlanLoading } = useQuery({
    queryKey: ["study-plan-today"],
    queryFn: getStudyPlanToday,
  });
  const { data: recentActivity = [] } = useQuery({
    queryKey: ["activity-recent"],
    queryFn: () => getRecentActivity(100),
  });

  const performance = useMemo(() => groupPerformance(studyPlan), [studyPlan]);
  const focus = studyPlan?.items[0];

  if (isLoading) {
    return <main className="min-h-screen px-6 py-10 text-slate-100">Carregando seu foco de hoje...</main>;
  }

  if (isError || !data) {
    return <main className="min-h-screen px-6 py-10 text-slate-100">Nao foi possivel conectar ao backend.</main>;
  }

  return (
    <main className="px-5 py-6 text-slate-100 sm:px-8 lg:px-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-12"
      >
        <div className="lg:col-span-12">
          <HeroStudyCard
            focus={focus}
            isLoading={isStudyPlanLoading}
            fallbackTitle={data.priority.title}
            fallbackDescription={data.priority.description}
            onRegister={setRegisteringItem}
          />
        </div>
        <ConsistencyWidget activity={recentActivity} />
        <ReviewWidget reviews={data.due_reviews} />
        <PerformanceWidget performance={performance} />
        <PomodoroWidget />
      </motion.div>

      {registeringItem ? <RegisterQuestionsModal item={registeringItem} onClose={() => setRegisteringItem(null)} /> : null}
    </main>
  );
}
