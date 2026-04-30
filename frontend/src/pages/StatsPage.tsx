import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

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
type TrendDirection = "up" | "down" | "flat";
type ChartScaleOptions = {
  min?: number;
  max?: number;
  minVisualMax?: number;
  paddingTopRatio?: number;
};
type ChartScale = {
  min: number;
  max: number;
  toY: (value: number, top: number, bottom: number) => number;
};

function formatPercent(value?: number | null): string {
  return `${Math.round((value ?? 0) * 100)}%`;
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

function formatWeekLabel(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (start.getMonth() === end.getMonth()) {
    return `${start.toLocaleDateString("pt-BR", { day: "2-digit" })}–${end.toLocaleDateString("pt-BR", { day: "2-digit" })} ${start.toLocaleDateString("pt-BR", { month: "short" })}`;
  }

  return `${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}–${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
}

function formatWeekTick(startDate: string): string {
  return new Date(`${startDate}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function formatWeekRange(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return `${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} - ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
}

function clampNumber(value: number, min: number, max?: number): number {
  const upper = max === undefined ? value : Math.min(value, max);
  return Math.max(min, upper);
}

function formatSecondsShort(value?: number | null): string {
  if (value === null || value === undefined) {
    return "0s";
  }
  const rounded = Math.max(0, Math.round(value));
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m${String(seconds).padStart(2, "0")}s`;
}

function buildChartScale(values: number[], options: ChartScaleOptions = {}): ChartScale {
  const min = options.min ?? 0;
  const finiteValues = values.filter((value) => Number.isFinite(value));
  const rawMax = finiteValues.length > 0 ? Math.max(...finiteValues) : min;
  const max = Math.max(
    min + 1,
    options.max ?? Math.max(rawMax * (1 + (options.paddingTopRatio ?? 0)), options.minVisualMax ?? min + 1),
  );

  return {
    min,
    max,
    toY(value: number, top: number, bottom: number) {
      const clamped = clampNumber(value, min, max);
      const span = Math.max(max - min, 1);
      const normalized = (clamped - min) / span;
      return bottom - normalized * (bottom - top);
    },
  };
}

function linearRegression(values: Array<number | null | undefined>): null | { slope: number; intercept: number; direction: TrendDirection } {
  const usable = values
    .map((value, index) => ({ x: index, y: value }))
    .filter((point): point is { x: number; y: number } => point.y !== null && point.y !== undefined && Number.isFinite(point.y));

  if (usable.length < 2) {
    return null;
  }

  const count = usable.length;
  const sumX = usable.reduce((total, point) => total + point.x, 0);
  const sumY = usable.reduce((total, point) => total + point.y, 0);
  const sumXY = usable.reduce((total, point) => total + point.x * point.y, 0);
  const sumXX = usable.reduce((total, point) => total + point.x * point.x, 0);
  const denominator = count * sumXX - sumX * sumX;
  if (denominator === 0) {
    return null;
  }

  const slope = (count * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / count;
  const direction: TrendDirection = Math.abs(slope) < 0.001 ? "flat" : slope > 0 ? "up" : "down";
  return { slope, intercept, direction };
}

function getTrendValue(regression: null | { slope: number; intercept: number }, index: number): number | null {
  if (!regression) {
    return null;
  }
  return regression.intercept + regression.slope * index;
}

function buildLinePath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return "";
  }
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function getVisibleLabelStep(count: number): number {
  if (count <= 6) {
    return 1;
  }
  if (count <= 10) {
    return 2;
  }
  if (count <= 16) {
    return 3;
  }
  return 4;
}

function buildX(index: number, count: number, left: number, right: number, width: number): number {
  const plotWidth = width - left - right;
  if (count <= 1) {
    return left + plotWidth / 2;
  }
  return left + (index / (count - 1)) * plotWidth;
}

function describeTimeTrend(direction: TrendDirection): string {
  if (direction === "down") {
    return "melhorando";
  }
  if (direction === "up") {
    return "piorando";
  }
  return "estavel";
}

function useDraggableTrendStrip(itemCount: number, focusIndex: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ pointerId: number; startX: number; startScrollLeft: number } | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const items = Array.from(element.querySelectorAll<HTMLElement>(".stats-bars-column, .stats-trend-anchor"));
      const focusItem = items[focusIndex];
      if (focusItem) {
        const itemCenter = focusItem.offsetLeft + focusItem.offsetWidth / 2;
        const targetLeft = itemCenter - element.clientWidth / 2;
        const maxLeft = Math.max(0, element.scrollWidth - element.clientWidth);
        element.scrollLeft = Math.max(0, Math.min(targetLeft, maxLeft));
        return;
      }

      const segmentWidth = element.scrollWidth / Math.max(itemCount, 1);
      const itemCenter = segmentWidth * focusIndex + segmentWidth / 2;
      const targetLeft = itemCenter - element.clientWidth / 2;
      const maxLeft = Math.max(0, element.scrollWidth - element.clientWidth);
      element.scrollLeft = Math.max(0, Math.min(targetLeft, maxLeft));
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusIndex, itemCount]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const element = ref.current;
    if (!element) {
      return;
    }
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: element.scrollLeft,
    };
    element.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const element = ref.current;
    const state = dragState.current;
    if (!element || !state || state.pointerId !== event.pointerId) {
      return;
    }
    const delta = event.clientX - state.startX;
    element.scrollLeft = state.startScrollLeft - delta;
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const element = ref.current;
    if (!element || !dragState.current || dragState.current.pointerId !== event.pointerId) {
      return;
    }
    element.releasePointerCapture(event.pointerId);
    dragState.current = null;
  }

  return {
    ref,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: handlePointerEnd,
    handlePointerCancel: handlePointerEnd,
  };
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
        <article title="Maior sequencia de dias estudando dentro do periodo mostrado.">
          <strong>{data.longest_streak_days}</strong>
          <span>maior ofensiva</span>
        </article>
        <article title="Quantidade de dias com estudo real dentro do periodo filtrado.">
          <strong>{data.active_days}</strong>
          <span>dias ativos</span>
        </article>
        <article title="Total de questoes registradas no periodo filtrado.">
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
        <span className="stats-heatmap-legend-separator">/</span>
        <span>mais questoes</span>
      </div>
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

