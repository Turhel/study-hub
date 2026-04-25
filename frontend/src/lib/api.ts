import type {
  ActivityTodayResponse,
  ActivityItem,
  BlockProgressDisciplineResponse,
  EssayCorrectionPayload,
  EssayCorrectionResponse,
  EssayCorrectionStoredResponse,
  EssayStudySessionCloseResponse,
  EssayStudySessionListItem,
  EssayStudySessionResponse,
  FreeStudyCatalogResponse,
  GamificationSummaryResponse,
  LessonContent,
  LessonContentPayload,
  QuestionAttemptBulkPayload,
  QuestionAttemptBulkResponse,
  StatsDisciplineResponse,
  StatsOverviewResponse,
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

export async function getStatsOverview(): Promise<StatsOverviewResponse> {
  const response = await fetch(`${API_BASE_URL}/api/stats/overview`);

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar as estatisticas gerais.");
  }

  return response.json() as Promise<StatsOverviewResponse>;
}

export async function getStatsByDiscipline(discipline: string): Promise<StatsDisciplineResponse> {
  const response = await fetch(`${API_BASE_URL}/api/stats/discipline/${encodeURIComponent(discipline)}`);

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar as estatisticas da disciplina.");
  }

  return response.json() as Promise<StatsDisciplineResponse>;
}

export async function getGamificationSummary(): Promise<GamificationSummaryResponse> {
  const response = await fetch(`${API_BASE_URL}/api/gamification/summary`);

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar ofensiva e maestria.");
  }

  return response.json() as Promise<GamificationSummaryResponse>;
}

export async function getFreeStudyCatalog(): Promise<FreeStudyCatalogResponse> {
  const response = await fetch(`${API_BASE_URL}/api/free-study/catalog`);

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar o catalogo de aulas.");
  }

  return response.json() as Promise<FreeStudyCatalogResponse>;
}

export async function getBlockProgressByDiscipline(discipline: string): Promise<BlockProgressDisciplineResponse> {
  const response = await fetch(`${API_BASE_URL}/api/block-progress/discipline/${encodeURIComponent(discipline)}`);

  if (!response.ok) {
    throw await responseError(response, "Nao foi possivel carregar a progressao da disciplina.");
  }

  return response.json() as Promise<BlockProgressDisciplineResponse>;
}

export async function getLessonContents(publishedOnly = false): Promise<LessonContent[]> {
  const query = publishedOnly ? "?published_only=true" : "";
  const response = await fetch(`${API_BASE_URL}/api/lessons/contents${query}`);

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar as aulas.");
  }

  return response.json() as Promise<LessonContent[]>;
}

export async function getLessonContentsBySubject(subjectId: number): Promise<LessonContent[]> {
  const response = await fetch(`${API_BASE_URL}/api/lessons/by-subject/${subjectId}`);

  if (!response.ok) {
    throw await responseError(response, "Nao foi possivel carregar as aulas deste conteudo.");
  }

  return response.json() as Promise<LessonContent[]>;
}

export async function getLessonContentsByRoadmapNode(nodeId: string): Promise<LessonContent[]> {
  const response = await fetch(`${API_BASE_URL}/api/lessons/by-roadmap-node/${encodeURIComponent(nodeId)}`);

  if (!response.ok) {
    throw await responseError(response, "Nao foi possivel carregar as aulas deste node.");
  }

  return response.json() as Promise<LessonContent[]>;
}

export async function createLessonContent(payload: LessonContentPayload): Promise<LessonContent> {
  const response = await fetch(`${API_BASE_URL}/api/lessons/contents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await responseError(response, "Nao foi possivel criar a aula.");
  }

  return response.json() as Promise<LessonContent>;
}

export async function updateLessonContent(id: number, payload: LessonContentPayload): Promise<LessonContent> {
  const response = await fetch(`${API_BASE_URL}/api/lessons/contents/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await responseError(response, "Nao foi possivel salvar a aula.");
  }

  return response.json() as Promise<LessonContent>;
}

export async function deleteLessonContent(id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/lessons/contents/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw await responseError(response, "Nao foi possivel excluir a aula.");
  }
}

export async function correctEssay(payload: EssayCorrectionPayload): Promise<EssayCorrectionResponse> {
  const response = await fetch(`${API_BASE_URL}/api/essay/correct`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await responseError(response, "Nao foi possivel corrigir a redacao.");
  }

  return response.json() as Promise<EssayCorrectionResponse>;
}

export async function createEssayCorrection(
  payload: EssayCorrectionPayload,
): Promise<EssayCorrectionStoredResponse> {
  const response = await fetch(`${API_BASE_URL}/api/essay/corrections`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await responseError(response, "Nao foi possivel salvar a correcao da redacao.");
  }

  return response.json() as Promise<EssayCorrectionStoredResponse>;
}

export async function getEssayCorrection(correctionId: number): Promise<EssayCorrectionStoredResponse> {
  const response = await fetch(`${API_BASE_URL}/api/essay/corrections/${correctionId}`);

  if (!response.ok) {
    throw await responseError(response, "Nao foi possivel carregar a correcao.");
  }

  return response.json() as Promise<EssayCorrectionStoredResponse>;
}

export async function createEssayStudySession(essayCorrectionId: number): Promise<EssayStudySessionResponse> {
  const response = await fetch(`${API_BASE_URL}/api/essay/study-sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ essay_correction_id: essayCorrectionId }),
  });

  if (!response.ok) {
    throw await responseError(response, "Nao foi possivel iniciar o estudo da redacao.");
  }

  return response.json() as Promise<EssayStudySessionResponse>;
}

export async function sendEssayStudyMessage(
  sessionId: number,
  content: string,
): Promise<EssayStudySessionResponse> {
  const response = await fetch(`${API_BASE_URL}/api/essay/study-sessions/${sessionId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw await responseError(response, "Nao foi possivel enviar a mensagem.");
  }

  return response.json() as Promise<EssayStudySessionResponse>;
}

export async function closeEssayStudySession(sessionId: number): Promise<EssayStudySessionCloseResponse> {
  const response = await fetch(`${API_BASE_URL}/api/essay/study-sessions/${sessionId}/close`, {
    method: "POST",
  });

  if (!response.ok) {
    throw await responseError(response, "Nao foi possivel fechar a sessao de estudo.");
  }

  return response.json() as Promise<EssayStudySessionCloseResponse>;
}

export async function getEssayStudySession(sessionId: number): Promise<EssayStudySessionResponse> {
  const response = await fetch(`${API_BASE_URL}/api/essay/study-sessions/${sessionId}`);

  if (!response.ok) {
    throw await responseError(response, "Nao foi possivel carregar a sessao de estudo.");
  }

  return response.json() as Promise<EssayStudySessionResponse>;
}

export async function listEssayStudySessionsForSubmission(
  submissionId: number,
): Promise<EssayStudySessionListItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/essay/submissions/${submissionId}/study-sessions`);

  if (!response.ok) {
    throw await responseError(response, "Nao foi possivel carregar sessoes de estudo da redacao.");
  }

  return response.json() as Promise<EssayStudySessionListItem[]>;
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
