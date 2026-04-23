import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";

import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";
import { getStudyPlanToday, getToday, saveQuestionAttemptsBulk } from "../lib/api";
import type {
  QuestionAttemptBulkPayload,
  QuestionAttemptBulkResponse,
  StudyPlanExecutionStatus,
  StudyPlanItem,
  StudyPlanTodayResponse,
  TodayItem,
} from "../lib/types";

function EmptyState({ text }: { text: string }) {
  return <p className="pixel-inset p-4 text-sm leading-6 text-zinc-500">{text}</p>;
}

function ItemList({ items, emptyText }: { items: TodayItem[]; emptyText: string }) {
  if (items.length === 0) {
    return <EmptyState text={emptyText} />;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={item.id ?? `${item.title}-${index}`} className="pixel-inset px-4 py-3">
          <p className="pixel-font text-sm font-bold text-zinc-100">{item.title}</p>
          {item.description ? <p className="mt-1 text-sm text-zinc-500">{item.description}</p> : null}
        </div>
      ))}
    </div>
  );
}

function StudyPlanStats({ plan }: { plan: StudyPlanTodayResponse }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="pixel-inset px-4 py-3">
        <p className="pixel-font text-xs font-bold uppercase text-zinc-500">Questoes</p>
        <p className="pixel-font mt-3 text-3xl font-bold text-zinc-50">{plan.summary.total_questions}</p>
      </div>
      <div className="pixel-inset px-4 py-3">
        <p className="pixel-font text-xs font-bold uppercase text-zinc-500">Focos</p>
        <p className="pixel-font mt-3 text-3xl font-bold text-zinc-50">{plan.summary.focus_count}</p>
      </div>
    </div>
  );
}

type RegisterFormState = {
  quantity: number;
  correctCount: number;
  source: string;
  difficultyBank: QuestionAttemptBulkPayload["difficulty_bank"];
  difficultyPersonal: QuestionAttemptBulkPayload["difficulty_personal"];
  averageSeconds: number;
  confidence: NonNullable<QuestionAttemptBulkPayload["confidence"]>;
  errorType: string;
  notes: string;
};

const defaultRegisterForm: RegisterFormState = {
  quantity: 8,
  correctCount: 0,
  source: "",
  difficultyBank: "media",
  difficultyPersonal: "media",
  averageSeconds: 180,
  confidence: "media",
  errorType: "",
  notes: "",
};

const executionStatusLabels: Record<StudyPlanExecutionStatus, string> = {
  nao_iniciado: "Nao iniciado",
  em_andamento: "Em andamento",
  concluido: "Concluido",
};

const executionStatusClasses: Record<StudyPlanExecutionStatus, string> = {
  nao_iniciado: "study-plan-status study-plan-status-idle",
  em_andamento: "study-plan-status study-plan-status-progress",
  concluido: "study-plan-status study-plan-status-done",
};

function StudyPlanCard({
  item,
  index,
  onRegister,
  feedback,
}: {
  item: StudyPlanItem;
  index: number;
  onRegister: (item: StudyPlanItem) => void;
  feedback?: QuestionAttemptBulkResponse;
}) {
  const scoreLabel = feedback?.mastery_score == null ? "a definir" : `${Math.round(feedback.mastery_score * 100)}%`;
  const progressPercent = Math.round(Math.min(Math.max(item.progress_ratio, 0), 1) * 100);
  const remainingLabel =
    item.execution_status === "concluido"
      ? "Foco concluido hoje"
      : `Restam ${item.remaining_today} questoes`;

  return (
    <article className="pixel-panel p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="pixel-font text-xs font-bold uppercase text-focus-400">
            Foco {index + 1} / {item.discipline}
          </p>
          <h3 className="mt-3 text-lg font-semibold text-zinc-50">{item.subject_name}</h3>
          <p className="mt-1 text-sm text-zinc-500">{item.block_name}</p>
        </div>
        <div className="pixel-inset shrink-0 px-3 py-2 text-right">
          <p className="pixel-font text-2xl font-bold text-focus-400">{item.planned_questions}</p>
          <p className="text-[11px] text-zinc-500">questoes</p>
        </div>
      </div>

      <div className="pixel-inset mt-4 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-100">
              {item.completed_today} / {item.planned_questions} questoes
            </p>
            <p className="mt-1 text-xs text-zinc-500">{remainingLabel}</p>
          </div>
          <span className={executionStatusClasses[item.execution_status]}>{executionStatusLabels[item.execution_status]}</span>
        </div>
        <div className="study-plan-progress mt-3">
          <div className="study-plan-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-zinc-400 sm:grid-cols-[1fr_auto] sm:items-end">
        <p className="leading-6">{item.primary_reason}</p>
        <span className="pixel-badge text-zinc-300">
          {item.planned_mode}
        </span>
      </div>
      <button
        className="pixel-button mt-5 px-4 py-2 text-sm"
        onClick={() => onRegister(item)}
      >
        Registrar questoes
      </button>
      {feedback ? (
        <div className="pixel-panel-soft mt-5 p-4">
          <p className="pixel-font text-xs font-bold uppercase text-focus-400">Registrado agora</p>
          <div className="mt-3 grid gap-2 text-sm text-zinc-300 sm:grid-cols-3">
            <p>
              <span className="block text-xs text-zinc-500">Tentativas</span>
              {feedback.created_attempts}
            </p>
            <p>
              <span className="block text-xs text-zinc-500">Bloco</span>
              {feedback.mastery_status ?? "a definir"}
            </p>
            <p>
              <span className="block text-xs text-zinc-500">Score</span>
              {scoreLabel}
            </p>
          </div>
          <p className="mt-3 text-sm text-zinc-400">
            Proxima revisao: {feedback.next_review_date ?? "a definir"}
          </p>
          <p className="mt-2 text-sm font-medium text-zinc-100">
            {feedback.impact_message ?? "Registro salvo e progresso atualizado."}
          </p>
        </div>
      ) : null}
    </article>
  );
}

