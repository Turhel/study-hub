import type { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  children: ReactNode;
};

export default function SectionCard({ title, children }: SectionCardProps) {
  return (
    <section className="rounded-lg border border-white/10 bg-ink-900/85 p-6 shadow-soft">
      <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}
