import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getStudyPlanToday } from "../lib/api";
import type { StudyPlanItem } from "../lib/types";

type DisciplineCard = {
  discipline: string;
  subjects: string[];
  blocks: string[];
  plannedQuestions: number;
  completedQuestions: number;
  remainingQuestions: number;
  icon: string;
  toneClassName: string;
};

const disciplineVisualMap: Record<string, { icon: string; toneClassName: string }> = {
  Linguagens: { icon: "📝", toneClassName: "today-discipline-card-languages" },
  "Ciencias Humanas": { icon: "🏛️", toneClassName: "today-discipline-card-humanas" },
  Matematica: { icon: "📐", toneClassName: "today-discipline-card-math" },
  "Ciencias da Natureza": { icon: "🌿", toneClassName: "today-discipline-card-nature" },
  Biologia: { icon: "🧬", toneClassName: "today-discipline-card-nature" },
  Quimica: { icon: "🧪", toneClassName: "today-discipline-card-nature" },
  Fisica: { icon: "⚡", toneClassName: "today-discipline-card-nature" },
  Redacao: { icon: "✍️", toneClassName: "today-discipline-card-writing" },
};

function normalizeDisciplineKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function buildDisciplineCards(items: StudyPlanItem[]): DisciplineCard[] {
  const grouped = items.reduce<Map<string, DisciplineCard>>((acc, item) => {
    const current = acc.get(item.discipline);
    const normalizedDiscipline = normalizeDisciplineKey(item.discipline);
    const visual = disciplineVisualMap[normalizedDiscipline] ?? {
      icon: "📚",
      toneClassName: "today-discipline-card-default",
    };

    if (!current) {
      acc.set(item.discipline, {
        discipline: item.discipline,
        subjects: [item.subject_name],
        blocks: [item.block_name],
        plannedQuestions: item.planned_questions,
        completedQuestions: item.completed_today,
        remainingQuestions: item.remaining_today,
        icon: visual.icon,
        toneClassName: visual.toneClassName,
      });
      return acc;
    }

    if (!current.subjects.includes(item.subject_name)) {
      current.subjects.push(item.subject_name);
    }

    if (!current.blocks.includes(item.block_name)) {
      current.blocks.push(item.block_name);
    }

    current.plannedQuestions += item.planned_questions;
    current.completedQuestions += item.completed_today;
    current.remainingQuestions += item.remaining_today;
    acc.set(item.discipline, current);
    return acc;
  }, new Map());

  return [...grouped.values()].sort((a, b) => b.plannedQuestions - a.plannedQuestions);
}

function summarizeSubjects(subjects: string[]): string {
  if (subjects.length <= 3) {
    return subjects.join(", ");
  }

  return `${subjects.slice(0, 3).join(", ")} e mais ${subjects.length - 3}`;
}

const visualTabs = [
  { label: "Areas", icon: "📚", active: true },
  { label: "Competencias", icon: "🎯", active: false },
  { label: "Habilidades", icon: "🛠️", active: false },
];

export default function TodayPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["study-plan-today"],
    queryFn: getStudyPlanToday,
  });

  const disciplineCards = useMemo(() => buildDisciplineCards(data?.items ?? []), [data?.items]);

  if (isLoading) {
    return <main className="today-status">Carregando suas materias de hoje...</main>;
  }

  if (isError || !data) {
    return <main className="today-status">Nao foi possivel carregar o plano de hoje.</main>;
  }

  return (
    <main className="today-page">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="today-subjects-shell"
      >
        <div className="today-subjects-header">
          <p className="today-subjects-kicker">Treinar</p>
          <h1 className="today-subjects-title">Materias para estudar hoje</h1>
          <p className="today-subjects-copy">
            Treine com questoes ajustadas ao seu nivel e veja as materias que puxam o foco do dia.
          </p>
        </div>

        <div className="today-visual-tabs" aria-hidden="true">
          {visualTabs.map((tab) => (
            <span
              key={tab.label}
              className={`today-visual-tab ${tab.active ? "today-visual-tab-active" : ""}`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </span>
          ))}
        </div>

        {disciplineCards.length === 0 ? (
          <section className="today-subjects-empty">
            <p>Nenhuma materia entrou no plano de hoje ainda.</p>
          </section>
        ) : (
          <section className="today-discipline-grid">
            {disciplineCards.map((card) => (
              <article key={card.discipline} className={`today-discipline-card ${card.toneClassName}`}>
                <div className="today-discipline-card-main">
                  <div>
                    <h2>{card.discipline}</h2>
                    <p>{summarizeSubjects(card.subjects)}.</p>
                  </div>
                  <span className="today-discipline-icon" aria-hidden="true">
                    {card.icon}
                  </span>
                </div>

                <div className="today-discipline-card-footer">
                  <div className="today-discipline-stats">
                    <div className="today-discipline-mini-stat">
                      <strong>{card.plannedQuestions}</strong>
                      <span>Hoje</span>
                    </div>
                    <div className="today-discipline-mini-stat">
                      <strong>{card.completedQuestions}</strong>
                      <span>Feitas</span>
                    </div>
                  </div>

                  <div className="today-discipline-actions">
                    <button type="button" className="today-discipline-icon-button" aria-label={`Ver detalhes de ${card.discipline}`}>
                      📊
                    </button>
                    <button type="button" className="today-discipline-train-button">
                      Treinar
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </motion.section>
    </main>
  );
}
