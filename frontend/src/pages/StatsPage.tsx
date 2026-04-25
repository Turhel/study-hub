import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getStatsByDiscipline, getStatsOverview } from "../lib/api";
import type { StatsDisciplineSignal, StatsSubjectPerformance } from "../lib/types";

const disciplines = ["Matematica", "Biologia", "Quimica", "Fisica", "Linguagens", "Humanas"];

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

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <article className="stats-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

function DisciplineSignalList({ title, items }: { title: string; items?: StatsDisciplineSignal[] }) {
  return (
    <section className="stats-list-panel">
      <h3>{title}</h3>
      {items && items.length > 0 ? (
        <div className="stats-list">
          {items.map((item) => (
            <article key={`${item.discipline}-${item.strategic_discipline}`} className="stats-list-item">
              <div>
                <strong>{item.discipline}</strong>
                <span>{item.strategic_discipline}</span>
              </div>
              <small>
                {item.questions} questoes - {formatPercent(item.accuracy)}
              </small>
            </article>
          ))}
        </div>
      ) : (
        <p className="today-empty-copy">Sem dados suficientes ainda.</p>
      )}
    </section>
  );
}

function SubjectList({ title, items }: { title: string; items?: StatsSubjectPerformance[] }) {
  return (
    <section className="stats-list-panel">
      <h3>{title}</h3>
      {items && items.length > 0 ? (
        <div className="stats-list">
          {items.slice(0, 5).map((item) => (
            <article key={item.subject_id} className="stats-list-item">
              <div>
                <strong>{item.subject_name}</strong>
                <span>{item.discipline}</span>
              </div>
              <small>
                {item.attempts} tentativas - {formatPercent(item.accuracy)}
              </small>
            </article>
          ))}
        </div>
      ) : (
        <p className="today-empty-copy">Sem assuntos nesta lista.</p>
      )}
    </section>
  );
}

export default function StatsPage() {
  const [selectedDiscipline, setSelectedDiscipline] = useState(disciplines[0]);

  const overviewQuery = useQuery({
    queryKey: ["stats-overview"],
    queryFn: getStatsOverview,
    retry: false,
  });

  const disciplineQuery = useQuery({
    queryKey: ["stats-discipline", selectedDiscipline],
    queryFn: () => getStatsByDiscipline(selectedDiscipline),
    retry: false,
  });

  const overview = overviewQuery.data;
  const discipline = disciplineQuery.data;

  return (
    <main className="today-page stats-page">
      <section className="today-subjects-shell today-functional-shell">
        <section className="today-panel stats-hero-panel">
          <div>
            <p className="today-eyebrow">Estatisticas</p>
            <h1>Visao de desempenho</h1>
            <p>Um resumo direto do que foi registrado, sem transformar estudo em painel corporativo.</p>
          </div>
        </section>

        {overviewQuery.isError ? (
          <section className="today-panel today-error-panel">
            <strong>Estatisticas indisponiveis</strong>
            <p>Nao foi possivel carregar o overview agora. A pagina continua pronta para tentar novamente.</p>
          </section>
        ) : null}

        <section className="today-panel today-panel-wide">
          <div className="today-section-heading">
            <div>
              <p className="today-eyebrow">Overview</p>
              <h2>Geral</h2>
            </div>
          </div>

          {overviewQuery.isLoading ? (
            <p className="today-empty-copy">Carregando estatisticas...</p>
          ) : (
            <div className="stats-grid">
              <StatCard label="Questoes hoje" value={overview?.questions_today ?? 0} />
              <StatCard label="Questoes na semana" value={overview?.questions_this_week ?? 0} />
              <StatCard label="Questoes no mes" value={overview?.questions_this_month ?? 0} />
              <StatCard label="Acerto hoje" value={formatPercent(overview?.accuracy_today)} />
              <StatCard label="Acerto na semana" value={formatPercent(overview?.accuracy_this_week)} />
              <StatCard label="Acerto no mes" value={formatPercent(overview?.accuracy_this_month)} />
              <StatCard
                label="Tempo medio correto"
                value={formatSeconds(overview?.avg_time_correct_questions_seconds)}
              />
              <StatCard label="Assuntos na semana" value={overview?.studied_subjects_this_week ?? 0} />
              <StatCard label="Blocos impactados" value={overview?.impacted_blocks_this_week ?? 0} />
            </div>
          )}
        </section>

        <div className="stats-two-column">
          <DisciplineSignalList title="Disciplinas fracas" items={overview?.weak_disciplines} />
          <DisciplineSignalList title="Disciplinas fortes" items={overview?.strong_disciplines} />
        </div>

        <section className="today-panel today-panel-wide">
          <div className="today-section-heading">
            <div>
              <p className="today-eyebrow">Por disciplina</p>
              <h2>{discipline?.discipline ?? selectedDiscipline}</h2>
            </div>
          </div>

          <div className="stats-discipline-tabs" role="tablist" aria-label="Disciplinas">
            {disciplines.map((disciplineName) => (
              <button
                key={disciplineName}
                type="button"
                className={disciplineName === selectedDiscipline ? "is-active" : ""}
                onClick={() => setSelectedDiscipline(disciplineName)}
              >
                {disciplineName}
              </button>
            ))}
          </div>

          {disciplineQuery.isError ? (
            <p className="today-empty-copy">Nao foi possivel carregar esta disciplina agora.</p>
          ) : null}

          {disciplineQuery.isLoading ? (
            <p className="today-empty-copy">Carregando disciplina...</p>
          ) : (
            <div className="stats-grid">
              <StatCard label="Questoes na semana" value={discipline?.questions_this_week ?? 0} />
              <StatCard label="Questoes no mes" value={discipline?.questions_this_month ?? 0} />
              <StatCard label="Acerto" value={formatPercent(discipline?.accuracy)} />
              <StatCard
                label="Tempo medio correto"
                value={formatSeconds(discipline?.avg_time_correct_questions_seconds)}
              />
              <StatCard label="Revisoes vencidas" value={discipline?.review_due_count ?? 0} />
              <StatCard label="Blocos em andamento" value={discipline?.blocks_in_progress ?? 0} />
              <StatCard label="Blocos revisaveis" value={discipline?.blocks_reviewable ?? 0} />
              <StatCard label="Assuntos estudados" value={discipline?.studied_subjects ?? 0} />
            </div>
          )}
        </section>

        <div className="stats-two-column">
          <SubjectList title="Assuntos fracos" items={discipline?.weak_subjects} />
          <SubjectList title="Assuntos fortes" items={discipline?.strong_subjects} />
        </div>
      </section>
    </main>
  );
}
