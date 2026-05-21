import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { saveQuestionAttemptsQuickSync, saveTimerSession } from "../../lib/api";
import { buildTimerSessionPayload, createSession, formatTime, getTimeTone, saveLocalSession } from "../../lib/timer";
import type { QuestionEntry, SessionSetup, SessionSummaryForm, TimerLaunchPreset, TimerSession } from "../../lib/timerTypes";
import QuestionProgress from "./QuestionProgress";
import TimerControls from "./TimerControls";

type FloatingTimerProps = {
  preset?: TimerLaunchPreset | null;
};

type QuickAnswer = {
  isCorrect: boolean | null;
  difficulty: "facil" | "media" | "dificil";
};

const defaultSetup: SessionSetup = {
  discipline: "Matematica",
  block: "Bloco 1",
  subject: "Matematica Basica",
  questionCount: 10,
  targetSecondsPerQuestion: 180,
  mode: "prova",
  questionSource: "external",
  blockId: null,
  subjectId: null,
};

const quickDifficultyLabels: Array<{ value: QuickAnswer["difficulty"]; label: string }> = [
  { value: "facil", label: "Facil" },
  { value: "media", label: "Medio" },
  { value: "dificil", label: "Dificil" },
];

function buildSetupFromPreset(preset?: TimerLaunchPreset | null): SessionSetup {
  if (!preset) {
    return defaultSetup;
  }

  return {
    discipline: preset.discipline || defaultSetup.discipline,
    block: preset.block || defaultSetup.block,
    subject: preset.subject || defaultSetup.subject,
    questionCount: Math.max(1, preset.questionCount || defaultSetup.questionCount),
    targetSecondsPerQuestion: Math.max(15, preset.targetSecondsPerQuestion || defaultSetup.targetSecondsPerQuestion),
    mode: preset.mode || defaultSetup.mode,
    questionSource: preset.questionSource || defaultSetup.questionSource,
    blockId: preset.blockId ?? null,
    subjectId: preset.subjectId ?? null,
  };
}

function tickQuestion(question: QuestionEntry): QuestionEntry {
  if (question.status !== "active") {
    return question;
  }
  return { ...question, elapsedSeconds: question.elapsedSeconds + 1 };
}

function overtimeRatio(elapsedSeconds: number, targetSeconds: number): number {
  if (targetSeconds <= 0 || elapsedSeconds <= targetSeconds) {
    return 0;
  }
  return Math.min((elapsedSeconds - targetSeconds) / targetSeconds, 1);
}

function widgetTone(elapsedSeconds: number, setup: SessionSetup): string {
  if (elapsedSeconds <= setup.targetSecondsPerQuestion) {
    return "text-zinc-50";
  }
  return getTimeTone(elapsedSeconds, setup.targetSecondsPerQuestion, setup.mode);
}

