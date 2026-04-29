import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  StudyTimerContext as StudyTimerContextData,
  StudyTimerPendingCompletion,
  StudyTimerSession,
} from "../lib/types";

type StudyTimerStore = {
  session: StudyTimerSession | null;
  pendingCompletion: StudyTimerPendingCompletion | null;
};

type StudyTimerController = {
  session: StudyTimerSession | null;
  pendingCompletion: StudyTimerPendingCompletion | null;
  startTimer: (context: StudyTimerContextData) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  finishTimer: () => void;
  cancelTimer: () => void;
  consumePendingCompletion: () => void;
};

const STORAGE_KEY = "study-hub-study-timer";

const StudyTimerContext = createContext<StudyTimerController | null>(null);

function toSafeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function computeElapsed(session: StudyTimerSession, now = Date.now()): number {
  if (!session.is_running || session.is_paused || !session.last_resumed_at) {
    return toSafeInteger(session.accumulated_seconds);
  }

  return toSafeInteger(session.accumulated_seconds + (now - session.last_resumed_at) / 1000);
}

function formatTimer(value: number): string {
  const safeValue = toSafeInteger(value);
  const hours = Math.floor(safeValue / 3600);
  const minutes = Math.floor((safeValue % 3600) / 60);
  const seconds = safeValue % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function loadStore(): StudyTimerStore {
  if (typeof window === "undefined") {
    return { session: null, pendingCompletion: null };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { session: null, pendingCompletion: null };
    }

    const parsed = JSON.parse(raw) as Partial<StudyTimerStore>;
    return {
      session: parsed.session ?? null,
      pendingCompletion: parsed.pendingCompletion ?? null,
    };
  } catch {
    return { session: null, pendingCompletion: null };
  }
}

function buildSession(context: StudyTimerContextData): StudyTimerSession {
  const now = Date.now();
  return {
    context,
    elapsed_seconds: 0,
    is_running: true,
    is_paused: false,
    started_at: now,
    last_resumed_at: now,
    accumulated_seconds: 0,
  };
}

export function StudyTimerProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<StudyTimerStore>(() => loadStore());
  const lastRenderedElapsedRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store]);

  useEffect(() => {
    if (!store.session?.is_running || store.session.is_paused) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setStore((current) => {
        if (!current.session?.is_running || current.session.is_paused) {
          return current;
        }

        const nextElapsed = computeElapsed(current.session);
        if (lastRenderedElapsedRef.current === nextElapsed) {
          return current;
        }

        lastRenderedElapsedRef.current = nextElapsed;
        return {
          ...current,
          session: {
            ...current.session,
            elapsed_seconds: nextElapsed,
          },
        };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [store.session?.is_paused, store.session?.is_running]);

  const controller = useMemo<StudyTimerController>(
    () => ({
      session: store.session,
      pendingCompletion: store.pendingCompletion,
      startTimer: (context) => {
        lastRenderedElapsedRef.current = 0;
        setStore((current) => ({
          ...current,
          session: buildSession(context),
        }));
      },
      pauseTimer: () => {
        setStore((current) => {
          if (!current.session?.is_running || current.session.is_paused) {
            return current;
          }

          const elapsed = computeElapsed(current.session);
          lastRenderedElapsedRef.current = elapsed;
          return {
            ...current,
            session: {
              ...current.session,
              elapsed_seconds: elapsed,
              accumulated_seconds: elapsed,
              is_paused: true,
              last_resumed_at: null,
            },
          };
        });
      },
      resumeTimer: () => {
        setStore((current) => {
          if (!current.session?.is_running || !current.session.is_paused) {
            return current;
          }

          return {
            ...current,
            session: {
              ...current.session,
              is_paused: false,
              last_resumed_at: Date.now(),
            },
          };
        });
      },
      finishTimer: () => {
        setStore((current) => {
          if (!current.session) {
            return current;
          }

          const elapsed = computeElapsed(current.session);
          lastRenderedElapsedRef.current = null;
          return {
            session: null,
            pendingCompletion: {
              context: current.session.context,
              elapsed_seconds: elapsed,
              finished_at: Date.now(),
            },
          };
        });
      },
      cancelTimer: () => {
        lastRenderedElapsedRef.current = null;
        setStore((current) => ({
          ...current,
          session: null,
        }));
      },
      consumePendingCompletion: () => {
        setStore((current) => ({
          ...current,
          pendingCompletion: null,
        }));
      },
    }),
    [store.pendingCompletion, store.session],
  );

  return <StudyTimerContext.Provider value={controller}>{children}</StudyTimerContext.Provider>;
}

export function useStudyTimer(): StudyTimerController {
  const value = useContext(StudyTimerContext);
  if (!value) {
    throw new Error("useStudyTimer must be used inside StudyTimerProvider.");
  }
  return value;
}

export function StudyTimerDock() {
  const { session, pauseTimer, resumeTimer, finishTimer, cancelTimer } = useStudyTimer();

  if (!session) {
    return null;
  }

  return (
    <aside className="study-timer-dock" aria-live="polite">
      <div className="study-timer-dock-head">
        <div>
          <span>{session.context.mode === "guided" ? "Timer do foco" : "Timer do modo livre"}</span>
          <strong>{session.context.subject_name}</strong>
        </div>
        <small>{session.context.discipline}</small>
      </div>

      <div className="study-timer-dock-time">{formatTimer(session.elapsed_seconds)}</div>

      <div className="study-timer-dock-meta">
        <span>{session.context.block_name ?? `Bloco ${session.context.block_id ?? "-"}`}</span>
        <span>{session.is_paused ? "Pausado" : "Rodando"}</span>
      </div>

      <div className="study-timer-dock-actions">
        <button type="button" className="study-timer-action" onClick={session.is_paused ? resumeTimer : pauseTimer}>
          {session.is_paused ? "Retomar" : "Pausar"}
        </button>
        <button type="button" className="study-timer-action" onClick={finishTimer}>
          Finalizar
        </button>
        <button type="button" className="study-timer-action is-danger" onClick={cancelTimer}>
          Cancelar
        </button>
      </div>
    </aside>
  );
}
