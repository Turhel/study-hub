import type {
  ActivityTodayResponse,
  ActivityItem,
  QuestionAttemptBulkPayload,
  QuestionAttemptBulkResponse,
  StudyGuidePreferencesPayload,
  StudyGuidePreferencesResponse,
  StudyPlanRecalculateResponse,
  StudyPlanTodayResponse,
  SystemCapabilitiesResponse,
  TodayResponse,
} from "./types";
import type { TimerSessionPayload } from "./timerTypes";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function responseError(response: Response, fallback: string): Promise<Error> {
  try {
    const payload = (await response.json()) as { detail?: string | { message?: string } };
    if (typeof payload.detail === "string") {
      return new Error(payload.detail);
    }
    if (payload.detail?.message) {
      return new Error(payload.detail.message);
    }
  } catch {
    return new Error(fallback);
  }
  return new Error(fallback);
}

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

export async function recalculateStudyPlanToday(): Promise<StudyPlanRecalculateResponse> {
  const response = await fetch(`${API_BASE_URL}/api/study-plan/today/recalculate`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel recalcular o plano de hoje.");
  }

  return response.json() as Promise<StudyPlanRecalculateResponse>;
}

export async function getSystemCapabilities(): Promise<SystemCapabilitiesResponse> {
  const response = await fetch(`${API_BASE_URL}/api/system/capabilities`);

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar as capacidades da maquina.");
  }

  return response.json() as Promise<SystemCapabilitiesResponse>;
}

export async function getStudyGuidePreferences(): Promise<StudyGuidePreferencesResponse> {
  const response = await fetch(`${API_BASE_URL}/api/study-guide/preferences`);

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar as preferencias do guia.");
  }

  return response.json() as Promise<StudyGuidePreferencesResponse>;
}

export async function saveStudyGuidePreferences(
  payload: StudyGuidePreferencesPayload,
): Promise<StudyGuidePreferencesResponse> {
  const response = await fetch(`${API_BASE_URL}/api/study-guide/preferences`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel salvar as preferencias do guia.");
  }

  return response.json() as Promise<StudyGuidePreferencesResponse>;
}

export async function getTodayActivity(): Promise<ActivityTodayResponse> {
  const response = await fetch(`${API_BASE_URL}/api/activity/today`);

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar a atividade de hoje.");
  }

  return response.json() as Promise<ActivityTodayResponse>;
}

export async function getRecentActivity(limit = 100): Promise<ActivityItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/activity/recent?limit=${limit}`);

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar a atividade recente.");
  }

  return response.json() as Promise<ActivityItem[]>;
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
    throw await responseError(response, "Nao foi possivel registrar as questoes.");
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
