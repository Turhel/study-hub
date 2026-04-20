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

function tickQuestion(question: QuestionEntry): QuestionEntry {
  if (question.status !== "active") {
    return question;
  }
  return { ...question, elapsedSeconds: question.elapsedSeconds + 1 };
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

  function finishSession() {
    if (session) {
      setSession({ ...session, isRunning: false, isPaused: true });
      setSummarySession({ ...session, isRunning: false, isPaused: true });
    }
  }

  const currentElapsed = activeQuestion?.elapsedSeconds ?? 0;
  const timeTone = getTimeTone(currentElapsed, setup.targetSecondsPerQuestion, setup.mode);
  const excessSeconds = Math.max(0, currentElapsed - setup.targetSecondsPerQuestion);
  const progressLabel = session ? `Questao ${(activeQuestion?.index ?? 0) + 1}/${setup.questionCount}` : "Nova sessao";

  return (
    <div className="min-h-screen bg-ink-950 p-3 text-zinc-100">
      <div className="mx-auto max-w-sm">
        {!session ? (
          <div className="rounded-lg border border-white/10 bg-ink-900/95 p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-focus-400">Timer flutuante</p>
                <h1 className="mt-1 text-2xl font-semibold">Preparar foco</h1>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-zinc-300">{setup.mode}</span>
            </div>
            <div className="mt-5 space-y-3">
              <input className="timer-input" value={setup.discipline} onChange={(event) => setSetup({ ...setup, discipline: event.target.value })} placeholder="Disciplina" />
              <input className="timer-input" value={setup.block} onChange={(event) => setSetup({ ...setup, block: event.target.value })} placeholder="Bloco" />
              <input className="timer-input" value={setup.subject} onChange={(event) => setSetup({ ...setup, subject: event.target.value })} placeholder="Assunto" />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-zinc-400">
                Questoes
                <input
                  className="timer-input mt-1"
                  type="number"
                  min={1}
                  value={setup.questionCount}
                  onChange={(event) => setSetup({ ...setup, questionCount: Number(event.target.value) })}
                />
              </label>
              <label className="text-xs text-zinc-400">
                Segundos alvo
                <input
                  className="timer-input mt-1"
                  type="number"
                  min={15}
                  value={setup.targetSecondsPerQuestion}
                  onChange={(event) => setSetup({ ...setup, targetSecondsPerQuestion: Number(event.target.value) })}
                />
              </label>
            </div>
            <select className="timer-input" value={setup.mode} onChange={(event) => setSetup({ ...setup, mode: event.target.value as SessionSetup["mode"] })}>
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
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-lg border border-white/10 bg-ink-900/95 p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-focus-400">{setup.discipline}</p>
                <h1 className="mt-1 truncate text-lg font-semibold text-zinc-50">{setup.subject}</h1>
              </div>
              <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-zinc-300">{setup.mode}</span>
            </div>

            <div className="mt-5 rounded-lg bg-black/20 p-4 text-center">
              <p className="text-sm font-medium text-zinc-400">{progressLabel}</p>
              <p className={`mt-2 text-7xl font-black tabular-nums tracking-normal transition-colors ${timeTone}`}>
                {formatTime(currentElapsed)}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                {excessSeconds > 0 ? `Excesso ${formatTime(excessSeconds)}` : `Alvo ${formatTime(setup.targetSecondsPerQuestion)}`}
              </p>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
              <span>Total {formatTime(session.totalElapsedSeconds)}</span>
              <span>Meta/q {formatTime(setup.targetSecondsPerQuestion)}</span>
            </div>

            <div className="mt-4">
              <QuestionProgress questions={session.questions} />
            </div>

            <div className="mt-5">
              <TimerControls
                hasSession
                isRunning={Boolean(session.isRunning)}
                isPaused={Boolean(session.isPaused)}
                onStart={startOrConfirm}
                onPause={() => setSession((current) => (current ? { ...current, isPaused: !current.isPaused } : current))}
                onNext={skipToNextQuestion}
                onToggleHistory={() => setShowHistory((current) => !current)}
                onFinish={finishSession}
              />
            </div>

            {showHistory ? (
              <div className="absolute inset-y-0 right-0 z-10 w-40 border-l border-white/10 bg-ink-900/95 p-3 shadow-soft">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">Historico</p>
                  <button className="text-xs text-zinc-500" onClick={() => setShowHistory(false)}>Fechar</button>
                </div>
                <div className="max-h-[420px] space-y-2 overflow-auto">
                  {session.questions.map((question) => (
                    <p key={question.index} className="flex justify-between rounded-md bg-white/[0.04] px-2 py-1.5 text-xs text-zinc-400">
                      <span>Q{question.index + 1}</span>
                      <span>{question.status}</span>
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {summarySession ? <SessionSummaryModal session={summarySession} onClose={() => setSummarySession(null)} /> : null}
    </div>
  );
}