function StudyPlanSection({
  plan,
  isLoading,
  isError,
  onRegister,
  feedbackByItem,
}: {
  plan: StudyPlanTodayResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRegister: (item: StudyPlanItem) => void;
  feedbackByItem: Record<string, QuestionAttemptBulkResponse>;
}) {
  if (isLoading) {
    return <EmptyState text="Carregando o plano diario..." />;
  }

  if (isError || !plan) {
    return <EmptyState text="Ainda nao foi possivel carregar o plano diario." />;
  }

  if (plan.items.length === 0) {
    return <EmptyState text="Ainda nao ha plano diario disponivel. Importe ou desbloqueie conteudos para gerar os focos de hoje." />;
  }

  return (
    <div className="space-y-4">
      <StudyPlanStats plan={plan} />
      <div className="space-y-3">
        {plan.items.map((item, index) => (
          <StudyPlanCard
            key={`${item.block_id}-${item.subject_id}`}
            item={item}
            index={index}
            onRegister={onRegister}
            feedback={feedbackByItem[planItemKey(item)]}
          />
        ))}
      </div>
    </div>
  );
}

function planItemKey(item: Pick<StudyPlanItem, "block_id" | "subject_id">): string {
  return `${item.block_id}-${item.subject_id}`;
}

function RegisterQuestionsModal({
  item,
  onClose,
  onRegistered,
}: {
  item: StudyPlanItem;
  onClose: () => void;
  onRegistered: (item: StudyPlanItem, response: QuestionAttemptBulkResponse) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RegisterFormState>({
    ...defaultRegisterForm,
    quantity: item.planned_questions,
    correctCount: Math.max(0, Math.round(item.planned_questions * 0.6)),
  });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      ...defaultRegisterForm,
      quantity: item.planned_questions,
      correctCount: Math.max(0, Math.round(item.planned_questions * 0.6)),
    });
    setMessage(null);
  }, [item]);

  const mutation = useMutation({
    mutationFn: saveQuestionAttemptsBulk,
    onSuccess: (response) => {
      setMessage(
        `Registradas ${response.created_attempts} questoes. Proxima revisao: ${response.next_review_date ?? "a definir"}.`,
      );
      onRegistered(item, response);
      queryClient.invalidateQueries({ queryKey: ["today"] });
      queryClient.invalidateQueries({ queryKey: ["study-plan-today"] });
      window.setTimeout(onClose, 900);
    },
    onError: () => {
      setMessage("Nao foi possivel registrar agora.");
    },
  });

  function update<K extends keyof RegisterFormState>(key: K, value: RegisterFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Math.max(1, form.quantity);
    const correctCount = Math.min(Math.max(0, form.correctCount), quantity);

    mutation.mutate({
      date: new Date().toISOString().slice(0, 10),
      discipline: item.discipline,
      block_id: item.block_id,
      subject_id: item.subject_id,
      source: form.source.trim() || null,
      quantity,
      correct_count: correctCount,
      difficulty_bank: form.difficultyBank,
      difficulty_personal: form.difficultyPersonal,
      elapsed_seconds: form.averageSeconds > 0 ? form.averageSeconds : null,
      confidence: form.confidence,
      error_type: form.errorType.trim() || null,
      notes: form.notes.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
      <form className="pixel-panel w-full max-w-lg p-5" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="pixel-font text-xs font-bold uppercase text-focus-400">Registro rapido</p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-50">{item.subject_name}</h2>
            <p className="mt-1 text-sm text-zinc-500">{item.discipline} / {item.block_name}</p>
          </div>
          <button type="button" className="pixel-button-muted px-3 py-2 text-xs" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-zinc-400">
            Quantidade feita
            <input
              className="pixel-input mt-1"
              type="number"
              min={1}
              value={form.quantity}
              onChange={(event) => update("quantity", Number(event.target.value))}
            />
          </label>
          <label className="text-sm text-zinc-400">
            Acertos
            <input
              className="pixel-input mt-1"
              type="number"
              min={0}
              max={form.quantity}
              value={form.correctCount}
              onChange={(event) => update("correctCount", Number(event.target.value))}
            />
          </label>
          <label className="text-sm text-zinc-400">
            Fonte
            <input
              className="pixel-input mt-1"
              value={form.source}
              onChange={(event) => update("source", event.target.value)}
              placeholder="Lista, livro, simulado..."
            />
          </label>
          <label className="text-sm text-zinc-400">
            Tempo medio por questao
            <input
              className="pixel-input mt-1"
              type="number"
              min={0}
              value={form.averageSeconds}
              onChange={(event) => update("averageSeconds", Number(event.target.value))}
            />
          </label>
          <label className="text-sm text-zinc-400">
            Dificuldade do banco
            <select
              className="pixel-input mt-1"
              value={form.difficultyBank}
              onChange={(event) => update("difficultyBank", event.target.value as RegisterFormState["difficultyBank"])}
            >
              <option value="facil">Facil</option>
              <option value="media">Media</option>
              <option value="dificil">Dificil</option>
            </select>
          </label>
          <label className="text-sm text-zinc-400">
            Dificuldade pessoal
            <select
              className="pixel-input mt-1"
              value={form.difficultyPersonal}
              onChange={(event) => update("difficultyPersonal", event.target.value as RegisterFormState["difficultyPersonal"])}
            >
              <option value="facil">Facil</option>
              <option value="media">Media</option>
              <option value="dificil">Dificil</option>
            </select>
          </label>
          <label className="text-sm text-zinc-400">
            Confianca
            <select
              className="pixel-input mt-1"
              value={form.confidence}
              onChange={(event) => update("confidence", event.target.value as RegisterFormState["confidence"])}
            >
              <option value="baixa">Baixa</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </label>
          <label className="text-sm text-zinc-400">
            Erro mais comum
            <input
              className="pixel-input mt-1"
              value={form.errorType}
              onChange={(event) => update("errorType", event.target.value)}
              placeholder="conceito, atencao, tempo..."
            />
          </label>
        </div>

        <label className="mt-3 block text-sm text-zinc-400">
          Observacoes
          <textarea
            className="pixel-input mt-1 min-h-20 resize-none"
            value={form.notes}
            onChange={(event) => update("notes", event.target.value)}
          />
        </label>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">{message}</p>
          <button
            type="submit"
            className="pixel-button px-4 py-2 text-sm"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Salvando..." : "Salvar registro"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function TodayPage() {
  const [registeringItem, setRegisteringItem] = useState<StudyPlanItem | null>(null);
  const [feedbackByItem, setFeedbackByItem] = useState<Record<string, QuestionAttemptBulkResponse>>({});
  const { data, isLoading, isError } = useQuery({
    queryKey: ["today"],
    queryFn: getToday,
  });
  const {
    data: studyPlan,
    isLoading: isStudyPlanLoading,
    isError: isStudyPlanError,
  } = useQuery({
    queryKey: ["study-plan-today"],
    queryFn: getStudyPlanToday,
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
    <main className="min-h-screen px-5 py-8 text-zinc-100 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="pixel-panel-soft mb-10 p-6 sm:p-8"
        >
          <p className="pixel-font text-sm font-bold uppercase text-focus-400">Study Hub</p>
          <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_280px] lg:items-end">
            <div className="max-w-3xl">
              <h1 className="pixel-font text-3xl font-bold text-zinc-50 sm:text-5xl">
              O estudo de hoje, sem ruido.
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-400">
                Um resumo limpo para decidir o proximo passo e manter o plano vivo.
              </p>
            </div>
            <div className="pixel-inset p-4">
              <p className="pixel-font text-xs font-bold uppercase text-ember-400">Status</p>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Prioridade adaptativa, revisoes e execucao real em um painel unico.
              </p>
            </div>
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
          className="pixel-panel-soft mt-8 p-7"
        >
          <p className="pixel-font text-sm font-bold uppercase text-focus-400">Prioridade de hoje</p>
          <h2 className="mt-3 text-2xl font-semibold text-zinc-50">{data.priority.title}</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-zinc-400">{data.priority.description}</p>
        </motion.section>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.18 }}
          className="my-8"
        >
          <SectionCard title="Plano de hoje">
            <StudyPlanSection
              plan={studyPlan}
              isLoading={isStudyPlanLoading}
              isError={isStudyPlanError}
              onRegister={setRegisteringItem}
              feedbackByItem={feedbackByItem}
            />
          </SectionCard>
        </motion.div>

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
      {registeringItem ? (
        <RegisterQuestionsModal
          item={registeringItem}
          onClose={() => setRegisteringItem(null)}
          onRegistered={(item, response) =>
            setFeedbackByItem((current) => ({
              ...current,
              [planItemKey(item)]: response,
            }))
          }
        />
      ) : null}
    </main>
  );
}