function settleActiveQuestion(question: QuestionEntry, forcedStatus: "completed" | "skipped" | "auto"): QuestionEntry {
  if (forcedStatus === "skipped") {
    return { ...question, status: "skipped", completedAt: Date.now() };
  }
  if (forcedStatus === "completed") {
    return { ...question, status: "completed", completedAt: Date.now() };
  }
  return {
    ...question,
    status: question.elapsedSeconds > 0 ? "completed" : "pending",
    completedAt: question.elapsedSeconds > 0 ? Date.now() : question.completedAt,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function activateQuestion(question: QuestionEntry): QuestionEntry {
  return {
    ...question,
    status: "active",
    startedAt: Date.now(),
  };
}

function quickAnswerFor(current?: QuickAnswer): QuickAnswer {
  return current ?? { isCorrect: null, difficulty: "media" };
}

function averageQuickDifficulty(answers: QuickAnswer[]): QuickAnswer["difficulty"] {
  if (!answers.length) {
    return "media";
  }

  const total = answers.reduce((sum, answer) => sum + (answer.difficulty === "dificil" ? 2 : answer.difficulty === "media" ? 1 : 0), 0);
  const average = total / answers.length;

  if (average >= 1.5) {
    return "dificil";
  }
  if (average >= 0.65) {
    return "media";
  }
  return "facil";
}

function sessionFormFromQuick(answers: QuickAnswer[]): SessionSummaryForm {
  const difficulty = averageQuickDifficulty(answers);
  return {
    difficulty: difficulty === "dificil" ? "alta" : difficulty === "media" ? "media" : "baixa",
    perceivedVolume: "ok",
    notes: "Registro rapido do Timer V2.",
  };
}

export default function FloatingTimer({ preset = null }: FloatingTimerProps) {
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<SessionSetup>(() => buildSetupFromPreset(preset));
  const [session, setSession] = useState<TimerSession | null>(null);
  const [showQuestionMap, setShowQuestionMap] = useState(true);
  const [quickAnswers, setQuickAnswers] = useState<Record<number, QuickAnswer>>({});
  const [floatingMessage, setFloatingMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const controllerWindowRef = useRef<Window | null>(null);
  const controllerModeRef = useRef<"pip" | "popup" | null>(null);

  const activeQuestion = useMemo(() => {
    if (!session) {
      return null;
    }
    return session.questions[session.activeQuestionIndex] ?? null;
  }, [session]);

  const activeQuickAnswer = activeQuestion ? quickAnswerFor(quickAnswers[activeQuestion.index]) : quickAnswerFor();

  useEffect(() => {
    if (!session) {
      setSetup(buildSetupFromPreset(preset));
    }
  }, [preset, session]);

  useEffect(() => {
    if (!session?.isRunning || session.isPaused) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setSession((current) => {
        if (!current || !current.isRunning || current.isPaused) {
          return current;
        }
        return {
          ...current,
          totalElapsedSeconds: current.totalElapsedSeconds + 1,
          questions: current.questions.map(tickQuestion),
        };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [session?.isRunning, session?.isPaused]);

  useEffect(() => {
    renderFloatingController();
  }, [session, activeQuestion]);

  useEffect(
    () => () => {
      closeFloatingController();
    },
    [],
  );

  function updateSetup<T extends keyof SessionSetup>(key: T, value: SessionSetup[T]) {
    setSetup((current) => {
      const next = { ...current, [key]: value };

      if (
        (key === "discipline" && value !== current.discipline) ||
        (key === "block" && value !== current.block) ||
        (key === "subject" && value !== current.subject)
      ) {
        next.blockId = null;
        next.subjectId = null;
      }

      return next;
    });
  }

  function updateQuickAnswer(index: number, patch: Partial<QuickAnswer>) {
    setQuickAnswers((current) => ({
      ...current,
      [index]: {
        ...quickAnswerFor(current[index]),
        ...patch,
      },
    }));
  }

  function startSession() {
    setQuickAnswers({});
    setSession(createSession(setup));
    setFloatingMessage(null);
    setSaveMessage(null);
  }

  function transitionToQuestion(nextIndex: number, currentStatus: "completed" | "skipped" | "auto" = "auto") {
    setSession((current) => {
      if (!current || nextIndex < 0 || nextIndex >= current.questions.length) {
        return current;
      }
      if (nextIndex === current.activeQuestionIndex) {
        return current;
      }

      const questions = current.questions.map((question, index) => {
        if (index === current.activeQuestionIndex) {
          return settleActiveQuestion(question, currentStatus);
        }
        if (index === nextIndex) {
          return activateQuestion(question);
        }
        return question;
      });

      return {
        ...current,
        questions,
        activeQuestionIndex: nextIndex,
      };
    });
  }

  function moveQuestion(offset: number, currentStatus: "completed" | "skipped" | "auto" = "auto") {
    setSession((current) => {
      if (!current) {
        return current;
      }
      const nextIndex = Math.min(Math.max(current.activeQuestionIndex + offset, 0), current.questions.length - 1);
      if (nextIndex === current.activeQuestionIndex) {
        return current;
      }

      const questions = current.questions.map((question, index) => {
        if (index === current.activeQuestionIndex) {
          return settleActiveQuestion(question, currentStatus);
        }
        if (index === nextIndex) {
          return activateQuestion(question);
        }
        return question;
      });

      return {
        ...current,
        questions,
        activeQuestionIndex: nextIndex,
      };
    });
  }

  function completeCurrentQuestion() {
    setSession((current) => {
      if (!current) {
        return current;
      }

      const currentIndex = current.activeQuestionIndex;
      const nextIndex = Math.min(currentIndex + 1, current.questions.length - 1);
      const questions = current.questions.map((question, index) => {
        if (index === currentIndex) {
          return settleActiveQuestion(question, "completed");
        }
        if (index === nextIndex && nextIndex !== currentIndex) {
          return activateQuestion(question);
        }
        return question;
      });

      return {
        ...current,
        questions,
        activeQuestionIndex: nextIndex,
      };
    });
  }

  function skipCurrentQuestion() {
    setSession((current) => {
      if (!current) {
        return current;
      }

      const currentIndex = current.activeQuestionIndex;
      const nextIndex = Math.min(currentIndex + 1, current.questions.length - 1);
      const questions = current.questions.map((question, index) => {
        if (index === currentIndex) {
          return settleActiveQuestion(question, "skipped");
        }
        if (index === nextIndex && nextIndex !== currentIndex) {
          return activateQuestion(question);
        }
        return question;
      });

      setQuickAnswers((answers) => ({
        ...answers,
        [currentIndex]: {
          ...quickAnswerFor(answers[currentIndex]),
          isCorrect: false,
        },
      }));

      return {
        ...current,
        questions,
        activeQuestionIndex: nextIndex,
      };
    });
  }

  function goToNextQuestion() {
    if (!session || !activeQuestion) {
      return;
    }

    if (!canGoNext) {
      finishSession();
      return;
    }

    if (activeQuickAnswer.isCorrect === null) {
      moveQuestion(1, "auto");
      return;
    }

    moveQuestion(1, "completed");
  }

  function togglePause() {
    setSession((current) => (current ? { ...current, isPaused: !current.isPaused } : current));
  }

  async function persistFinishedSession(finishedSession: TimerSession) {
    const answeredEntries = Object.entries(quickAnswers)
      .map(([index, answer]) => ({ index: Number(index), answer }))
      .filter(({ index, answer }) => Number.isFinite(index) && answer.isCorrect !== null && finishedSession.questions[index]);
    const answered = answeredEntries.map(({ answer }) => answer);
    const form = sessionFormFromQuick(answered);

    saveLocalSession(finishedSession);
    setIsSavingSession(true);
    setSaveMessage("Salvando sessao...");

    try {
      const sessionResponse = await saveTimerSession(buildTimerSessionPayload(finishedSession, form));
      let syncMessage = "Sem respostas rapidas para sincronizar com o guia.";

      if (answeredEntries.length > 0) {
        if (!finishedSession.setup.blockId || !finishedSession.setup.subjectId) {
          syncMessage = "Sessao salva, mas sem block_id/subject_id o guia ainda nao consegue aprender com este treino.";
        } else {
          const totalSecondsSpent = answeredEntries.reduce(
            (total, { index }) => total + (finishedSession.questions[index]?.elapsedSeconds ?? 0),
            0,
          );
          const correctCount = answered.filter((answer) => answer.isCorrect).length;
          const difficulty = averageQuickDifficulty(answered);
          const response = await saveQuestionAttemptsQuickSync({
            discipline: finishedSession.setup.discipline,
            block_id: finishedSession.setup.blockId,
            subject_id: finishedSession.setup.subjectId,
            source: finishedSession.setup.questionSource === "db" ? "timer-v2-db" : "timer-v2-external",
            quantity: answeredEntries.length,
            correct_count: correctCount,
            difficulty_bank: difficulty,
            difficulty_personal: difficulty,
            elapsed_seconds: totalSecondsSpent,
            confidence: null,
            error_type: answered.some((answer) => answer.isCorrect === false) ? "timer_v2_quick_miss" : null,
            notes: "Timer V2 quick-sync. Respostas registradas durante o treino.",
            study_mode: "guided",
          });

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["study-plan-today"] }),
            queryClient.invalidateQueries({ queryKey: ["activity-today"] }),
            queryClient.invalidateQueries({ queryKey: ["activity-recent"] }),
            queryClient.invalidateQueries({ queryKey: ["gamification-summary"] }),
            queryClient.invalidateQueries({ queryKey: ["stats-overview"] }),
            queryClient.invalidateQueries({ queryKey: ["stats-discipline"] }),
          ]);

          syncMessage = `${response.created_attempts} questoes sincronizadas. ${response.impact_message ?? ""}`.trim();
        }
      }

      setSaveMessage(`Sessao #${sessionResponse.id} salva. ${syncMessage}`);
      window.setTimeout(() => {
        setSession(null);
        setQuickAnswers({});
      }, 900);
    } catch {
      setSaveMessage("Sessao salva localmente, mas o backend nao respondeu para finalizar o treino.");
    } finally {
      setIsSavingSession(false);
    }
  }

  function finishSession() {
    setSession((current) => {
      if (!current) {
        return current;
      }

      const questions = current.questions.map((question, index) =>
        index === current.activeQuestionIndex && question.status === "active"
          ? settleActiveQuestion(question, activeQuickAnswer.isCorrect === null ? "auto" : "completed")
          : question,
      );

      const nextSession = {
        ...current,
        questions,
        isRunning: false,
        isPaused: true,
      };

      closeFloatingController();
      void persistFinishedSession(nextSession);
      return nextSession;
    });
  }

  function cancelTraining() {
    const shouldCancel = window.confirm("Cancelar este treino e descartar a sessao atual?");
    if (!shouldCancel) {
      return;
    }

    closeFloatingController();
    setSession(null);
    setFloatingMessage(null);
    setSaveMessage(null);
    setQuickAnswers({});
    setSetup(buildSetupFromPreset(preset));
  }

  function closeFloatingController() {
    const controllerWindow = controllerWindowRef.current;
    if (controllerWindow && !controllerWindow.closed) {
      controllerWindow.close();
    }
    controllerWindowRef.current = null;
    controllerModeRef.current = null;
  }

  function renderFloatingController() {
    const controllerWindow = controllerWindowRef.current;
    if (!controllerWindow || controllerWindow.closed || !session || !activeQuestion) {
      return;
    }

    const canGoPrevious = session.activeQuestionIndex > 0;
    const canGoNext = session.activeQuestionIndex < session.questions.length - 1;
    const documentTitle = `${setup.subject} - Controle`;
    const modeLabel = controllerModeRef.current === "pip" ? "Always on top" : "Janela auxiliar";

    controllerWindow.document.title = documentTitle;
    controllerWindow.document.body.innerHTML = `
      <style>
        :root { color-scheme: dark; font-family: Manrope, system-ui, sans-serif; }
        body { margin: 0; background: #0f1117; color: #eef2f8; padding: 12px; }
        .shell { display: grid; gap: 12px; }
        .card { border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; background: rgba(255,255,255,0.04); padding: 12px; }
        .eyebrow { margin: 0; color: #7ec5ff; font-size: 11px; font-weight: 800; text-transform: uppercase; }
        h1 { margin: 6px 0 0; font-size: 18px; line-height: 1.2; }
        p { margin: 6px 0 0; color: rgba(226,232,240,0.72); font-size: 12px; line-height: 1.5; }
        .time { font-size: 42px; font-weight: 800; line-height: 1; margin-top: 8px; }
        .meta { display: flex; justify-content: space-between; gap: 8px; margin-top: 8px; font-size: 12px; color: rgba(226,232,240,0.72); }
        .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        button { border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; background: rgba(255,255,255,0.05); padding: 10px 12px; color: #eef2f8; font-size: 13px; font-weight: 700; }
        button.primary { background: #2fa9f4; border-color: rgba(47,169,244,0.6); color: #fff; }
        button.danger { border-color: rgba(248,113,113,0.35); color: #fecaca; background: rgba(239,68,68,0.1); }
        button:disabled { opacity: 0.45; cursor: not-allowed; }
      </style>
      <div class="shell">
        <div class="card">
          <p class="eyebrow">${escapeHtml(modeLabel)}</p>
          <h1>Questao ${activeQuestion.index + 1} de ${setup.questionCount}</h1>
          <p>${escapeHtml(setup.subject)}</p>
          <div class="time">${formatTime(activeQuestion.elapsedSeconds)}</div>
          <div class="meta">
            <span>Total ${formatTime(session.totalElapsedSeconds)}</span>
            <span>${session.isPaused ? "Pausado" : "Rodando"}</span>
          </div>
        </div>
        <div class="grid">
          <button id="previous" ${canGoPrevious ? "" : "disabled"}>Anterior</button>
          <button id="next" ${canGoNext ? "" : "disabled"}>Proxima</button>
          <button id="pause">${session.isPaused ? "Retomar" : "Pausar"}</button>
          <button id="complete">Concluir</button>
          <button id="skip">Pular</button>
          <button id="finish" class="danger">Finalizar</button>
        </div>
      </div>
    `;

    (controllerWindow.document.getElementById("previous") as HTMLButtonElement | null)?.addEventListener("click", () => moveQuestion(-1));
    (controllerWindow.document.getElementById("next") as HTMLButtonElement | null)?.addEventListener("click", goToNextQuestion);
    (controllerWindow.document.getElementById("pause") as HTMLButtonElement | null)?.addEventListener("click", togglePause);
    (controllerWindow.document.getElementById("complete") as HTMLButtonElement | null)?.addEventListener("click", completeCurrentQuestion);
    (controllerWindow.document.getElementById("skip") as HTMLButtonElement | null)?.addEventListener("click", skipCurrentQuestion);
    (controllerWindow.document.getElementById("finish") as HTMLButtonElement | null)?.addEventListener("click", finishSession);
  }

  async function openFloatingController() {
    if (!session) {
      return;
    }

    if (controllerWindowRef.current && !controllerWindowRef.current.closed) {
      controllerWindowRef.current.focus();
      return;
    }

    const pipApi = (window as Window & {
      documentPictureInPicture?: {
        requestWindow?: (options?: { width?: number; height?: number }) => Promise<Window>;
      };
    }).documentPictureInPicture;

    try {
      if (pipApi?.requestWindow) {
        const pipWindow = await pipApi.requestWindow({ width: 360, height: 260 });
        controllerWindowRef.current = pipWindow;
        controllerModeRef.current = "pip";
        setFloatingMessage("Controle flutuante aberto em always on top.");
        pipWindow.addEventListener("pagehide", () => {
          controllerWindowRef.current = null;
          controllerModeRef.current = null;
        });
      } else {
        const popup = window.open("", "study-hub-timer-controller", "width=360,height=260");
        if (!popup) {
          setFloatingMessage("O navegador bloqueou a janela do controle flutuante.");
          return;
        }
        controllerWindowRef.current = popup;
        controllerModeRef.current = "popup";
        setFloatingMessage("Controle aberto em janela separada. O always on top depende do navegador.");
        popup.addEventListener("beforeunload", () => {
          controllerWindowRef.current = null;
          controllerModeRef.current = null;
        });
      }
      renderFloatingController();
    } catch {
      setFloatingMessage("Nao foi possivel abrir o controle flutuante nesta maquina.");
    }
  }

  const currentElapsed = activeQuestion?.elapsedSeconds ?? 0;
  const activeNumber = (activeQuestion?.index ?? 0) + 1;
  const ratio = overtimeRatio(currentElapsed, setup.targetSecondsPerQuestion);
  const timeTone = widgetTone(currentElapsed, setup);
  const overtimeLabel = ratio === 0 ? "No alvo" : setup.mode === "prova" ? "Acima do alvo" : "Tempo extra";
  const canGoPrevious = Boolean(session && session.activeQuestionIndex > 0);
  const canGoNext = Boolean(session && session.activeQuestionIndex < session.questions.length - 1);
  const answeredCount = Object.values(quickAnswers).filter((answer) => answer.isCorrect !== null).length;
  const correctCount = Object.values(quickAnswers).filter((answer) => answer.isCorrect === true).length;

  if (!session) {
    return (
      <main className="timer-shell px-4 py-6">
        <section className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
          <div className="rounded-[20px] border border-white/10 bg-[#151a24] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.48)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-sky-300">Treino guiado</p>
                <h1 className="mt-1 text-3xl font-semibold text-zinc-50">Preparar foco</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                  Ajuste o foco, inicie o timer e registre cada questao com dois toques: resultado e dificuldade.
                </p>
              </div>
              <span className="timer-mode-badge">{setup.mode}</span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="text-[11px] text-zinc-400">
                Disciplina
                <input className="timer-input mt-1" value={setup.discipline} onChange={(event) => updateSetup("discipline", event.target.value)} placeholder="Disciplina" />
              </label>
              <label className="text-[11px] text-zinc-400">
                Bloco
                <input className="timer-input mt-1" value={setup.block} onChange={(event) => updateSetup("block", event.target.value)} placeholder="Bloco" />
              </label>
              <label className="text-[11px] text-zinc-400 md:col-span-2">
                Assunto
                <input className="timer-input mt-1" value={setup.subject} onChange={(event) => updateSetup("subject", event.target.value)} placeholder="Assunto" />
              </label>
              <label className="text-[11px] text-zinc-400">
                Quantidade de questoes
                <input
                  className="timer-input mt-1"
                  type="number"
                  min={1}
                  value={setup.questionCount}
                  onChange={(event) => updateSetup("questionCount", Math.max(1, Number(event.target.value) || 1))}
                />
              </label>
              <label className="text-[11px] text-zinc-400">
                Alvo por questao (seg)
                <input
                  className="timer-input mt-1"
                  type="number"
                  min={15}
                  value={setup.targetSecondsPerQuestion}
                  onChange={(event) => updateSetup("targetSecondsPerQuestion", Math.max(15, Number(event.target.value) || 15))}
                />
              </label>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="text-[11px] text-zinc-400">
                Ritmo
                <select className="timer-input mt-1 dark:bg-slate-900 dark:text-zinc-100 dark:border-slate-700" value={setup.mode} onChange={(event) => updateSetup("mode", event.target.value as SessionSetup["mode"])}>
                  <option value="prova">Modo prova</option>
                  <option value="livre">Modo livre</option>
                </select>
              </label>

              <label className="text-[11px] text-zinc-400">
                Origem das questoes
                <select
                  className="timer-input mt-1 dark:bg-slate-900 dark:text-zinc-100 dark:border-slate-700"
                  value={setup.questionSource}
                  onChange={(event) => updateSetup("questionSource", event.target.value as SessionSetup["questionSource"])}
                >
                  <option value="external">PDF / livro / apostila / fora do DB</option>
                  <option value="db">Banco de questoes</option>
                </select>
              </label>
            </div>

            <div className="mt-5">
              <TimerControls
                hasSession={false}
                isRunning={false}
                isPaused={false}
                canGoPrevious={false}
                canGoNext={false}
                onStart={startSession}
                onPause={() => undefined}
                onPrevious={() => undefined}
                onNext={() => undefined}
                onComplete={() => undefined}
                onSkip={() => undefined}
                onToggleHistory={() => undefined}
                onOpenFloating={() => undefined}
                onFinish={() => undefined}
              />
            </div>

            <div className="mt-3">
              <button className="timer-widget-button-danger w-full" onClick={cancelTraining}>
                Cancelar treino
              </button>
            </div>
          </div>

          <aside className="rounded-[20px] border border-white/10 bg-[#151a24] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.48)]">
            <h2 className="text-lg font-semibold text-zinc-50">Fluxo V2</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-400">
              <p>1. Escolha acerto ou erro na questao atual.</p>
              <p>2. Marque a dificuldade sentida.</p>
              <p>3. Aperte proxima. No final, o guia recebe o lote consolidado.</p>
            </div>
          </aside>
        </section>
      </main>
    );
  }

  return (
    <main className="timer-shell px-4 py-6">
      <section className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(18rem,0.3fr)]">
        <section className="space-y-4 rounded-[22px] border border-white/10 bg-[#151a24] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.48)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-sky-300">Treino em andamento</p>
              <h1 className="mt-1 text-2xl font-semibold text-zinc-50">
                {setup.discipline} - {setup.subject}
              </h1>
              <p className="mt-2 text-sm text-zinc-400">
                {setup.block} - {setup.questionSource === "db" ? "Banco de questoes" : "PDF / livro / apostila"}
              </p>
            </div>
            <button className="timer-widget-button-danger px-3 py-2" onClick={cancelTraining} aria-label="Cancelar treino">
              Cancelar
            </button>
          </div>

          {showQuestionMap ? (
            <QuestionProgress
              questions={session.questions}
              activeIndex={session.activeQuestionIndex}
              onSelectQuestion={(index) => transitionToQuestion(index, activeQuickAnswer.isCorrect === null ? "auto" : "completed")}
            />
          ) : null}

          <div className="rounded-[24px] border border-sky-400/20 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">Questao {activeNumber}</p>
            <strong className={`mt-3 block text-7xl font-semibold leading-none tabular-nums ${timeTone}`}>{formatTime(currentElapsed)}</strong>
            <p className="mt-3 text-sm text-zinc-400">
              {overtimeLabel} - alvo {formatTime(setup.targetSecondsPerQuestion)}
            </p>
            <div className="mx-auto mt-4 h-2 max-w-md overflow-hidden rounded-full bg-white/10">
              <div
                className={
                  setup.mode === "prova"
                    ? "h-full rounded-full bg-gradient-to-r from-yellow-300 via-orange-400 to-red-500"
                    : "h-full rounded-full bg-zinc-400"
                }
                style={{ width: `${Math.max(4, ratio * 100)}%` }}
              />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className={`rounded-2xl border px-5 py-5 text-lg font-black uppercase tracking-normal transition ${
                  activeQuickAnswer.isCorrect === true
                    ? "border-emerald-300 bg-emerald-400 text-slate-950 shadow-[0_0_24px_rgba(52,211,153,0.28)]"
                    : "border-emerald-300/35 bg-emerald-400/10 text-emerald-100 opacity-75 hover:opacity-100"
                }`}
                onClick={() => activeQuestion && updateQuickAnswer(activeQuestion.index, { isCorrect: true })}
              >
                Acertei
              </button>
              <button
                type="button"
                className={`rounded-2xl border px-5 py-5 text-lg font-black uppercase tracking-normal transition ${
                  activeQuickAnswer.isCorrect === false
                    ? "border-rose-300 bg-rose-400 text-slate-950 shadow-[0_0_24px_rgba(251,113,133,0.25)]"
                    : "border-rose-300/35 bg-rose-400/10 text-rose-100 opacity-75 hover:opacity-100"
                }`}
                onClick={() => activeQuestion && updateQuickAnswer(activeQuestion.index, { isCorrect: false })}
              >
                Errei
              </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {quickDifficultyLabels.map((difficulty) => (
                <button
                  key={difficulty.value}
                  type="button"
                  className={`rounded-2xl border px-4 py-3 text-sm font-bold transition dark:border-slate-700 dark:text-zinc-100 ${
                    activeQuickAnswer.difficulty === difficulty.value
                      ? "border-sky-300 bg-sky-400 text-slate-950 dark:bg-sky-400 dark:text-slate-950"
                      : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.06] dark:bg-slate-800 dark:text-zinc-100 dark:border-slate-700"
                  }`}
                  onClick={() => activeQuestion && updateQuickAnswer(activeQuestion.index, { difficulty: difficulty.value })}
                >
                  {difficulty.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[0.8fr_1.4fr_0.8fr]">
            <button className="timer-widget-button py-3" onClick={() => moveQuestion(-1)} disabled={!canGoPrevious || isSavingSession}>
              Anterior
            </button>
            <button className="timer-primary-action py-3 text-base" onClick={goToNextQuestion} disabled={isSavingSession}>
              {canGoNext ? "Proxima ->" : "Finalizar treino"}
            </button>
            <button className="timer-widget-button-danger py-3" onClick={finishSession} disabled={isSavingSession}>
              Finalizar
            </button>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[22px] border border-white/10 bg-[#151a24] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.48)]">
            <div className="grid gap-2">
              <button className="timer-widget-button" onClick={togglePause}>
                {session.isPaused ? "Retomar" : "Pausar"}
              </button>
              <button className="timer-widget-button" onClick={openFloatingController}>
                Controle flutuante
              </button>
              <button className="timer-widget-button" onClick={() => setShowQuestionMap((current) => !current)}>
                {showQuestionMap ? "Ocultar mapa" : "Mostrar mapa"}
              </button>
              <button className="timer-widget-button" onClick={skipCurrentQuestion} disabled={isSavingSession}>
                Pular como erro
              </button>
            </div>
            {floatingMessage ? <p className="mt-4 text-xs leading-5 text-zinc-400">{floatingMessage}</p> : null}
            {saveMessage ? <p className="mt-4 text-xs leading-5 text-zinc-300">{saveMessage}</p> : null}
          </section>

          <section className="rounded-[22px] border border-white/10 bg-[#151a24] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.48)]">
            <h2 className="text-lg font-semibold text-zinc-50">Sessao</h2>
            <div className="mt-4 grid gap-2">
              <div className="timer-mini-stat">
                <span>Respondidas</span>
                <strong>{answeredCount}/{session.questions.length}</strong>
              </div>
              <div className="timer-mini-stat">
                <span>Acertos</span>
                <strong>{correctCount}</strong>
              </div>
              <div className="timer-mini-stat">
                <span>Total</span>
                <strong>{formatTime(session.totalElapsedSeconds)}</strong>
              </div>
              <div className="timer-mini-stat">
                <span>Modo</span>
                <strong>{setup.mode}</strong>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
