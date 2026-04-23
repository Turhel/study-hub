import type { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

export default function SectionCard({ title, children, className = "" }: SectionCardProps) {
  return (
    <section className={`bento-card p-6 ${className}`}>
      <h2 className="pixel-font text-base font-bold uppercase text-zinc-100">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}
