import type { QuestionEntry, SessionSetup, SessionSummary, SessionSummaryForm, TimerSession, TimerSessionPayload } from "./timerTypes";

export function formatTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function createSession(setup: SessionSetup): TimerSession {
  const now = Date.now();
  const questions: QuestionEntry[] = Array.from({ length: setup.questionCount }, (_, index) => ({
    index,
    status: index === 0 ? "active" : "pending",
    elapsedSeconds: 0,
    startedAt: index === 0 ? now : undefined,
  }));

  return {
    setup,
    questions,
    activeQuestionIndex: 0,
    isRunning: true,
    isPaused: false,
    startedAt: now,
    totalElapsedSeconds: 0,
  };
}

export function summarizeSession(session: TimerSession): SessionSummary {
  const completed = session.questions.filter((question) => question.status === "completed");
  const skipped = session.questions.filter((question) => question.status === "skipped");
  const totalCompletedSeconds = completed.reduce((sum, question) => sum + question.elapsedSeconds, 0);

  return {
    totalQuestions: session.questions.length,
    completedQuestions: completed.length,
    skippedQuestions: skipped.length,
    averageCompletedSeconds: completed.length ? Math.round(totalCompletedSeconds / completed.length) : 0,
    overTargetQuestions: completed.filter(
      (question) => question.elapsedSeconds > session.setup.targetSecondsPerQuestion,
    ).length,
  };
}

export function getTimeTone(elapsedSeconds: number, targetSeconds: number, mode: "prova" | "livre"): string {
  if (elapsedSeconds <= targetSeconds) {
    return "text-zinc-50";
  }

  const excessRatio = targetSeconds > 0 ? (elapsedSeconds - targetSeconds) / targetSeconds : 1;

  if (mode === "livre") {
    return excessRatio > 0.5 ? "text-ember-400" : "text-zinc-300";
  }
  if (excessRatio < 0.25) {
    return "text-yellow-300";
  }
  if (excessRatio < 0.75) {
    return "text-orange-400";
  }
  return "text-red-400";
}

export function saveLocalSession(session: TimerSession): void {
  const saved = JSON.parse(localStorage.getItem("study-hub-timer-sessions") ?? "[]") as TimerSession[];
  localStorage.setItem("study-hub-timer-sessions", JSON.stringify([session, ...saved].slice(0, 20)));
}

export function buildTimerSessionPayload(session: TimerSession, form: SessionSummaryForm): TimerSessionPayload {
  const summary = summarizeSession(session);

  return {
    discipline: session.setup.discipline,
    block_name: session.setup.block,
    subject_name: session.setup.subject,
    mode: session.setup.mode,
    planned_questions: session.setup.questionCount,
    target_seconds_per_question: session.setup.targetSecondsPerQuestion,
    total_elapsed_seconds: session.totalElapsedSeconds,
    completed_count: summary.completedQuestions,
    skipped_count: summary.skippedQuestions,
    overtime_count: summary.overTargetQuestions,
    average_seconds_completed: summary.averageCompletedSeconds,
    difficulty_general: form.difficulty,
    volume_perceived: form.perceivedVolume,
    notes: form.notes.trim() || null,
    items: session.questions
      .filter((question) => question.status === "completed" || question.status === "skipped")
      .map((question) => ({
        question_number: question.index + 1,
        status: question.status === "completed" ? "done" : "skipped",
        elapsed_seconds: question.elapsedSeconds,
        exceeded_target: question.elapsedSeconds > session.setup.targetSecondsPerQuestion,
        completed_at: question.completedAt ? new Date(question.completedAt).toISOString() : null,
      })),
  };
}
