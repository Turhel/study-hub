import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  finishMockExam,
  generateMockExamPlaceholders,
  getMockExam,
  getMockExamQuestions,
  startMockExam,
  updateMockExamQuestion,
} from "../lib/api";
import type { MockExamPlaceholderRequest, MockExamQuestion, MockExamQuestionPayload } from "../lib/types";

const answerOptions = ["A", "B", "C", "D", "E"] as const;

type DraftState = {
  question_code: string;
  area: string;
  discipline: string;
  user_answer: string;
  correct_answer: string;
  skipped: boolean;
  difficulty_percent: string;
  notes: string;
};

type PlaceholderFormState = {
  total_questions: string;
  first_area: string;
  first_start: string;
  first_end: string;
  second_area: string;
  second_start: string;
  second_end: string;
};

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function statusLabel(status: string): string {
  if (status === "finished") {
    return "finalizado";
  }
  if (status === "in_progress") {
    return "em andamento";
  }
  return "rascunho";
}

function questionStateLabel(question: MockExamQuestion, current: boolean): string {
  if (current) return "is-current";
  if (question.skipped) return "is-skipped";
  if (question.user_answer) return "is-answered";
  return "is-empty";
}

function questionDraftFromRow(question: MockExamQuestion | null): DraftState {
  if (!question) {
    return {
      question_code: "",
      area: "",
      discipline: "",
      user_answer: "",
      correct_answer: "",
      skipped: false,
      difficulty_percent: "",
      notes: "",
    };
  }
  return {
    question_code: question.question_code ?? "",
    area: question.area ?? "",
    discipline: question.discipline ?? "",
    user_answer: question.user_answer ?? "",
    correct_answer: question.correct_answer ?? "",
    skipped: question.skipped,
    difficulty_percent: question.difficulty_percent == null ? "" : String(question.difficulty_percent),
    notes: question.notes ?? "",
  };
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

export default function MockExamRunPage() {
  const params = useParams<{ id: string }>();
  const examId = Number(params.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const storageKey = `mock-exam-run:${examId}`;
  const hydratedRef = useRef(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [questionEnteredAt, setQuestionEnteredAt] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftState>(questionDraftFromRow(null));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placeholderForm, setPlaceholderForm] = useState<PlaceholderFormState | null>(null);

  const examQuery = useQuery({ queryKey: ["mock-exam", examId], queryFn: () => getMockExam(examId), enabled: Number.isFinite(examId) && examId > 0, retry: false });
  const questionsQuery = useQuery({ queryKey: ["mock-exam-questions", examId], queryFn: () => getMockExamQuestions(examId), enabled: Number.isFinite(examId) && examId > 0, retry: false });

  useEffect(() => {
    if (!hydratedRef.current) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as { currentIndex?: number; elapsedSeconds?: number; paused?: boolean };
          if (typeof parsed.currentIndex === "number") setCurrentIndex(parsed.currentIndex);
          if (typeof parsed.elapsedSeconds === "number") setElapsedSeconds(parsed.elapsedSeconds);
          if (typeof parsed.paused === "boolean") setPaused(parsed.paused);
        } catch {
          // ignore corrupted local state
        }
      }
      hydratedRef.current = true;
    }
  }, [storageKey]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    localStorage.setItem(storageKey, JSON.stringify({ currentIndex, elapsedSeconds, paused }));
  }, [currentIndex, elapsedSeconds, paused, storageKey]);

  useEffect(() => {
    if (paused || examQuery.data?.status !== "in_progress") {
      return;
    }
    const timer = window.setInterval(() => setElapsedSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [paused, examQuery.data?.status]);

  const selectedQuestion = (questionsQuery.data ?? [])[currentIndex] ?? null;

  useEffect(() => {
    setDraft(questionDraftFromRow(selectedQuestion));
    setQuestionEnteredAt(Date.now());
  }, [selectedQuestion?.id]);

  useEffect(() => {
    if (examQuery.data && !placeholderForm) {
      setPlaceholderForm(buildPlaceholderDefault(examQuery.data.total_questions, examQuery.data.area));
    }
  }, [examQuery.data, placeholderForm]);

  const startMutation = useMutation({
    mutationFn: () => startMockExam(examId),
    onSuccess: async (payload) => {
      setFeedback("Prova iniciada.");
      setPaused(false);
      await Promise.all([
        queryClient.setQueryData(["mock-exam", examId], payload.exam),
        queryClient.invalidateQueries({ queryKey: ["mock-exam", examId] }),
      ]);
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel iniciar a prova.");
    },
  });

  const placeholderMutation = useMutation({
    mutationFn: async () => {
      if (!placeholderForm) {
        throw new Error("Configure as faixas antes de gerar as questoes.");
      }
      const payload: MockExamPlaceholderRequest = {
        total_questions: Number(placeholderForm.total_questions),
        areas: [
          {
            area: placeholderForm.first_area,
            start: Number(placeholderForm.first_start),
            end: Number(placeholderForm.first_end),
          },
          {
            area: placeholderForm.second_area,
            start: Number(placeholderForm.second_start),
            end: Number(placeholderForm.second_end),
          },
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
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel gerar as questoes.");
    },
  });

  const saveCurrentQuestion = async (override?: Partial<DraftState>) => {
    if (!selectedQuestion) return;
    const source = { ...draft, ...override };
    const extraSeconds =
      paused || questionEnteredAt == null || examQuery.data?.status !== "in_progress"
        ? 0
        : Math.max(0, Math.round((Date.now() - questionEnteredAt) / 1000));
    const nextTime = (selectedQuestion.time_seconds ?? 0) + extraSeconds;
    const payload: MockExamQuestionPayload = {
      question_code: source.question_code.trim() || null,
      area: source.area.trim() || null,
      discipline: source.discipline.trim() || null,
      user_answer: source.user_answer || null,
      correct_answer: source.correct_answer || null,
      skipped: source.skipped,
      difficulty_percent: source.difficulty_percent.trim() ? Number(source.difficulty_percent) : null,
      time_seconds: nextTime,
      notes: source.notes.trim() || null,
    };
    const updated = await updateMockExamQuestion(examId, selectedQuestion.id, payload);
    queryClient.setQueryData<MockExamQuestion[]>(["mock-exam-questions", examId], (current = []) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    setDraft(questionDraftFromRow(updated));
    setQuestionEnteredAt(Date.now());
  };

  const saveMutation = useMutation({
    mutationFn: () => saveCurrentQuestion(),
    onSuccess: () => setFeedback("Questao salva."),
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel salvar a questao.");
    },
  });

  const finishMutation = useMutation({
    mutationFn: async () => {
      if (selectedQuestion) {
        await saveCurrentQuestion();
      }
      return finishMockExam(examId);
    },
    onSuccess: async () => {
      localStorage.removeItem(storageKey);
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
      setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel finalizar o simulado.");
    },
  });

  const questionMeta = useMemo(() => {
    const rows = questionsQuery.data ?? [];
    return rows.map((question, index) => ({
      ...question,
      current: index === currentIndex,
    }));
  }, [currentIndex, questionsQuery.data]);

  if (examQuery.isLoading || questionsQuery.isLoading) {
    return (
      <main className="today-page mock-exam-run-page">
        <section className="today-subjects-shell today-functional-shell mock-exams-shell">
          <section className="today-panel app-empty-card">
            <strong>Carregando prova...</strong>
            <p>Estamos montando o executor do simulado.</p>
          </section>
        </section>
      </main>
    );
  }

  if (examQuery.isError || !examQuery.data) {
    return (
      <main className="today-page mock-exam-run-page">
        <section className="today-subjects-shell today-functional-shell mock-exams-shell">
          <section className="today-panel app-empty-card">
            <strong>Simulado indisponivel.</strong>
            <p>Este registro nao respondeu agora.</p>
            <Link className="app-secondary-action" to="/mock-exams">
              Voltar para simulados
            </Link>
          </section>
        </section>
      </main>
    );
  }

  const exam = examQuery.data;
  const questions = questionsQuery.data ?? [];

  return (
    <main className="today-page mock-exam-run-page">
      <section className="today-subjects-shell today-functional-shell mock-exams-shell mock-exam-run-shell">
        <section className="today-panel mock-exam-run-hero">
          <div>
            <p className="today-eyebrow">Simulado v2</p>
            <h1>{exam.title}</h1>
            <p>{exam.area} · modo {exam.mode === "external" ? "externo" : "interno"}</p>
          </div>
          <div className="mock-exam-run-hero-actions">
            <span className={`mock-exam-status-badge is-${exam.status}`}>{statusLabel(exam.status)}</span>
            <Link className="app-secondary-action" to="/mock-exams">Voltar</Link>
            {exam.status === "finished" ? (
              <Link className="app-primary-action app-primary-action-blue" to={`/mock-exams/${exam.id}/results`}>Resultados</Link>
            ) : null}
          </div>
        </section>

        {feedback ? <section className="today-feedback"><span>{feedback}</span><button type="button" onClick={() => setFeedback(null)}>Fechar</button></section> : null}
        {error ? <section className="today-error-panel"><strong>Algo travou.</strong><p>{error}</p></section> : null}

        {questions.length === 0 ? (
          <section className="today-panel mock-exam-placeholder-panel">
            <div className="today-section-heading">
              <div>
                <p className="today-eyebrow">Configurar prova externa</p>
                <h2>Gerar grade de questoes</h2>
              </div>
            </div>
            <p className="mock-exam-form-note">Para o modo externo, criamos uma grade 1..N com areas por faixa. Depois disso voce ja pode iniciar e responder dentro do app.</p>
            {placeholderForm ? (
              <div className="today-form-grid">
                <label className="today-form-field">Total de questoes<input className="app-input" type="number" min={1} value={placeholderForm.total_questions} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, total_questions: event.target.value } : current)} /></label>
                <label className="today-form-field">Area 1<input className="app-input" value={placeholderForm.first_area} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, first_area: event.target.value } : current)} /></label>
                <label className="today-form-field">Inicio 1<input className="app-input" type="number" min={1} value={placeholderForm.first_start} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, first_start: event.target.value } : current)} /></label>
                <label className="today-form-field">Fim 1<input className="app-input" type="number" min={1} value={placeholderForm.first_end} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, first_end: event.target.value } : current)} /></label>
                <label className="today-form-field">Area 2<input className="app-input" value={placeholderForm.second_area} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, second_area: event.target.value } : current)} /></label>
                <label className="today-form-field">Inicio 2<input className="app-input" type="number" min={1} value={placeholderForm.second_start} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, second_start: event.target.value } : current)} /></label>
                <label className="today-form-field">Fim 2<input className="app-input" type="number" min={1} value={placeholderForm.second_end} onChange={(event) => setPlaceholderForm((current) => current ? { ...current, second_end: event.target.value } : current)} /></label>
              </div>
            ) : null}
            <div className="today-action-row">
              <button type="button" className="app-primary-action app-primary-action-blue" disabled={placeholderMutation.isPending} onClick={() => { setError(null); setFeedback(null); placeholderMutation.mutate(); }}>
                {placeholderMutation.isPending ? "Gerando..." : "Gerar placeholders"}
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="mock-exam-run-layout">
              <section className="today-panel mock-exam-grid-panel">
                <div className="today-section-heading">
                  <div>
                    <p className="today-eyebrow">Gabarito de questoes</p>
                    <h2>Questoes {questions.length > 0 ? `1 a ${questions.length}` : "sem grade"}</h2>
                  </div>
                </div>
                <div className="mock-exam-question-grid">
                  {questionMeta.map((question, index) => (
                    <button
                      key={question.id}
                      type="button"
                      className={`mock-exam-question-chip ${questionStateLabel(question, question.current)}`}
                      onClick={async () => {
                        if (index === currentIndex) return;
                        try {
                          await saveCurrentQuestion();
                          setCurrentIndex(index);
                          setError(null);
                        } catch (saveError) {
                          setError(saveError instanceof Error ? saveError.message : "Nao foi possivel trocar de questao.");
                        }
                      }}
                      title={`Questao ${question.question_number}`}
                    >
                      {question.question_number}
                    </button>
                  ))}
                </div>
              </section>

              <aside className="today-panel mock-exam-timer-panel">
                <span className="today-eyebrow">Tempo total</span>
                <strong>{formatDuration(elapsedSeconds)}</strong>
                <p>{paused ? "Pausado" : "Cronometro rodando"}</p>
                {exam.status === "draft" ? (
                  <button type="button" className="app-primary-action app-primary-action-blue" disabled={startMutation.isPending} onClick={() => { setError(null); setFeedback(null); startMutation.mutate(); }}>
                    {startMutation.isPending ? "Iniciando..." : "Iniciar prova"}
                  </button>
                ) : null}
                {exam.status !== "finished" ? (
                  <>
                    <button type="button" className="app-secondary-action" onClick={() => setPaused((current) => !current)}>
                      {paused ? "Retomar" : "Pausar"}
                    </button>
                    <button type="button" className="app-primary-action app-primary-action-blue" disabled={finishMutation.isPending} onClick={() => { setError(null); setFeedback(null); finishMutation.mutate(); }}>
                      {finishMutation.isPending ? "Finalizando..." : "Finalizar"}
                    </button>
                  </>
                ) : null}
              </aside>
            </section>

            {selectedQuestion ? (
              <section className="today-panel mock-exam-question-panel">
                <div className="mock-exam-question-nav">
                  <button type="button" className="app-secondary-action" disabled={currentIndex <= 0} onClick={async () => { try { await saveCurrentQuestion(); setCurrentIndex((current) => Math.max(0, current - 1)); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Nao foi possivel voltar."); } }}>Anterior</button>
                  <strong>Questao {selectedQuestion.question_number} de {questions.length}</strong>
                  <button type="button" className="app-secondary-action" disabled={currentIndex >= questions.length - 1} onClick={async () => { try { await saveCurrentQuestion(); setCurrentIndex((current) => Math.min(questions.length - 1, current + 1)); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Nao foi possivel avancar."); } }}>Proxima</button>
                </div>

                <div className="today-form-grid">
                  <label className="today-form-field">Codigo<input className="app-input" value={draft.question_code} onChange={(event) => setDraft((current) => ({ ...current, question_code: event.target.value }))} placeholder="Opcional" /></label>
                  <label className="today-form-field">Area<input className="app-input" value={draft.area} onChange={(event) => setDraft((current) => ({ ...current, area: event.target.value }))} placeholder="Ex.: Matematica" /></label>
                  <label className="today-form-field">Disciplina<input className="app-input" value={draft.discipline} onChange={(event) => setDraft((current) => ({ ...current, discipline: event.target.value }))} placeholder="Ex.: Algebra" /></label>
                  <label className="today-form-field">Dificuldade (% acertaram)<input className="app-input" type="number" min={0} max={100} value={draft.difficulty_percent} onChange={(event) => setDraft((current) => ({ ...current, difficulty_percent: event.target.value }))} /></label>
                </div>

                {exam.mode === "internal" && selectedQuestion.prompt_markdown ? (
                  <article className="mock-exam-question-content">
                    <h3>Enunciado</h3>
                    <pre>{selectedQuestion.prompt_markdown}</pre>
                    {selectedQuestion.alternatives.length > 0 ? (
                      <div className="mock-exam-alternatives">
                        {selectedQuestion.alternatives.map((alternative, index) => (
                          <div key={`${selectedQuestion.id}-${index}`} className="mock-exam-alternative-item">{alternative}</div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ) : null}

                <div className="mock-exam-answer-grid">
                  <label className="today-form-field">Sua resposta<select className="app-input" value={draft.user_answer} onChange={(event) => setDraft((current) => ({ ...current, skipped: false, user_answer: event.target.value }))}><option value="">Nao responder agora</option>{answerOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                  <label className="today-form-field">Gabarito<select className="app-input" value={draft.correct_answer} onChange={(event) => setDraft((current) => ({ ...current, correct_answer: event.target.value }))}><option value="">Ainda nao sei</option>{answerOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                </div>

                <label className="today-form-field">
                  Observacoes
                  <textarea className="app-input" value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Duvida de leitura, erro de conta, chute..." />
                </label>

                <div className="today-action-row">
                  <button type="button" className="app-secondary-action" onClick={async () => { try { await saveCurrentQuestion({ skipped: true, user_answer: "" }); setFeedback(`Questao ${selectedQuestion.question_number} marcada como pulada.`); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Nao foi possivel pular a questao."); } }}>Pular</button>
                  <button type="button" className="app-secondary-action" disabled={saveMutation.isPending} onClick={() => { setError(null); setFeedback(null); saveMutation.mutate(); }}>Salvar questao</button>
                </div>
              </section>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
