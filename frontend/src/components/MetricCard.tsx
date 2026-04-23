type MetricCardProps = {
  label: string;
  value: number;
  hint: string;
  className?: string;
};

export default function MetricCard({ label, value, hint, className = "" }: MetricCardProps) {
  return (
    <div className={`bento-card p-5 ${className}`}>
      <p className="pixel-font text-xs font-bold uppercase text-ember-400">{label}</p>
      <p className="pixel-font mt-4 text-4xl font-bold text-zinc-50">{value}</p>
      <p className="mt-3 text-sm leading-6 text-zinc-500">{hint}</p>
    </div>
  );
}
