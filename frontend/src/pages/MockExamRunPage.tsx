import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import {
  deleteMockExam,
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
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isRunning(exam: MockExam): boolean {
  return exam.status === "em_andamento" || exam.status === "in_progress";
}

function isPaused(exam: MockExam): boolean {
  return exam.status === "pausado" || exam.is_paused;
}

function isFinished(exam: MockExam): boolean {
  return exam.status === "finalizado" || exam.status === "finished" || exam.status === "aguardando_gabarito";
}

function buildPlaceholderDefault(totalQuestions: number, area: string): PlaceholderFormState {
  const midpoint = Math.max(1, Math.floor(totalQuestions / 2));
  return {
    total_questions: String(totalQuestions),
    first_area: area === "Geral" ? "Linguagens/Humanas" : area,
    first_start: "1",
    first_end: String(midpoint),
    second_area: area === "Geral" ? "Natureza/Matematica" : area,
    second_start: String(midpoint + 1),
    second_end: String(totalQuestions),
  };
}

function nextOpenQuestionIndex(questions: MockExamQuestion[], currentIndex: number): number {
  const afterCurrent = questions.findIndex((question, index) => index > currentIndex && !question.user_answer && !question.skipped);
  if (afterCurrent >= 0) return afterCurrent;
  const firstOpen = questions.findIndex((question) => !question.user_answer && !question.skipped);
  return firstOpen >= 0 ? firstOpen : Math.min(currentIndex, Math.max(questions.length - 1, 0));
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
  const [error, setError] = useState<string | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const finishingRef = useRef(false);

  useEffect(() => {
    document.body.classList.add("mock-exam-isolated");
    return () => document.body.classList.remove("mock-exam-isolated");
  }, []);

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

  const questions = questionsQuery.data ?? [];
  const exam = examQuery.data;
  const selectedQuestion = questions[currentIndex] ?? null;

  useEffect(() => {
    if (questions.length === 0) return;
    setCurrentIndex((current) => Math.min(current, questions.length - 1));
  }, [questions.length]);

  useEffect(() => {
    setQuestionStartedAt(Date.now());
  }, [selectedQuestion?.id]);

  const startMutation = useMutation({
    mutationFn: () => startMockExam(examId),
    onSuccess: async (payload) => {
      setError(null);
      setQuestionStartedAt(Date.now());
      queryClient.setQueryData(["mock-exam", examId], payload.exam);
      await queryClient.invalidateQueries({ queryKey: ["mock-exam", examId] });
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel iniciar a prova."),
  });

  const pauseMutation = useMutation({
    mutationFn: () => pauseMockExam(examId),
    onSuccess: async (payload) => {
      setError(null);
      queryClient.setQueryData(["mock-exam", examId], payload.exam);
      await queryClient.invalidateQueries({ queryKey: ["mock-exam", examId] });
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel pausar a prova."),
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeMockExam(examId),
    onSuccess: async (payload) => {
      setError(null);
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
    onSuccess: async () => {
      setError(null);
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
      let nextQuestions = questions;
      queryClient.setQueryData<MockExamQuestion[]>(["mock-exam-questions", examId], (current = []) => {
        nextQuestions = current.map((item) => (item.id === updated.id ? updated : item));
        return nextQuestions;
      });
      setSelectedAnswers((current) => {
        const next = { ...current };
        if (updated.user_answer) {
          next[updated.id] = updated.user_answer;
        } else {
          delete next[updated.id];
        }
        return next;
      });
      setCurrentIndex((current) => nextOpenQuestionIndex(nextQuestions, current));
      setQuestionStartedAt(Date.now());
      setError(null);
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel registrar a resposta."),
  });

  const cancelMutation = useMutation({
    mutationFn: () => deleteMockExam(examId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mock-exam", examId] }),
        queryClient.invalidateQueries({ queryKey: ["mock-exam-questions", examId] }),
        queryClient.invalidateQueries({ queryKey: ["mock-exams"] }),
        queryClient.invalidateQueries({ queryKey: ["mock-exams-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["mock-exam-active"] }),
      ]);
      navigate("/mock-exams");
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel cancelar a prova."),
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
  const canAnswer = Boolean(exam && isRunning(exam) && !recordAnswerMutation.isPending && selectedQuestion);
  const progressLabel = questions.length > 0 ? `Questao ${selectedQuestion?.question_number ?? currentIndex + 1} de ${questions.length}` : "Questao 0 de 0";
  const criticalTime = Boolean(exam && remainingSeconds <= 300 && isRunning(exam));
  const examQuestionCount = exam?.total_questions ?? questions.length;
  const examDurationMinutes = exam?.duration_minutes && exam.duration_minutes > 0
    ? exam.duration_minutes
    : Math.max(1, Math.round((examQuestionCount * 180) / 60));
  const examDurationHours = Math.floor(examDurationMinutes / 60);
  const examDurationRemainder = examDurationMinutes % 60;
  const examDurationLabel = examDurationHours > 0
    ? `${examDurationHours}h${String(examDurationRemainder).padStart(2, "0")}`
    : `${examDurationMinutes}min`;
  const examDurationContext = examDurationMinutes === 230
    ? "Dia 1 liquido"
    : examDurationMinutes === 275
      ? "Dia 2 liquido"
      : "tempo liquido";

  function focusQuestion(index: number) {
    if (questions.length === 0) return;
    setCurrentIndex(Math.max(0, Math.min(index, questions.length - 1)));
    setQuestionStartedAt(Date.now());
  }

  function submitCurrentAnswer(answer: string) {
    if (!canAnswer || !selectedQuestion) return;
    setSelectedAnswers((current) => ({ ...current, [selectedQuestion.id]: answer }));
    recordAnswerMutation.mutate({ question: selectedQuestion, answer });
  }

  function skipCurrentQuestion() {
    if (!canAnswer || !selectedQuestion) return;
    setSelectedAnswers((current) => {
      const next = { ...current };
      delete next[selectedQuestion.id];
      return next;
    });
    recordAnswerMutation.mutate({ question: selectedQuestion, skipped: true });
  }

  useEffect(() => {
    function handleExamKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      if (target?.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select") {
        return;
      }

      const key = event.key.toUpperCase();
      if (answerOptions.includes(key as (typeof answerOptions)[number])) {
        event.preventDefault();
        submitCurrentAnswer(key);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        focusQuestion(currentIndex + 1);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        focusQuestion(currentIndex - 1);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (exam && isPaused(exam)) {
          resumeMutation.mutate();
          return;
        }
        focusQuestion(nextOpenQuestionIndex(questions, currentIndex));
        return;
      }

      if (event.key === "Escape" && exam && isRunning(exam) && !pauseMutation.isPending) {
        event.preventDefault();
        pauseMutation.mutate();
      }
    }

    window.addEventListener("keydown", handleExamKeyDown);
    return () => window.removeEventListener("keydown", handleExamKeyDown);
  });

  if (examQuery.isLoading || questionsQuery.isLoading) {
    return (
      <main className="fixed inset-0 z-50 flex items-center justify-center bg-black px-4 text-white">
        <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-950 p-6 text-center">
          <strong className="text-xl font-black">Carregando Modo Maratona...</strong>
          <p className="mt-2 text-sm font-semibold text-zinc-500">Preparando o ambiente isolado.</p>
        </section>
      </main>
    );
  }

  if (examQuery.isError || !exam) {
    return (
      <main className="fixed inset-0 z-50 flex items-center justify-center bg-black px-4 text-white">
        <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-950 p-6 text-center">
          <strong className="text-xl font-black">Simulado indisponivel.</strong>
          <p className="mt-2 text-sm font-semibold text-zinc-500">Este registro nao respondeu agora.</p>
          <button type="button" className="mt-5 rounded-2xl border border-white/15 px-5 py-3 font-black" onClick={() => navigate("/mock-exams")}>
            Voltar
          </button>
        </section>
      </main>
    );
  }

  if (questions.length === 0) {
    return (
      <main className="fixed inset-0 z-50 overflow-y-auto bg-black px-4 py-8 text-white">
        <section className="mx-auto flex min-h-full w-full max-w-3xl items-center">
          <div className="w-full rounded-[2rem] border border-white/10 bg-zinc-950 p-6 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-sky-300">Setup de prova</p>
            <h1 className="mt-2 text-3xl font-black">Gerar grade cega</h1>
            <p className="mt-2 text-sm font-semibold text-zinc-500">Antes da maratona, criamos apenas os slots numerados da prova.</p>
            {placeholderForm ? (
              <div className="mt-6 grid gap-3 md:grid-cols-4">
                <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Total<input className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-sky-400" type="number" min={1} value={placeholderForm.total_questions} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, total_questions: event.target.value } : current)} /></label>
                <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Area 1<input className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-sky-400" value={placeholderForm.first_area} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, first_area: event.target.value } : current)} /></label>
                <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Inicio 1<input className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-sky-400" type="number" min={1} value={placeholderForm.first_start} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, first_start: event.target.value } : current)} /></label>
                <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Fim 1<input className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-sky-400" type="number" min={1} value={placeholderForm.first_end} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, first_end: event.target.value } : current)} /></label>
                <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Area 2<input className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-sky-400" value={placeholderForm.second_area} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, second_area: event.target.value } : current)} /></label>
                <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Inicio 2<input className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-sky-400" type="number" min={1} value={placeholderForm.second_start} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, second_start: event.target.value } : current)} /></label>
                <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Fim 2<input className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-sky-400" type="number" min={1} value={placeholderForm.second_end} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, second_end: event.target.value } : current)} /></label>
              </div>
            ) : null}
            {error ? <p className="mt-4 rounded-2xl border border-red-400/30 bg-red-950/40 p-3 text-sm font-bold text-red-100">{error}</p> : null}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="rounded-2xl border border-white/15 px-5 py-3 font-black text-zinc-300" onClick={() => navigate("/mock-exams")}>Voltar</button>
              <button type="button" className="rounded-2xl bg-sky-400 px-5 py-3 font-black text-black" disabled={placeholderMutation.isPending} onClick={() => placeholderMutation.mutate()}>
                {placeholderMutation.isPending ? "Gerando..." : "Gerar grade"}
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 z-50 overflow-y-auto bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/10 bg-black/95 py-4 backdrop-blur">
          <div className="min-w-0">
            <p className="truncate text-xs font-black uppercase tracking-[0.24em] text-zinc-500">{exam.title}</p>
            <strong className="mt-1 block text-sm font-black text-zinc-200 md:text-base">{progressLabel}</strong>
          </div>
          <div className="text-center">
            <strong className={`block font-mono text-4xl font-black tabular-nums md:text-6xl ${criticalTime ? "text-amber-300" : "text-white"}`}>
              {isPaused(exam) ? "PAUSADO" : formatDuration(remainingSeconds)}
            </strong>
            <span className="mt-1 block text-[11px] font-black uppercase tracking-[0.18em] text-zinc-600">
              {examQuestionCount}q - {examDurationContext} - {examDurationLabel}
            </span>
          </div>
          <div className="flex min-w-0 flex-col items-stretch justify-end gap-2 sm:flex-row">
            {exam.status === "draft" ? (
              <button type="button" className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-black text-zinc-200 hover:border-sky-300" disabled={startMutation.isPending} onClick={() => startMutation.mutate()}>
                {startMutation.isPending ? "Iniciando..." : "Iniciar Prova"}
              </button>
            ) : isPaused(exam) ? (
              <>
                <button type="button" className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-black text-zinc-200 hover:border-sky-300" disabled={resumeMutation.isPending} onClick={() => resumeMutation.mutate()}>
                  Retomar
                </button>
                <button
                  type="button"
                  className="rounded-2xl border border-red-400/40 px-4 py-3 text-sm font-black text-red-200 transition hover:border-red-300 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={cancelMutation.isPending}
                  onClick={() => {
                    if (window.confirm("Cancelar esta prova e apagar o simulado em andamento?")) {
                      cancelMutation.mutate();
                    }
                  }}
                >
                  {cancelMutation.isPending ? "Cancelando..." : "Cancelar prova"}
                </button>
              </>
            ) : isRunning(exam) ? (
              <button type="button" className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-black text-zinc-200 hover:border-sky-300" disabled={pauseMutation.isPending} onClick={() => pauseMutation.mutate()}>
                ⏸️ Pausar Prova
              </button>
            ) : (
              <button type="button" className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-black text-zinc-200 hover:border-sky-300" onClick={() => navigate(`/mock-exams/${exam.id}/results`)}>
                Resultados
              </button>
            )}
          </div>
        </header>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-950/30 p-4 text-sm font-bold text-red-100">
            {error}
          </div>
        ) : null}

        <section className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <div className="w-full max-w-4xl rounded-[2rem] border border-white/10 bg-zinc-950 px-5 py-8 shadow-2xl md:px-10 md:py-12">
            <p className="text-xs font-black uppercase tracking-[0.32em] text-zinc-500">Lancamento cego</p>
            <h1 className="mt-3 text-5xl font-black tracking-tight md:text-8xl">
              Q{selectedQuestion?.question_number ?? currentIndex + 1}
            </h1>
            <p className="mt-3 text-sm font-semibold text-zinc-500">
              {answeredCount}/{questions.length} preenchidas · sem feedback ate o encerramento.
            </p>

            <div className="mx-auto mt-9 grid max-w-3xl grid-cols-5 gap-3 md:gap-5">
              {answerOptions.map((answer) => {
                const selectedAnswer = selectedQuestion ? selectedAnswers[selectedQuestion.id] ?? selectedQuestion.user_answer : null;
                const isSelected = selectedAnswer === answer;
                return (
                  <button
                    key={answer}
                    type="button"
                    disabled={!canAnswer}
                    className={`aspect-square rounded-full border text-3xl font-black shadow-xl transition disabled:cursor-not-allowed disabled:opacity-30 md:text-5xl ${
                      isSelected
                        ? "border-sky-300 bg-sky-400/20 text-sky-100 shadow-sky-950/50"
                        : "border-white/15 bg-white/[0.03] text-white hover:border-white/50 hover:bg-white/10"
                    }`}
                    onClick={() => submitCurrentAnswer(answer)}
                  >
                    {answer}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={!canAnswer}
              className="mt-8 w-full max-w-2xl rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-5 text-base font-black text-zinc-200 transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 md:text-lg"
              onClick={skipCurrentQuestion}
            >
              ⏩ Pular Questao / Deixar em Branco
            </button>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-black text-zinc-400 hover:border-white/30 hover:text-white"
                disabled={finishMutation.isPending}
                onClick={() => finishMutation.mutate()}
              >
                {finishMutation.isPending ? "Encerrando..." : "Encerrar prova"}
              </button>
            </div>
          </div>

          <div className="mt-6 flex w-full max-w-4xl flex-wrap justify-center gap-2">
            {questions.map((question, index) => {
              const answered = Boolean(question.user_answer || question.skipped);
              const current = index === currentIndex;
              return (
                <button
                  key={question.id}
                  type="button"
                  className={`h-8 w-8 rounded-full border text-[11px] font-black transition ${
                    current
                      ? "border-white bg-white text-black"
                      : answered
                        ? "border-zinc-500 bg-zinc-800 text-zinc-200"
                        : "border-zinc-800 bg-zinc-950 text-zinc-600"
                  }`}
                  onClick={() => focusQuestion(index)}
                >
                  {question.question_number}
                </button>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
