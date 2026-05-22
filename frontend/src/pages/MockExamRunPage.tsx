import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  finishMockExam,
  generateMockExamPlaceholders,
  getMockExam,
  getMockExamQuestions,
  pauseMockExam,
  recordMockExamAnswer,
  resumeMockExam,
  startMockExam,
} from "../lib/api";
import type { MockExam, MockExamPlaceholderRequest, MockExamQuestion } from "../lib/types";

const answerOptions = ["A", "B", "C", "D", "E"] as const;

type PlaceholderFormState = {
  total_questions: string;
  first_area: string;
  first_start: string;
  first_end: string;
  second_area: string;
  second_start: string;
  second_end: string;
};

function parseBackendTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = /[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`;
  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isRunning(exam: MockExam): boolean {
  return exam.status === "em_andamento" || exam.status === "in_progress";
}

function isPaused(exam: MockExam): boolean {
  return exam.status === "pausado" || exam.is_paused;
}

function isFinished(exam: MockExam): boolean {
  return exam.status === "finalizado" || exam.status === "finished";
}

function statusLabel(status: MockExam["status"]): string {
  if (status === "finalizado" || status === "finished") return "finalizado";
  if (status === "pausado") return "pausado";
  if (status === "em_andamento" || status === "in_progress") return "em andamento";
  return "rascunho";
}

function buildPlaceholderDefault(totalQuestions: number, area: string): PlaceholderFormState {
  const midpoint = Math.max(1, Math.floor(totalQuestions / 2));
  return {
    total_questions: String(totalQuestions),
    first_area: area === "Geral" ? "Matematica" : area,
    first_start: "1",
    first_end: String(midpoint),
    second_area: area === "Geral" ? "Natureza" : area,
    second_start: String(midpoint + 1),
    second_end: String(totalQuestions),
  };
}

function questionState(question: MockExamQuestion, current: boolean): string {
  if (current) return "is-current";
  if (question.skipped) return "is-skipped";
  if (question.user_answer) return "is-answered";
  return "is-empty";
}

export default function MockExamRunPage() {
  const params = useParams<{ id: string }>();
  const examId = Number(params.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const [questionStartedAt, setQuestionStartedAt] = useState(Date.now());
  const [placeholderForm, setPlaceholderForm] = useState<PlaceholderFormState | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finishingRef = useRef(false);

  const examQuery = useQuery({
    queryKey: ["mock-exam", examId],
    queryFn: () => getMockExam(examId),
    enabled: Number.isFinite(examId) && examId > 0,
    retry: false,
  });
  const questionsQuery = useQuery({
    queryKey: ["mock-exam-questions", examId],
    queryFn: () => getMockExamQuestions(examId),
    enabled: Number.isFinite(examId) && examId > 0,
    retry: false,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (examQuery.data && !placeholderForm) {
      setPlaceholderForm(buildPlaceholderDefault(examQuery.data.total_questions, examQuery.data.area));
    }
  }, [examQuery.data, placeholderForm]);

  const selectedQuestion = (questionsQuery.data ?? [])[currentIndex] ?? null;
  useEffect(() => {
    setQuestionStartedAt(Date.now());
  }, [selectedQuestion?.id]);

  const startMutation = useMutation({
    mutationFn: () => startMockExam(examId),
    onSuccess: async (payload) => {
      setFeedback("Modo Maratona iniciado. O relogio agora segue a hora do sistema.");
      setQuestionStartedAt(Date.now());
      queryClient.setQueryData(["mock-exam", examId], payload.exam);
      await queryClient.invalidateQueries({ queryKey: ["mock-exam", examId] });
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel iniciar a prova."),
  });

  const pauseMutation = useMutation({
    mutationFn: () => pauseMockExam(examId),
    onSuccess: async (payload) => {
      queryClient.setQueryData(["mock-exam", examId], payload.exam);
      await queryClient.invalidateQueries({ queryKey: ["mock-exam", examId] });
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel pausar a prova."),
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeMockExam(examId),
    onSuccess: async (payload) => {
      setQuestionStartedAt(Date.now());
      queryClient.setQueryData(["mock-exam", examId], payload.exam);
      await queryClient.invalidateQueries({ queryKey: ["mock-exam", examId] });
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel retomar a prova."),
  });

  const placeholderMutation = useMutation({
    mutationFn: async () => {
      if (!placeholderForm) throw new Error("Configure as faixas antes de gerar as questoes.");
      const payload: MockExamPlaceholderRequest = {
        total_questions: Number(placeholderForm.total_questions),
        areas: [
          { area: placeholderForm.first_area, start: Number(placeholderForm.first_start), end: Number(placeholderForm.first_end) },
          { area: placeholderForm.second_area, start: Number(placeholderForm.second_start), end: Number(placeholderForm.second_end) },
        ].filter((item) => item.area.trim()),
      };
      return generateMockExamPlaceholders(examId, payload);
    },
    onSuccess: async (payload) => {
      setFeedback(payload.message);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mock-exam", examId] }),
        queryClient.invalidateQueries({ queryKey: ["mock-exam-questions", examId] }),
        queryClient.invalidateQueries({ queryKey: ["mock-exams"] }),
      ]);
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel gerar as questoes."),
  });

  const recordAnswerMutation = useMutation({
    mutationFn: ({ question, answer, skipped }: { question: MockExamQuestion; answer?: string; skipped?: boolean }) =>
      recordMockExamAnswer(examId, {
        question_id: question.id,
        user_answer: answer ?? null,
        skipped: Boolean(skipped),
        time_seconds: Math.max(0, Math.round((Date.now() - questionStartedAt) / 1000)),
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData<MockExamQuestion[]>(["mock-exam-questions", examId], (current = []) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      const questions = questionsQuery.data ?? [];
      if (currentIndex < questions.length - 1) {
        setCurrentIndex((current) => current + 1);
      }
      setQuestionStartedAt(Date.now());
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel registrar a resposta."),
  });

  const finishMutation = useMutation({
    mutationFn: () => finishMockExam(examId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mock-exam", examId] }),
        queryClient.invalidateQueries({ queryKey: ["mock-exam-questions", examId] }),
        queryClient.invalidateQueries({ queryKey: ["mock-exam-results", examId] }),
        queryClient.invalidateQueries({ queryKey: ["mock-exams"] }),
        queryClient.invalidateQueries({ queryKey: ["mock-exams-summary"] }),
      ]);
      navigate(`/mock-exams/${examId}/results`);
    },
    onError: (mutationError) => {
      finishingRef.current = false;
      setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel finalizar o simulado.");
    },
  });

  const exam = examQuery.data;
  const questions = questionsQuery.data ?? [];
  const targetEnd = parseBackendTime(exam?.target_end_time);
  const remainingSeconds = targetEnd == null || !exam || isPaused(exam) || isFinished(exam)
    ? 0
    : Math.max(0, Math.ceil((targetEnd - nowTick) / 1000));

  useEffect(() => {
    if (!exam || !isRunning(exam) || targetEnd == null || remainingSeconds > 0 || finishingRef.current) return;
    finishingRef.current = true;
    finishMutation.mutate();
  }, [exam, finishMutation, remainingSeconds, targetEnd]);

  const answeredCount = useMemo(
    () => questions.filter((question) => question.user_answer || question.skipped).length,
    [questions],
  );

  if (examQuery.isLoading || questionsQuery.isLoading) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
        <section className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-slate-900 p-6">
          <strong>Carregando prova...</strong>
          <p className="text-slate-300">Estamos montando o Modo Maratona.</p>
        </section>
      </main>
    );
  }

  if (examQuery.isError || !exam) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
        <section className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-slate-900 p-6">
          <strong>Simulado indisponivel.</strong>
          <p className="text-slate-300">Este registro nao respondeu agora.</p>
          <Link className="mt-4 inline-flex rounded-xl border border-white/20 px-4 py-2" to="/mock-exams">
            Voltar para simulados
          </Link>
        </section>
      </main>
    );
  }

  if (questions.length === 0) {
    return (
      <main className="today-page mock-exam-run-page">
        <section className="today-subjects-shell today-functional-shell mock-exams-shell">
          <section className="today-panel mock-exam-placeholder-panel">
            <p className="today-eyebrow">Configurar prova externa</p>
            <h1>Gerar grade de questoes</h1>
            <p className="mock-exam-form-note">Criamos uma grade 1..N por faixa de area. Depois disso o Modo Maratona fica disponivel.</p>
            {placeholderForm ? (
              <div className="today-form-grid">
                <label className="today-form-field">Total<input className="app-input" type="number" min={1} value={placeholderForm.total_questions} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, total_questions: event.target.value } : current)} /></label>
                <label className="today-form-field">Area 1<input className="app-input" value={placeholderForm.first_area} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, first_area: event.target.value } : current)} /></label>
                <label className="today-form-field">Inicio 1<input className="app-input" type="number" min={1} value={placeholderForm.first_start} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, first_start: event.target.value } : current)} /></label>
                <label className="today-form-field">Fim 1<input className="app-input" type="number" min={1} value={placeholderForm.first_end} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, first_end: event.target.value } : current)} /></label>
                <label className="today-form-field">Area 2<input className="app-input" value={placeholderForm.second_area} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, second_area: event.target.value } : current)} /></label>
                <label className="today-form-field">Inicio 2<input className="app-input" type="number" min={1} value={placeholderForm.second_start} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, second_start: event.target.value } : current)} /></label>
                <label className="today-form-field">Fim 2<input className="app-input" type="number" min={1} value={placeholderForm.second_end} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, second_end: event.target.value } : current)} /></label>
              </div>
            ) : null}
            {error ? <p className="today-form-error">{error}</p> : null}
            {feedback ? <p className="today-feedback">{feedback}</p> : null}
            <div className="today-action-row">
              <Link className="app-secondary-action" to="/mock-exams">Voltar</Link>
              <button type="button" className="app-primary-action app-primary-action-blue" disabled={placeholderMutation.isPending} onClick={() => placeholderMutation.mutate()}>
                {placeholderMutation.isPending ? "Gerando..." : "Gerar placeholders"}
              </button>
            </div>
          </section>
        </section>
      </main>
    );
  }

  const canAnswer = isRunning(exam) && !recordAnswerMutation.isPending && selectedQuestion;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#172554_0,#020617_48%,#020617_100%)] px-4 py-6 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-48px)] max-w-5xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-400/30 bg-slate-950/80 p-4 shadow-2xl">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">Modo Maratona</p>
            <h1 className="text-2xl font-black">{exam.title}</h1>
            <p className="text-sm text-slate-300">{exam.area} · {answeredCount}/{questions.length} preenchidas · {statusLabel(exam.status)}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-slate-200" to="/mock-exams">
              Sair
            </Link>
            {isFinished(exam) ? (
              <Link className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-black text-slate-950" to={`/mock-exams/${exam.id}/results`}>
                Resultados
              </Link>
            ) : null}
          </div>
        </header>

        {error ? <div className="rounded-2xl border border-red-400/40 bg-red-950/60 p-4 text-red-100">{error}</div> : null}
        {feedback ? <div className="rounded-2xl border border-sky-400/30 bg-sky-950/40 p-4 text-sky-100">{feedback}</div> : null}

        <section className="grid flex-1 gap-5 lg:grid-cols-[1fr_300px]">
          <div className="flex flex-col justify-center rounded-3xl border border-white/10 bg-slate-950/70 p-6 text-center shadow-2xl">
            <span className="text-sm font-black uppercase tracking-[0.25em] text-slate-400">Tempo restante</span>
            <strong className={`mt-2 font-mono text-6xl font-black md:text-8xl ${remainingSeconds <= 300 && isRunning(exam) ? "text-red-300" : "text-yellow-300"}`}>
              {isPaused(exam) ? "PAUSA" : formatDuration(remainingSeconds)}
            </strong>
            <p className="mt-3 text-slate-300">
              {isRunning(exam) ? "Relogio sincronizado pelo horario do sistema." : isPaused(exam) ? "Prova congelada. Ao retomar, o backend ajusta o fim." : "Inicie para abrir o lancamento cego."}
            </p>

            <div className="mt-8 rounded-3xl border border-sky-400/20 bg-slate-900/80 p-5">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">Questao atual</p>
              <h2 className="mt-1 text-4xl font-black">Q{selectedQuestion?.question_number ?? currentIndex + 1}</h2>
              <div className="mt-6 grid grid-cols-5 gap-3">
                {answerOptions.map((answer) => (
                  <button
                    key={answer}
                    type="button"
                    disabled={!canAnswer}
                    className="aspect-square rounded-full border border-sky-300/50 bg-sky-500/15 text-2xl font-black text-white shadow-lg shadow-sky-950/40 transition hover:bg-sky-400 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-35"
                    onClick={() => selectedQuestion && recordAnswerMutation.mutate({ question: selectedQuestion, answer })}
                  >
                    {answer}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={!canAnswer}
                className="mt-5 w-full rounded-2xl border border-amber-300/50 bg-amber-400/10 px-5 py-4 text-lg font-black text-amber-100 transition hover:bg-amber-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-35"
                onClick={() => selectedQuestion && recordAnswerMutation.mutate({ question: selectedQuestion, skipped: true })}
              >
                Pular questao
              </button>
            </div>

            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {exam.status === "draft" ? (
                <button type="button" className="rounded-2xl bg-sky-400 px-6 py-3 font-black text-slate-950" disabled={startMutation.isPending} onClick={() => startMutation.mutate()}>
                  {startMutation.isPending ? "Iniciando..." : "Iniciar Modo Maratona"}
                </button>
              ) : null}
              {isRunning(exam) ? (
                <button type="button" className="rounded-2xl border border-white/20 px-6 py-3 font-black" disabled={pauseMutation.isPending} onClick={() => pauseMutation.mutate()}>
                  Pausar prova
                </button>
              ) : null}
              {isPaused(exam) ? (
                <button type="button" className="rounded-2xl bg-emerald-400 px-6 py-3 font-black text-slate-950" disabled={resumeMutation.isPending} onClick={() => resumeMutation.mutate()}>
                  Retomar prova
                </button>
              ) : null}
              {!isFinished(exam) ? (
                <button type="button" className="rounded-2xl border border-red-400/50 px-6 py-3 font-black text-red-100" disabled={finishMutation.isPending} onClick={() => finishMutation.mutate()}>
                  Finalizar agora
                </button>
              ) : null}
            </div>
          </div>

          <aside className="rounded-3xl border border-white/10 bg-slate-950/70 p-4 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Mapa cego</p>
            <div className="mt-4 grid max-h-[65vh] grid-cols-5 gap-2 overflow-y-auto pr-1">
              {questions.map((question, index) => (
                <button
                  key={question.id}
                  type="button"
                  className={`rounded-xl border px-2 py-3 text-sm font-black ${questionState(question, index === currentIndex)} ${
                    index === currentIndex
                      ? "border-sky-300 bg-sky-400 text-slate-950"
                      : question.user_answer
                        ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                        : question.skipped
                          ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                          : "border-white/10 bg-slate-900 text-slate-300"
                  }`}
                  onClick={() => {
                    setCurrentIndex(index);
                    setQuestionStartedAt(Date.now());
                  }}
                >
                  {question.question_number}
                </button>
              ))}
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
