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
  topReason: string;
  icon: string;
  toneClassName: string;
};

const disciplineVisualMap: Record<string, { icon: string; toneClassName: string }> = {
  Linguagens: { icon: "📝", toneClassName: "today-discipline-card-languages" },
  "Ciências Humanas": { icon: "🏛️", toneClassName: "today-discipline-card-humanas" },
  Matemática: { icon: "📐", toneClassName: "today-discipline-card-math" },
  "Ciências da Natureza": { icon: "🌿", toneClassName: "today-discipline-card-nature" },
  Biologia: { icon: "🧬", toneClassName: "today-discipline-card-nature" },
  Química: { icon: "🧪", toneClassName: "today-discipline-card-nature" },
  Física: { icon: "⚡", toneClassName: "today-discipline-card-nature" },
  Redação: { icon: "✍️", toneClassName: "today-discipline-card-writing" },
};

function buildDisciplineCards(items: StudyPlanItem[]): DisciplineCard[] {
  const grouped = items.reduce<Map<string, DisciplineCard>>((acc, item) => {
    const current = acc.get(item.discipline);
    const visual = disciplineVisualMap[item.discipline] ?? {
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
        topReason: item.primary_reason,
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

export default function TodayPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["study-plan-today"],
    queryFn: getStudyPlanToday,
  });

  const disciplineCards = useMemo(() => buildDisciplineCards(data?.items ?? []), [data?.items]);

  if (isLoading) {
    return <main className="today-status">Carregando suas matérias de hoje...</main>;
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
          <p className="today-subjects-kicker">Foco do dia</p>
          <h1 className="today-subjects-title">Matérias para estudar hoje</h1>
          <p className="today-subjects-copy">
            Só o que importa agora: as áreas que entram no seu estudo de hoje, separadas em cards por matéria.
          </p>
        </div>

        {disciplineCards.length === 0 ? (
          <section className="today-subjects-empty">
            <p>Nenhuma matéria entrou no plano de hoje ainda.</p>
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
                  <div className="today-discipline-stat">
                    <strong>{card.plannedQuestions}</strong>
                    <span>questões</span>
                  </div>
                  <div className="today-discipline-stat">
                    <strong>{card.blocks.length}</strong>
                    <span>blocos</span>
                  </div>
                  <div className="today-discipline-stat">
                    <strong>{card.remainingQuestions}</strong>
                    <span>restantes</span>
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
