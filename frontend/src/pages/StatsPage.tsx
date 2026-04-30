import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getGamificationSummary,
  getStatsByDiscipline,
  getStatsDisciplines,
  getStatsDisciplineSubjects,
  getStatsHeatmap,
  getStatsOverview,
  getStatsTimeSeries,
} from "../lib/api";
import type { StatsDisciplineSubjectItem, StatsHeatmapDay, StatsHeatmapResponse, StatsTimeSeriesPoint } from "../lib/types";

const GENERAL_FILTER = "Geral";

type StatsCardTone = "blue" | "pink" | "gold" | "green";

function formatPercent(value?: number | null): string {
  return `${Math.round((value ?? 0) * 100)}%`;
}

function formatDecimal(value?: number | null): string {
  return value === null || value === undefined ? "0" : value.toFixed(1);
}

function formatSeconds(value?: number | null): string {
  if (value === null || value === undefined) {
    return "Sem tempo";
  }

  if (value < 60) {
    return `${Math.round(value)}s`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return seconds ? `${minutes}min ${seconds}s` : `${minutes}min`;
}

function formatDateLabel(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function formatMonthLabel(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR", {
    month: "short",
  });
}

function formatWeekTick(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (start.getMonth() === end.getMonth()) {
    return `${start.toLocaleDateString("pt-BR", { day: "2-digit" })} ${start.toLocaleDateString("pt-BR", { month: "short" })}`;
  }

  return start.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function normalizeDisciplineLabel(value: string): string {
  return value === GENERAL_FILTER ? value : value;
}

function StatsGlyph({ tone }: { tone: StatsCardTone }) {
  if (tone === "gold") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="10" y="8" width="28" height="32" rx="5" className="today-icon-fill-gold" />
        <path d="M17 18h14M17 25h14M17 32h8" className="today-icon-line-dark" />
      </svg>
    );
  }
  if (tone === "pink") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="9" y="9" width="30" height="30" rx="8" className="today-icon-fill-pink" />
        <path d="M24 15v18M15 24h18" className="today-icon-line-soft" />
      </svg>
    );
  }
  if (tone === "green") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="16" className="today-icon-fill-green" />
        <path d="M14 27c6-9 14-9 20 0M17 33c5-5 9-5 14 0" className="today-icon-line-dark" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="17" className="today-icon-fill-blue" />
      <circle cx="24" cy="24" r="9" className="today-icon-fill-gold" />
      <circle cx="24" cy="24" r="3" className="today-icon-fill-coral" />
    </svg>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone: StatsCardTone;
}) {
  return (
    <article className={`stats-card stats-card-${tone}`}>
      <div className="stats-card-main">
        <div className="stats-card-copy">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
        <span className="stats-card-icon" aria-hidden="true">
          <StatsGlyph tone={tone} />
        </span>
      </div>
      {hint ? (
        <div className="stats-card-footer">
          <small>{hint}</small>
        </div>
      ) : null}
    </article>
  );
}

function buildHeatmapWeeks(days: StatsHeatmapDay[]) {
  const weeks: StatsHeatmapDay[][] = [];

  for (const day of days) {
    const shouldStartNewWeek = weeks.length === 0 || day.weekday === 0;
    if (shouldStartNewWeek) {
      weeks.push([]);
    }
    weeks[weeks.length - 1].push(day);
  }

  return weeks;
}

