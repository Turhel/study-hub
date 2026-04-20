type MetricCardProps = {
  label: string;
  value: number;
  hint: string;
};

export default function MetricCard({ label, value, hint }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-soft">
      <p className="text-sm font-medium text-zinc-400">{label}</p>
      <p className="mt-3 text-4xl font-semibold tracking-normal text-zinc-50">{value}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{hint}</p>
    </div>
  );
}
