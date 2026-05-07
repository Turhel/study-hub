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

export type ResetStudyDataPayload = {
  confirmation_text: string;
  dry_run: boolean;
  reset_preferences: boolean;
  include_essays: boolean;
};

export type ResetStudyDataResponse = {
  dry_run: boolean;
  deleted_counts: Record<string, number>;
  reset_counts: Record<string, number>;
  preserved_tables: string[];
  preferences_reset: boolean;
  essays_deleted: boolean;
  warnings: string[];
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
  estimated_tri_score?: number | null;
  estimated_tri_basis?: "subject" | "discipline" | null;
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

export type StudyPlanCalendarItem = {
  type: "study_focus" | "review" | "mock_exam" | "rest";
  discipline?: string | null;
  block_id?: number | null;
  subject_id?: number | null;
  subject_name?: string | null;
  planned_questions: number;
  reason: string;
};

export type StudyPlanCalendarDay = {
  date: string;
  status: "today" | "projected" | "adjusted";
  total_questions: number;
  focus_count: number;
  items: StudyPlanCalendarItem[];
  reason: string;
};

export type StudyPlanCalendarResponse = {
  start_date: string;
  end_date: string;
  days: StudyPlanCalendarDay[];
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

export type StudyTimerMode = "guided" | "free";

export type StudyTimerContext = {
  mode: StudyTimerMode;
  discipline: string;
  block_id: number | null;
  block_name?: string | null;
  subject_id: number;
  subject_name: string;
};

export type StudyTimerSession = {
  context: StudyTimerContext;
  elapsed_seconds: number;
  is_running: boolean;
  is_paused: boolean;
  started_at: number | null;
  last_resumed_at: number | null;
  accumulated_seconds: number;
};

export type StudyTimerPendingCompletion = {
  context: StudyTimerContext;
  elapsed_seconds: number;
  finished_at: number;
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
  difficulty_personal?: "facil" | "media" | "dificil" | null;
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

export type StatsDisciplineItem = {
  discipline: string;
  strategic_discipline: string;
  total_questions: number;
  correct_questions: number;
  accuracy: number;
  questions_this_week: number;
  questions_this_month: number;
  average_time_correct_questions_seconds: number | null;
  studied_subjects_count: number;
  weak_subjects_count: number;
  risk_blocks_count: number;
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

export type StatsHeatmapDay = {
  date: string;
  weekday: number;
  questions_count: number;
  correct_count: number;
  accuracy: number;
  studied: boolean;
  intensity_level: number;
};

export type StatsHeatmapResponse = {
  discipline: string | null;
  start_date: string;
  end_date: string;
  max_questions_in_day: number;
  total_questions: number;
  active_days: number;
  current_streak_days: number;
  longest_streak_days: number;
  days: StatsHeatmapDay[];
};

export type StatsTimeSeriesPoint = {
  period: string;
  start_date: string;
  end_date: string;
  questions_count: number;
  correct_count: number;
  accuracy: number;
  avg_time_correct_questions_seconds: number | null;
  active_days: number;
};

export type StatsTimeSeriesGroupBy = "day" | "week";

export type StatsTimeSeriesResponse = {
  discipline: string | null;
  group_by: StatsTimeSeriesGroupBy;
  points: StatsTimeSeriesPoint[];
};

export type StatsDisciplineSubjectItem = {
  subject_id: number;
  subject_name: string;
  block_id: number | null;
  questions_count: number;
  correct_count: number;
  accuracy: number;
  avg_time_correct_questions_seconds: number | null;
  last_studied_at: string | null;
  mastery_score: number | null;
  mastery_status: string | null;
};

export type StatsDisciplineSubjectsResponse = {
  discipline: string;
  subjects: StatsDisciplineSubjectItem[];
};

export type MockExamArea =
  | "Linguagens"
  | "Humanas"
  | "Natureza"
  | "Matematica"
  | "Matem?tica"
  | "Redacao"
  | "Reda??o"
  | "Geral";

export type MockExamMode = "external" | "internal";

export type MockExamStatus = "draft" | "in_progress" | "finished";

export type MockExamPayload = {
  exam_date: string;
  title: string;
  area: MockExamArea;
  mode?: MockExamMode;
  total_questions: number;
  correct_count: number;
  tri_score?: number | null;
  duration_minutes?: number | null;
  notes?: string | null;
};

export type MockExam = {
  id: number;
  exam_date: string;
  title: string;
  area: MockExamArea;
  mode: MockExamMode;
  status: MockExamStatus;
  total_questions: number;
  correct_count: number;
  accuracy: number;
  tri_score: number | null;
  official_tri_score: number | null;
  estimated_tri_score: number | null;
  duration_minutes: number | null;
  notes: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MockExamSummaryArea = {
  area: MockExamArea;
  total_exams: number;
  latest_tri_score: number | null;
  best_tri_score: number | null;
  average_accuracy: number | null;
};

export type MockExamSummaryResponse = {
  total_exams: number;
  latest_exam_date: string | null;
  last_three_average_tri: number | null;
  last_three_average_accuracy: number | null;
  best_tri_score: number | null;
  by_area: MockExamSummaryArea[];
  recent: MockExam[];
};

export type MockExamQuestionSourceType = "external" | "internal";

export type MockExamQuestion = {
  id: number;
  mock_exam_id: number;
  question_number: number;
  question_code: string | null;
  area: string | null;
  discipline: string | null;
  subject_id: number | null;
  block_id: number | null;
  source_type: MockExamQuestionSourceType;
  prompt_markdown: string | null;
  alternatives: string[];
  correct_answer: string | null;
  user_answer: string | null;
  is_correct: boolean | null;
  skipped: boolean;
  difficulty_percent: number | null;
  time_seconds: number | null;
  started_at: string | null;
  answered_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MockExamQuestionPayload = {
  question_code?: string | null;
  area?: string | null;
  discipline?: string | null;
  subject_id?: number | null;
  block_id?: number | null;
  prompt_markdown?: string | null;
  alternatives?: string[];
  correct_answer?: string | null;
  user_answer?: string | null;
  skipped?: boolean | null;
  difficulty_percent?: number | null;
  time_seconds?: number | null;
  started_at?: string | null;
  answered_at?: string | null;
  notes?: string | null;
};

export type MockExamQuestionsBulkPayload = {
  questions: Array<
    MockExamQuestionPayload & {
      question_number: number;
      source_type?: MockExamQuestionSourceType;
    }
  >;
};

export type MockExamPlaceholderRequest = {
  total_questions: number;
  areas: Array<{
    area: string;
    start: number;
    end: number;
  }>;
};

export type MockExamPlaceholderResponse = {
  created_questions: number;
  total_questions: number;
  message: string;
};

export type MockExamStartResponse = {
  exam: MockExam;
  questions_count: number;
};

export type MockExamAreaResult = {
  area: string;
  total_questions: number;
  answered_count: number;
  skipped_count: number;
  correct_count: number;
  accuracy: number;
  avg_time_seconds: number | null;
  avg_time_correct_seconds: number | null;
  average_difficulty_percent: number | null;
  estimated_tri_score: number | null;
};

export type MockExamFinishResponse = {
  exam: MockExam;
  total_questions: number;
  answered_count: number;
  skipped_count: number;
  correct_count: number;
  accuracy: number;
  avg_time_seconds: number | null;
  avg_time_correct_seconds: number | null;
  by_area: MockExamAreaResult[];
};

export type MockExamResultsResponse = {
  exam: MockExam;
  total_questions: number;
  answered_count: number;
  skipped_count: number;
  correct_count: number;
  accuracy: number;
  avg_time_seconds: number | null;
  avg_time_correct_seconds: number | null;
  official_tri_score: number | null;
  estimated_tri_score: number | null;
  overall_area_average_score: number | null;
  by_area: MockExamAreaResult[];
  questions: MockExamQuestion[];
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

export type FreeStudyRoadmapNodeBrief = {
  node_id: string;
  discipline: string;
  strategic_discipline: string;
  subject_area: string;
  content: string;
  subunit: string | null;
  relation_type?: string | null;
};

export type FreeStudySubjectContextGuidedStatus =
  | "entry"
  | "available"
  | "blocked_required"
  | "blocked_cross_required"
  | "reviewable"
  | "unmapped"
  | string;

export type FreeStudySubjectContextResponse = {
  subject_id: number;
  subject_name: string;
  discipline: string;
  strategic_discipline: string | null;
  subarea: string | null;
  block_id: number | null;
  block_name: string | null;
  roadmap_node_id: string | null;
  roadmap_mapped: boolean;
  free_study_allowed: boolean;
  guided_status: FreeStudySubjectContextGuidedStatus;
  warning_level: FreeStudyWarningLevel;
  warning_message: string | null;
  direct_prerequisites: FreeStudyRoadmapNodeBrief[];
  missing_required_nodes: FreeStudyRoadmapNodeBrief[];
  missing_cross_required_nodes: FreeStudyRoadmapNodeBrief[];
  missing_recommended_nodes: FreeStudyRoadmapNodeBrief[];
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

export type EssayCorrectionMode = "score_only" | "detailed" | "teach";

export type EssayCorrectionPayload = {
  theme: string;
  essay_text: string;
  student_goal?: string | null;
  mode?: EssayCorrectionMode;
};

export type EssayScoreRange = {
  min: number;
  max: number;
};

export type EssayCompetencyResult = {
  score: number;
  comment: string;
};

export type EssayCorrectionResponse = {
  estimated_score_range: EssayScoreRange;
  competencies: Record<string, EssayCompetencyResult>;
  strengths: string[];
  weaknesses: string[];
  improvement_plan: string[];
  confidence_note: string;
};

export type EssaySubmissionResponse = {
  id: number;
  theme: string;
  essay_text: string;
  created_at: string;
};

export type EssayCorrectionStoredResponse = EssayCorrectionResponse & {
  id: number;
  submission: EssaySubmissionResponse;
  provider: string;
  model: string;
  prompt_name: string;
  prompt_hash: string;
  mode: EssayCorrectionMode;
  tokens_input: number;
  tokens_output: number;
  tokens_total: number;
  created_at: string;
};

export type EssayStudyMessageResponse = {
  id: number;
  role: "system" | "user" | "assistant";
  content: string;
  tokens_estimated: number;
  created_at: string;
};

export type EssayStudySessionStatus = "active" | "closed" | "token_limit_reached";

export type EssayStudySessionResponse = {
  id: number;
  essay_submission_id: number;
  essay_correction_id: number;
  provider: string;
  model: string;
  prompt_name: string;
  prompt_hash: string;
  tokens_input: number;
  tokens_output: number;
  status: EssayStudySessionStatus;
  tokens_total: number;
  token_limit: number;
  can_accept_messages: boolean;
  messages_count: number;
  started_at: string;
  ended_at: string | null;
  messages: EssayStudyMessageResponse[];
};

export type EssayStudySessionListItem = Omit<EssayStudySessionResponse, "messages">;

export type EssayStudySessionCloseResponse = {
  id: number;
  status: Exclude<EssayStudySessionStatus, "active">;
  ended_at: string;
};
