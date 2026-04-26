import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import {
  createLessonContent,
  deleteLessonContent,
  getBlockProgressByDiscipline,
  getFreeStudyCatalog,
  getLessonContentsByRoadmapNode,
  getLessonContentsBySubject,
  updateLessonContent,
} from "../lib/api";
import type {
  BlockProgressDisciplineResponse,
  FreeStudyCatalogDiscipline,
  FreeStudyCatalogSubject,
  LessonContent,
  LessonContentPayload,
  LessonExtraLink,
} from "../lib/types";

type LessonFormState = {
  title: string;
  body_markdown: string;
  youtube_url: string;
  extra_links_text: string;
  notes: string;
  is_published: boolean;
};

type LessonModule = {
  block_id: number;
  block_name: string;
  subareas: string[];
  subjects: FreeStudyCatalogSubject[];
};

const emptyForm: LessonFormState = {
  title: "",
  body_markdown: "",
  youtube_url: "",
  extra_links_text: "",
  notes: "",
  is_published: true,
};

function getSubjects(discipline?: FreeStudyCatalogDiscipline | null): FreeStudyCatalogSubject[] {
  return discipline?.subareas.flatMap((subarea) => subarea.subjects) ?? [];
}

function groupSubjectsByBlock(discipline?: FreeStudyCatalogDiscipline | null): LessonModule[] {
  const modules = new Map<number, LessonModule>();

  discipline?.subareas.forEach((subarea) => {
    subarea.subjects.forEach((subject) => {
      const current = modules.get(subject.block_id);
      if (current) {
        current.subjects.push(subject);
        if (!current.subareas.includes(subarea.subarea)) {
          current.subareas.push(subarea.subarea);
        }
        return;
      }

      modules.set(subject.block_id, {
        block_id: subject.block_id,
        block_name: subject.block_name,
        subareas: [subarea.subarea],
        subjects: [subject],
      });
    });
  });

  return [...modules.values()].sort((a, b) => a.block_id - b.block_id);
}

function statusFromModule(module: LessonModule, progress?: BlockProgressDisciplineResponse): string {
  if (progress?.active_block?.id === module.block_id) {
    return "em andamento";
  }

  if (progress?.next_block?.id === module.block_id) {
    return "bloqueado";
  }

  if (progress?.reviewable_blocks.some((block) => block.id === module.block_id)) {
    return "revisavel";
  }

  if (module.subjects.some((subject) => subject.roadmap_status === "reviewable")) {
    return "revisavel";
  }

  if (module.subjects.every((subject) => subject.roadmap_status?.includes("blocked"))) {
    return "bloqueado";
  }

  if (module.subjects.some((subject) => subject.roadmap_status === "entry" || subject.roadmap_status === "available")) {
    return "disponivel";
  }

  return "disponivel";
}

function statusClassName(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("bloqueado")) {
    return "is-locked";
  }
  if (normalized.includes("revis")) {
    return "is-reviewable";
  }
  if (normalized.includes("andamento")) {
    return "is-active";
  }
  return "is-available";
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
    is_published: lesson.is_published,
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

      if (!url) {
        return { label, url: label };
      }

      return { label, url };
    })
    .filter((link) => link.url.length > 0);
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
    is_published: form.is_published,
  };
}

function getLessonError(...errors: unknown[]): string | null {
  const found = errors.find(Boolean);
  if (found instanceof Error) {
    return found.message;
  }
  return found ? "Nao foi possivel carregar este conteudo agora." : null;
}

function LessonsGuidanceIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="6" y="11" width="13" height="26" rx="3" className="today-icon-fill-green" />
      <rect x="17.5" y="8.5" width="13" height="28.5" rx="3" className="today-icon-fill-gold" />
      <rect x="29" y="10" width="13" height="27" rx="3" className="today-icon-fill-blue" />
      <path d="M10 16h5M10 21h5M21 15h6M21 20h6M32 17h6M32 22h6" className="today-icon-line-soft" />
    </svg>
  );
}

