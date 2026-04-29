import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import {
  getFreeStudyCatalog,
  getFreeStudySubjectContext,
  saveFreeStudyQuestionAttemptsBulk,
} from "../lib/api";
import type {
  FreeStudyCatalogDiscipline,
  FreeStudyCatalogSubject,
  FreeStudyRoadmapNodeBrief,
  FreeStudySubjectContextResponse,
  QuestionAttemptBulkPayload,
  QuestionAttemptBulkResponse,
} from "../lib/types";

type FreeStudyAttemptForm = {
  quantity: number;
  correct_count: number;
  source: string;
  difficulty_bank: "facil" | "media" | "dificil";
  difficulty_personal: "" | "facil" | "media" | "dificil";
  elapsed_seconds: string;
  confidence: "" | "baixa" | "media" | "alta";
  error_type: string;
  notes: string;
};

const defaultAttemptForm: FreeStudyAttemptForm = {
  quantity: 3,
  correct_count: 0,
  source: "",
  difficulty_bank: "media",
  difficulty_personal: "media",
  elapsed_seconds: "",
  confidence: "media",
  error_type: "",
  notes: "",
};

function getSubjects(discipline?: FreeStudyCatalogDiscipline | null): FreeStudyCatalogSubject[] {
  return discipline?.subareas.flatMap((subarea) => subarea.subjects) ?? [];
}

function warningClassName(level?: string | null): string {
  if (level === "high") return "free-study-warning-high";
  if (level === "medium") return "free-study-warning-medium";
  if (level === "low") return "free-study-warning-low";
  return "free-study-warning-none";
}

function warningLabel(level?: string | null): string {
  if (level === "high") return "Warning alto";
  if (level === "medium") return "Warning medio";
  if (level === "low") return "Warning leve";
  return "Sem warning";
}

function contextStatusLabel(status?: string | null): string {
  if (!status) return "Sem status";
  if (status === "blocked_required") return "Bloqueado por prerequisito";
  if (status === "blocked_cross_required") return "Bloqueado por cross_required";
  if (status === "reviewable") return "Revisavel";
  if (status === "entry") return "Entrada";
  if (status === "available") return "Disponivel";
  if (status === "unmapped") return "Nao mapeado";
  return status;
}

function formatNodeBrief(node: FreeStudyRoadmapNodeBrief): string {
  return [node.node_id, node.subject_area, node.content, node.subunit].filter(Boolean).join(" - ");
}

function validationMessage(form: FreeStudyAttemptForm): string | null {
  if (!Number.isFinite(form.quantity) || form.quantity <= 0) {
    return "Informe uma quantidade maior que zero.";
  }
  if (!Number.isFinite(form.correct_count) || form.correct_count < 0) {
    return "Acertos nao pode ser negativo.";
  }
  if (form.correct_count > form.quantity) {
    return "Acertos nao pode ser maior que a quantidade.";
  }
  const elapsed = Number(form.elapsed_seconds);
  if (form.elapsed_seconds.trim() && (!Number.isFinite(elapsed) || elapsed < 0)) {
    return "Tempo total deve ser zero ou maior.";
  }
  return null;
}

function buildPayload(
  subject: FreeStudyCatalogSubject,
  context: FreeStudySubjectContextResponse,
  form: FreeStudyAttemptForm,
): QuestionAttemptBulkPayload {
  const elapsed = Number(form.elapsed_seconds);
  return {
    discipline: context.discipline,
    block_id: subject.block_id,
    subject_id: subject.subject_id,
    source: form.source.trim() || null,
    quantity: form.quantity,
    correct_count: form.correct_count,
    difficulty_bank: form.difficulty_bank,
    difficulty_personal: form.difficulty_personal || null,
    elapsed_seconds: Number.isFinite(elapsed) && elapsed > 0 ? elapsed : null,
    confidence: form.confidence || null,
    error_type: form.error_type.trim() || null,
    notes: form.notes.trim() || null,
    study_mode: "free",
  };
}

