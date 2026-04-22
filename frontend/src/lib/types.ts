export type TodayMetrics = {
  blocks: number;
  subjects: number;
  due_reviews: number;
  forgotten_subjects: number;
};

export type TodayPriority = {
  title: string;
  description: string;
};

export type TodayItem = {
  id?: number;
  title: string;
  description?: string;
};

export type TodayResponse = {
  metrics: TodayMetrics;
  priority: TodayPriority;
  due_reviews: TodayItem[];
  risk_blocks: TodayItem[];
  forgotten_subjects: TodayItem[];
};

export type StudyPlanSummary = {
  total_questions: number;
  focus_count: number;
};

export type StudyPlanExecutionStatus = "nao_iniciado" | "em_andamento" | "concluido";

export type StudyPlanItem = {
  discipline: string;
  block_id: number;
  block_name: string;
  subject_id: number;
  subject_name: string;
  planned_questions: number;
  completed_today: number;
  remaining_today: number;
  progress_ratio: number;
  execution_status: StudyPlanExecutionStatus;
  priority_score: number;
  primary_reason: string;
  planned_mode: string;
};

export type StudyPlanTodayResponse = {
  summary: StudyPlanSummary;
  items: StudyPlanItem[];
};

export type QuestionAttemptBulkPayload = {
  date?: string | null;
  discipline: string;
  block_id: number;
  subject_id: number;
  source?: string | null;
  quantity: number;
  correct_count: number;
  difficulty_bank: "facil" | "media" | "dificil";
  difficulty_personal: "facil" | "media" | "dificil";
  elapsed_seconds?: number | null;
  confidence?: "baixa" | "media" | "alta" | null;
  error_type?: string | null;
  notes?: string | null;
};

export type QuestionAttemptBulkResponse = {
  created_attempts: number;
  block_id: number;
  subject_id: number;
  mastery_status: string | null;
  mastery_score: number | null;
  next_review_date: string | null;
  impact_message: string | null;
};
