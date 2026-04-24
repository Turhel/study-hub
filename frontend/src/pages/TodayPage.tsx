import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getStudyPlanToday } from "../lib/api";
import type { StudyPlanItem } from "../lib/types";

type DisciplineCard = {
  discipline: string;
  subjects: string[];
  plannedQuestions: number;
  completedQuestions: number;
  icon: string;
  toneClassName: string;
};

const smokeDisciplineCard: DisciplineCard = {
  discipline: "Matemática",
  subjects: ["Matemática aplicada à realidade"],
  plannedQuestions: 12,
  completedQuestions: 0,
  icon: "📐",
  toneClassName: "today-discipline-card-math",
};

const disciplineVisualMap: Record<string, { icon: string; toneClassName: string }> = {
  "Linguagens e Códigos": { icon: "📝", toneClassName: "today-discipline-card-languages" },
  Linguagens: { icon: "📝", toneClassName: "today-discipline-card-languages" },
  "Ciencias Humanas": { icon: "🏛️", toneClassName: "today-discipline-card-humanas" },
  Geografia: { icon: "🌍", toneClassName: "today-discipline-card-humanas" },
  Historia: { icon: "📜", toneClassName: "today-discipline-card-humanas" },
  Sociologia: { icon: "👥", toneClassName: "today-discipline-card-humanas" },
  Filosofia: { icon: "🤔", toneClassName: "today-discipline-card-humanas" },
  "Matemática e suas Tecnologias": { icon: "📐", toneClassName: "today-discipline-card-math" },
  Matematica: { icon: "📐", toneClassName: "today-discipline-card-math" },
  "Ciencias da Natureza": { icon: "🌿", toneClassName: "today-discipline-card-nature" },
  Biologia: { icon: "🧬", toneClassName: "today-discipline-card-nature" },
  Quimica: { icon: "🧪", toneClassName: "today-discipline-card-nature" },
  Fisica: { icon: "⚡", toneClassName: "today-discipline-card-nature" },
  Redacao: { icon: "✍️", toneClassName: "today-discipline-card-writing" },
};

const visualTabs = [
  { label: "Areas", icon: "📚", active: true },
  { label: "Competencias", icon: "🎯", active: false },
  { label: "Habilidades", icon: "🛠️", active: false },
];

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
        plannedQuestions: item.planned_questions,
        completedQuestions: item.completed_today,
        icon: visual.icon,
        toneClassName: visual.toneClassName,
      });
      return acc;
    }

    if (!current.subjects.includes(item.subject_name)) {
      current.subjects.push(item.subject_name);
    }

    current.plannedQuestions += item.planned_questions;
    current.completedQuestions += item.completed_today;
    acc.set(item.discipline, current);
    return acc;
  }, new Map());

  const cards = [...grouped.values()].sort((a, b) => b.plannedQuestions - a.plannedQuestions);
  return cards.length > 0 ? cards : [smokeDisciplineCard];
}

function summarizeSubjects(subjects: string[]): string {
  if (subjects.length === 1) {
    return subjects[0];
  }

  if (subjects.length <= 3) {
    return subjects.join(", ");
  }

  return `${subjects.slice(0, 3).join(", ")} e mais ${subjects.length - 3}`;
}

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
                <div className="today-discipline-footer-meta">
                  <div className="today-score-chip" aria-hidden="true">
                    <span className="today-score-pill" />
                    <span className="today-score-info">i</span>
                  </div>
                  <span>Sua nota</span>
                </div>

                <div className="today-discipline-footer-count">
                  <strong>{card.completedQuestions}</strong>
                  <span>Feitas</span>
                </div>

                <div className="today-discipline-actions">
                  <button type="button" className="today-discipline-icon-button" aria-label={`Ver detalhes de ${card.discipline}`}>
                    <span className="today-discipline-chart" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </button>
                  <button type="button" className="today-discipline-train-button">
                    Treinar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      </motion.section>
    </main>
  );
}
