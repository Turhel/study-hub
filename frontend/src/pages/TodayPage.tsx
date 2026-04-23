import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";

import { getRecentActivity, getStudyPlanToday, getToday, saveQuestionAttemptsBulk } from "../lib/api";
import type {
  ActivityItem,
  QuestionAttemptBulkPayload,
  StudyPlanItem,
  StudyPlanTodayResponse,
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
  const title = focus ? `Continuar: ${focus.subject_name}` : isLoading ? "Carregando plano..." : fallbackTitle;
  const description = focus
    ? `${focus.block_name} / ${focus.discipline}`
    : fallbackDescription;
  const progress = focus ? clampPercent(focus.progress_ratio * 100) : 0;

  return (
    <section className="bento-card-feature min-h-[320px] p-6 sm:p-8 lg:col-span-12">
      <div className="flex h-full flex-col justify-between gap-10">
        <div>
          <p className="pixel-font text-sm font-bold uppercase text-focus-400">Study Hub</p>
          <h1 className="mt-8 max-w-3xl text-3xl font-semibold leading-tight text-zinc-50 sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">{description}</p>
        </div>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <button
            className="hero-play-button"
            disabled={!focus}
            onClick={() => focus && onRegister(focus)}
            aria-label="Continuar estudo"
            title="Continuar estudo"
          >
            <span />
          </button>
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <div className="flex items-center justify-between gap-3 text-sm text-zinc-400">
              <span>{focus ? `${focus.completed_today}/${focus.planned_questions} questoes hoje` : "Sem progresso"}</span>
              <span>{progress}%</span>
            </div>
            <div className="study-plan-progress mt-3">
              <div className="study-plan-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              {focus?.primary_reason ?? "O plano aparece aqui quando o backend retorna um foco para hoje."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ConsistencyWidget({ activity }: { activity: ActivityItem[] }) {
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
    return Array.from({ length: 35 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (34 - index));
      const key = getLocalDateKey(date);
      const count = countsByDay[key] ?? 0;
      return { key, count };
    });
  }, [countsByDay]);

  const activeDays = days.filter((day) => day.count > 0).length;

  return (
    <section className="bento-card p-5 lg:col-span-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="pixel-font text-sm font-bold uppercase text-ember-400">Sua consistencia</p>
          <p className="mt-2 text-sm text-zinc-500">Ultimos 35 dias</p>
        </div>
        <p className="pixel-font text-3xl font-bold text-zinc-50">{activeDays}</p>
      </div>

      <div className="mt-7 grid grid-cols-7 gap-2">
        {days.map((day) => {
          const level =
            day.count === 0
              ? "bg-zinc-900"
            : day.count === 1
                ? "bg-[#102417]"
                : day.count === 2
                  ? "bg-[#1f6f45]"
                  : "bg-focus-400";

          return <div key={day.key} className={`aspect-square rounded-[3px] border border-black/40 ${level}`} title={day.key} />;
        })}
      </div>

      <div className="mt-5 flex items-center justify-between text-xs text-zinc-500">
        <span>Menos</span>
        <div className="flex gap-1">
          <span className="h-3 w-3 rounded-[2px] bg-zinc-900" />
          <span className="h-3 w-3 rounded-[2px] bg-[#102417]" />
          <span className="h-3 w-3 rounded-[2px] bg-[#1f6f45]" />
          <span className="h-3 w-3 rounded-[2px] bg-focus-400" />
        </div>
        <span>Mais</span>
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
    <section className="bento-card p-5 lg:col-span-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="pixel-font text-sm font-bold uppercase text-focus-400">Desempenho por materia</p>
          <p className="mt-2 text-sm text-zinc-500">Dificuldade e acuracia atual</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[170px_1fr]">
        <svg className="mx-auto h-40 w-40 overflow-visible" viewBox="0 0 164 164" role="img" aria-label="Radar de desempenho">
          {[0.33, 0.66, 1].map((scale) => (
            <circle key={scale} cx={center} cy={center} r={radius * scale} fill="none" stroke="rgba(255,255,255,0.08)" />
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
                stroke="rgba(255,255,255,0.08)"
              />
            );
          })}
          <polygon points={points.join(" ")} fill="rgba(125, 220, 154, 0.2)" stroke="#7ddc9a" strokeWidth="2" />
        </svg>

        <div className="space-y-4">
          <div className="flex gap-4 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-2"><span className="h-2 w-4 rounded-full bg-ember-400" />Dificuldade</span>
            <span className="inline-flex items-center gap-2"><span className="h-2 w-4 rounded-full bg-focus-400" />Acuracia</span>
          </div>
          {performance.length === 0 ? (
            <p className="bento-surface p-4 text-sm leading-6 text-zinc-500">
              O grafico aparece quando o plano diario tiver focos carregados.
            </p>
          ) : (
            performance.map((item) => (
              <div key={item.discipline}>
                <div className="flex items-center justify-between gap-3">
                  <p className="pixel-font text-xs font-bold uppercase text-zinc-200">{item.discipline}</p>
                  <p className="text-xs text-zinc-500">
                    {item.completed}/{item.planned}
                  </p>
                </div>
                <div className="mt-2 grid gap-2">
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                    <div className="h-full rounded-full bg-ember-400" style={{ width: `${item.difficulty}%` }} />
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                    <div className="h-full rounded-full bg-focus-400" style={{ width: `${clampPercent(item.accuracy)}%` }} />
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

  return (
    <section className="bento-card p-5 lg:col-span-3">
      <p className="pixel-font text-sm font-bold uppercase text-ember-400">Pomodoro teste</p>
      <div className="mt-7 grid place-items-center">
        <div className="pomodoro-ring" style={{ "--pomodoro-progress": `${progress}%` } as CSSProperties}>
          <span className="pixel-font text-3xl font-bold text-zinc-50">
            {minutes}:{remainingSeconds}
          </span>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button className="pixel-button px-3 py-2 text-sm" onClick={() => setIsRunning((current) => !current)}>
          {isRunning ? "Pausar" : "Iniciar"}
        </button>
        <button
          className="pixel-button-muted px-3 py-2 text-sm"
          onClick={() => {
            setIsRunning(false);
            setSeconds(25 * 60);
          }}
        >
          Reset
        </button>
      </div>
    </section>
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
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
      <form className="bento-card w-full max-w-lg p-5" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="pixel-font text-xs font-bold uppercase text-focus-400">Registro rapido</p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-50">{item.subject_name}</h2>
            <p className="mt-1 text-sm text-zinc-500">{item.discipline} / {item.block_name}</p>
          </div>
          <button type="button" className="pixel-button-muted px-3 py-2 text-xs" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-zinc-400">
            Quantidade feita
            <input
              className="pixel-input mt-1"
              type="number"
              min={1}
              value={form.quantity}
              onChange={(event) => update("quantity", Number(event.target.value))}
            />
          </label>
          <label className="text-sm text-zinc-400">
            Acertos
            <input
              className="pixel-input mt-1"
              type="number"
              min={0}
              max={form.quantity}
              value={form.correctCount}
              onChange={(event) => update("correctCount", Number(event.target.value))}
            />
          </label>
          <label className="text-sm text-zinc-400">
            Fonte
            <input
              className="pixel-input mt-1"
              value={form.source}
              onChange={(event) => update("source", event.target.value)}
              placeholder="Lista, livro, simulado..."
            />
          </label>
          <label className="text-sm text-zinc-400">
            Tempo medio por questao
            <input
              className="pixel-input mt-1"
              type="number"
              min={0}
              value={form.averageSeconds}
              onChange={(event) => update("averageSeconds", Number(event.target.value))}
            />
          </label>
          <label className="text-sm text-zinc-400">
            Dificuldade do banco
            <select
              className="pixel-input mt-1"
              value={form.difficultyBank}
              onChange={(event) => update("difficultyBank", event.target.value as RegisterFormState["difficultyBank"])}
            >
              <option value="facil">Facil</option>
              <option value="media">Media</option>
              <option value="dificil">Dificil</option>
            </select>
          </label>
          <label className="text-sm text-zinc-400">
            Dificuldade pessoal
            <select
              className="pixel-input mt-1"
              value={form.difficultyPersonal}
              onChange={(event) => update("difficultyPersonal", event.target.value as RegisterFormState["difficultyPersonal"])}
            >
              <option value="facil">Facil</option>
              <option value="media">Media</option>
              <option value="dificil">Dificil</option>
            </select>
          </label>
          <label className="text-sm text-zinc-400">
            Confianca
            <select
              className="pixel-input mt-1"
              value={form.confidence}
              onChange={(event) => update("confidence", event.target.value as RegisterFormState["confidence"])}
            >
              <option value="baixa">Baixa</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </label>
          <label className="text-sm text-zinc-400">
            Erro mais comum
            <input
              className="pixel-input mt-1"
              value={form.errorType}
              onChange={(event) => update("errorType", event.target.value)}
              placeholder="conceito, atencao, tempo..."
            />
          </label>
        </div>

        <label className="mt-3 block text-sm text-zinc-400">
          Observacoes
          <textarea
            className="pixel-input mt-1 min-h-20 resize-none"
            value={form.notes}
            onChange={(event) => update("notes", event.target.value)}
          />
        </label>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">{message}</p>
          <button type="submit" className="pixel-button px-4 py-2 text-sm" disabled={mutation.isPending}>
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
  const {
    data: studyPlan,
    isLoading: isStudyPlanLoading,
  } = useQuery({
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
    return <main className="min-h-screen bg-ink-950 px-6 py-10 text-zinc-100">Carregando seu foco de hoje...</main>;
  }

  if (isError || !data) {
    return <main className="min-h-screen bg-ink-950 px-6 py-10 text-zinc-100">Nao foi possivel conectar ao backend.</main>;
  }

  return (
    <main className="min-h-screen px-5 py-8 pb-28 text-zinc-100 sm:px-8 lg:px-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-12"
      >
        <HeroStudyCard
          focus={focus}
          isLoading={isStudyPlanLoading}
          fallbackTitle={data.priority.title}
          fallbackDescription={data.priority.description}
          onRegister={setRegisteringItem}
        />
        <ConsistencyWidget activity={recentActivity} />
        <PerformanceWidget performance={performance} />
        <PomodoroWidget />
      </motion.div>

      {registeringItem ? (
        <RegisterQuestionsModal
          item={registeringItem}
          onClose={() => setRegisteringItem(null)}
        />
      ) : null}
    </main>
  );
}
