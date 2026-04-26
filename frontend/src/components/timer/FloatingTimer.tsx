import { useEffect, useMemo, useRef, useState } from "react";

import { createSession, formatTime, getTimeTone } from "../../lib/timer";
import type { QuestionEntry, SessionSetup, TimerLaunchPreset, TimerSession } from "../../lib/timerTypes";
import QuestionProgress from "./QuestionProgress";
import SessionSummaryModal from "./SessionSummaryModal";
import TimerControls from "./TimerControls";

type FloatingTimerProps = {
  preset?: TimerLaunchPreset | null;
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

export default function FloatingTimer({ preset = null }: FloatingTimerProps) {
  const [setup, setSetup] = useState<SessionSetup>(() => buildSetupFromPreset(preset));
  const [session, setSession] = useState<TimerSession | null>(null);
  const [showQuestionMap, setShowQuestionMap] = useState(true);
  const [summarySession, setSummarySession] = useState<TimerSession | null>(null);
  const [floatingMessage, setFloatingMessage] = useState<string | null>(null);
  const controllerWindowRef = useRef<Window | null>(null);
  const controllerModeRef = useRef<"pip" | "popup" | null>(null);

  const activeQuestion = useMemo(() => {
    if (!session) {
      return null;
    }
    return session.questions[session.activeQuestionIndex] ?? null;
  }, [session]);

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
    setSetup((current) => ({ ...current, [key]: value }));
  }

  function startSession() {
    setSummarySession(null);
    setSession(createSession(setup));
    setFloatingMessage(null);
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

  function moveQuestion(offset: number) {
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
          return settleActiveQuestion(question, "auto");
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

      return {
        ...current,
        questions,
        activeQuestionIndex: nextIndex,
      };
    });
  }

  function togglePause() {
    setSession((current) => (current ? { ...current, isPaused: !current.isPaused } : current));
  }

  function finishSession() {
    setSession((current) => {
      if (!current) {
        return current;
      }

      const questions = current.questions.map((question, index) =>
        index === current.activeQuestionIndex && question.status === "active"
          ? settleActiveQuestion(question, "auto")
          : question,
      );

      const nextSession = {
        ...current,
        questions,
        isRunning: false,
        isPaused: true,
      };

      closeFloatingController();
      window.setTimeout(() => setSummarySession(nextSession), 0);
      return nextSession;
    });
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
    (controllerWindow.document.getElementById("next") as HTMLButtonElement | null)?.addEventListener("click", () => moveQuestion(1));
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
                  O treino ja pode sair do plano do dia com disciplina, assunto e quantidade recomendada. Antes de iniciar, voce ainda
                  pode ajustar a quantidade, o modo e a origem das questoes.
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
                <select className="timer-input mt-1" value={setup.mode} onChange={(event) => updateSetup("mode", event.target.value as SessionSetup["mode"])}>
                  <option value="prova">Modo prova</option>
                  <option value="livre">Modo livre</option>
                </select>
              </label>

              <label className="text-[11px] text-zinc-400">
                Origem das questoes
                <select
                  className="timer-input mt-1"
                  value={setup.questionSource}
                  onChange={(event) => updateSetup("questionSource", event.target.value as SessionSetup["questionSource"])}
                >
                  <option value="external">PDF / livro / apostila / fora do DB</option>
                  <option value="db">Banco de questoes (area pronta para integrar)</option>
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
          </div>

          <aside className="rounded-[20px] border border-white/10 bg-[#151a24] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.48)]">
            <h2 className="text-lg font-semibold text-zinc-50">O que acontece depois</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-400">
              <p>1. O treino abre com a quantidade sugerida pelo foco do dia, mas voce pode editar.</p>
              <p>2. O cronometro conta por questao e grava exatamente quanto tempo voce ficou em cada uma.</p>
              <p>3. Se estiver resolvendo por PDF, abra o controle flutuante para manter tempo e navegacao na frente.</p>
              <p>4. Ao finalizar, o app mostra os tempos por questao e, no modo fora do DB, abre o question maker.</p>
            </div>
          </aside>
        </section>
      </main>
    );
  }

  return (
    <main className="timer-shell px-4 py-6">
      <section className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <div className="space-y-4">
          <section className="rounded-[20px] border border-white/10 bg-[#151a24] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.48)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-sky-300">Treino em andamento</p>
                <h1 className="mt-1 text-3xl font-semibold text-zinc-50">
                  {setup.discipline} - {setup.subject}
                </h1>
                <p className="mt-3 text-sm text-zinc-400">
                  {setup.block} • {setup.questionCount} questoes •{" "}
                  {setup.questionSource === "db" ? "Banco de questoes" : "PDF / livro / apostila"}
                </p>
              </div>
              <button className="timer-close-button" onClick={finishSession} aria-label="Finalizar sessao">
                Finalizar
              </button>
            </div>

            {showQuestionMap ? (
              <div className="mt-5">
                <QuestionProgress
                  questions={session.questions}
                  activeIndex={session.activeQuestionIndex}
                  onSelectQuestion={(index) => transitionToQuestion(index, "auto")}
                />
              </div>
            ) : null}
          </section>

          <section className="rounded-[20px] border border-white/10 bg-[#151a24] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.48)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <button className="text-base font-semibold text-zinc-200 transition hover:text-white disabled:opacity-40" onClick={() => moveQuestion(-1)} disabled={!canGoPrevious}>
                ← Anterior
              </button>
              <div className="text-center">
                <p className="text-sm text-zinc-400">Questao {activeNumber} de {setup.questionCount}</p>
                <strong className="mt-1 block text-2xl text-zinc-50">{formatTime(currentElapsed)}</strong>
              </div>
              <button className="text-base font-semibold text-zinc-200 transition hover:text-white disabled:opacity-40" onClick={() => moveQuestion(1)} disabled={!canGoNext}>
                Proxima →
              </button>
            </div>

            <div className="mt-5 rounded-[18px] border border-white/10 bg-black/20 p-5">
              {setup.questionSource === "db" ? (
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-normal text-amber-300">Integracao aguardando backend</p>
                  <h2 className="text-xl font-semibold text-zinc-50">Area reservada para questao do banco</h2>
                  <p className="max-w-3xl text-sm leading-6 text-zinc-400">
                    O treino ja esta medindo tempo por questao e navegacao normalmente. Assim que existir um endpoint real para buscar
                    questoes do DB, este bloco passa a renderizar enunciado, itens e recursos da questao atual.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-normal text-sky-300">Resolva fora do app</p>
                  <h2 className="text-xl font-semibold text-zinc-50">Use este treino junto com o PDF ou apostila</h2>
                  <p className="max-w-3xl text-sm leading-6 text-zinc-400">
                    Deixe o material aberto em outra janela. Aqui o app cuida do tempo por questao, da navegacao anterior/proxima e do
                    fechamento da sessao. No final, voce descreve o que foi cada questao no question maker.
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <span className="text-xs font-semibold uppercase tracking-normal text-zinc-500">Questao atual</span>
                      <strong className={`mt-2 block text-4xl font-semibold ${timeTone}`}>{formatTime(currentElapsed)}</strong>
                      <p className="mt-2 text-sm text-zinc-400">
                        {overtimeLabel} / meta {formatTime(setup.targetSecondsPerQuestion)}
                      </p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={
                            setup.mode === "prova"
                              ? "h-full rounded-full bg-gradient-to-r from-yellow-300 via-orange-400 to-red-500"
                              : "h-full rounded-full bg-zinc-400"
                          }
                          style={{ width: `${ratio * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <span className="text-xs font-semibold uppercase tracking-normal text-zinc-500">Como usar</span>
                      <ul className="mt-2 space-y-2 text-sm leading-6 text-zinc-400">
                        <li>• Abra o PDF em outra janela ou tela.</li>
                        <li>• Use o controle flutuante para manter o tempo sempre visivel.</li>
                        <li>• Avance ou volte de questao conforme o material.</li>
                        <li>• Finalize a sessao e preencha o question maker.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[20px] border border-white/10 bg-[#151a24] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.48)]">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">Tempo da questao</p>
              <p className={`mt-3 text-6xl font-semibold leading-none tabular-nums transition-colors ${timeTone}`}>{formatTime(currentElapsed)}</p>
              <p className="mt-3 text-sm text-zinc-400">
                {session.isPaused ? "Sessao pausada" : "Sessao rodando"} • total {formatTime(session.totalElapsedSeconds)}
              </p>
            </div>

            <div className="mt-5">
              <TimerControls
                hasSession
                isRunning={Boolean(session.isRunning)}
                isPaused={Boolean(session.isPaused)}
                canGoPrevious={canGoPrevious}
                canGoNext={canGoNext}
                onStart={() => undefined}
                onPause={togglePause}
                onPrevious={() => moveQuestion(-1)}
                onNext={() => moveQuestion(1)}
                onComplete={completeCurrentQuestion}
                onSkip={skipCurrentQuestion}
                onToggleHistory={() => setShowQuestionMap((current) => !current)}
                onOpenFloating={openFloatingController}
                onFinish={finishSession}
              />
            </div>

            {floatingMessage ? <p className="mt-4 text-xs leading-5 text-zinc-400">{floatingMessage}</p> : null}
          </section>

          <section className="rounded-[20px] border border-white/10 bg-[#151a24] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.48)]">
            <h2 className="text-lg font-semibold text-zinc-50">Leitura rapida</h2>
            <div className="mt-4 grid gap-2">
              <div className="timer-mini-stat">
                <span>Modo</span>
                <strong>{setup.mode}</strong>
              </div>
              <div className="timer-mini-stat">
                <span>Origem</span>
                <strong>{setup.questionSource === "db" ? "DB" : "Fora do DB"}</strong>
              </div>
              <div className="timer-mini-stat">
                <span>Progresso</span>
                <strong>
                  {session.questions.filter((question) => question.status === "completed" || question.status === "skipped").length}/
                  {session.questions.length}
                </strong>
              </div>
            </div>
          </section>
        </aside>
      </section>

      {summarySession ? <SessionSummaryModal session={summarySession} onClose={() => setSummarySession(null)} /> : null}
    </main>
  );
}
