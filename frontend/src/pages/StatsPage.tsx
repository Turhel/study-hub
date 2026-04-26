import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { getStatsByDiscipline, getStatsOverview } from "../lib/api";
import type { StatsDisciplineSignal, StatsSubjectPerformance } from "../lib/types";

const disciplines = ["Matematica", "Biologia", "Quimica", "Fisica", "Linguagens", "Humanas"];
type StatsCardTone = "blue" | "pink" | "gold" | "green";

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

function StatCard({
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
        <div>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
        <span className="stats-card-icon">
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

function DisciplineSignalList({ title, items }: { title: string; items?: StatsDisciplineSignal[] }) {
  return (
    <section className="stats-list-panel">
      <div className="stats-list-head">
        <h3>{title}</h3>
      </div>
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
      <div className="stats-list-head">
        <h3>{title}</h3>
      </div>
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

function GuidanceIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="17" className="today-icon-fill-blue" />
      <circle cx="24" cy="24" r="9" className="today-icon-fill-gold" />
      <circle cx="24" cy="24" r="3" className="today-icon-fill-coral" />
    </svg>
  );
}

function StatsNextStep({
  title,
  description,
  primaryTo,
  primaryLabel,
  secondaryTo,
  secondaryLabel,
}: {
  title: string;
  description: string;
  primaryTo: string;
  primaryLabel: string;
  secondaryTo?: string;
  secondaryLabel?: string;
}) {
  return (
    <section className="app-next-step-panel">
      <div className="app-next-step-copy">
        <p className="today-eyebrow">Faca agora</p>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="app-next-step-actions">
        <Link className="app-primary-action app-primary-action-blue app-guidance-link" to={primaryTo}>
          {primaryLabel}
        </Link>
        {secondaryTo && secondaryLabel ? (
          <Link className="app-secondary-action app-guidance-link" to={secondaryTo}>
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
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
  const hasAnyVolume = (overview?.questions_today ?? 0) > 0 || (overview?.questions_this_week ?? 0) > 0;
  const nextStep = hasAnyVolume
    ? {
        title: `Use ${selectedDiscipline} para decidir o reforco`,
        description:
          "Leia a visao geral, depois veja a disciplina que mais importa agora. Se a taxa de acerto caiu, volte para Today ou Aulas com esse alvo claro.",
        primaryTo: "/",
        primaryLabel: "Voltar ao foco do dia",
        secondaryTo: "/lessons",
        secondaryLabel: "Abrir aulas",
      }
    : {
        title: "Alimente esta tela primeiro",
        description:
          "Sem registro real, Estatisticas vira so uma tela vazia. O melhor proximo passo e resolver algumas questoes no foco do dia e registrar o resultado.",
        primaryTo: "/",
        primaryLabel: "Ir para Today",
        secondaryTo: "/lessons",
        secondaryLabel: "Ver aulas",
      };

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

        <section className="app-guidance-panel">
          <div className="app-guidance-head">
            <div>
              <h3>Como usar esta tela</h3>
              <p>As estatisticas servem para confirmar se o estudo do dia virou registro real, nao para te deixar perdido em numero.</p>
            </div>
            <span className="app-guidance-icon">
              <GuidanceIcon />
            </span>
          </div>
          <div className="app-guidance-steps">
            <div className="app-guidance-step">
              <span className="app-guidance-step-index">1</span>
              <p>Registre algumas questoes no Foco do dia para alimentar este painel.</p>
            </div>
            <div className="app-guidance-step">
              <span className="app-guidance-step-index">2</span>
              <p>Use o overview para ver volume e acerto sem abrir disciplina por disciplina.</p>
            </div>
            <div className="app-guidance-step">
              <span className="app-guidance-step-index">3</span>
              <p>Quando algo estiver fraco, volte para a TodayPage ou para Aulas e ataque esse ponto.</p>
            </div>
          </div>
          <div className="app-guidance-actions">
            <Link className="app-primary-action app-primary-action-blue app-guidance-link" to="/">
              Abrir foco do dia
            </Link>
            <Link className="app-secondary-action app-guidance-link" to="/lessons">
              Ir para aulas
            </Link>
          </div>
        </section>

        <StatsNextStep {...nextStep} />

        <section className="today-panel today-panel-wide">
          <div className="today-section-heading">
            <div>
              <p className="today-eyebrow">Overview</p>
              <h2>Geral</h2>
            </div>
          </div>

          {overviewQuery.isLoading ? (
            <div className="app-empty-card">
              <strong>Carregando estatisticas...</strong>
              <p>Assim que houver resposta do backend, este bloco mostra volume, acerto e tempo medio.</p>
            </div>
          ) : (
            <div className="stats-grid">
              <StatCard label="Questoes hoje" value={overview?.questions_today ?? 0} tone="gold" />
              <StatCard label="Questoes na semana" value={overview?.questions_this_week ?? 0} tone="blue" />
              <StatCard label="Questoes no mes" value={overview?.questions_this_month ?? 0} tone="pink" />
              <StatCard label="Acerto hoje" value={formatPercent(overview?.accuracy_today)} tone="green" />
              <StatCard label="Acerto na semana" value={formatPercent(overview?.accuracy_this_week)} tone="blue" />
              <StatCard label="Acerto no mes" value={formatPercent(overview?.accuracy_this_month)} tone="pink" />
              <StatCard
                label="Tempo medio correto"
                value={formatSeconds(overview?.avg_time_correct_questions_seconds)}
                tone="gold"
              />
              <StatCard label="Assuntos na semana" value={overview?.studied_subjects_this_week ?? 0} tone="green" />
              <StatCard label="Blocos impactados" value={overview?.impacted_blocks_this_week ?? 0} tone="blue" />
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
            <div className="app-empty-card">
              <strong>Disciplina indisponivel agora.</strong>
              <p>Voce ainda pode usar o overview geral e voltar nesta aba quando o backend responder.</p>
            </div>
          ) : null}

          {disciplineQuery.isLoading ? (
            <div className="app-empty-card">
              <strong>Carregando disciplina...</strong>
              <p>Este painel aprofunda o desempenho so da materia selecionada.</p>
            </div>
          ) : (
            <div className="stats-grid">
              <StatCard label="Questoes na semana" value={discipline?.questions_this_week ?? 0} tone="gold" />
              <StatCard label="Questoes no mes" value={discipline?.questions_this_month ?? 0} tone="blue" />
              <StatCard label="Acerto" value={formatPercent(discipline?.accuracy)} tone="green" />
              <StatCard
                label="Tempo medio correto"
                value={formatSeconds(discipline?.avg_time_correct_questions_seconds)}
                tone="pink"
              />
              <StatCard label="Revisoes vencidas" value={discipline?.review_due_count ?? 0} tone="pink" />
              <StatCard label="Blocos em andamento" value={discipline?.blocks_in_progress ?? 0} tone="blue" />
              <StatCard label="Blocos revisaveis" value={discipline?.blocks_reviewable ?? 0} tone="gold" />
              <StatCard label="Assuntos estudados" value={discipline?.studied_subjects ?? 0} tone="green" />
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
