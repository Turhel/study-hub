import type { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

export default function SectionCard({ title, children, className = "" }: SectionCardProps) {
  return (
    <section className={`app-card ${className}`}>
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}
