type MetricCardProps = {
  label: string;
  value: number;
  hint: string;
  className?: string;
};

export default function MetricCard({ label, value, hint, className = "" }: MetricCardProps) {
  return (
    <div className={`app-card ${className}`}>
      <p className="text-xs font-semibold uppercase text-sky-300">{label}</p>
      <p className="mt-4 text-4xl font-bold text-white">{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-500">{hint}</p>
    </div>
  );
}
