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
