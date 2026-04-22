import { useEffect, useMemo, useState } from "react";

import { createSession, formatTime, getTimeTone } from "../../lib/timer";
import type { QuestionEntry, SessionSetup, TimerSession } from "../../lib/timerTypes";
import QuestionProgress from "./QuestionProgress";
import SessionSummaryModal from "./SessionSummaryModal";
import TimerControls from "./TimerControls";

const initialSetup: SessionSetup = {
  discipline: "Matematica",
  block: "Bloco 1",
  subject: "Matematica Basica",
  questionCount: 10,
  targetSecondsPerQuestion: 180,
  mode: "prova",
};

const historyStatusClass = {
  pending: "border-white/10 bg-white/[0.03] text-zinc-500",
  active: "border-sky-300 bg-sky-400 text-slate-950",
  completed: "border-emerald-300/40 bg-emerald-400/15 text-emerald-200",
  skipped: "border-yellow-300/40 bg-yellow-300/15 text-yellow-200",
};

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

export default function FloatingTimer() {
  const [setup, setSetup] = useState<SessionSetup>(initialSetup);
  const [session, setSession] = useState<TimerSession | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [summarySession, setSummarySession] = useState<TimerSession | null>(null);

  const activeQuestion = useMemo(() => {
    if (!session) {
      return null;
    }
    return session.questions[session.activeQuestionIndex] ?? null;
  }, [session]);

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

  function startOrConfirm() {
    if (!session) {
      setSession(createSession(setup));
      return;
    }
    completeCurrentQuestion();
  }

  function moveToNext(updatedQuestions: QuestionEntry[], nextIndex: number): QuestionEntry[] {
    return updatedQuestions.map((question, index) => {
      if (index === nextIndex) {
        return { ...question, status: "active", startedAt: Date.now() };
      }
      return question;
    });
  }

  function completeCurrentQuestion() {
    setSession((current) => {
      if (!current) {
        return current;
      }
      const currentIndex = current.activeQuestionIndex;
      const nextIndex = current.questions.findIndex((question, index) => index > currentIndex && question.status === "pending");
      let questions = current.questions.map((question, index) =>
        index === currentIndex ? { ...question, status: "completed" as const, completedAt: Date.now() } : question,
      );

      if (nextIndex !== -1) {
        questions = moveToNext(questions, nextIndex);
      }

      const nextSession = {
        ...current,
        questions,
        activeQuestionIndex: nextIndex === -1 ? currentIndex : nextIndex,
        isRunning: nextIndex !== -1,
        isPaused: nextIndex === -1,
      };

      if (nextIndex === -1) {
        window.setTimeout(() => setSummarySession(nextSession), 0);
      }

      return nextSession;
    });
  }

  function skipToNextQuestion() {
    setSession((current) => {
      if (!current) {
        return current;
      }
      const currentIndex = current.activeQuestionIndex;
      const nextIndex = current.questions.findIndex((question, index) => index > currentIndex && question.status === "pending");
      let questions = current.questions.map((question, index) =>
        index === currentIndex ? { ...question, status: "skipped" as const } : question,
      );

      if (nextIndex !== -1) {
        questions = moveToNext(questions, nextIndex);
      }

      const nextSession = {
        ...current,
        questions,
        activeQuestionIndex: nextIndex === -1 ? currentIndex : nextIndex,
        isRunning: nextIndex !== -1,
        isPaused: nextIndex === -1,
      };

      if (nextIndex === -1) {
        window.setTimeout(() => setSummarySession(nextSession), 0);
      }

      return nextSession;
    });
  }

  function togglePause() {
    setSession((current) => (current ? { ...current, isPaused: !current.isPaused } : current));
  }

  function finishSession() {
    if (session) {
      const nextSession = { ...session, isRunning: false, isPaused: true };
      setSession(nextSession);
      setSummarySession(nextSession);
    }
  }

  function updateSetup<T extends keyof SessionSetup>(key: T, value: SessionSetup[T]) {
    setSetup((current) => ({ ...current, [key]: value }));
  }

  const currentElapsed = activeQuestion?.elapsedSeconds ?? 0;
  const activeNumber = (activeQuestion?.index ?? 0) + 1;
  const ratio = overtimeRatio(currentElapsed, setup.targetSecondsPerQuestion);
  const timeTone = widgetTone(currentElapsed, setup);
  const overtimeLabel = ratio === 0 ? "No alvo" : setup.mode === "prova" ? "Acima do alvo" : "Tempo extra";

  if (!session) {
    return (
      <main className="timer-shell">
        <section className="timer-widget px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-sky-300">Study Hub</p>
              <h1 className="mt-1 text-2xl font-semibold text-zinc-50">Preparar foco</h1>
            </div>
            <span className="timer-mode-badge">{setup.mode}</span>
          </div>

          <div className="mt-5 space-y-3">
            <input className="timer-input" value={setup.discipline} onChange={(event) => updateSetup("discipline", event.target.value)} placeholder="Disciplina" />
            <input className="timer-input" value={setup.block} onChange={(event) => updateSetup("block", event.target.value)} placeholder="Bloco" />
            <input className="timer-input" value={setup.subject} onChange={(event) => updateSetup("subject", event.target.value)} placeholder="Assunto" />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-zinc-400">
                Questoes
                <input
                  className="timer-input mt-1"
                  type="number"
                  min={1}
                  value={setup.questionCount}
                  onChange={(event) => updateSetup("questionCount", Math.max(1, Number(event.target.value)))}
                />
              </label>
              <label className="text-[11px] text-zinc-400">
                Alvo por questao
                <input
                  className="timer-input mt-1"
                  type="number"
                  min={15}
                  value={setup.targetSecondsPerQuestion}
                  onChange={(event) => updateSetup("targetSecondsPerQuestion", Math.max(15, Number(event.target.value)))}
                />
              </label>
            </div>
            <select className="timer-input" value={setup.mode} onChange={(event) => updateSetup("mode", event.target.value as SessionSetup["mode"])}>
              <option value="prova">Modo prova</option>
              <option value="livre">Modo livre</option>
            </select>
          </div>

          <div className="mt-5">
            <TimerControls
              hasSession={false}
              isRunning={false}
              isPaused={false}
              onStart={startOrConfirm}
              onPause={() => undefined}
              onNext={() => undefined}
              onToggleHistory={() => undefined}
              onFinish={() => undefined}
            />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="timer-shell">
      <section className="timer-widget relative overflow-hidden px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="timer-mode-badge">{setup.mode}</span>
              <span className="text-[11px] text-zinc-500">Questao {activeNumber}/{setup.questionCount}</span>
            </div>
            <p className="mt-2 truncate text-sm font-semibold text-zinc-100">{setup.subject}</p>
            <p className="truncate text-[11px] text-zinc-500">{setup.discipline} / {setup.block}</p>
          </div>
          <button className="timer-close-button" onClick={finishSession} aria-label="Finalizar sessao">
            Fim
          </button>
        </div>

        <div className="mt-5 rounded-lg bg-black/20 px-3 py-4 text-center">
          <p className="text-[11px] font-medium text-zinc-500">Questao atual</p>
          <p className={`mt-1 text-6xl font-semibold leading-none tabular-nums transition-colors ${timeTone}`}>{formatTime(currentElapsed)}</p>
          <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-zinc-500">
            <span>{overtimeLabel}</span>
            <span>/</span>
            <span>Meta {formatTime(setup.targetSecondsPerQuestion)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={setup.mode === "prova" ? "h-full rounded-full bg-gradient-to-r from-yellow-300 via-orange-400 to-red-500" : "h-full rounded-full bg-zinc-400"}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="timer-mini-stat">
            <span>Total</span>
            <strong>{formatTime(session.totalElapsedSeconds)}</strong>
          </div>
          <div className="timer-mini-stat">
            <span>Status</span>
            <strong>{session.isPaused ? "Pausado" : "Rodando"}</strong>
          </div>
        </div>

        <div className="mt-4">
          <QuestionProgress questions={session.questions} />
        </div>

        <div className="mt-4">
          <TimerControls
            hasSession
            isRunning={Boolean(session.isRunning)}
            isPaused={Boolean(session.isPaused)}
            onStart={startOrConfirm}
            onPause={togglePause}
            onNext={skipToNextQuestion}
            onToggleHistory={() => setShowHistory((current) => !current)}
            onFinish={finishSession}
          />
        </div>

        {showHistory ? (
          <aside className="absolute inset-y-0 right-0 z-10 w-36 border-l border-white/10 bg-[#181818]/95 p-3 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-zinc-300">Historico</p>
              <button className="text-[11px] text-zinc-500 transition hover:text-zinc-200" onClick={() => setShowHistory(false)}>
                Fechar
              </button>
            </div>
            <div className="max-h-[330px] space-y-1.5 overflow-auto pr-1">
              {session.questions.map((question) => (
                <div key={question.index} className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-[11px] ${historyStatusClass[question.status]}`}>
                  <span>Q{question.index + 1}</span>
                  <span>{question.status === "active" ? "atual" : question.status === "completed" ? "ok" : question.status === "skipped" ? "pulada" : "pendente"}</span>
                </div>
              ))}
            </div>
          </aside>
        ) : null}
      </section>

      {summarySession ? <SessionSummaryModal session={summarySession} onClose={() => setSummarySession(null)} /> : null}
    </main>
  );
}
