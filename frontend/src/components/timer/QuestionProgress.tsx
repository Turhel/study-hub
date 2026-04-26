import type { QuestionEntry } from "../../lib/timerTypes";

type QuestionProgressProps = {
  questions: QuestionEntry[];
  activeIndex: number;
  onSelectQuestion: (index: number) => void;
};

const dotClass = {
  pending: "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:bg-white/[0.06]",
  active: "border-sky-300/80 bg-sky-400 text-slate-950 shadow-[0_0_18px_rgba(56,189,248,0.28)]",
  completed: "border-emerald-300/40 bg-emerald-400/18 text-emerald-200 hover:border-emerald-300/60",
  skipped: "border-yellow-300/40 bg-yellow-300/16 text-yellow-200 hover:border-yellow-300/60",
};

export default function QuestionProgress({ questions, activeIndex, onSelectQuestion }: QuestionProgressProps) {
  const doneCount = questions.filter((question) => question.status === "completed" || question.status === "skipped").length;
  const percent = questions.length ? (doneCount / questions.length) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>Mapa de questoes</span>
        <span>
          {doneCount}/{questions.length}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-sky-400 transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex flex-wrap gap-2">
        {questions.map((question) => (
          <button
            key={question.index}
            type="button"
            className={`min-w-10 rounded-xl border px-3 py-2 text-center text-xs font-semibold tabular-nums transition ${dotClass[question.status]} ${
              activeIndex === question.index ? "ring-2 ring-sky-300/30" : ""
            }`}
            onClick={() => onSelectQuestion(question.index)}
          >
            {question.index + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