function LessonsNextStep({
  title,
  description,
  primaryLabel,
  primaryAction,
  secondaryLabel,
  secondaryTo,
}: {
  title: string;
  description: string;
  primaryLabel: string;
  primaryAction: () => void;
  secondaryLabel?: string;
  secondaryTo?: string;
}) {
  return (
    <section className="app-next-step-panel">
      <div className="app-next-step-copy">
        <p className="today-eyebrow">Faca agora</p>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="app-next-step-actions">
        <button type="button" className="app-primary-action app-primary-action-blue" onClick={primaryAction}>
          {primaryLabel}
        </button>
        {secondaryLabel && secondaryTo ? (
          <Link className="app-secondary-action app-guidance-link" to={secondaryTo}>
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export default function LessonsPage() {
  const queryClient = useQueryClient();
  const [selectedDiscipline, setSelectedDiscipline] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<LessonFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ["free-study-catalog"],
    queryFn: getFreeStudyCatalog,
    retry: false,
  });

  const disciplines = catalogQuery.data?.disciplines ?? [];
  const discipline = disciplines.find((item) => item.discipline === selectedDiscipline) ?? disciplines[0] ?? null;
  const modules = useMemo(() => groupSubjectsByBlock(discipline), [discipline]);
  const subjects = useMemo(() => getSubjects(discipline), [discipline]);
  const selectedSubject =
    subjects.find((subject) => subject.subject_id === selectedSubjectId) ?? subjects[0] ?? null;

  const blockProgressQuery = useQuery({
    queryKey: ["block-progress", discipline?.discipline],
    queryFn: () => getBlockProgressByDiscipline(discipline!.discipline),
    enabled: Boolean(discipline?.discipline),
    retry: false,
  });

  const subjectLessonsQuery = useQuery({
    queryKey: ["lesson-contents", "subject", selectedSubject?.subject_id],
    queryFn: () => getLessonContentsBySubject(selectedSubject!.subject_id),
    enabled: Boolean(selectedSubject?.subject_id),
    retry: false,
  });

  const roadmapLessonsQuery = useQuery({
    queryKey: ["lesson-contents", "roadmap-node", selectedSubject?.roadmap_node_id],
    queryFn: () => getLessonContentsByRoadmapNode(selectedSubject!.roadmap_node_id!),
    enabled: Boolean(selectedSubject?.roadmap_node_id),
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

      const payload = buildPayload(form, selectedSubject);
      return lessonContent
        ? updateLessonContent(lessonContent.id, payload)
        : createLessonContent(payload);
    },
    onSuccess: async (lesson) => {
      setFeedback(lessonContent ? "Aula atualizada." : "Aula criada.");
      setIsEditing(false);
      setFormError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lesson-contents", "subject", selectedSubject?.subject_id] }),
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
      if (!lessonContent) {
        return;
      }
      await deleteLessonContent(lessonContent.id);
    },
    onSuccess: async () => {
      setFeedback("Aula excluida.");
      setIsEditing(false);
      setForm(formFromLesson(null, selectedSubject));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lesson-contents", "subject", selectedSubject?.subject_id] }),
        queryClient.invalidateQueries({ queryKey: ["lesson-contents", "roadmap-node", selectedSubject?.roadmap_node_id] }),
      ]);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Nao foi possivel excluir a aula.");
    },
  });

  useEffect(() => {
    if (!selectedDiscipline && disciplines.length > 0) {
      setSelectedDiscipline(disciplines[0].discipline);
    }
  }, [disciplines, selectedDiscipline]);

  useEffect(() => {
    if (!selectedSubject && subjects.length > 0) {
      setSelectedSubjectId(subjects[0].subject_id);
      return;
    }

    if (selectedSubject && !subjects.some((subject) => subject.subject_id === selectedSubject.subject_id)) {
      setSelectedSubjectId(subjects[0]?.subject_id ?? null);
    }
  }, [selectedSubject, subjects]);

  useEffect(() => {
    if (!isEditing) {
      setForm(formFromLesson(lessonContent, selectedSubject));
    }
  }, [isEditing, lessonContent, selectedSubject]);

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

  const nextStep = !selectedSubject
    ? {
        title: "Escolha um conteudo da trilha",
        description: "Aulas so fica util quando voce seleciona um assunto especifico. Comece pela disciplina atual e abra um conteudo do modulo.",
        primaryLabel: "Ir para Today",
        primaryAction: () => {
          window.location.assign("/");
        },
        secondaryLabel: undefined,
        secondaryTo: undefined,
      }
    : isEditing
      ? {
          title: "Feche uma aula enxuta",
          description: "Nao precisa escrever perfeito. Salve um titulo, um resumo curto e um link principal para nao deixar o conteudo sem apoio.",
          primaryLabel: "Salvar aula",
          primaryAction: () => saveLessonMutation.mutate(),
          secondaryLabel: "Voltar ao foco do dia",
          secondaryTo: "/",
        }
      : lessonContent
        ? {
            title: `Estude ${selectedSubject.subject_name}`,
            description: "Agora que o conteudo existe, a melhor proxima acao e usar esta aula como apoio e depois voltar ao foco do dia para praticar.",
            primaryLabel: "Voltar ao foco do dia",
            primaryAction: () => {
              window.location.assign("/");
            },
            secondaryLabel: "Ver estatisticas",
            secondaryTo: "/stats",
          }
        : {
            title: "Cadastre a primeira aula deste conteudo",
            description: "Sem aula, este ponto da trilha fica sem apoio. O proximo passo util e criar um resumo simples ou anexar o link principal.",
            primaryLabel: "Criar aula",
            primaryAction: startEditing,
            secondaryLabel: "Voltar ao foco do dia",
            secondaryTo: "/",
          };

  return (
    <main className="today-page lessons-page">
      <section className="today-subjects-shell today-functional-shell lessons-shell">
        <section className="today-panel lessons-hero-panel">
          <div>
            <p className="today-eyebrow">Aulas</p>
            <h1>Trilha de conteudos</h1>
            <p>
              Navegue pelos blocos do roadmap e mantenha o material editorial de cada conteudo no mesmo lugar.
            </p>
          </div>
        </section>

        {catalogQuery.isError ? (
          <section className="today-panel today-error-panel">
            <strong>Aulas indisponiveis</strong>
            <p>O catalogo nao carregou agora. Verifique se o backend esta rodando e tente novamente.</p>
          </section>
        ) : null}

        <section className="app-guidance-panel">
          <div className="app-guidance-head">
            <div>
              <h3>Como navegar aqui</h3>
              <p>Aulas existe para te dar um lugar simples: escolher a disciplina, abrir o conteudo e estudar sem caçar material perdido.</p>
            </div>
            <span className="app-guidance-icon">
              <LessonsGuidanceIcon />
            </span>
          </div>
          <div className="app-guidance-steps">
            <div className="app-guidance-step">
              <span className="app-guidance-step-index">1</span>
              <p>Escolha a disciplina no topo.</p>
            </div>
            <div className="app-guidance-step">
              <span className="app-guidance-step-index">2</span>
              <p>Abra um modulo e selecione um conteudo da lista.</p>
            </div>
            <div className="app-guidance-step">
              <span className="app-guidance-step-index">3</span>
              <p>Se nao existir aula, crie um resumo curto ou cole o link principal.</p>
            </div>
          </div>
          <div className="app-guidance-actions">
            <Link className="app-secondary-action app-guidance-link" to="/">
              Voltar ao foco do dia
            </Link>
          </div>
        </section>

        <LessonsNextStep
          title={nextStep.title}
          description={nextStep.description}
          primaryLabel={nextStep.primaryLabel}
          primaryAction={nextStep.primaryAction}
          secondaryLabel={nextStep.secondaryLabel}
          secondaryTo={nextStep.secondaryTo}
        />

        {feedback ? (
          <section className="today-feedback">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback(null)}>
              Fechar
            </button>
          </section>
        ) : null}

        <section className="today-panel today-panel-wide lessons-toolbar">
          <div className="today-section-heading">
            <div>
              <p className="today-eyebrow">Disciplina</p>
              <h2>{discipline?.discipline ?? "Catalogo"}</h2>
            </div>
          </div>

          {catalogQuery.isLoading ? (
            <div className="app-empty-card">
              <strong>Carregando catalogo...</strong>
              <p>Quando o catalogo responder, as disciplinas e modulos aparecem aqui para voce escolher.</p>
            </div>
          ) : disciplines.length > 0 ? (
            <div className="stats-discipline-tabs lessons-discipline-tabs" role="tablist" aria-label="Disciplinas">
              {disciplines.map((item) => (
                <button
                  key={item.discipline}
                  type="button"
                  className={item.discipline === discipline?.discipline ? "is-active" : ""}
                  onClick={() => {
                    setSelectedDiscipline(item.discipline);
                    setSelectedSubjectId(null);
                    setIsEditing(false);
                    setFeedback(null);
                  }}
                >
                  {item.discipline}
                </button>
              ))}
            </div>
          ) : (
            <div className="app-empty-card">
              <strong>Nenhuma disciplina encontrada.</strong>
              <p>Sem catalogo nao ha trilha para navegar. Vale verificar o backend antes de continuar.</p>
            </div>
          )}

          {blockProgressQuery.isError ? (
            <div className="app-empty-card">
              <strong>Progressao indisponivel.</strong>
              <p>Voce ainda pode navegar pelo catalogo, mas sem a leitura de bloqueios e avancos desta disciplina.</p>
            </div>
          ) : blockProgressQuery.data?.message ? (
            <p className="lessons-progress-note">{blockProgressQuery.data.message}</p>
          ) : null}
        </section>

        <div className="lessons-grid">
          <section className="lessons-module-list" aria-label="Modulos da disciplina">
            {modules.length === 0 && !catalogQuery.isLoading ? (
              <article className="app-empty-card">
                <strong>Nenhum modulo encontrado.</strong>
                <p>Sem modulos, nao ha trilha para abrir conteudos nesta disciplina.</p>
              </article>
            ) : null}

            {modules.map((module, index) => {
              const status = statusFromModule(module, blockProgressQuery.data);
              return (
                <article key={module.block_id} className={`lessons-module ${statusClassName(status)}`}>
                  <div className="lessons-module-marker" aria-hidden="true">
                    {index + 1}
                  </div>
                  <div className="lessons-module-body">
                    <div className="lessons-module-head">
                      <div>
                        <span>{status}</span>
                        <h2>{module.block_name}</h2>
                        <p>{module.subareas.slice(0, 2).join(" / ")}</p>
                      </div>
                      <small>{module.subjects.length} conteudos</small>
                    </div>

                    <div className="lessons-subject-list">
                      {module.subjects.map((subject) => (
                        <button
                          key={subject.subject_id}
                          type="button"
                          className={subject.subject_id === selectedSubject?.subject_id ? "is-selected" : ""}
                          onClick={() => {
                            setSelectedSubjectId(subject.subject_id);
                            setIsEditing(false);
                            setFeedback(null);
                          }}
                        >
                          <strong>{subject.subject_name}</strong>
                          <span>
                            {subject.roadmap_node_id ?? "sem node"} - {subject.roadmap_status ?? "sem status"}
                          </span>
                          {subject.warning_message ? <small>{subject.warning_message}</small> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="today-panel lessons-content-panel">
            <div className="today-section-heading lessons-content-heading">
              <div>
                <p className="today-eyebrow">Conteudo selecionado</p>
                <h2>{selectedSubject?.subject_name ?? "Nenhum conteudo"}</h2>
              </div>

              {selectedSubject ? (
                <button type="button" className="app-secondary-action lessons-small-action" onClick={startEditing}>
                  {lessonContent ? "Editar aula" : "Criar aula"}
                </button>
              ) : null}
            </div>

            {selectedSubject ? (
              <div className="lessons-selected-meta">
                <span>{selectedSubject.block_name}</span>
                <span>{selectedSubject.roadmap_node_id ?? "sem roadmap node"}</span>
                <span>{selectedSubject.roadmap_mapped ? "mapeado" : "sem mapeamento"}</span>
              </div>
            ) : null}

            {lessonError ? <p className="today-form-error">{lessonError}</p> : null}

            {lessonLoading ? (
              <div className="app-empty-card">
                <strong>Carregando aula...</strong>
                <p>Este painel mostra o texto editorial, links e notas do conteudo selecionado.</p>
              </div>
            ) : isEditing && selectedSubject ? (
              <form
                className="lessons-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveLessonMutation.mutate();
                }}
              >
                <label className="today-form-field">
                  Titulo
                  <input
                    className="app-input"
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>

                <label className="today-form-field">
                  Corpo da aula
                  <textarea
                    className="app-input"
                    value={form.body_markdown}
                    onChange={(event) => setForm((current) => ({ ...current, body_markdown: event.target.value }))}
                  />
                </label>

                <label className="today-form-field">
                  YouTube
                  <input
                    className="app-input"
                    value={form.youtube_url}
                    onChange={(event) => setForm((current) => ({ ...current, youtube_url: event.target.value }))}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </label>

                <label className="today-form-field">
                  Links extras
                  <textarea
                    className="app-input"
                    value={form.extra_links_text}
                    onChange={(event) => setForm((current) => ({ ...current, extra_links_text: event.target.value }))}
                    placeholder="Lista de exercicios | https://..."
                  />
                </label>

                <label className="today-form-field">
                  Notas
                  <textarea
                    className="app-input"
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </label>

                <label className="lessons-publish-toggle">
                  <input
                    type="checkbox"
                    checked={form.is_published}
                    onChange={(event) => setForm((current) => ({ ...current, is_published: event.target.checked }))}
                  />
                  <span>Publicado</span>
                </label>

                {formError ? <p className="today-form-error">{formError}</p> : null}

                <div className="today-action-row lessons-editor-actions">
                  {lessonContent ? (
                    <button
                      type="button"
                      className="app-secondary-action lessons-danger-action"
                      disabled={deleteLessonMutation.isPending || saveLessonMutation.isPending}
                      onClick={() => {
                        setFormError(null);
                        deleteLessonMutation.mutate();
                      }}
                    >
                      {deleteLessonMutation.isPending ? "Excluindo..." : "Excluir"}
                    </button>
                  ) : null}
                  <button type="button" className="app-secondary-action" onClick={cancelEditing}>
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="app-primary-action app-primary-action-blue"
                    disabled={saveLessonMutation.isPending}
                  >
                    {saveLessonMutation.isPending ? "Salvando..." : "Salvar aula"}
                  </button>
                </div>
              </form>
            ) : lessonContent ? (
              <article className="lessons-reader">
                <div className="lessons-reader-head">
                  <div>
                    <h3>{lessonContent.title}</h3>
                    <span>{lessonContent.is_published ? "Publicado" : "Rascunho"}</span>
                  </div>
                </div>

                <p className="lessons-markdown">{lessonContent.body_markdown || "Sem texto cadastrado."}</p>

                {lessonContent.youtube_url ? (
                  <a className="lessons-video-link" href={lessonContent.youtube_url} target="_blank" rel="noreferrer">
                    Abrir video da aula
                  </a>
                ) : null}

                {lessonContent.extra_links.length > 0 ? (
                  <div className="lessons-link-list">
                    <strong>Links extras</strong>
                    {lessonContent.extra_links.map((link) => (
                      <a key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noreferrer">
                        {link.label}
                      </a>
                    ))}
                  </div>
                ) : null}

                {lessonContent.notes ? (
                  <div className="lessons-notes">
                    <strong>Notas</strong>
                    <p>{lessonContent.notes}</p>
                  </div>
                ) : null}
              </article>
            ) : (
              <div className="lessons-empty-state">
                <strong>Ainda nao ha aula cadastrada para este conteudo.</strong>
                <p>Crie um resumo simples, link do YouTube ou anotacoes para deixar este ponto da trilha pronto.</p>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
