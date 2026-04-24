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

function buildHeroPoints({
  focus,
  dueReviews,
  forgottenSubjects,
  totalQuestions,
}: {
  focus: StudyPlanItem | undefined;
  dueReviews: number;
  forgottenSubjects: number;
  totalQuestions: number;
}): string[] {
  const points = [
    focus
      ? `Hoje o bloco principal eh ${focus.block_name.toLowerCase()} em ${focus.discipline.toLowerCase()}.`
      : "Seu proximo passo aparece aqui assim que houver um foco priorizado.",
    dueReviews > 0
      ? `${dueReviews} revis${dueReviews === 1 ? "ao" : "oes"} vencida${dueReviews === 1 ? "" : "s"} pedem manutencao.`
      : "Nenhuma revisao vencida esta competindo com o foco principal agora.",
    totalQuestions > 0
      ? `${totalQuestions} questoes planejadas no dia para manter carga segura e executavel.`
      : "A carga diaria ainda vai crescer conforme voce registrar execucao real.",
  ];

  if (forgottenSubjects > 0) {
    points.push(`${forgottenSubjects} assunto${forgottenSubjects === 1 ? "" : "s"} sem contato recente entram no radar.`);
  }

  return points.slice(0, 4);
}

function HeroSection({
  focus,
  priorityTitle,
  priorityDescription,
  totalQuestions,
  focusCount,
  dueReviews,
  forgottenSubjects,
  onRegister,
}: {
  focus: StudyPlanItem | undefined;
  priorityTitle: string;
  priorityDescription: string;
  totalQuestions: number;
  focusCount: number;
  dueReviews: number;
  forgottenSubjects: number;
  onRegister: (item: StudyPlanItem) => void;
}) {
  const progress = focus ? clampPercent(focus.progress_ratio * 100) : 0;
  const heroPoints = buildHeroPoints({
    focus,
    dueReviews,
    forgottenSubjects,
    totalQuestions,
  });

  return (
    <section className="today-hero">
      <div className="today-hero-ornament today-hero-ornament-left" aria-hidden="true">
        <span>📚</span>
      </div>
      <div className="today-hero-ornament today-hero-ornament-top" aria-hidden="true">
        <span>🧪</span>
      </div>
      <div className="today-hero-ornament today-hero-ornament-right" aria-hidden="true">
        <span>🧠</span>
      </div>

      <p className="today-kicker">Foco do dia</p>
      <h1 className="today-hero-title">O estudo de hoje, sem ruido.</h1>
      <p className="today-hero-copy">
        {focus
          ? `Comece por ${focus.subject_name} e avance no bloco ${focus.block_name}. O plano continua leve, mas orientado pela trilha.`
          : `${priorityTitle}. ${priorityDescription}`}
      </p>

      <div className="today-hero-points">
        {heroPoints.map((point) => (
          <p key={point}>{point}</p>
        ))}
      </div>

      <div className="today-hero-actions">
        <button className="app-primary-action app-primary-action-blue" disabled={!focus} onClick={() => focus && onRegister(focus)}>
          {focus ? "Comecar sessao principal" : "Aguardando foco"}
        </button>
        <div className="today-hero-meta">
          <span>{focusCount} focos ativos</span>
          <span>{dueReviews} revisoes</span>
          <span>{Math.max(forgottenSubjects, 0)} lacunas</span>
        </div>
      </div>

      <div className="today-hero-progress">
        <div className="today-subtle-text flex items-center justify-between gap-3 text-sm">
          <span>{focus ? `${focus.completed_today}/${focus.planned_questions} questoes feitas` : "Sem execucao registrada hoje"}</span>
          <span>{progress}%</span>
        </div>
        <div className="app-progress mt-2">
          <div className="app-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </section>
  );
}

