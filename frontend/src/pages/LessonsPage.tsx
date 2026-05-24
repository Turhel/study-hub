import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createLessonContent,
  deleteLessonContent,
  getFreeStudyCatalogByDiscipline,
  getLessonA1RecoveryBlocks,
  getLessonContentsByRoadmapNode,
  getLessonContentsBySubject,
  getLessonSavedErrorsByBlock,
  getLessonStudiedSubjects,
  markLessonSubjectStudied,
  updateLessonContent,
} from "../lib/api";
import type {
  FreeStudyCatalogDiscipline,
  FreeStudyCatalogSubject,
  LessonA1RecoveryBlock,
  LessonContent,
  LessonContentPayload,
  LessonExtraLink,
  LessonSavedError,
} from "../lib/types";

type AreaOption = {
  id: "exatas" | "natureza" | "humanas" | "linguagens";
  label: string;
  description: string;
  disciplines: string[];
};

type LessonFormState = {
  title: string;
  body_markdown: string;
  youtube_url: string;
  extra_links_text: string;
  notes: string;
};

type SubjectOption = FreeStudyCatalogSubject & {
  subarea: string;
};

const STUDY_AREAS: AreaOption[] = [
  {
    id: "exatas",
    label: "Exatas",
    description: "Matematica e raciocinio quantitativo.",
    disciplines: ["Matemática"],
  },
  {
    id: "natureza",
    label: "Natureza",
    description: "Biologia, Quimica e Fisica.",
    disciplines: ["Biologia", "Química", "Física"],
  },
  {
    id: "humanas",
    label: "Humanas",
    description: "Historia, Geografia, Filosofia e Sociologia.",
    disciplines: ["História do Brasil", "História", "Geografia", "Filosofia/Sociologia", "Filosofia", "Sociologia"],
  },
  {
    id: "linguagens",
    label: "Linguagens",
    description: "Interpretacao, gramatica, literatura e lingua estrangeira.",
    disciplines: ["Interpretação de texto", "Gramática", "Literatura", "Inglês", "Espanhol", "Artes"],
  },
];

const SUBJECTS_PAGE_SIZE = 10;

const emptyForm: LessonFormState = {
  title: "",
  body_markdown: "",
  youtube_url: "",
  extra_links_text: "",
  notes: "",
};

function flattenSubjects(discipline?: FreeStudyCatalogDiscipline | null): SubjectOption[] {
  if (!discipline) {
    return [];
  }

  return discipline.subareas.flatMap((subarea) =>
    subarea.subjects.map((subject) => ({
      ...subject,
      subarea: subarea.subarea,
    })),
  );
}

function formFromLesson(lesson: LessonContent | null, subject: FreeStudyCatalogSubject | null): LessonFormState {
  if (!lesson) {
    return {
      ...emptyForm,
      title: subject?.subject_name ?? "",
    };
  }

  return {
    title: lesson.title,
    body_markdown: lesson.body_markdown,
    youtube_url: lesson.youtube_url ?? "",
    extra_links_text: formatExtraLinks(lesson.extra_links),
    notes: lesson.notes ?? "",
  };
}

function formatExtraLinks(links?: LessonExtraLink[] | null): string {
  return (links ?? []).map((link) => `${link.label} | ${link.url}`).join("\n");
}

function parseExtraLinks(value: string): LessonExtraLink[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [labelPart, ...urlParts] = line.split("|");
      const label = labelPart.trim();
      const url = urlParts.join("|").trim();
      return { label, url: url || label };
    })
    .filter((link) => link.label.length > 0 && link.url.length > 0);
}

function buildPayload(form: LessonFormState, subject: FreeStudyCatalogSubject): LessonContentPayload {
  return {
    roadmap_node_id: subject.roadmap_node_id || null,
    subject_id: subject.subject_id,
    title: form.title.trim(),
    body_markdown: form.body_markdown.trim(),
    youtube_url: form.youtube_url.trim() || null,
    extra_links: parseExtraLinks(form.extra_links_text),
    notes: form.notes.trim() || null,
    is_published: true,
  };
}

function getLessonError(...errors: unknown[]): string | null {
  const found = errors.find(Boolean);
  if (found instanceof Error) {
    return found.message;
  }
  return found ? "Nao foi possivel carregar este conteudo agora." : null;
}

