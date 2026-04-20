import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";

import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";
import { getToday } from "../lib/api";
import type { TodayItem } from "../lib/types";

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm leading-6 text-zinc-500">{text}</p>;
}

function ItemList({ items, emptyText }: { items: TodayItem[]; emptyText: string }) {
  if (items.length === 0) {
    return <EmptyState text={emptyText} />;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={item.id ?? `${item.title}-${index}`} className="rounded-lg bg-white/[0.04] px-4 py-3">
          <p className="font-medium text-zinc-100">{item.title}</p>
          {item.description ? <p className="mt-1 text-sm text-zinc-500">{item.description}</p> : null}
        </div>
      ))}
    </div>
  );
}

export default function TodayPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["today"],
    queryFn: getToday,
  });

  if (isLoading) {
    return <main className="min-h-screen bg-ink-950 px-6 py-10 text-zinc-100">Carregando seu foco de hoje...</main>;
  }

  if (isError || !data) {
    return <main className="min-h-screen bg-ink-950 px-6 py-10 text-zinc-100">Nao foi possivel conectar ao backend.</main>;
  }

  const metrics = [
    { label: "Blocos", value: data.metrics.blocks, hint: "estrutura do plano" },
    { label: "Assuntos", value: data.metrics.subjects, hint: "conteudos mapeados" },
    { label: "Revisoes", value: data.metrics.due_reviews, hint: "vencidas hoje" },
    { label: "Sem contato", value: data.metrics.forgotten_subjects, hint: "pedem revisita" },
  ];

  return (
    <main className="min-h-screen bg-ink-950 px-5 py-8 text-zinc-100 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mb-10"
        >
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-focus-400">Study Hub</p>
          <div className="mt-4 max-w-3xl">
            <h1 className="text-4xl font-semibold tracking-normal text-zinc-50 sm:text-5xl">
              O estudo de hoje, sem ruido.
            </h1>
            <p className="mt-4 text-lg leading-8 text-zinc-400">
              Um resumo limpo para decidir o proximo passo e manter o plano vivo.
            </p>
          </div>
        </motion.header>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.14 }}
          className="my-8 rounded-lg border border-focus-400/30 bg-focus-500/10 p-7 shadow-soft"
        >
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-focus-400">Prioridade de hoje</p>
          <h2 className="mt-3 text-2xl font-semibold text-zinc-50">{data.priority.title}</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-zinc-400">{data.priority.description}</p>
        </motion.section>

        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard title="Revisoes vencidas">
            <ItemList items={data.due_reviews} emptyText="Nenhuma revisao vencida por enquanto." />
          </SectionCard>

          <SectionCard title="Blocos em risco">
            <ItemList items={data.risk_blocks} emptyText="Nenhum bloco em risco no resumo atual." />
          </SectionCard>
        </div>

        <div className="mt-5">
          <SectionCard title="Assuntos sem contato recente">
            <ItemList items={data.forgotten_subjects} emptyText="Nenhum assunto esquecido no momento." />
          </SectionCard>
        </div>
      </div>
    </main>
  );
}
