import type { QuestionEntry } from "../../lib/timerTypes";

type QuestionProgressProps = {
  questions: QuestionEntry[];
};

const dotClass = {
  pending: "border-white/10 bg-white/[0.03] text-zinc-500",
  active: "border-sky-300/80 bg-sky-400 text-slate-950 shadow-[0_0_18px_rgba(56,189,248,0.28)]",
  completed: "border-emerald-300/40 bg-emerald-400/18 text-emerald-200",
  skipped: "border-yellow-300/40 bg-yellow-300/16 text-yellow-200",
};

export default function QuestionProgress({ questions }: QuestionProgressProps) {
  const doneCount = questions.filter((question) => question.status === "completed" || question.status === "skipped").length;
  const percent = questions.length ? (doneCount / questions.length) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>Progresso</span>
        <span>
          {doneCount}/{questions.length}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-sky-400 transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-10 gap-1.5">
        {questions.map((question) => (
          <div
            key={question.index}
            className={`rounded-md border py-1 text-center text-[10px] font-semibold tabular-nums ${dotClass[question.status]}`}
          >
            {question.index + 1}
          </div>
        ))}
      </div>
    </div>
  );
}