function areaIcon(areaId: AreaOption["id"]): string {
  if (areaId === "exatas") return "📐";
  if (areaId === "natureza") return "🧬";
  if (areaId === "humanas") return "📝";
  return "🔤";
}

function findAreaForDiscipline(discipline: string): AreaOption | null {
  const normalized = discipline.toLocaleLowerCase("pt-BR");
  return STUDY_AREAS.find((area) =>
    area.disciplines.some((item) => normalized.includes(item.toLocaleLowerCase("pt-BR").split(" ")[0])),
  ) ?? null;
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  return `${Math.round(value * 100)}%`;
}

function formatSeconds(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}

function promptPreview(error: LessonSavedError): string {
  if (!error.prompt_markdown) {
    return "Questao salva sem enunciado estruturado.";
  }

  try {
    const blocks = JSON.parse(error.prompt_markdown) as Array<{ type?: string; content?: string }>;
    const textBlock = blocks.find((block) => block.type !== "image" && block.content);
    if (textBlock?.content) {
      return textBlock.content.slice(0, 180);
    }
  } catch {
    return error.prompt_markdown.slice(0, 180);
  }

  return "Questao salva com imagem ou estrutura sem texto.";
}

function ErrorAuditList({ errors, isLoading }: { errors: LessonSavedError[]; isLoading: boolean }) {
  if (isLoading) {
    return <p className="text-sm font-semibold text-slate-500">Carregando erros reais...</p>;
  }

  if (errors.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <strong className="text-sm text-white">Sem erros salvos neste bloco.</strong>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
          Quando voce salvar questoes na gaveta do Timer, elas aparecem aqui para guiar a ancoragem A1.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {errors.map((error) => (
        <article key={error.id} className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <strong className="text-sm font-black text-white">Questao {error.question_number}</strong>
            <span className="rounded-full border border-amber-500/30 px-2 py-1 text-xs font-black text-amber-200">
              {formatSeconds(error.time_seconds)}
            </span>
          </div>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">{promptPreview(error)}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-slate-400">
            <span>Voce: {error.user_answer ?? "--"}</span>
            <span>Gabarito: {error.correct_answer ?? "--"}</span>
            <span>TRI terceiros: {error.difficulty_percent ?? "--"}%</span>
          </div>
          {error.notes ? <p className="mt-3 text-xs font-semibold leading-5 text-amber-100/80">{error.notes}</p> : null}
        </article>
      ))}
    </div>
  );
}

