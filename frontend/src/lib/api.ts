import type {
  QuestionAttemptBulkPayload,
  QuestionAttemptBulkResponse,
  StudyPlanTodayResponse,
  TodayResponse,
} from "./types";
import type { TimerSessionPayload } from "./timerTypes";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function getToday(): Promise<TodayResponse> {
  const response = await fetch(`${API_BASE_URL}/api/today`);

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar o resumo de hoje.");
  }

  return response.json() as Promise<TodayResponse>;
}

export async function getStudyPlanToday(): Promise<StudyPlanTodayResponse> {
  const response = await fetch(`${API_BASE_URL}/api/study-plan/today`);

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar o plano de hoje.");
  }

  return response.json() as Promise<StudyPlanTodayResponse>;
}

export async function saveQuestionAttemptsBulk(payload: QuestionAttemptBulkPayload): Promise<QuestionAttemptBulkResponse> {
  const response = await fetch(`${API_BASE_URL}/api/question-attempts/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel registrar as questoes.");
  }

  return response.json() as Promise<QuestionAttemptBulkResponse>;
}

export async function saveTimerSession(payload: TimerSessionPayload): Promise<{ id: number }> {
  const response = await fetch(`${API_BASE_URL}/api/timer-sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel salvar a sessao no backend.");
  }

  return response.json() as Promise<{ id: number }>;
}