function resultMessage(data: QuestionAttemptBulkResponse): string {
  return [
    `${data.created_attempts} questoes registradas`,
    data.impact_message,
    data.mastery_status ? `Dominio: ${data.mastery_status}` : null,
    data.mastery_score !== null && data.mastery_score !== undefined ? `Score: ${data.mastery_score.toFixed(2)}` : null,
    data.next_review_date ? `Proxima revisao: ${data.next_review_date}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function FreeStudyGuidanceIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="16" className="today-icon-fill-blue" />
      <path d="M17 18h14M17 24h14M17 30h8" className="today-icon-line-soft" />
      <path d="M30 12l6 6-11 11-6 1 1-6 10-12z" className="today-icon-fill-gold" />
    </svg>
  );
}

function FreeStudyNodeList({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: FreeStudyRoadmapNodeBrief[];
  emptyText: string;
}) {
  return (
    <section className="free-study-node-panel">
      <div className="stats-list-head">
        <h3>{title}</h3>
      </div>
      {items.length > 0 ? (
        <div className="free-study-node-list">
          {items.map((node) => (
            <article key={`${title}-${node.node_id}`} className="free-study-node-item">
              <strong>{node.node_id}</strong>
              <p>{formatNodeBrief(node)}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="today-empty-copy">{emptyText}</p>
      )}
    </section>
  );
}

export default function FreeStudyPage() {
  const queryClient = useQueryClient();
  const [selectedDiscipline, setSelectedDiscipline] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [attemptForm, setAttemptForm] = useState<FreeStudyAttemptForm>(defaultAttemptForm);
  const [feedback, setFeedback] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ["free-study-catalog"],
    queryFn: getFreeStudyCatalog,
    retry: false,
  });

  const disciplines = catalogQuery.data?.disciplines ?? [];
  const discipline = disciplines.find((item) => item.discipline === selectedDiscipline) ?? disciplines[0] ?? null;
  const subjects = useMemo(() => getSubjects(discipline), [discipline]);
  const selectedSubject =
    subjects.find((subject) => subject.subject_id === selectedSubjectId) ?? subjects[0] ?? null;

  const contextQuery = useQuery({
    queryKey: ["free-study-context", selectedSubject?.subject_id],
    queryFn: () => getFreeStudySubjectContext(selectedSubject!.subject_id),
    enabled: Boolean(selectedSubject?.subject_id),
    retry: false,
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
    setAttemptForm(defaultAttemptForm);
  }, [selectedSubjectId]);

  const registerMutation = useMutation({
    mutationFn: ({
      subject,
      context,
      form,
    }: {
      subject: FreeStudyCatalogSubject;
      context: FreeStudySubjectContextResponse;
      form: FreeStudyAttemptForm;
    }) => saveFreeStudyQuestionAttemptsBulk(buildPayload(subject, context, form)),
    onSuccess: async (data) => {
      setFeedback(resultMessage(data) || "Questoes registradas.");
      setAttemptForm(defaultAttemptForm);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["activity-today"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-recent"] }),
        queryClient.invalidateQueries({ queryKey: ["stats-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["stats-discipline"] }),
        queryClient.invalidateQueries({ queryKey: ["gamification-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["study-plan-today"] }),
        queryClient.invalidateQueries({ queryKey: ["free-study-context", selectedSubject?.subject_id] }),
      ]);
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : "Nao foi possivel registrar as questoes.");
    },
  });

  const context = contextQuery.data;
  const attemptError = validationMessage(attemptForm);

  function submitAttempt() {
    if (!selectedSubject || !context || attemptError) {
      return;
    }

    registerMutation.mutate({ subject: selectedSubject, context, form: attemptForm });
  }

  return (
    <main className="today-page free-study-page">
      <section className="today-subjects-shell today-functional-shell free-study-shell">
        <section className="today-panel free-study-hero-panel">
          <div>
            <p className="today-eyebrow">Modo Livre</p>
            <h1>Escolha qualquer conteudo e registre estudo fora do plano guiado.</h1>
            <p>
              Aqui o app nao bloqueia. Ele mostra o contexto pedagogico, os riscos e deixa voce seguir mesmo assim.
            </p>
          </div>
        </section>

        {feedback ? (
          <section className="today-feedback">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback(null)}>
              Fechar
            </button>
          </section>
        ) : null}

        <section className="app-guidance-panel">
          <div className="app-guidance-head">
            <div>
              <h3>Como usar o Modo Livre</h3>
              <p>
                Escolha uma disciplina, abra um conteudo, leia o warning pedagogico e registre as questoes que voce
                resolveu.
              </p>
            </div>
            <span className="app-guidance-icon">
              <FreeStudyGuidanceIcon />
            </span>
          </div>
          <div className="app-guidance-steps">
            <div className="app-guidance-step">
              <span className="app-guidance-step-index">1</span>
              <p>Selecione um assunto do catalogo livre.</p>
            </div>
            <div className="app-guidance-step">
              <span className="app-guidance-step-index">2</span>
              <p>Veja o contexto e os prerequisitos pendentes antes de decidir o volume.</p>
            </div>
            <div className="app-guidance-step">
              <span className="app-guidance-step-index">3</span>
              <p>Registre as questoes e use activity, stats e maestria para medir o impacto.</p>
            </div>
          </div>
          <div className="app-guidance-actions">
            <Link className="app-secondary-action app-guidance-link" to="/">
              Voltar ao foco do dia
            </Link>
          </div>
        </section>

        {catalogQuery.isError ? (
          <section className="today-panel today-error-panel">
            <strong>Modo Livre indisponivel</strong>
            <p>O catalogo nao carregou agora. Verifique se o backend esta rodando e tente novamente.</p>
          </section>
        ) : null}

        <section className="today-panel free-study-toolbar">
          <div className="today-section-heading">
            <div>
              <p className="today-eyebrow">Catalogo</p>
              <h2>{discipline?.discipline ?? "Disciplinas"}</h2>
            </div>
          </div>

          {catalogQuery.isLoading ? (
            <div className="app-empty-card">
              <strong>Carregando catalogo...</strong>
              <p>Assim que o backend responder, as disciplinas e conteudos aparecem aqui.</p>
            </div>
          ) : disciplines.length > 0 ? (
            <div className="stats-discipline-tabs lessons-discipline-tabs" role="tablist" aria-label="Disciplinas do modo livre">
              {disciplines.map((item) => (
                <button
                  key={item.discipline}
                  type="button"
                  className={item.discipline === discipline?.discipline ? "is-active" : ""}
                  onClick={() => {
                    setSelectedDiscipline(item.discipline);
                    setSelectedSubjectId(null);
                    setFeedback(null);
                  }}
                >
                  {item.discipline}
                </button>
              ))}
            </div>
          ) : (
            <div className="app-empty-card">
              <strong>Nenhum conteudo encontrado.</strong>
              <p>Sem subjects no catalogo, o Modo Livre nao tem o que listar.</p>
            </div>
          )}
        </section>

        <div className="free-study-grid">
          <section className="free-study-catalog-column">
            {discipline?.subareas.length ? (
              discipline.subareas.map((subarea) => (
                <section key={subarea.subarea} className="today-panel free-study-subarea-panel">
                  <div className="today-section-head">
                    <div>
                      <p className="today-eyebrow">Subarea</p>
                      <h2>{subarea.subarea}</h2>
                    </div>
                  </div>

                  <div className="free-study-subject-list">
                    {subarea.subjects.map((subject) => (
                      <button
                        key={subject.subject_id}
                        type="button"
                        className={`free-study-subject-card ${subject.subject_id === selectedSubject?.subject_id ? "is-selected" : ""}`}
                        onClick={() => {
                          setSelectedSubjectId(subject.subject_id);
                          setFeedback(null);
                        }}
                      >
                        <div className="free-study-subject-head">
                          <strong>{subject.subject_name}</strong>
                          <span className={`free-study-warning-chip ${warningClassName(subject.warning_level)}`}>
                            {warningLabel(subject.warning_level)}
                          </span>
                        </div>
                        <span>{subject.block_name}</span>
                        <small>
                          {subject.roadmap_node_id ?? "sem node"} - {contextStatusLabel(subject.roadmap_status)}
                        </small>
                        {subject.warning_message ? <p>{subject.warning_message}</p> : null}
                      </button>
                    ))}
                  </div>
                </section>
              ))
            ) : catalogQuery.isLoading ? null : (
              <section className="today-panel">
                <p className="today-empty-copy">Nenhuma subarea encontrada para esta disciplina.</p>
              </section>
            )}
          </section>

          <section className="free-study-context-column">
            <section className="today-panel free-study-context-panel">
              <div className="today-section-heading">
                <div>
                  <p className="today-eyebrow">Contexto</p>
                  <h2>{selectedSubject?.subject_name ?? "Selecione um conteudo"}</h2>
                </div>
              </div>

              {contextQuery.isLoading ? (
                <div className="app-empty-card">
                  <strong>Carregando contexto...</strong>
                  <p>Este painel mostra o status guiado, o warning e os prerequisitos do assunto escolhido.</p>
                </div>
              ) : contextQuery.isError ? (
                <div className="app-empty-card">
                  <strong>Contexto indisponivel.</strong>
                  <p>{contextQuery.error instanceof Error ? contextQuery.error.message : "Nao foi possivel carregar este conteudo."}</p>
                </div>
              ) : context ? (
                <>
                  <div className={`free-study-warning-banner ${warningClassName(context.warning_level)}`}>
                    <div>
                      <strong>{warningLabel(context.warning_level)}</strong>
                      <p>{context.warning_message ?? "Este conteudo pode ser estudado livremente sem alerta adicional."}</p>
                    </div>
                  </div>

                  <div className="free-study-meta-grid">
                    <article>
                      <span>Disciplina</span>
                      <strong>{context.discipline}</strong>
                    </article>
                    <article>
                      <span>Bloco</span>
                      <strong>{context.block_id ?? "Sem bloco"}</strong>
                    </article>
                    <article>
                      <span>Roadmap node</span>
                      <strong>{context.roadmap_node_id ?? "Sem node"}</strong>
                    </article>
                    <article>
                      <span>Status guiado</span>
                      <strong>{contextStatusLabel(context.guided_status)}</strong>
                    </article>
                  </div>

                  <FreeStudyNodeList
                    title="Prerequisitos diretos"
                    items={context.direct_prerequisites}
                    emptyText="Sem prerequisitos diretos listados."
                  />
                  <FreeStudyNodeList
                    title="Required pendentes"
                    items={context.missing_required_nodes}
                    emptyText="Nenhum required pendente."
                  />
                  <FreeStudyNodeList
                    title="Cross required pendentes"
                    items={context.missing_cross_required_nodes}
                    emptyText="Nenhum cross_required pendente."
                  />
                  <FreeStudyNodeList
                    title="Recommended pendentes"
                    items={context.missing_recommended_nodes}
                    emptyText="Nenhum recommended pendente."
                  />
                </>
              ) : (
                <div className="app-empty-card">
                  <strong>Escolha um assunto.</strong>
                  <p>O contexto aparece quando voce seleciona um conteudo no catalogo.</p>
                </div>
              )}
            </section>

            <section className="today-panel free-study-form-panel">
              <div className="today-section-heading">
                <div>
                  <p className="today-eyebrow">Registrar questoes</p>
                  <h2>{selectedSubject?.subject_name ?? "Sem assunto selecionado"}</h2>
                </div>
              </div>

              {!selectedSubject || !context ? (
                <div className="app-empty-card">
                  <strong>Selecione um conteudo antes.</strong>
                  <p>O formulario de registro depende do assunto escolhido no catalogo.</p>
                </div>
              ) : (
                <>
                  <div className="today-preferences-grid free-study-form-grid">
                    <label className="today-form-field">
                      <span>Quantidade</span>
                      <input
                        className="app-input"
                        type="number"
                        min={1}
                        value={attemptForm.quantity}
                        onChange={(event) =>
                          setAttemptForm((current) => {
                            const quantity = Number(event.target.value);
                            return {
                              ...current,
                              quantity,
                              correct_count:
                                Number.isFinite(quantity) && current.correct_count > quantity ? quantity : current.correct_count,
                            };
                          })
                        }
                      />
                    </label>
                    <label className="today-form-field">
                      <span>Acertos</span>
                      <input
                        className="app-input"
                        type="number"
                        min={0}
                        max={attemptForm.quantity}
                        value={attemptForm.correct_count}
                        onChange={(event) =>
                          setAttemptForm((current) => ({ ...current, correct_count: Number(event.target.value) }))
                        }
                      />
                    </label>
                    <label className="today-form-field">
                      <span>Fonte</span>
                      <input
                        className="app-input"
                        value={attemptForm.source}
                        onChange={(event) => setAttemptForm((current) => ({ ...current, source: event.target.value }))}
                        placeholder="lista, prova, simulado..."
                      />
                    </label>
                    <label className="today-form-field">
                      <span>Tempo total (s)</span>
                      <input
                        className="app-input"
                        type="number"
                        min={0}
                        value={attemptForm.elapsed_seconds}
                        onChange={(event) =>
                          setAttemptForm((current) => ({ ...current, elapsed_seconds: event.target.value }))
                        }
                      />
                    </label>
                    <label className="today-form-field">
                      <span>Dificuldade banco</span>
                      <select
                        className="app-input"
                        value={attemptForm.difficulty_bank}
                        onChange={(event) =>
                          setAttemptForm((current) => ({
                            ...current,
                            difficulty_bank: event.target.value as FreeStudyAttemptForm["difficulty_bank"],
                          }))
                        }
                      >
                        <option value="facil">Facil</option>
                        <option value="media">Media</option>
                        <option value="dificil">Dificil</option>
                      </select>
                    </label>
                    <label className="today-form-field">
                      <span>Dificuldade pessoal</span>
                      <select
                        className="app-input"
                        value={attemptForm.difficulty_personal}
                        onChange={(event) =>
                          setAttemptForm((current) => ({
                            ...current,
                            difficulty_personal: event.target.value as FreeStudyAttemptForm["difficulty_personal"],
                          }))
                        }
                      >
                        <option value="">Nao informar</option>
                        <option value="facil">Facil</option>
                        <option value="media">Media</option>
                        <option value="dificil">Dificil</option>
                      </select>
                    </label>
                    <label className="today-form-field">
                      <span>Confianca</span>
                      <select
                        className="app-input"
                        value={attemptForm.confidence}
                        onChange={(event) =>
                          setAttemptForm((current) => ({
                            ...current,
                            confidence: event.target.value as FreeStudyAttemptForm["confidence"],
                          }))
                        }
                      >
                        <option value="">Nao informar</option>
                        <option value="baixa">Baixa</option>
                        <option value="media">Media</option>
                        <option value="alta">Alta</option>
                      </select>
                    </label>
                    <label className="today-form-field">
                      <span>Tipo de erro</span>
                      <input
                        className="app-input"
                        value={attemptForm.error_type}
                        onChange={(event) => setAttemptForm((current) => ({ ...current, error_type: event.target.value }))}
                        placeholder="conceito, distracao..."
                      />
                    </label>
                  </div>

                  <label className="today-form-field today-form-wide">
                    <span>Observacoes</span>
                    <textarea
                      className="app-input"
                      value={attemptForm.notes}
                      onChange={(event) => setAttemptForm((current) => ({ ...current, notes: event.target.value }))}
                    />
                  </label>

                  {attemptError ? <p className="today-form-error">{attemptError}</p> : null}

                  <div className="free-study-submit-note">
                    <p>O Modo Livre nao bloqueia estudo. O warning serve para dar contexto antes do registro.</p>
                  </div>

                  <div className="today-action-row">
                    <button
                      type="button"
                      className="app-primary-action app-primary-action-blue"
                      disabled={registerMutation.isPending || Boolean(attemptError)}
                      onClick={submitAttempt}
                    >
                      {registerMutation.isPending ? "Registrando..." : "Registrar questoes"}
                    </button>
                  </div>
                </>
              )}
            </section>
          </section>
        </div>
      </section>
    </main>
  );
}