export default function LessonsPage() {
  const queryClient = useQueryClient();
  const [selectedAreaId, setSelectedAreaId] = useState<AreaOption["id"] | null>(null);
  const [selectedDiscipline, setSelectedDiscipline] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [subjectPage, setSubjectPage] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<LessonFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const selectedArea = STUDY_AREAS.find((area) => area.id === selectedAreaId) ?? null;

  const recoveryQuery = useQuery({
    queryKey: ["lessons-a1-recovery"],
    queryFn: getLessonA1RecoveryBlocks,
    retry: false,
  });

  const studiedSubjectsQuery = useQuery({
    queryKey: ["lessons-studied-subjects"],
    queryFn: getLessonStudiedSubjects,
    retry: false,
  });

  const catalogQuery = useQuery({
    queryKey: ["free-study-catalog", selectedDiscipline],
    queryFn: () => getFreeStudyCatalogByDiscipline(selectedDiscipline!),
    enabled: Boolean(selectedDiscipline),
    retry: false,
  });

  const discipline = catalogQuery.data?.disciplines[0] ?? null;
  const subjects = useMemo(() => flattenSubjects(discipline), [discipline]);
  const studiedSubjectIds = useMemo(
    () => new Set((studiedSubjectsQuery.data ?? []).map((item) => item.subject_id)),
    [studiedSubjectsQuery.data],
  );
  const selectedSubject = subjects.find((subject) => subject.subject_id === selectedSubjectId) ?? null;
  const selectedSubjectStudied = selectedSubjectId !== null && studiedSubjectIds.has(selectedSubjectId);
  const subjectPageCount = Math.max(1, Math.ceil(subjects.length / SUBJECTS_PAGE_SIZE));
  const pagedSubjects = subjects.slice(
    subjectPage * SUBJECTS_PAGE_SIZE,
    subjectPage * SUBJECTS_PAGE_SIZE + SUBJECTS_PAGE_SIZE,
  );
  const selectedBlockId = selectedSubject?.block_id ?? null;

  const subjectLessonsQuery = useQuery({
    queryKey: ["lesson-contents", "subject", selectedSubjectId],
    queryFn: () => getLessonContentsBySubject(selectedSubjectId!),
    enabled: Boolean(selectedSubjectId),
    retry: false,
  });

  const roadmapLessonsQuery = useQuery({
    queryKey: ["lesson-contents", "roadmap-node", selectedSubject?.roadmap_node_id],
    queryFn: () => getLessonContentsByRoadmapNode(selectedSubject!.roadmap_node_id!),
    enabled: Boolean(selectedSubject?.roadmap_node_id),
    retry: false,
  });

  const savedErrorsQuery = useQuery({
    queryKey: ["lessons-block-errors", selectedBlockId],
    queryFn: () => getLessonSavedErrorsByBlock(selectedBlockId!),
    enabled: Boolean(selectedBlockId),
    retry: false,
  });

  const lessonContent =
    (subjectLessonsQuery.data && subjectLessonsQuery.data.length > 0 ? subjectLessonsQuery.data[0] : null) ??
    (roadmapLessonsQuery.data && roadmapLessonsQuery.data.length > 0 ? roadmapLessonsQuery.data[0] : null);
  const lessonLoading = subjectLessonsQuery.isLoading || roadmapLessonsQuery.isLoading;
  const lessonError = getLessonError(subjectLessonsQuery.error, roadmapLessonsQuery.error);

  const saveLessonMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSubject) {
        throw new Error("Selecione um conteudo antes de salvar.");
      }
      if (!form.title.trim()) {
        throw new Error("Informe um titulo para a aula.");
      }
      if (!form.body_markdown.trim()) {
        throw new Error("Informe pelo menos uma nota de ancoragem.");
      }

      const payload = buildPayload(form, selectedSubject);
      return lessonContent ? updateLessonContent(lessonContent.id, payload) : createLessonContent(payload);
    },
    onSuccess: async (lesson) => {
      setFeedback(lessonContent ? "Aula atualizada." : "Aula criada.");
      setIsEditing(false);
      setFormError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lesson-contents", "subject", selectedSubjectId] }),
        queryClient.invalidateQueries({ queryKey: ["lesson-contents", "roadmap-node", selectedSubject?.roadmap_node_id] }),
      ]);
      setForm(formFromLesson(lesson, selectedSubject));
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Nao foi possivel salvar a aula.");
    },
  });

  const deleteLessonMutation = useMutation({
    mutationFn: async () => {
      if (lessonContent) {
        await deleteLessonContent(lessonContent.id);
      }
    },
    onSuccess: async () => {
      setFeedback("Aula excluida.");
      setIsEditing(false);
      setForm(formFromLesson(null, selectedSubject));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lesson-contents", "subject", selectedSubjectId] }),
        queryClient.invalidateQueries({ queryKey: ["lesson-contents", "roadmap-node", selectedSubject?.roadmap_node_id] }),
      ]);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Nao foi possivel excluir a aula.");
    },
  });

  const markStudiedMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSubjectId) {
        throw new Error("Selecione um assunto antes de marcar como estudado.");
      }
      return markLessonSubjectStudied(selectedSubjectId);
    },
    onSuccess: async () => {
      setFeedback("A1 marcado como estudado.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lessons-studied-subjects"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-recent"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-today"] }),
      ]);
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : "Nao foi possivel marcar como estudado.");
    },
  });

  useEffect(() => {
    if (!isEditing) {
      setForm(formFromLesson(lessonContent, selectedSubject));
    }
  }, [isEditing, lessonContent, selectedSubject]);

  function chooseArea(area: AreaOption) {
    setSelectedAreaId(area.id);
    setSelectedDiscipline(null);
    setSelectedSubjectId(null);
    setSubjectPage(0);
    setIsEditing(false);
    setFeedback(null);
  }

  function chooseDiscipline(disciplineName: string) {
    setSelectedDiscipline(disciplineName);
    setSelectedSubjectId(null);
    setSubjectPage(0);
    setIsEditing(false);
    setFeedback(null);
  }

  function chooseSubject(subjectId: number) {
    setSelectedSubjectId(subjectId);
    setIsEditing(false);
    setFeedback(null);
  }

  function startRecovery(block: LessonA1RecoveryBlock) {
    const area = findAreaForDiscipline(block.discipline);
    if (area) {
      setSelectedAreaId(area.id);
    }
    setSelectedDiscipline(block.discipline);
    setSelectedSubjectId(block.subject_id);
    setSubjectPage(0);
    setIsEditing(false);
    setFeedback(
      block.subject_id
        ? "A1 carregado. Leia a teoria olhando para os erros reais na coluna da direita."
        : "Bloco em EX localizado, mas sem assunto vinculado para abrir aula automaticamente.",
    );
  }

  function startEditing() {
    setForm(formFromLesson(lessonContent, selectedSubject));
    setFormError(null);
    setFeedback(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setForm(formFromLesson(lessonContent, selectedSubject));
    setFormError(null);
    setIsEditing(false);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-10">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-sky-300">Aulas A1</p>
          <h1 className="text-3xl font-black tracking-tight text-white">Ancoragem teorica ativa</h1>
          <p className="max-w-3xl text-sm font-semibold leading-6 text-slate-400">
            Aulas aqui nao e leitura linear. E suporte A1: teoria direcionada pelos blocos travados e pelos seus erros
            reais.
          </p>
        </header>

        {feedback ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm font-bold text-sky-100">
            <span>{feedback}</span>
            <button type="button" className="text-sky-300 hover:text-white" onClick={() => setFeedback(null)}>
              Fechar
            </button>
          </div>
        ) : null}

        <section className="rounded-[2rem] border border-amber-500/25 bg-amber-500/5 p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-300">
                🩹 Conteudos em recuperacao urgente
              </p>
              <h2 className="text-2xl font-black text-white">A1 para blocos retidos em EX</h2>
            </div>
            {recoveryQuery.isFetching ? <span className="text-sm font-bold text-amber-200">Atualizando...</span> : null}
          </div>

          {recoveryQuery.data && recoveryQuery.data.length > 0 ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {recoveryQuery.data.map((block) => {
                const studied = block.subject_id !== null && studiedSubjectIds.has(block.subject_id);
                return (
                  <article key={block.block_id} className="rounded-2xl border border-amber-500/25 bg-slate-950/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full border border-amber-500/30 px-2 py-1 text-xs font-black text-amber-200">
                            {block.eaere_stage}
                          </span>
                          {studied ? (
                            <span className="rounded-full border border-emerald-500/30 px-2 py-1 text-xs font-black text-emerald-200">
                              Estudado
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-3 text-lg font-black text-white">{block.subject_name ?? block.block_name}</h3>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          {block.discipline} / {block.block_name}
                        </p>
                      </div>
                      <span className="text-right text-xs font-black text-amber-200">
                        MM
                        <br />
                        {formatPercent(block.ex_moving_average)}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold text-slate-400">
                      <span>Score {formatPercent(block.mastery_score)}</span>
                      <span>{block.saved_errors_count} erro(s) salvos</span>
                    </div>
                    <button
                      type="button"
                      className="mt-4 w-full rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-300"
                      onClick={() => startRecovery(block)}
                    >
                      📖 Iniciar Ancoragem Teorica
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm font-semibold text-slate-400">
              Nenhum bloco em EX agora. Quando algum conteudo travar, ele aparece aqui com prioridade de A1.
            </p>
          )}
        </section>

        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-sky-300">Busca manual</p>
            <h2 className="text-2xl font-black text-white">Consultar uma aula avulsa</h2>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {STUDY_AREAS.map((area) => {
              const active = selectedAreaId === area.id;
              return (
                <button
                  key={area.id}
                  type="button"
                  className={`rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-sky-400 bg-sky-500/15 text-white"
                      : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-600 hover:bg-slate-900"
                  }`}
                  onClick={() => chooseArea(area)}
                >
                  <span className="text-xl">{areaIcon(area.id)}</span>
                  <strong className="mt-3 block text-lg font-black">{area.label}</strong>
                  <span className="mt-1 block text-xs font-semibold leading-5 text-slate-400">{area.description}</span>
                </button>
              );
            })}
          </div>

          {selectedArea ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {selectedArea.disciplines.map((disciplineName) => (
                <button
                  key={disciplineName}
                  type="button"
                  className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                    selectedDiscipline === disciplineName
                      ? "border-sky-400 bg-sky-500 text-slate-950"
                      : "border-slate-700 bg-slate-950 text-slate-300 hover:border-sky-500/60"
                  }`}
                  onClick={() => chooseDiscipline(disciplineName)}
                >
                  {disciplineName}
                </button>
              ))}
            </div>
          ) : null}

          {selectedDiscipline && !selectedSubject ? (
            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <strong className="text-sm font-black text-white">{selectedDiscipline}</strong>
                {catalogQuery.isFetching ? <span className="text-xs font-bold text-slate-500">Carregando...</span> : null}
              </div>

              {catalogQuery.isError ? (
                <p className="text-sm font-semibold text-red-200">Nao foi possivel carregar esta disciplina.</p>
              ) : null}

              {!catalogQuery.isFetching && !catalogQuery.isError && subjects.length === 0 ? (
                <p className="text-sm font-semibold text-slate-500">Nenhum assunto encontrado para esta disciplina.</p>
              ) : null}

              <div className="grid gap-2">
                {pagedSubjects.map((subject) => {
                  const studied = studiedSubjectIds.has(subject.subject_id);
                  return (
                    <button
                      key={subject.subject_id}
                      type="button"
                      className={`flex flex-col gap-1 rounded-2xl border px-4 py-3 text-left transition sm:flex-row sm:items-center sm:justify-between ${
                        studied
                          ? "border-emerald-500/35 bg-emerald-500/10 hover:border-emerald-400"
                          : "border-slate-800 bg-slate-900/70 hover:border-sky-500/70 hover:bg-sky-500/10"
                      }`}
                      onClick={() => chooseSubject(subject.subject_id)}
                    >
                      <span>
                        <span className="flex flex-wrap items-center gap-2">
                          <strong className="block text-sm font-black text-white">{subject.subject_name}</strong>
                          {studied ? (
                            <span className="rounded-full border border-emerald-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">
                              Estudado
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">
                          {subject.subarea} / {subject.block_name ?? "Bloco livre"}
                        </span>
                      </span>
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Abrir A1</span>
                    </button>
                  );
                })}
              </div>

              {subjects.length > SUBJECTS_PAGE_SIZE ? (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs font-bold text-slate-500">
                    Pagina {subjectPage + 1} de {subjectPageCount} · {subjects.length} assuntos
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-slate-700 px-4 py-2 text-xs font-black text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={subjectPage === 0}
                      onClick={() => setSubjectPage((page) => Math.max(0, page - 1))}
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-slate-700 px-4 py-2 text-xs font-black text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={subjectPage + 1 >= subjectPageCount}
                      onClick={() => setSubjectPage((page) => Math.min(subjectPageCount - 1, page + 1))}
                    >
                      Proxima
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {selectedSubject ? (
          <section className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
            <article className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-sky-300">Conteudo e suporte</p>
                  <h2 className="mt-2 text-3xl font-black text-white">{selectedSubject.subject_name}</h2>
                  <p className="mt-2 text-sm font-semibold text-slate-500">
                    {selectedDiscipline} / {selectedSubject.block_name ?? "Bloco livre"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {selectedSubjectStudied ? (
                    <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-4 py-2 text-sm font-black text-emerald-200">
                      Estudado
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-4 py-2 text-sm font-black text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={markStudiedMutation.isPending}
                      onClick={() => markStudiedMutation.mutate()}
                    >
                      {markStudiedMutation.isPending ? "Marcando..." : "Marcar como estudado"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-full border border-slate-700 px-4 py-2 text-sm font-black text-slate-300 hover:border-sky-500 hover:text-white"
                    onClick={startEditing}
                  >
                    {lessonContent ? "Editar A1" : "Criar A1"}
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Status de execucao</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                  {selectedSubjectStudied
                    ? "Voce ja marcou este A1 como estudado. Agora a teoria esta registrada como apoio feito."
                    : "Depois de assistir, fichar ou revisar a teoria ativa, marque este assunto como estudado."}
                </p>
              </div>

              {lessonError ? <p className="mt-4 text-sm font-bold text-red-200">{lessonError}</p> : null}

              {lessonLoading ? (
                <p className="mt-6 text-sm font-semibold text-slate-500">Carregando material...</p>
              ) : isEditing ? (
                <form
                  className="mt-6 grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveLessonMutation.mutate();
                  }}
                >
                  <label className="grid gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                    Titulo
                    <input
                      className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold normal-case tracking-normal text-white outline-none focus:border-sky-400"
                      value={form.title}
                      onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                    Fichamento ativo / engenharia reversa
                    <textarea
                      className="min-h-44 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold normal-case leading-6 tracking-normal text-white outline-none focus:border-sky-400"
                      value={form.body_markdown}
                      onChange={(event) => setForm((current) => ({ ...current, body_markdown: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                    Video principal
                    <input
                      className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold normal-case tracking-normal text-white outline-none focus:border-sky-400"
                      value={form.youtube_url}
                      onChange={(event) => setForm((current) => ({ ...current, youtube_url: event.target.value }))}
                      placeholder="https://www.youtube.com/watch?v=..."
                    />
                  </label>
                  <label className="grid gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                    Links extras
                    <textarea
                      className="min-h-24 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold normal-case leading-6 tracking-normal text-white outline-none focus:border-sky-400"
                      value={form.extra_links_text}
                      onChange={(event) => setForm((current) => ({ ...current, extra_links_text: event.target.value }))}
                      placeholder="Lista de exercicios | https://..."
                    />
                  </label>
                  <label className="grid gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                    Notas
                    <textarea
                      className="min-h-24 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold normal-case leading-6 tracking-normal text-white outline-none focus:border-sky-400"
                      value={form.notes}
                      onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    />
                  </label>

                  {formError ? <p className="text-sm font-bold text-red-200">{formError}</p> : null}

                  <div className="flex flex-wrap justify-end gap-2">
                    {lessonContent ? (
                      <button
                        type="button"
                        className="rounded-2xl border border-red-500/30 px-4 py-3 text-sm font-black text-red-200 disabled:opacity-50"
                        disabled={deleteLessonMutation.isPending || saveLessonMutation.isPending}
                        onClick={() => deleteLessonMutation.mutate()}
                      >
                        Excluir
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-2xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-300"
                      onClick={cancelEditing}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-50"
                      disabled={saveLessonMutation.isPending}
                    >
                      {saveLessonMutation.isPending ? "Salvando..." : "Salvar A1"}
                    </button>
                  </div>
                </form>
              ) : lessonContent ? (
                <div className="mt-6 grid gap-5">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                    <h3 className="text-xl font-black text-white">{lessonContent.title}</h3>
                    <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-300">
                      {lessonContent.body_markdown || "Sem fichamento ativo cadastrado."}
                    </p>
                  </div>
                  {lessonContent.youtube_url ? (
                    <a
                      className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-center text-sm font-black text-sky-100 hover:bg-sky-500/20"
                      href={lessonContent.youtube_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir video da aula
                    </a>
                  ) : null}
                  {lessonContent.extra_links.length > 0 ? (
                    <div className="grid gap-2">
                      {lessonContent.extra_links.map((link) => (
                        <a
                          key={`${link.label}-${link.url}`}
                          className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm font-bold text-slate-300 hover:border-sky-500/60 hover:text-white"
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {lessonContent.notes ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                      <strong className="text-sm text-white">Notas</strong>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{lessonContent.notes}</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
                  <strong className="text-lg font-black text-white">Sem ancoragem cadastrada.</strong>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
                    Crie um A1 curto: o que voce precisa entender, qual erro ele corrige e qual material resolve.
                  </p>
                  <button
                    type="button"
                    className="mt-5 rounded-2xl bg-sky-500 px-5 py-3 text-sm font-black text-slate-950"
                    onClick={startEditing}
                  >
                    Criar suporte A1
                  </button>
                </div>
              )}
            </article>

            <aside className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-5">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-300">Auditoria do erro</p>
              <h2 className="mt-2 text-2xl font-black text-white">Erros reais deste bloco</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                Use esta coluna como mapa de leitura: teoria primeiro nos buracos que voce ja provou que existem.
              </p>
              <div className="mt-5">
                <ErrorAuditList errors={savedErrorsQuery.data ?? []} isLoading={savedErrorsQuery.isLoading} />
              </div>
            </aside>
          </section>
        ) : null}
      </section>
    </main>
  );
}
