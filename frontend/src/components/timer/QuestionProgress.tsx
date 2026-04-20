import type { QuestionEntry } from "../../lib/timerTypes";

type QuestionProgressProps = {
  questions: QuestionEntry[];
};

const statusClass = {
  pending: "bg-white/10 text-zinc-500",
  active: "bg-focus-500 text-ink-950 ring-2 ring-focus-400/50",
  completed: "bg-focus-500/20 text-focus-400",
  skipped: "bg-ember-400/20 text-ember-400",
};

export default function QuestionProgress({ questions }: QuestionProgressProps) {
  const completedOrSkipped = questions.filter((question) => question.status === "completed" || question.status === "skipped").length;
  const percent = questions.length ? (completedOrSkipped / questions.length) * 100 : 0;

  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-focus-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-10 gap-1.5">
        {questions.map((question) => (
          <div
            key={question.index}
            className={`rounded-md py-1 text-center text-[10px] font-bold ${statusClass[question.status]}`}
          >
            {question.index + 1}
          </div>
        ))}
      </div>
    </div>
  );
}
