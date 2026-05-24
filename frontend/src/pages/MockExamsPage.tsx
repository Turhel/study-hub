import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import {
  createMockExam,
  generateMockExamPlaceholders,
  getMockExamResults,
  getMockExams,
  getMockExamSummary,
} from "../lib/api";
import type { MockExam, MockExamArea, MockExamMode, MockExamPayload, MockExamResultsResponse } from "../lib/types";

const areaOptions: Array<{ value: MockExamArea; label: string }> = [
  { value: "Geral", label: "Geral" },
  { value: "Linguagens", label: "Linguagens" },
  { value: "Humanas", label: "Humanas" },
  { value: "Natureza", label: "Natureza" },
  { value: "Matematica", label: "Matematica" },
  { value: "Redacao", label: "Redacao" },
];

type ExternalFormState = {
  exam_date: string;
  title: string;
  area: MockExamArea;
  mode: MockExamMode;
  total_questions: string;
  correct_count: string;
  tri_score: string;
  duration_minutes: string;
  notes: string;
};

const emptyExternalForm: ExternalFormState = {
  exam_date: new Date().toISOString().slice(0, 10),
  title: "",
  area: "Geral",
  mode: "external",
  total_questions: "90",
  correct_count: "",
  tri_score: "",
  duration_minutes: "",
  notes: "",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "Sem data";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${Math.round(value * 100)}%`;
}

function formatTri(value: number | null | undefined): string {
  if (value == null) return "-";
  return value.toFixed(1);
}

function formatScore(exam: MockExam, results?: MockExamResultsResponse): string {
  return formatTri(results?.estimated_tri_score ?? exam.estimated_tri_score ?? exam.official_tri_score);
}

function isExamFinished(exam: MockExam): boolean {
  return exam.status === "finished" || exam.status === "finalizado";
}

function isExamRunnable(exam: MockExam): boolean {
  return exam.status === "draft" || exam.status === "in_progress" || exam.status === "em_andamento" || exam.status === "pausado";
}

function buildExternalPayload(form: ExternalFormState): MockExamPayload {
  return {
    exam_date: form.exam_date,
    title: form.title.trim(),
    area: form.area,
    mode: form.mode,
    total_questions: Number(form.total_questions),
    correct_count: Number(form.correct_count),
    tri_score: form.tri_score.trim() ? Number(form.tri_score) : null,
    duration_minutes: form.duration_minutes.trim() ? Number(form.duration_minutes) : null,
    notes: form.notes.trim() || null,
  };
}

function validateExternalForm(form: ExternalFormState): string | null {
  if (!form.exam_date) return "Informe a data do simulado.";
  if (!form.title.trim()) return "Informe um titulo para o simulado.";
  const totalQuestions = Number(form.total_questions);
  const correctCount = Number(form.correct_count);
  if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) return "Total de questoes deve ser maior que zero.";
  if (!Number.isFinite(correctCount) || correctCount < 0) return "Acertos nao pode ser negativo.";
  if (correctCount > totalQuestions) return "Acertos nao pode ser maior que o total.";
  if (form.tri_score.trim() && !Number.isFinite(Number(form.tri_score))) return "A nota TRI precisa ser numerica.";
  if (form.duration_minutes.trim() && !Number.isFinite(Number(form.duration_minutes))) return "A duracao precisa ser numerica.";
  return null;
}

function miniChartPoints(values: number[]): string {
  if (values.length === 0) return "";
  const width = 112;
  const height = 34;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, 1);
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / spread) * (height - 6) - 3;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

function bucketTimes(values: number[], buckets = 9): number[] {
  if (values.length <= buckets) return values;
  const bucketSize = Math.ceil(values.length / buckets);
  const result: number[] = [];
  for (let index = 0; index < values.length; index += bucketSize) {
    const slice = values.slice(index, index + bucketSize);
    result.push(slice.reduce((sum, value) => sum + value, 0) / slice.length);
  }
  return result;
}

function FatigueSparkline({ results }: { results?: MockExamResultsResponse }) {
  const times = useMemo(
    () => bucketTimes((results?.questions ?? []).map((question) => question.time_seconds).filter((value): value is number => value != null && value > 0)),
    [results],
  );

  if (times.length < 2) {
    return <span className="text-xs font-semibold text-slate-500">sem curva</span>;
  }

  const path = miniChartPoints(times);
  const last = times[times.length - 1] ?? 0;
  const first = times[0] ?? 0;
  const delta = last - first;

  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 112 34" className="h-9 w-28 overflow-visible" aria-label="Curva de fadiga">
        <path d="M 0 31 L 112 31" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
        <path d={path} fill="none" stroke="#38bdf8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`text-[11px] font-black ${delta > 0 ? "text-amber-300" : "text-sky-300"}`}>
        Tmu {Math.round(last)}s
      </span>
    </div>
  );
}

export default function MockExamsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [externalOpen, setExternalOpen] = useState(false);
  const [form, setForm] = useState<ExternalFormState>(emptyExternalForm);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const examsQuery = useQuery({ queryKey: ["mock-exams"], queryFn: getMockExams, retry: false });
  const summaryQuery = useQuery({ queryKey: ["mock-exams-summary"], queryFn: getMockExamSummary, retry: false });

  const recentExams = useMemo(() => (examsQuery.data ?? []).slice(0, 8), [examsQuery.data]);
  const runnableExam = useMemo(() => (examsQuery.data ?? []).find(isExamRunnable), [examsQuery.data]);
  const finishedRecent = useMemo(() => recentExams.filter(isExamFinished).slice(0, 5), [recentExams]);

  const resultQueries = useQueries({
    queries: finishedRecent.map((exam) => ({
      queryKey: ["mock-exam-results", exam.id],
      queryFn: () => getMockExamResults(exam.id),
      enabled: isExamFinished(exam),
      retry: false,
    })),
  });

  const resultsByExamId = useMemo(() => {
    const map = new Map<number, MockExamResultsResponse>();
    finishedRecent.forEach((exam, index) => {
      const payload = resultQueries[index]?.data;
      if (payload) map.set(exam.id, payload);
    });
    return map;
  }, [finishedRecent, resultQueries]);

  const startDefaultMutation = useMutation({
    mutationFn: async () => {
      const created = await createMockExam({
        exam_date: new Date().toISOString().slice(0, 10),
        title: "Simulado Padrao ENEM",
        area: "Geral",
        mode: "external",
        total_questions: 90,
        correct_count: 0,
        tri_score: null,
        duration_minutes: null,
        notes: "Modo Maratona V3.",
      });
      await generateMockExamPlaceholders(created.id, {
        total_questions: 90,
        areas: [
          { area: "Linguagens/Humanas", start: 1, end: 45 },
          { area: "Natureza/Matematica", start: 46, end: 90 },
        ],
      });
      return created;
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["mock-exams"] });
      navigate(`/mock-exams/${created.id}/run`);
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : "Nao foi possivel iniciar o simulado."),
  });

  const externalMutation = useMutation({
    mutationFn: async () => {
      const validation = validateExternalForm(form);
      if (validation) throw new Error(validation);
      return createMockExam(buildExternalPayload(form));
    },
    onSuccess: async () => {
      setFeedback("Gabarito externo registrado.");
      setForm(emptyExternalForm);
      setExternalOpen(false);
      setFormError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mock-exams"] }),
        queryClient.invalidateQueries({ queryKey: ["mock-exams-summary"] }),
      ]);
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : "Nao foi possivel registrar o gabarito."),
  });

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white md:px-8">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="rounded-[2rem] border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-black/30 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[0.32em] text-sky-300">Simulados V3</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">Modo Maratona</h1>
              <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-slate-400">
                Entre em prova cega, registre por clique e acompanhe endurance sem transformar o simulado em dashboard.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <button
                type="button"
                className="rounded-2xl bg-sky-400 px-6 py-4 text-base font-black text-slate-950 shadow-lg shadow-sky-950/40 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={startDefaultMutation.isPending}
                onClick={() => startDefaultMutation.mutate()}
              >
                {startDefaultMutation.isPending ? "Preparando..." : "⏱️ Iniciar Novo Simulado Padrao"}
              </button>
              <button
                type="button"
                className="rounded-2xl border border-white/15 bg-white/5 px-6 py-4 text-base font-black text-slate-200 transition hover:border-sky-300/60 hover:text-white"
                onClick={() => { setExternalOpen(true); setFeedback(null); setFormError(null); }}
              >
                📑 Registrar Gabarito Externo
              </button>
            </div>
          </div>

          <div className="mt-7 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-950/70 p-4">
              <span className="text-xs font-bold text-slate-500">Simulados</span>
              <strong className="mt-1 block text-2xl font-black">{summaryQuery.data?.total_exams ?? 0}</strong>
            </div>
            <div className="rounded-2xl bg-slate-950/70 p-4">
              <span className="text-xs font-bold text-slate-500">TRI recente</span>
              <strong className="mt-1 block text-2xl font-black">{summaryQuery.isLoading ? "..." : formatTri(summaryQuery.data?.last_three_average_tri)}</strong>
            </div>
            <div className="rounded-2xl bg-slate-950/70 p-4">
              <span className="text-xs font-bold text-slate-500">Acerto recente</span>
              <strong className="mt-1 block text-2xl font-black">{summaryQuery.isLoading ? "..." : formatPercent(summaryQuery.data?.last_three_average_accuracy)}</strong>
            </div>
          </div>
        </section>

        {feedback ? <div className="rounded-2xl border border-sky-400/30 bg-sky-950/50 p-4 text-sm font-bold text-sky-100">{feedback}</div> : null}
        {formError ? <div className="rounded-2xl border border-red-400/30 bg-red-950/40 p-4 text-sm font-bold text-red-100">{formError}</div> : null}

        {externalOpen ? (
          <section className="rounded-[1.5rem] border border-white/10 bg-slate-900/80 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-sky-300">Registro externo</p>
                <h2 className="mt-1 text-2xl font-black">Lancar resultado de prova pronta</h2>
              </div>
              <button type="button" className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-slate-300" onClick={() => setExternalOpen(false)}>
                Fechar
              </button>
            </div>
            <form className="mt-5 grid gap-3 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); externalMutation.mutate(); }}>
              <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400 md:col-span-2">
                Titulo
                <input className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-sky-400" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: ENEM Dia 1" />
              </label>
              <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Data
                <input type="date" className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-sky-400" value={form.exam_date} onChange={(event) => setForm((current) => ({ ...current, exam_date: event.target.value }))} />
              </label>
              <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Area
                <select className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-sky-400" value={form.area} onChange={(event) => setForm((current) => ({ ...current, area: event.target.value as MockExamArea }))}>
                  {areaOptions.map((area) => <option key={area.value} value={area.value}>{area.label}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Total
                <input type="number" min={1} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-sky-400" value={form.total_questions} onChange={(event) => setForm((current) => ({ ...current, total_questions: event.target.value }))} />
              </label>
              <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Acertos
                <input type="number" min={0} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-sky-400" value={form.correct_count} onChange={(event) => setForm((current) => ({ ...current, correct_count: event.target.value }))} />
              </label>
              <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                TRI oficial
                <input type="number" min={0} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-sky-400" value={form.tri_score} onChange={(event) => setForm((current) => ({ ...current, tri_score: event.target.value }))} placeholder="Opcional" />
              </label>
              <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Minutos
                <input type="number" min={0} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-sky-400" value={form.duration_minutes} onChange={(event) => setForm((current) => ({ ...current, duration_minutes: event.target.value }))} placeholder="Opcional" />
              </label>
              <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400 md:col-span-4">
                Observacoes
                <textarea className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-sky-400" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Contexto, prova, sensacao..." />
              </label>
              <div className="flex justify-end md:col-span-4">
                <button type="submit" className="rounded-2xl bg-sky-400 px-6 py-3 font-black text-slate-950" disabled={externalMutation.isPending}>
                  {externalMutation.isPending ? "Salvando..." : "Salvar gabarito"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-white/10 bg-slate-900/60 p-5 shadow-xl shadow-black/20">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-sky-300">Historico</p>
              <h2 className="mt-1 text-2xl font-black">Historico de Performance e Endurance</h2>
            </div>
            {runnableExam ? (
              <button type="button" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black text-slate-200 hover:border-sky-300" onClick={() => navigate(`/mock-exams/${runnableExam.id}/run`)}>
                Continuar simulado ativo
              </button>
            ) : null}
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left">
              <thead>
                <tr className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">Modelo</th>
                  <th className="px-4 py-2">Acertos/Total</th>
                  <th className="px-4 py-2">Nota TRI Estimada</th>
                  <th className="px-4 py-2">Curva de Fadiga</th>
                  <th className="px-4 py-2 text-right">Acao</th>
                </tr>
              </thead>
              <tbody>
                {examsQuery.isLoading ? (
                  <tr><td className="rounded-2xl bg-slate-950/70 px-4 py-5 text-slate-400" colSpan={6}>Carregando simulados...</td></tr>
                ) : examsQuery.isError ? (
                  <tr><td className="rounded-2xl bg-red-950/30 px-4 py-5 text-red-100" colSpan={6}>Nao foi possivel carregar o historico.</td></tr>
                ) : recentExams.length === 0 ? (
                  <tr><td className="rounded-2xl bg-slate-950/70 px-4 py-8 text-center text-slate-400" colSpan={6}>Nenhum simulado registrado ainda.</td></tr>
                ) : (
                  recentExams.map((exam) => {
                    const results = resultsByExamId.get(exam.id);
                    return (
                      <tr key={exam.id} className="text-sm font-bold text-slate-200">
                        <td className="rounded-l-2xl bg-slate-950/70 px-4 py-4">{formatDate(exam.exam_date)}</td>
                        <td className="bg-slate-950/70 px-4 py-4">
                          <div className="flex flex-col">
                            <span className="text-white">{exam.title}</span>
                            <span className="text-xs text-slate-500">{exam.area}</span>
                          </div>
                        </td>
                        <td className="bg-slate-950/70 px-4 py-4">{exam.correct_count}/{exam.total_questions}</td>
                        <td className="bg-slate-950/70 px-4 py-4">{formatScore(exam, results)}</td>
                        <td className="bg-slate-950/70 px-4 py-4"><FatigueSparkline results={results} /></td>
                        <td className="rounded-r-2xl bg-slate-950/70 px-4 py-4 text-right">
                          <button
                            type="button"
                            className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-200 hover:border-sky-300 hover:text-white"
                            onClick={() => navigate(`/mock-exams/${exam.id}/${isExamFinished(exam) ? "results" : "run"}`)}
                          >
                            {isExamFinished(exam) ? "Resultados" : "Abrir prova"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