function QuestionsTrendChart({ points }: { points: StatsTimeSeriesPoint[] }) {
  const focusIndex = Math.max(points.length - 1, 0);
  const scroller = useDraggableTrendStrip(points.length, focusIndex);
  const width = Math.max(points.length * 44, 220);
  const height = 176;
  const left = 34;
  const right = 12;
  const top = 14;
  const bottom = 132;
  const scale = buildChartScale(points.map((point) => point.questions_count), { min: 0, minVisualMax: 5, paddingTopRatio: 0.15 });
  const labelStep = getVisibleLabelStep(points.length);
  const plotWidth = width - left - right;
  const barSlot = points.length > 0 ? plotWidth / points.length : plotWidth;
  const barWidth = Math.max(12, Math.min(18, barSlot * 0.54));

  return (
    <div className="stats-trend-strip-shell">
      <div
        ref={scroller.ref}
        className="stats-trend-strip"
        onPointerDown={scroller.handlePointerDown}
        onPointerMove={scroller.handlePointerMove}
        onPointerUp={scroller.handlePointerUp}
        onPointerCancel={scroller.handlePointerCancel}
      >
        <div className="stats-bars-chart" style={{ width: `${width}px` }} role="img" aria-label="Questoes por semana com tendencia">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="stats-composed-chart"
            aria-hidden="true"
          >
            <line x1={left} x2={width - right} y1={bottom} y2={bottom} className="stats-axis-line" />
            {points.map((point, index) => {
              const x = buildX(index, points.length, left, right, width);
              const y = scale.toY(point.questions_count, top, bottom);
              const showLabel = index % labelStep === 0 || index === points.length - 1;
              return (
                <g key={point.period}>
                  <rect
                    x={x - barWidth / 2}
                    y={y}
                    width={barWidth}
                    height={Math.max(bottom - y, 1)}
                    rx="4"
                    className="stats-bar-rect"
                  >
                    <title>{`${formatWeekRange(point.start_date, point.end_date)} - ${point.questions_count} questoes`}</title>
                  </rect>
                  {showLabel ? (
                    <text x={x} y={bottom + 14} textAnchor="middle" className="stats-line-axis-label">
                      {formatWeekTick(point.start_date)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

function AccuracyTrendChart({
  points,
}: {
  points: StatsTimeSeriesPoint[];
}) {
  const focusIndex = Math.max(points.length - 1, 0);
  const scroller = useDraggableTrendStrip(points.length, focusIndex);
  const width = Math.max(points.length * 44, 220);
  const height = 176;
  const left = 36;
  const right = 12;
  const top = 14;
  const bottom = 132;
  const scale = buildChartScale(points.map((point) => point.accuracy), { min: 0, max: 1.1 });
  const actualCoords = points.map((point, index) => ({
    x: buildX(index, points.length, left, right, width),
    y: scale.toY(clampNumber(point.accuracy, 0, 1), top, bottom),
  }));
  const regression = linearRegression(points.map((point) => point.accuracy));
  const trendCoords = regression
    ? points.map((_, index) => ({
        x: buildX(index, points.length, left, right, width),
        y: scale.toY(clampNumber(getTrendValue(regression, index) ?? 0, 0, 1), top, bottom),
      }))
    : [];
  const labelStep = getVisibleLabelStep(points.length);
  const referenceTicks = [0, 0.5, 1];

  return (
    <div className="stats-trend-strip-shell">
      <div
        ref={scroller.ref}
        className="stats-trend-strip"
        onPointerDown={scroller.handlePointerDown}
        onPointerMove={scroller.handlePointerMove}
        onPointerUp={scroller.handlePointerUp}
        onPointerCancel={scroller.handlePointerCancel}
      >
        <svg viewBox={`0 0 ${width} ${height}`} className="stats-composed-chart" role="img" aria-hidden="true" style={{ width: `${width}px` }}>
          {referenceTicks.map((tick) => {
            const y = scale.toY(tick, top, bottom);
            return (
              <g key={tick}>
                <line x1={left} x2={width - right} y1={y} y2={y} className="stats-grid-line" />
                <text x={left - 8} y={y + 3} textAnchor="end" className="stats-y-axis-label">
                  {formatPercent(tick)}
                </text>
              </g>
            );
          })}
          <line x1={left} x2={width - right} y1={bottom} y2={bottom} className="stats-axis-line" />
          <path d={buildLinePath(actualCoords)} className="stats-line-path stats-line-accent-blue" />
          {regression ? <path d={buildLinePath(trendCoords)} className="stats-line-path stats-line-projection stats-line-accent-blue stats-line-trend-subtle" /> : null}
          {points.map((point, index) => {
            const coord = actualCoords[index];
            const showLabel = index % labelStep === 0 || index === points.length - 1;
            return (
              <g key={point.period}>
                <circle cx={coord.x} cy={coord.y} r="3.5" className="stats-line-dot stats-line-accent-blue" />
                <title>{`${formatWeekLabel(point.start_date, point.end_date)} - ${formatPercent(point.accuracy)}`}</title>
                {showLabel ? (
                  <text x={coord.x} y={bottom + 14} textAnchor="middle" className="stats-line-axis-label">
                    {formatWeekTick(point.start_date)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="stats-chart-legend">
        <span><i className="stats-legend-swatch stats-legend-swatch-area" />acuracia</span>
        {regression ? <span title="Linha pontilhada calculada por regressao linear simples sobre a acuracia semanal."><i className="stats-legend-swatch stats-legend-swatch-line" />tendencia</span> : null}
      </div>
    </div>
  );
}

function TimeTrendChart({ points }: { points: StatsTimeSeriesPoint[] }) {
  const focusIndex = Math.max(points.length - 1, 0);
  const scroller = useDraggableTrendStrip(points.length, focusIndex);
  const width = Math.max(points.length * 44, 220);
  const height = 176;
  const left = 40;
  const right = 12;
  const top = 14;
  const bottom = 132;
  const values = points.map((point) => point.avg_time_correct_questions_seconds ?? 0);
  const scale = buildChartScale(values, { min: 0, minVisualMax: 180, paddingTopRatio: 0.15 });
  const actualCoords = points.map((point, index) => ({
    x: buildX(index, points.length, left, right, width),
    y: scale.toY(point.avg_time_correct_questions_seconds ?? 0, top, bottom),
  }));
  const regression = linearRegression(values);
  const trendCoords = regression
    ? points.map((_, index) => ({
        x: buildX(index, points.length, left, right, width),
        y: scale.toY(clampNumber(getTrendValue(regression, index) ?? 0, 0, scale.max), top, bottom),
      }))
    : [];
  const targetY = scale.toY(180, top, bottom);
  const labelStep = getVisibleLabelStep(points.length);
  const trendSummary = regression ? describeTimeTrend(regression.direction) : "sem tendencia suficiente";

  return (
    <div className="stats-trend-strip-shell">
      <div
        ref={scroller.ref}
        className="stats-trend-strip"
        onPointerDown={scroller.handlePointerDown}
        onPointerMove={scroller.handlePointerMove}
        onPointerUp={scroller.handlePointerUp}
        onPointerCancel={scroller.handlePointerCancel}
      >
        <svg viewBox={`0 0 ${width} ${height}`} className="stats-composed-chart" role="img" aria-hidden="true" style={{ width: `${width}px` }}>
          <line x1={left} x2={width - right} y1={targetY} y2={targetY} className="stats-line-target" />
          <text x={width - right} y={Math.max(targetY - 6, top + 8)} textAnchor="end" className="stats-line-target-label">
            meta 3min
          </text>
          <line x1={left} x2={width - right} y1={bottom} y2={bottom} className="stats-axis-line" />
          <path d={buildLinePath(actualCoords)} className="stats-line-path stats-line-accent-gold" />
          {regression ? <path d={buildLinePath(trendCoords)} className="stats-line-path stats-line-projection stats-line-accent-gold stats-line-trend-subtle" /> : null}
          {points.map((point, index) => {
            const coord = actualCoords[index];
            const showLabel = index % labelStep === 0 || index === points.length - 1;
            return (
              <g key={point.period}>
                <circle cx={coord.x} cy={coord.y} r="3.5" className="stats-line-dot stats-line-accent-gold" />
                <title>{`${formatWeekLabel(point.start_date, point.end_date)} - ${formatSecondsShort(point.avg_time_correct_questions_seconds)}`}</title>
                {showLabel ? (
                  <text x={coord.x} y={bottom + 14} textAnchor="middle" className="stats-line-axis-label">
                    {formatWeekTick(point.start_date)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="stats-chart-legend">
        <span><i className="stats-legend-swatch stats-legend-swatch-time" />tempo real</span>
        {regression ? <span title="Linha pontilhada calculada por regressao linear simples sobre o tempo medio das questoes corretas."><i className="stats-legend-swatch stats-legend-swatch-line stats-legend-swatch-line-gold" />tendencia</span> : null}
        <span title="Referencia de 3 minutos para leitura mais confortavel do ritmo."><i className="stats-legend-swatch stats-legend-swatch-target" />meta 3min</span>
      </div>
      <div className="stats-trend-status">{trendSummary}</div>
    </div>
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
        </section>

        {hasAnyError ? (
          <section className="today-panel today-error-panel">
            <strong>Algum bloco de estatisticas nao carregou.</strong>
            <p>A pagina continua estavel, mas parte dos graficos pode estar incompleta ate a proxima tentativa.</p>
          </section>
        ) : null}

        <Heatmap
          data={heatmap}
          title={selectedDiscipline ? `Ultimos 365 dias em ${selectedDiscipline}` : "Ultimos 365 dias de estudo"}
        />

        <div className="stats-trend-grid">
          <ChartFrame title="Questoes por semana" subtitle="Volume semanal em barras simples.">
            {timeseriesPoints.length > 0 ? (
              <QuestionsTrendChart points={timeseriesPoints} />
            ) : (
              <p className="today-empty-copy">Sem pontos suficientes para desenhar o volume.</p>
            )}
          </ChartFrame>

          <ChartFrame title="Acuracia por semana" subtitle="Escala fixa de 0% a 100%, com referencia clara.">
            {timeseriesPoints.length > 0 ? (
              <AccuracyTrendChart points={timeseriesPoints} />
            ) : (
              <p className="today-empty-copy">Sem pontos suficientes para desenhar a acuracia.</p>
            )}
          </ChartFrame>

          <ChartFrame title="Tempo medio correto" subtitle="Linha real com meta de 3min e tendencia discreta.">
            {timeseriesPoints.length > 0 ? (
              <TimeTrendChart points={timeseriesPoints} />
            ) : (
              <p className="today-empty-copy">Sem tempo suficiente para desenhar o ritmo.</p>
            )}
          </ChartFrame>
        </div>

        {selectedDiscipline ? (
          <>
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

        <section className="today-panel today-panel-wide">
          <div className="stats-grid">
            {summaryCards.map((card) => (
              <SummaryCard key={card.label} {...card} />
            ))}
            {secondaryCards.map((card) => (
              <SummaryCard key={card.label} {...card} />
            ))}
            {selectedDiscipline ? (
              <>
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
              </>
            ) : null}
          </div>
        </section>

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
