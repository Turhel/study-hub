import type { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  children: ReactNode;
};

export default function SectionCard({ title, children }: SectionCardProps) {
  return (
    <section className="pixel-panel p-6">
      <h2 className="pixel-font text-base font-bold uppercase text-zinc-100">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}