function Heatmap({
  data,
  title,
}: {
  data?: StatsHeatmapResponse;
  title: string;
}) {
  const weeks = useMemo(() => buildHeatmapWeeks(data?.days ?? []), [data?.days]);
  const heatmapTrackStyle = useMemo(
    () => ({ "--heatmap-weeks": String(weeks.length) }) as CSSProperties,
    [weeks.length],
  );
  const monthLabels = useMemo(() => {
    let lastMonth = "";
    return weeks
      .map((week, index) => {
        const firstDay = week[0];
        if (!firstDay) {
          return null;
        }
        const month = formatMonthLabel(firstDay.date);
        if (month === lastMonth) {
          return null;
        }
        lastMonth = month;
        return { index, month };
      })
      .filter((item): item is { index: number; month: string } => item !== null);
  }, [weeks]);
  const todayKey = new Date().toISOString().slice(0, 10);

  if (!data || data.days.length === 0) {
    return (
      <section className="stats-chart-card stats-heatmap-panel">
        <div className="stats-chart-head">
          <div>
            <span className="today-eyebrow">Heatmap</span>
            <h3>{title}</h3>
          </div>
        </div>
        <div className="app-empty-card">
          <strong>Sem dias para mostrar.</strong>
          <p>Assim que houver questoes registradas, o mapa de calor passa a desenhar seu ritmo.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="stats-chart-card stats-heatmap-panel">
      <div className="stats-chart-head">
        <div>
          <span className="today-eyebrow">Heatmap</span>
          <h3>{title}</h3>
        </div>
        <div className="stats-heatmap-summary">
          <strong>{data.current_streak_days} dias</strong>
          <span>ofensiva atual</span>
        </div>
      </div>

      <div className="stats-heatmap-meta">
        <article>
          <strong>{data.longest_streak_days}</strong>
          <span>maior ofensiva</span>
        </article>
        <article>
          <strong>{data.active_days}</strong>
          <span>dias ativos</span>
        </article>
        <article>
          <strong>{data.total_questions}</strong>
          <span>questoes no periodo</span>
        </article>
      </div>

      <div className="stats-heatmap-shell">
        <div className="stats-heatmap-track" style={heatmapTrackStyle}>
          <div className="stats-heatmap-months" aria-hidden="true">
            {monthLabels.map(({ month, index }) => (
              <span key={`${month}-${index}`} style={{ gridColumn: `${index + 1}` }}>
                {month}
              </span>
            ))}
          </div>
          <div className="stats-heatmap-grid">
            {weeks.map((week, index) => (
              <div key={`week-${index}`} className="stats-heatmap-week">
                {Array.from({ length: 7 }, (_, rowIndex) => {
                  const day = week.find((item) => item.weekday === rowIndex);
                  if (!day) {
                    return <span key={`empty-${index}-${rowIndex}`} className="heatmap-cell heatmap-cell-empty" />;
                  }

                  return (
                    <span
                      key={day.date}
                      className={`heatmap-cell heatmap-level-${day.intensity_level} ${day.date === todayKey ? "is-today" : ""}`}
                      title={`${formatDateLabel(day.date)} - ${day.questions_count} questoes - ${day.correct_count} acertos - ${formatPercent(day.accuracy)}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="stats-heatmap-legend">
        <span>sem estudo</span>
        <i className="heatmap-legend-cell heatmap-level-0" />
        <i className="heatmap-legend-cell heatmap-level-1" />
        <i className="heatmap-legend-cell heatmap-level-2" />
        <i className="heatmap-legend-cell heatmap-level-3" />
        <i className="heatmap-legend-cell heatmap-level-4" />
        <span>menos questoes</span>
        <span className="stats-heatmap-legend-separator">/</span>
        <span>mais questoes</span>
      </div>
      <p className="stats-heatmap-note">Menos questoes ficam mais escuras. Mais questoes ficam mais claras. Em telas menores, deslize na horizontal.</p>
    </section>
  );
}

function ChartFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="stats-chart-card">
      <div className="stats-chart-head">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function QuestionsBarChart({ points }: { points: StatsTimeSeriesPoint[] }) {
  const maxValue = Math.max(...points.map((point) => point.questions_count), 1);

  return (
    <div className="stats-bars-chart" role="img" aria-label="Questoes por periodo">
      {points.map((point) => (
        <div
          key={point.period}
          className="stats-bars-column"
          title={`${formatWeekTick(point.start_date, point.end_date)} - ${point.questions_count} questoes - ${point.correct_count} acertos`}
        >
          <div className="stats-bars-track">
            <div
              className="stats-bars-fill"
              style={{ height: `${(point.questions_count / maxValue) * 100}%` }}
            />
          </div>
          <span>{formatWeekTick(point.start_date, point.end_date)}</span>
        </div>
      ))}
    </div>
  );
}

function buildLinePath(values: number[], width: number, height: number) {
  if (values.length === 0) {
    return "";
  }

  const maxValue = Math.max(...values, 1);
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / maxValue) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function LineChart({
  points,
  valueSelector,
  strokeClassName,
  labelBuilder,
}: {
  points: StatsTimeSeriesPoint[];
  valueSelector: (point: StatsTimeSeriesPoint) => number;
  strokeClassName: string;
  labelBuilder: (point: StatsTimeSeriesPoint) => string;
}) {
  const width = 520;
  const height = 170;
  const values = points.map(valueSelector);
  const path = buildLinePath(values, width, height);

  return (
    <svg viewBox={`0 0 ${width} ${height + 26}`} className="stats-line-chart" role="img" aria-hidden="true">
      <path d={path} className={`stats-line-path ${strokeClassName}`} />
      {points.map((point, index) => {
        const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
        const maxValue = Math.max(...values, 1);
        const y = height - (valueSelector(point) / maxValue) * height;
        return (
          <g key={point.period}>
            <circle cx={x} cy={y} r="4" className={`stats-line-dot ${strokeClassName}`} />
            <title>{labelBuilder(point)}</title>
          </g>
        );
      })}
    </svg>
  );
}

function SubjectBreakdown({
  discipline,
  items,
}: {
  discipline: string;
  items: StatsDisciplineSubjectItem[];
}) {
  if (items.length === 0) {
    return (
      <section className="stats-chart-card">
        <div className="stats-chart-head">
          <div>
            <h3>Assuntos de {discipline}</h3>
            <p>Sem assuntos com registro ainda.</p>
          </div>
        </div>
      </section>
    );
  }

  const maxQuestions = Math.max(...items.map((item) => item.questions_count), 1);

  return (
    <section className="stats-chart-card">
      <div className="stats-chart-head">
        <div>
          <h3>Assuntos de {discipline}</h3>
          <p>Volume, acerto e ritmo por conteudo.</p>
        </div>
      </div>

      <div className="stats-breakdown-list">
        {items.slice(0, 8).map((item) => (
          <article key={item.subject_id} className="stats-breakdown-item">
            <div className="stats-breakdown-copy">
              <strong>{item.subject_name}</strong>
              <span>
                {item.questions_count} questoes • {formatPercent(item.accuracy)} • {formatSeconds(item.avg_time_correct_questions_seconds)}
              </span>
            </div>
            <div className="stats-breakdown-bars">
              <div className="stats-breakdown-bar">
                <label>Volume</label>
                <div className="stats-breakdown-track">
                  <i style={{ width: `${(item.questions_count / maxQuestions) * 100}%` }} />
                </div>
              </div>
              <div className="stats-breakdown-bar">
                <label>Acerto</label>
                <div className="stats-breakdown-track stats-breakdown-track-accuracy">
                  <i style={{ width: `${Math.max(item.accuracy, 0.02) * 100}%` }} />
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function StatsPage() {
  const [selectedFilter, setSelectedFilter] = useState(GENERAL_FILTER);
  const selectedDiscipline = selectedFilter === GENERAL_FILTER ? null : selectedFilter;

  const overviewQuery = useQuery({
    queryKey: ["stats-overview"],
    queryFn: getStatsOverview,
    retry: false,
  });
  const gamificationQuery = useQuery({
    queryKey: ["gamification-summary"],
    queryFn: getGamificationSummary,
    retry: false,
  });
  const disciplinesQuery = useQuery({
    queryKey: ["stats-disciplines"],
    queryFn: getStatsDisciplines,
    retry: false,
  });
  const heatmapQuery = useQuery({
    queryKey: ["stats-heatmap", selectedDiscipline ?? "general", 365],
    queryFn: () => getStatsHeatmap(365, selectedDiscipline),
    retry: false,
  });
  const timeseriesQuery = useQuery({
    queryKey: ["stats-timeseries", selectedDiscipline ?? "general", "week", 180],
    queryFn: () => getStatsTimeSeries("week", 180, selectedDiscipline),
    retry: false,
  });
  const disciplineDetailQuery = useQuery({
    queryKey: ["stats-discipline", selectedDiscipline],
    queryFn: () => getStatsByDiscipline(selectedDiscipline ?? ""),
    enabled: selectedDiscipline !== null,
    retry: false,
  });
  const disciplineSubjectsQuery = useQuery({
    queryKey: ["stats-discipline-subjects", selectedDiscipline],
    queryFn: () => getStatsDisciplineSubjects(selectedDiscipline ?? ""),
    enabled: selectedDiscipline !== null,
    retry: false,
  });

  const disciplineOptions = useMemo(() => {
    const labels = new Set<string>([GENERAL_FILTER]);
    for (const item of disciplinesQuery.data ?? []) {
      labels.add(item.discipline);
    }
    return Array.from(labels);
  }, [disciplinesQuery.data]);

  const overview = overviewQuery.data;
  const streak = gamificationQuery.data?.streak;
  const mastery = gamificationQuery.data?.mastery;
  const disciplineDetail = disciplineDetailQuery.data;
  const heatmap = heatmapQuery.data;
  const timeseriesPoints = timeseriesQuery.data?.points ?? [];
  const selectedSubjectItems = disciplineSubjectsQuery.data?.subjects ?? [];
  const selectedDisciplineCardSource = selectedDiscipline ? disciplineDetail : null;
  const summaryCards = selectedDisciplineCardSource
    ? [
        {
          label: "Questoes na semana",
          value: selectedDisciplineCardSource.questions_this_week,
          hint: normalizeDisciplineLabel(selectedFilter),
          tone: "gold" as const,
        },
        {
          label: "Questoes no mes",
          value: selectedDisciplineCardSource.questions_this_month,
          hint: "janela recente",
          tone: "blue" as const,
        },
        {
          label: "Acuracia",
          value: formatPercent(selectedDisciplineCardSource.accuracy),
          hint: `${selectedDisciplineCardSource.correct_count} acertos`,
          tone: "green" as const,
        },
        {
          label: "Tempo medio correto",
          value: formatSeconds(selectedDisciplineCardSource.avg_time_correct_questions_seconds),
          hint: "so questoes certas",
          tone: "pink" as const,
        },
      ]
    : [
        {
          label: "Questoes hoje",
          value: overview?.questions_today ?? 0,
          hint: "dia atual",
          tone: "gold" as const,
        },
        {
          label: "Questoes na semana",
          value: overview?.questions_this_week ?? 0,
          hint: "ultimos 7 dias",
          tone: "blue" as const,
        },
        {
          label: "Questoes no mes",
          value: overview?.questions_this_month ?? 0,
          hint: "janela atual",
          tone: "pink" as const,
        },
        {
          label: "Acuracia da semana",
          value: formatPercent(overview?.accuracy_this_week),
          hint: "acertos / questoes",
          tone: "green" as const,
        },
      ];

  const secondaryCards = [
    {
      label: "Tempo medio correto",
      value: formatSeconds(
        selectedDiscipline ? disciplineDetail?.avg_time_correct_questions_seconds : overview?.avg_time_correct_questions_seconds,
      ),
      hint: "ritmo em questoes certas",
      tone: "blue" as const,
    },
    {
      label: "Ofensiva atual",
      value: streak?.current_streak_days ?? 0,
      hint: streak?.studied_today ? "voce estudou hoje" : "dia atual ainda livre",
      tone: "gold" as const,
    },
    {
      label: "Maior ofensiva",
      value: streak?.longest_streak_days ?? 0,
      hint: "historico recente",
      tone: "green" as const,
    },
    {
      label: "Estrelas",
      value: mastery?.total_mastery_stars ?? 0,
      hint: `${mastery?.mastered_subjects_count ?? 0} assuntos dominados`,
      tone: "pink" as const,
    },
  ];

  const isAnyLoading =
    overviewQuery.isLoading ||
    gamificationQuery.isLoading ||
    disciplinesQuery.isLoading ||
    heatmapQuery.isLoading ||
    timeseriesQuery.isLoading;

  const hasAnyError =
    overviewQuery.isError ||
    gamificationQuery.isError ||
    heatmapQuery.isError ||
    timeseriesQuery.isError ||
    (selectedDiscipline !== null && (disciplineDetailQuery.isError || disciplineSubjectsQuery.isError));

  return (
    <main className="today-page stats-page">
      <section className="today-subjects-shell today-functional-shell">
        <section className="today-panel stats-hero-panel">
          <div className="stats-hero-copy">
            <div>
              <p className="today-eyebrow">Estatisticas</p>
              <h1>Seu estudo em mapa, ritmo e tendencia</h1>
              <p>Menos texto, mais leitura visual do que realmente aconteceu no estudo.</p>
            </div>
            <div className="stats-filter-row" role="tablist" aria-label="Filtro de disciplina">
              {disciplineOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={option === selectedFilter ? "is-active" : ""}
                  onClick={() => setSelectedFilter(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </section>

        {hasAnyError ? (
          <section className="today-panel today-error-panel">
            <strong>Algum bloco de estatisticas nao carregou.</strong>
            <p>A pagina continua estavel, mas parte dos graficos pode estar incompleta ate a proxima tentativa.</p>
          </section>
        ) : null}

        <section className="today-panel today-panel-wide">
          <div className="stats-grid">
            {summaryCards.map((card) => (
              <SummaryCard key={card.label} {...card} />
            ))}
            {secondaryCards.map((card) => (
              <SummaryCard key={card.label} {...card} />
            ))}
          </div>
        </section>

        <Heatmap
          data={heatmap}
          title={selectedDiscipline ? `Ultimos 365 dias em ${selectedDiscipline}` : "Ultimos 365 dias de estudo"}
        />

        <div className="stats-trend-grid">
          <ChartFrame title="Questoes por semana" subtitle="Volume registrado ao longo do tempo.">
            {timeseriesPoints.length > 0 ? (
              <QuestionsBarChart points={timeseriesPoints} />
            ) : (
              <p className="today-empty-copy">Sem pontos suficientes para desenhar o volume.</p>
            )}
          </ChartFrame>

          <ChartFrame title="Acuracia por semana" subtitle="Linha de acerto no periodo filtrado.">
            {timeseriesPoints.length > 0 ? (
              <LineChart
                points={timeseriesPoints}
                valueSelector={(point) => point.accuracy}
                strokeClassName="stats-line-accent-blue"
                labelBuilder={(point) => `${formatWeekTick(point.start_date, point.end_date)} - ${formatPercent(point.accuracy)} - ${point.correct_count} acertos`}
              />
            ) : (
              <p className="today-empty-copy">Sem pontos suficientes para desenhar a acuracia.</p>
            )}
          </ChartFrame>

          <ChartFrame title="Tempo medio correto" subtitle="So respostas corretas entram aqui.">
            {timeseriesPoints.length > 0 ? (
              <LineChart
                points={timeseriesPoints}
                valueSelector={(point) => point.avg_time_correct_questions_seconds ?? 0}
                strokeClassName="stats-line-accent-gold"
                labelBuilder={(point) => `${formatWeekTick(point.start_date, point.end_date)} - ${formatSeconds(point.avg_time_correct_questions_seconds)}`}
              />
            ) : (
              <p className="today-empty-copy">Sem tempo suficiente para desenhar o ritmo.</p>
            )}
          </ChartFrame>
        </div>

        {selectedDiscipline ? (
          <>
            <section className="today-panel today-panel-wide">
              <div className="stats-grid">
                <SummaryCard
                  label="Assuntos estudados"
                  value={disciplineDetail?.studied_subjects ?? 0}
                  hint={selectedDiscipline}
                  tone="green"
                />
                <SummaryCard
                  label="Revisoes vencidas"
                  value={disciplineDetail?.review_due_count ?? 0}
                  hint="ponto de manutencao"
                  tone="pink"
                />
                <SummaryCard
                  label="Blocos em andamento"
                  value={disciplineDetail?.blocks_in_progress ?? 0}
                  hint="trilha ativa"
                  tone="blue"
                />
                <SummaryCard
                  label="Blocos revisaveis"
                  value={disciplineDetail?.blocks_reviewable ?? 0}
                  hint="conteudo para consolidar"
                  tone="gold"
                />
              </div>
            </section>

            <SubjectBreakdown discipline={selectedDiscipline} items={selectedSubjectItems} />
          </>
        ) : (
          <div className="stats-two-column">
            <section className="stats-chart-card">
              <div className="stats-chart-head">
                <div>
                  <h3>Disciplinas fortes</h3>
                  <p>Onde o registro recente esta sustentando melhor o acerto.</p>
                </div>
              </div>
              <div className="stats-breakdown-list">
                {(overview?.strong_disciplines ?? []).slice(0, 5).map((item) => (
                  <article key={`strong-${item.discipline}`} className="stats-breakdown-item">
                    <div className="stats-breakdown-copy">
                      <strong>{item.discipline}</strong>
                      <span>{item.questions} questoes • {formatPercent(item.accuracy)}</span>
                    </div>
                  </article>
                ))}
                {(overview?.strong_disciplines ?? []).length === 0 ? (
                  <p className="today-empty-copy">Sem dados suficientes ainda.</p>
                ) : null}
              </div>
            </section>

            <section className="stats-chart-card">
              <div className="stats-chart-head">
                <div>
                  <h3>Disciplinas fracas</h3>
                  <p>Onde vale revisar o foco do dia ou puxar aula de reforco.</p>
                </div>
              </div>
              <div className="stats-breakdown-list">
                {(overview?.weak_disciplines ?? []).slice(0, 5).map((item) => (
                  <article key={`weak-${item.discipline}`} className="stats-breakdown-item">
                    <div className="stats-breakdown-copy">
                      <strong>{item.discipline}</strong>
                      <span>{item.questions} questoes • {formatPercent(item.accuracy)}</span>
                    </div>
                  </article>
                ))}
                {(overview?.weak_disciplines ?? []).length === 0 ? (
                  <p className="today-empty-copy">Sem sinais fracos relevantes ainda.</p>
                ) : null}
              </div>
            </section>
          </div>
        )}

        {isAnyLoading ? (
          <section className="today-panel app-empty-card">
            <strong>Montando os graficos...</strong>
            <p>Assim que os endpoints responderem, a leitura visual fica completa.</p>
          </section>
        ) : null}
      </section>
    </main>
  );
}
