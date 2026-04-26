export type TimerMode = "prova" | "livre";
export type QuestionSourceKind = "db" | "external";

export type QuestionStatus = "pending" | "active" | "completed" | "skipped";

export type SessionSetup = {
  discipline: string;
  block: string;
  subject: string;
  questionCount: number;
  targetSecondsPerQuestion: number;
  mode: TimerMode;
  questionSource: QuestionSourceKind;
  blockId?: number | null;
  subjectId?: number | null;
};

export type TimerLaunchPreset = {
  discipline: string;
  block: string;
  subject: string;
  questionCount: number;
  targetSecondsPerQuestion?: number;
  mode?: TimerMode;
  questionSource?: QuestionSourceKind;
  blockId?: number | null;
  subjectId?: number | null;
};

export type QuestionEntry = {
  index: number;
  status: QuestionStatus;
  elapsedSeconds: number;
  startedAt?: number;
  completedAt?: number;
};

export type TimerSession = {
  setup: SessionSetup;
  questions: QuestionEntry[];
  activeQuestionIndex: number;
  isRunning: boolean;
  isPaused: boolean;
  startedAt: number;
  totalElapsedSeconds: number;
};

export type SessionSummaryForm = {
  difficulty: "baixa" | "media" | "alta";
  perceivedVolume: "baixo" | "ok" | "alto";
  notes: string;
};

export type SessionSummary = {
  totalQuestions: number;
  completedQuestions: number;
  skippedQuestions: number;
  averageCompletedSeconds: number;
  overTargetQuestions: number;
};

export type ExternalQuestionDraft = {
  questionNumber: number;
  textBlocks: string[];
  imageLabel: string;
  imagePreviewUrl: string | null;
  prompt: string;
  options: string[];
  correctOptionIndex: number | null;
  wasCorrect: "" | "correct" | "incorrect";
  peerAccuracy: string;
  personalDifficulty: "baixa" | "media" | "alta";
  notes: string;
};

export type TimerSessionItemPayload = {
  question_number: number;
  status: "done" | "skipped";
  elapsed_seconds: number;
  exceeded_target: boolean;
  completed_at: string | null;
};

export type TimerSessionPayload = {
  discipline: string;
  block_name: string;
  subject_name: string;
  mode: TimerMode;
  planned_questions: number;
  target_seconds_per_question: number;
  total_elapsed_seconds: number;
  completed_count: number;
  skipped_count: number;
  overtime_count: number;
  average_seconds_completed: number;
  difficulty_general: SessionSummaryForm["difficulty"];
  volume_perceived: SessionSummaryForm["perceivedVolume"];
  notes: string | null;
  items: TimerSessionItemPayload[];
};