function FocusBoard({
  focus,
  items,
  onRegister,
}: {
  focus: StudyPlanItem | undefined;
  items: StudyPlanItem[];
  onRegister: (item: StudyPlanItem) => void;
}) {
  const visibleItems = items.slice(0, 4);

  return (
    <section className="today-panel today-panel-wide">
      <PanelHeader
        eyebrow="Sessao principal"
        title={focus ? focus.subject_name : "Plano em construcao"}
        description={focus ? `${focus.discipline} / ${focus.block_name}` : "Registre questoes para o sistema calibrar seu proximo passo."}
      />

      <div className="today-focus-grid">
        {visibleItems.length === 0 ? (
          <p className="app-empty-state">
            Ainda nao ha blocos no plano de hoje. Assim que houver dados suficientes, esta area passa a mostrar o proximo degrau da trilha.
          </p>
        ) : (
          visibleItems.map((item) => {
            const progress = clampPercent(item.progress_ratio * 100);

            return (
              <article key={`${item.subject_id}-${item.block_id}`} className="today-focus-card">
                <div className="today-focus-card-head">
                  <div>
                    <p className="today-chip">{item.discipline}</p>
                    <h3>{item.subject_name}</h3>
                    <p className="today-focus-card-copy">{item.primary_reason}</p>
                  </div>
                  <span className="today-focus-icon">{item === focus ? "✦" : "•"}</span>
                </div>

                <div className="today-focus-stats">
                  <span>{item.block_name}</span>
                  <span>{item.remaining_today} restantes</span>
                </div>

                <div className="app-progress">
                  <div className="app-progress-fill" style={{ width: `${progress}%` }} />
                </div>

                <div className="today-focus-footer">
                  <strong>{item.planned_questions} questoes</strong>
                  <button className="app-secondary-action app-outline-action" onClick={() => onRegister(item)}>
                    Registrar
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function ReviewWidget({ reviews, riskBlocks }: { reviews: TodayItem[]; riskBlocks: TodayItem[] }) {
  const visibleItems = [...reviews, ...riskBlocks].slice(0, 4);

  return (
    <section className="today-panel">
      <PanelHeader
        eyebrow="Memoria"
        title="Nao deixe a trilha apagar"
        description="Revisoes vencidas e blocos em risco aparecem aqui antes de virarem atrito."
      />

      <div className="mt-5 space-y-3">
        {visibleItems.length === 0 ? (
          <p className="app-empty-state">Nenhuma revisao vencida ou bloco em risco no momento.</p>
        ) : (
          visibleItems.map((item, index) => (
            <div key={item.id ?? `${item.title}-${index}`} className="today-list-row">
              <span className="today-list-bullet" aria-hidden="true" />
              <div className="min-w-0">
                <p className="today-row-title truncate text-sm">{item.title}</p>
                {item.description ? <p className="today-row-copy mt-1 text-sm">{item.description}</p> : null}
              </div>
            </div>
          ))
        )}
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
    <section className="today-panel today-panel-wide">
      <PanelHeader
        eyebrow="Constancia"
        title="Dias em que voce apareceu"
        description="Sem cronograma rigido. So visibilidade honesta da frequencia recente."
      />

      <div className="mt-6 overflow-x-auto pb-1">
        <div className="min-w-[620px]">
          <div className="today-heatmap-label ml-8 grid grid-cols-12 gap-1.5 text-[11px]">
            {monthLabels.map((label, index) => (
              <span key={`${label}-${index}`} className="h-4 truncate">
                {label}
              </span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-[1.55rem_1fr] gap-2">
            <div className="today-heatmap-label grid grid-rows-7 gap-1.5 text-[10px] leading-3">
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
                        ? "heatmap-level-0"
                        : day.count === 1
                          ? "heatmap-level-1"
                          : day.count === 2
                            ? "heatmap-level-2"
                            : "heatmap-level-3";

                    return (
                      <div
                        key={day.key}
                        className={`heatmap-cell ${level}`}
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

      <div className="today-heatmap-label mt-5 flex items-center justify-between text-xs">
        <span>{activeDays} dias ativos</span>
        <div className="flex gap-1">
          <span className="heatmap-legend-cell heatmap-level-0" />
          <span className="heatmap-legend-cell heatmap-level-1" />
          <span className="heatmap-legend-cell heatmap-level-2" />
          <span className="heatmap-legend-cell heatmap-level-3" />
        </div>
        <span>mais intensidade</span>
      </div>
    </section>
  );
}

function PerformanceWidget({ performance }: { performance: SubjectPerformance[] }) {
  return (
    <section className="today-panel">
      <PanelHeader
        eyebrow="Distribuicao"
        title="Onde o dia esta mais pesado"
        description="A trilha segue priorizando sem deixar o estudo virar explosao de carga."
      />

      <div className="mt-5 space-y-4">
        {performance.length === 0 ? (
          <p className="app-empty-state">Quando houver focos no plano, esta area mostra onde a sessao de hoje esta mais concentrada.</p>
        ) : (
          performance.map((item) => (
            <div key={item.discipline} className="today-performance-row">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="today-row-title text-sm">{item.discipline}</p>
                  <p className="today-row-copy text-xs">
                    {item.completed}/{item.planned} feitas
                  </p>
                </div>
                <span className="today-performance-pill">{item.difficulty}% peso</span>
              </div>

              <div className="mt-3 grid gap-2">
                <div className="app-progress">
                  <div className="app-progress-fill" style={{ width: `${item.difficulty}%` }} />
                </div>
                <div className="app-progress app-progress-muted">
                  <div className="app-progress-fill app-progress-fill-secondary" style={{ width: `${clampPercent(item.accuracy)}%` }} />
                </div>
              </div>
            </div>
          ))
        )}
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
    <section className="today-panel">
      <PanelHeader
        eyebrow="Ritmo"
        title="Bloco curto de aquecimento"
        description="Use um ciclo breve antes de registrar o resultado da sessao principal."
      />

      <div className="mt-6 grid gap-6 sm:grid-cols-[150px_1fr] sm:items-center">
        <div className="pomodoro-ring" style={{ "--pomodoro-progress": `${progress}%` } as CSSProperties}>
          {tickMarks.map((tick) => (
            <span key={tick} className="pomodoro-tick" style={{ transform: `rotate(${tick * 30}deg)` }} />
          ))}
          <div className="pomodoro-face">
            <span className="pomodoro-hand" style={{ transform: `rotate(${progress * 3.6}deg)` }} />
            <span className="today-timer-value text-2xl font-black">
              {minutes}:{remainingSeconds}
            </span>
          </div>
        </div>

        <div>
          <p className="today-row-copy text-sm leading-6">Timer compacto, sem virar dashboard. O objetivo aqui eh entrar em fluxo com carga segura.</p>
          <button className="app-primary-action app-primary-action-blue mt-4 w-full" onClick={() => setIsRunning((current) => !current)}>
            {isRunning ? "Pausar bloco" : "Iniciar bloco"}
          </button>
          <button
            className="app-secondary-action app-outline-action mt-3 w-full"
            onClick={() => {
              setIsRunning(false);
              setSeconds(25 * 60);
            }}
          >
            Recomecar
          </button>
        </div>
      </div>
    </section>
  );
}

function PanelHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="today-kicker">{eyebrow}</p>
      <h2 className="today-panel-title">{title}</h2>
      <p className="today-panel-copy">{description}</p>
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
    <div className="today-modal-backdrop">
      <form className="today-modal" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="today-kicker">Registro da sessao</p>
            <h2 className="today-panel-title mt-3">{item.subject_name}</h2>
            <p className="today-panel-copy">
              {item.discipline} / {item.block_name}
            </p>
          </div>
          <button type="button" className="app-secondary-action app-outline-action px-3 py-2 text-xs" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="today-form-label">
            Questoes feitas
            <input className="app-input mt-1" type="number" min={1} value={form.quantity} onChange={(event) => update("quantity", Number(event.target.value))} />
          </label>
          <label className="today-form-label">
            Acertos
            <input className="app-input mt-1" type="number" min={0} max={form.quantity} value={form.correctCount} onChange={(event) => update("correctCount", Number(event.target.value))} />
          </label>
          <label className="today-form-label">
            Fonte
            <input className="app-input mt-1" value={form.source} onChange={(event) => update("source", event.target.value)} placeholder="Lista, livro, simulado..." />
          </label>
          <label className="today-form-label">
            Ritmo medio por questao
            <input className="app-input mt-1" type="number" min={0} value={form.averageSeconds} onChange={(event) => update("averageSeconds", Number(event.target.value))} />
          </label>
          <label className="today-form-label">
            Dificuldade do banco
            <select className="app-input mt-1" value={form.difficultyBank} onChange={(event) => update("difficultyBank", event.target.value as RegisterFormState["difficultyBank"])}>
              <option value="facil">Facil</option>
              <option value="media">Media</option>
              <option value="dificil">Dificil</option>
            </select>
          </label>
          <label className="today-form-label">
            Dificuldade pessoal
            <select className="app-input mt-1" value={form.difficultyPersonal} onChange={(event) => update("difficultyPersonal", event.target.value as RegisterFormState["difficultyPersonal"])}>
              <option value="facil">Facil</option>
              <option value="media">Media</option>
              <option value="dificil">Dificil</option>
            </select>
          </label>
          <label className="today-form-label">
            Confianca
            <select className="app-input mt-1" value={form.confidence} onChange={(event) => update("confidence", event.target.value as RegisterFormState["confidence"])}>
              <option value="baixa">Baixa</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </label>
          <label className="today-form-label">
            Principal tropeco
            <input className="app-input mt-1" value={form.errorType} onChange={(event) => update("errorType", event.target.value)} placeholder="conceito, atencao, tempo..." />
          </label>
        </div>

        <label className="today-form-label mt-3 block">
          Observacoes
          <textarea className="app-input mt-1 min-h-20 resize-none" value={form.notes} onChange={(event) => update("notes", event.target.value)} />
        </label>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="today-row-copy text-sm">{message}</p>
          <button type="submit" className="app-primary-action app-primary-action-blue px-4 py-2 text-sm" disabled={mutation.isPending}>
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
    return <main className="today-status">Carregando seu foco de hoje...</main>;
  }

  if (isError || !data) {
    return <main className="today-status">Nao foi possivel conectar ao backend.</main>;
  }

  return (
    <main className="today-page">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="today-layout"
      >
        <HeroSection
          focus={focus}
          priorityTitle={data.priority.title}
          priorityDescription={data.priority.description}
          totalQuestions={studyPlan?.summary.total_questions ?? 0}
          focusCount={studyPlan?.summary.focus_count ?? 0}
          dueReviews={data.metrics.due_reviews}
          forgottenSubjects={data.metrics.forgotten_subjects}
          onRegister={setRegisteringItem}
        />

        <FocusBoard focus={focus} items={studyPlan?.items ?? []} onRegister={setRegisteringItem} />
        <ReviewWidget reviews={data.due_reviews} riskBlocks={data.risk_blocks} />
        <ConsistencyWidget activity={recentActivity} />
        <PerformanceWidget performance={performance} />
        <PomodoroWidget />
      </motion.div>

      {registeringItem ? <RegisterQuestionsModal item={registeringItem} onClose={() => setRegisteringItem(null)} /> : null}
      {isStudyPlanLoading ? <p className="today-sync-note mt-4 text-center text-sm">Atualizando plano de hoje...</p> : null}
    </main>
  );
}
