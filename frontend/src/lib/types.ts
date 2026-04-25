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
  starting_points?: TodayItem[];
};

export type ActivityItem = {
  type: "question_attempt_bulk" | "review_upsert" | "daily_plan_generated" | "block_progress_decision";
  created_at: string;
  title: string;
  description: string;
  discipline?: string | null;
  strategic_discipline?: string | null;
  subarea?: string | null;
  block_id?: number | null;
  subject_id?: number | null;
  metadata: Record<string, unknown>;
};

export type ActivityTodayResponse = {
  date: string;
  question_attempts_registered: number;
  subjects_studied_today: number;
  blocks_impacted_today: number;
  reviews_generated_today: number;
  progression_decisions_today: number;
  studied_subject_ids: number[];
  impacted_block_ids: number[];
};

export type SystemCapabilitiesResponse = {
  machine_profile: "desktop" | "notebook" | "local" | string;
  database: {
    dialect: "sqlite" | "postgresql" | string;
    using_remote_database: boolean;
  };
  llm: {
    enabled: boolean;
    provider: string;
    model: string;
  };
  features: {
    essay_correction_enabled: boolean;
    essay_study_enabled: boolean;
  };
};

export type StudyPlanSummary = {
  total_questions: number;
  focus_count: number;
};

export type StudyPlanExecutionStatus = "nao_iniciado" | "em_andamento" | "concluido";

export type StudyPlanItem = {
  discipline: string;
  strategic_discipline?: string | null;
  subarea?: string | null;
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
  roadmap_node_id?: string | null;
  roadmap_mapped?: boolean;
  roadmap_mapping_source?: "override" | "heuristic" | "unmapped" | string | null;
  roadmap_mapping_confidence?: number | null;
  roadmap_mapping_reason?: string | null;
  roadmap_status?: "entry" | "available" | "blocked_required" | "blocked_cross_required" | "reviewable" | string | null;
  roadmap_reason?: string | null;
};

export type StudyPlanTodayResponse = {
  summary: StudyPlanSummary;
  items: StudyPlanItem[];
};

export type StudyGuideIntensity = "leve" | "normal" | "forte";

export type StudyGuidePreferencesPayload = {
  daily_minutes: number;
  intensity: StudyGuideIntensity;
  max_focus_count: number;
  max_questions: number;
  include_reviews: boolean;
  include_new_content: boolean;
};

export type StudyGuidePreferencesResponse = StudyGuidePreferencesPayload & {
  updated_at: string;
};

export type StudyPlanRecalculateResponse = {
  replaced_plan_id: number | null;
  plan: StudyPlanTodayResponse;
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
  study_mode?: "guided" | "free";
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

export type StatsDisciplineSignal = {
  discipline: string;
  strategic_discipline: string;
  questions: number;
  accuracy: number;
};

export type StatsOverviewResponse = {
  questions_today: number;
  questions_this_week: number;
  questions_this_month: number;
  accuracy_today: number;
  accuracy_this_week: number;
  accuracy_this_month: number;
  avg_time_correct_questions_seconds: number | null;
  studied_subjects_this_week: number;
  impacted_blocks_this_week: number;
  weak_disciplines: StatsDisciplineSignal[];
  strong_disciplines: StatsDisciplineSignal[];
  recent_activity_count: number;
};

export type StatsSubjectPerformance = {
  subject_id: number;
  subject_name: string;
  discipline: string;
  block_id: number | null;
  attempts: number;
  correct: number;
  accuracy: number;
  mastery_score: number | null;
};

export type StatsDisciplineResponse = {
  discipline: string;
  questions_this_week: number;
  questions_this_month: number;
  correct_count: number;
  incorrect_count: number;
  accuracy: number;
  avg_time_correct_questions_seconds: number | null;
  studied_subjects: number;
  weak_subjects: StatsSubjectPerformance[];
  strong_subjects: StatsSubjectPerformance[];
  review_due_count: number;
  blocks_in_progress: number;
  blocks_reviewable: number;
};

export type GamificationStreakResponse = {
  current_streak_days: number;
  longest_streak_days: number;
  studied_today: boolean;
  active_weekdays: string[];
  last_study_date: string | null;
};

export type GamificationTopMasterySubject = {
  subject_id: number;
  subject_name: string;
  discipline: string;
  stars: number;
  question_accuracy: number;
  attempts_count: number;
};

export type GamificationMasteryResponse = {
  total_mastery_stars: number;
  question_mastery_stars: number;
  review_mastery_stars: number;
  consistency_mastery_stars: number;
  mastered_subjects_count: number;
  top_mastery_subjects: GamificationTopMasterySubject[];
  metadata: Record<string, unknown>;
};

export type GamificationSummaryResponse = {
  streak: GamificationStreakResponse;
  mastery: GamificationMasteryResponse;
};

export type LessonExtraLink = {
  label: string;
  url: string;
};

export type LessonContent = {
  id: number;
  roadmap_node_id: string | null;
  subject_id: number | null;
  title: string;
  body_markdown: string;
  youtube_url: string | null;
  extra_links: LessonExtraLink[];
  notes: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type LessonContentPayload = {
  roadmap_node_id?: string | null;
  subject_id?: number | null;
  title?: string;
  body_markdown?: string;
  youtube_url?: string | null;
  extra_links?: LessonExtraLink[];
  notes?: string | null;
  is_published?: boolean;
};

export type FreeStudyWarningLevel = "none" | "low" | "medium" | "high" | string;

export type FreeStudyCatalogSubject = {
  subject_id: number;
  subject_name: string;
  block_id: number;
  block_name: string;
  roadmap_node_id: string | null;
  roadmap_mapped: boolean;
  roadmap_status: string | null;
  free_study_allowed: boolean;
  warning_level: FreeStudyWarningLevel;
  warning_message: string | null;
};

export type FreeStudyCatalogSubarea = {
  subarea: string;
  subjects: FreeStudyCatalogSubject[];
};

export type FreeStudyCatalogDiscipline = {
  discipline: string;
  strategic_discipline: string;
  subareas: FreeStudyCatalogSubarea[];
};

export type FreeStudyCatalogResponse = {
  disciplines: FreeStudyCatalogDiscipline[];
};

export type BlockProgressItem = {
  id: number;
  name: string;
  status: string;
};

export type BlockProgressDecision = {
  discipline?: string;
  current_block_id?: number | null;
  decision?: string;
  note?: string | null;
  created_at?: string;
};

export type BlockProgressDisciplineResponse = {
  discipline: string;
  active_block: BlockProgressItem | null;
  next_block: BlockProgressItem | null;
  reviewable_blocks: BlockProgressItem[];
  saved_decision: BlockProgressDecision | null;
  ready_to_advance: boolean;
  message: string;
};
