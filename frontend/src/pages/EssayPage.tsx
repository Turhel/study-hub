import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import {
  closeEssayStudySession,
  createEssayCorrection,
  createEssayStudySession,
  createManualEssayCorrection,
  getSystemCapabilities,
  sendEssayStudyMessage,
} from "../lib/api";
import type {
  EssayCompetencyResult,
  EssayCorrectionMode,
  EssayCorrectionStoredResponse,
  EssayExternalProvider,
  EssayStudyMessageResponse,
  EssayStudySessionResponse,
} from "../lib/types";

const correctionModeOptions: Array<{ value: EssayCorrectionMode; label: string }> = [
  { value: "detailed", label: "Detalhada" },
  { value: "score_only", label: "Nota rapida" },
  { value: "teach", label: "Modo estudo" },
];

const externalProviderOptions: EssayExternalProvider[] = ["ChatGPT", "Gemini", "Claude", "DeepSeek", "Outro"];
const allowedCompetencyScores = [0, 40, 80, 120, 160, 200];
type EssayTab = "automatic" | "manual";
type ManualScoreKey = "c1" | "c2" | "c3" | "c4" | "c5";

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatScoreRange(result?: EssayCorrectionStoredResponse | null): string {
  if (!result) {
    return "--";
  }
  const { min, max } = result.estimated_score_range;
  return min === max ? String(min) : `${min}-${max}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "Sem data";
  }
  return new Date(value).toLocaleString("pt-BR");
}

function competencyLabel(key: string): string {
  const normalized = key.toUpperCase();
  return normalized.startsWith("C") ? normalized : `C${normalized}`;
}

function sortedCompetencies(competencies: Record<string, EssayCompetencyResult>) {
  return Object.entries(competencies).sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

function splitManualItems(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildExternalPrompt(theme: string, essayText: string, studentGoal: string): string {
  return [
    "Corrija a redacao abaixo como uma redacao do ENEM.",
    "",
    "Use os criterios das competencias C1, C2, C3, C4 e C5, cada uma com nota entre 0 e 200.",
    "Aceite que o tema pode ser oficial, simulado ou proposto pelo usuario. A nota deve ser uma estimativa assistida, nao nota oficial do INEP.",
    "",
    `Tema: ${theme.trim() || "[cole o tema aqui]"}`,
    `Objetivo do aluno: ${studentGoal.trim() || "Sem objetivo especifico informado."}`,
    "",
    "Texto da redacao:",
    essayText.trim() || "[cole a redacao aqui]",
    "",
    "Responda em formato facil de copiar, com esta estrutura:",
    "Nota total: [soma de C1-C5]",
    "C1: [0, 40, 80, 120, 160 ou 200] - [comentario curto]",
    "C2: [0, 40, 80, 120, 160 ou 200] - [comentario curto]",
    "C3: [0, 40, 80, 120, 160 ou 200] - [comentario curto]",
    "C4: [0, 40, 80, 120, 160 ou 200] - [comentario curto]",
    "C5: [0, 40, 80, 120, 160 ou 200] - [comentario curto]",
    "Pontos fortes:",
    "- ...",
    "Pontos fracos:",
    "- ...",
    "Plano de melhoria:",
    "- ...",
    "Observacoes:",
    "- ...",
  ].join("\n");
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="essay-result-list">
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="today-empty-copy">Sem itens retornados.</p>
      )}
    </section>
  );
}

function CorrectionResult({ result }: { result: EssayCorrectionStoredResponse }) {
  const competencies = sortedCompetencies(result.competencies);

  return (
    <section className="today-panel essay-result-panel">
      <div className="today-section-heading essay-result-heading">
        <div>
          <p className="today-eyebrow">Correcao concluida</p>
          <h2>{result.submission.theme}</h2>
          <p>Gerada em {formatDateTime(result.created_at)}</p>
        </div>
        <article className="essay-score-card">
          <span>Nota estimada</span>
          <strong>{formatScoreRange(result)}</strong>
        </article>
      </div>

      <div className="essay-provider-row">
        <span>Provider: {result.provider}</span>
        <span>Modelo: {result.model}</span>
        <span>Modo: {result.mode}</span>
        <span>Tokens: {result.tokens_total}</span>
      </div>

      <div className="essay-competency-grid">
        {competencies.length > 0 ? (
          competencies.map(([key, value]) => (
            <article key={key} className="essay-competency-card">
              <span>{competencyLabel(key)}</span>
              <strong>{value.score}</strong>
              <p>{value.comment}</p>
            </article>
          ))
        ) : (
          <p className="today-empty-copy">Sem competencias retornadas.</p>
        )}
      </div>

      <div className="essay-result-columns">
        <ResultList title="Pontos fortes" items={result.strengths} />
        <ResultList title="Pontos a melhorar" items={result.weaknesses} />
      </div>

      <ResultList title="Plano de melhoria" items={result.improvement_plan} />

      <section className="essay-confidence-note">
        <h3>Leitura geral</h3>
        <p>{result.confidence_note}</p>
      </section>

      <details className="essay-raw-details">
        <summary>Ver payload bruto</summary>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </section>
  );
}

function StudyMessage({ message }: { message: EssayStudyMessageResponse }) {
  return (
    <article className={`essay-chat-message essay-chat-message-${message.role}`}>
      <span>{message.role}</span>
      <p>{message.content}</p>
      <small>{formatDateTime(message.created_at)}</small>
    </article>
  );
}

function EssayGuidanceIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="8" y="6" width="21" height="29" rx="4" className="today-icon-fill-blue" />
      <path d="M13 14h11M13 20h11M13 26h7" className="today-icon-line-soft" />
      <path d="M25 30l11-11 5 5-11 11-7 2 2-7z" className="today-icon-fill-gold" />
    </svg>
  );
}

function EssayNextStep({
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

export default function EssayPage() {
  const [theme, setTheme] = useState("");
  const [essayText, setEssayText] = useState("");
  const [studentGoal, setStudentGoal] = useState("");
  const [mode, setMode] = useState<EssayCorrectionMode>("detailed");
  const [essayTab, setEssayTab] = useState<EssayTab>("automatic");
  const [formError, setFormError] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualProvider, setManualProvider] = useState<EssayExternalProvider>("ChatGPT");
  const [manualScores, setManualScores] = useState<Record<ManualScoreKey, number>>({
    c1: 160,
    c2: 160,
    c3: 160,
    c4: 160,
    c5: 160,
  });
  const [manualStrengths, setManualStrengths] = useState("");
  const [manualWeaknesses, setManualWeaknesses] = useState("");
  const [manualImprovementPlan, setManualImprovementPlan] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [correction, setCorrection] = useState<EssayCorrectionStoredResponse | null>(null);
  const [studySession, setStudySession] = useState<EssayStudySessionResponse | null>(null);
  const [studyMessage, setStudyMessage] = useState("");
  const [studyError, setStudyError] = useState<string | null>(null);

  const capabilitiesQuery = useQuery({
    queryKey: ["system-capabilities"],
    queryFn: getSystemCapabilities,
    retry: false,
  });

  const capabilities = capabilitiesQuery.data;
  const correctionEnabled = Boolean(capabilities?.llm.enabled && capabilities.features.essay_correction_enabled);
  const studyEnabled = Boolean(capabilities?.llm.enabled && capabilities.features.essay_study_enabled);
  const unavailableMessage = capabilities
    ? "Correcao por IA esta indisponivel nesta maquina. Habilite um provider compatível nesta instalacao."
    : "Carregando capabilities da maquina...";

  const correctionMutation = useMutation({
    mutationFn: () =>
      createEssayCorrection({
        theme: theme.trim(),
        essay_text: essayText.trim(),
        student_goal: studentGoal.trim() || null,
        mode,
      }),
    onSuccess: (result) => {
      setCorrection(result);
      setStudySession(null);
      setFormError(null);
    },
    onError: (error) => {
      setFormError(getErrorMessage(error, "Nao foi possivel corrigir a redacao."));
    },
  });

  const manualCorrectionMutation = useMutation({
    mutationFn: () =>
      createManualEssayCorrection({
        theme: theme.trim(),
        essay_text: essayText.trim(),
        external_provider: manualProvider,
        c1: manualScores.c1,
        c2: manualScores.c2,
        c3: manualScores.c3,
        c4: manualScores.c4,
        c5: manualScores.c5,
        strengths: splitManualItems(manualStrengths),
        weaknesses: splitManualItems(manualWeaknesses),
        improvement_plan: splitManualItems(manualImprovementPlan),
        notes: manualNotes.trim() || null,
      }),
    onSuccess: (result) => {
      setCorrection(result);
      setStudySession(null);
      setManualError(null);
      setEssayTab("manual");
    },
    onError: (error) => {
      setManualError(getErrorMessage(error, "Nao foi possivel registrar a correcao manual."));
    },
  });

  const createStudyMutation = useMutation({
    mutationFn: () => {
      if (!correction) {
        throw new Error("Corrija uma redacao antes de iniciar o estudo.");
      }
      return createEssayStudySession(correction.id);
    },
    onSuccess: (session) => {
      setStudySession(session);
      setStudyError(null);
    },
    onError: (error) => {
      setStudyError(getErrorMessage(error, "Nao foi possivel iniciar o estudo."));
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: () => {
      if (!studySession) {
        throw new Error("Abra uma sessao de estudo antes de enviar mensagem.");
      }
      return sendEssayStudyMessage(studySession.id, studyMessage.trim());
    },
    onSuccess: (session) => {
      setStudySession(session);
      setStudyMessage("");
      setStudyError(null);
    },
    onError: (error) => {
      setStudyError(getErrorMessage(error, "Nao foi possivel enviar a mensagem."));
    },
  });

  const closeStudyMutation = useMutation({
    mutationFn: () => {
      if (!studySession) {
        throw new Error("Nenhuma sessao aberta.");
      }
      return closeEssayStudySession(studySession.id);
    },
    onSuccess: (closed) => {
      setStudySession((current) =>
        current ? { ...current, status: closed.status, ended_at: closed.ended_at, can_accept_messages: false } : current,
      );
      setStudyError(null);
    },
    onError: (error) => {
      setStudyError(getErrorMessage(error, "Nao foi possivel fechar a sessao."));
    },
  });

  const wordCount = useMemo(
    () => essayText.trim().split(/\s+/).filter(Boolean).length,
    [essayText],
  );
  const manualTotal = useMemo(
    () => Object.values(manualScores).reduce((total, score) => total + score, 0),
    [manualScores],
  );
  const nextStep = !theme.trim() || !essayText.trim()
    ? {
        title: "Escreva a redacao primeiro",
        description: "Antes de pensar em IA, o passo certo e preencher tema e texto. Sem isso, a tela vira so expectativa.",
        primaryLabel: "Continuar escrevendo",
        primaryAction: () => {
          const themeInput = document.querySelector<HTMLInputElement>(".essay-form input");
          themeInput?.focus();
        },
        secondaryLabel: "Voltar ao foco do dia",
        secondaryTo: "/",
      }
    : !correctionEnabled
      ? {
          title: "Use a correcao externa/manual",
          description: "Se a IA automatica falhar ou estiver desligada, copie o prompt para outra IA e registre C1-C5 aqui para manter seu historico.",
          primaryLabel: "Abrir modo manual",
          primaryAction: () => {
            setEssayTab("manual");
          },
          secondaryLabel: "Ver estatisticas",
          secondaryTo: "/stats",
        }
      : !correction
        ? {
            title: "Peca a correcao agora",
            description: "Seu texto ja esta pronto. O proximo passo util e gerar o feedback da IA para descobrir o que corrigir primeiro.",
            primaryLabel: "Corrigir com IA",
            primaryAction: submitCorrection,
            secondaryLabel: "Voltar ao foco do dia",
            secondaryTo: "/",
          }
        : !studySession
          ? {
              title: "Transforme a correcao em estudo",
              description: "Voce ja tem o feedback. Agora vale abrir o chat da redacao para tirar duvidas e sair com um plano de melhora.",
              primaryLabel: "Estudar esta redacao",
              primaryAction: () => createStudyMutation.mutate(),
              secondaryLabel: "Voltar ao foco do dia",
              secondaryTo: "/",
            }
          : {
              title: "Feche a sessao com uma duvida boa",
              description: "Pergunte sobre o erro mais importante desta redacao ou sobre como melhorar sua proxima versao.",
              primaryLabel: "Enviar pergunta",
              primaryAction: submitStudyMessage,
              secondaryLabel: "Voltar ao foco do dia",
              secondaryTo: "/",
            };

  function submitCorrection() {
    setFormError(null);
    if (!theme.trim()) {
      setFormError("Informe o tema da redacao.");
      return;
    }
    if (!essayText.trim()) {
      setFormError("Escreva a redacao antes de pedir correcao.");
      return;
    }
    if (!correctionEnabled) {
      setFormError(unavailableMessage);
      return;
    }
    correctionMutation.mutate();
  }

  async function copyExternalPrompt() {
    setCopyFeedback(null);
    const prompt = buildExternalPrompt(theme, essayText, studentGoal);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyFeedback("Prompt copiado.");
    } catch {
      setCopyFeedback("Nao foi possivel copiar automaticamente. Selecione o texto do prompt e copie manualmente.");
    }
  }

  function submitManualCorrection() {
    setManualError(null);
    if (!theme.trim()) {
      setManualError("Informe o tema da redacao.");
      return;
    }
    if (!essayText.trim()) {
      setManualError("Escreva a redacao antes de registrar a correcao.");
      return;
    }
    const invalidScore = Object.entries(manualScores).find(([, score]) => !allowedCompetencyScores.includes(score));
    if (invalidScore) {
      setManualError("As notas C1-C5 devem ser 0, 40, 80, 120, 160 ou 200.");
      return;
    }
    if (splitManualItems(manualStrengths).length === 0) {
      setManualError("Informe pelo menos um ponto forte.");
      return;
    }
    if (splitManualItems(manualWeaknesses).length === 0) {
      setManualError("Informe pelo menos um ponto fraco.");
      return;
    }
    if (splitManualItems(manualImprovementPlan).length === 0) {
      setManualError("Informe pelo menos uma acao no plano de melhoria.");
      return;
    }
    manualCorrectionMutation.mutate();
  }

  function submitStudyMessage() {
    setStudyError(null);
    if (!studyMessage.trim()) {
      setStudyError("Escreva uma pergunta antes de enviar.");
      return;
    }
    sendMessageMutation.mutate();
  }

  return (
    <main className="today-page essay-page">
      <section className="today-subjects-shell today-functional-shell essay-shell">
        <section className="today-panel essay-hero-panel">
          <div>
            <p className="today-eyebrow">Redacao</p>
            <h1>Correcao e estudo assistido</h1>
            <p>
              Escreva, corrija e transforme o feedback em um plano curto de estudo quando a IA estiver disponivel.
            </p>
          </div>
        </section>

        {capabilitiesQuery.isError ? (
          <section className="today-panel today-error-panel">
            <strong>Capabilities indisponiveis</strong>
            <p>Nao foi possivel consultar a maquina agora. A correcao por IA fica bloqueada por seguranca.</p>
          </section>
        ) : null}

        <section className="app-guidance-panel">
          <div className="app-guidance-head">
            <div>
              <h3>Como usar redacao sem se enrolar</h3>
              <p>Esta tela tem dois trabalhos: guardar seu texto e, quando houver IA disponivel, transformar isso em correcao e estudo.</p>
            </div>
            <span className="app-guidance-icon">
              <EssayGuidanceIcon />
            </span>
          </div>
          <div className="app-guidance-steps">
            <div className="app-guidance-step">
              <span className="app-guidance-step-index">1</span>
              <p>Preencha tema e texto.</p>
            </div>
            <div className="app-guidance-step">
              <span className="app-guidance-step-index">2</span>
              <p>Se a IA estiver ligada, corrija e leia os pontos fortes e fracos.</p>
            </div>
            <div className="app-guidance-step">
              <span className="app-guidance-step-index">3</span>
              <p>Use o chat depois da correcao para estudar os erros mais importantes.</p>
            </div>
          </div>
          <div className="app-guidance-actions">
            <Link className="app-secondary-action app-guidance-link" to="/">
              Voltar ao foco do dia
            </Link>
          </div>
        </section>

        <EssayNextStep
          title={nextStep.title}
          description={nextStep.description}
          primaryLabel={nextStep.primaryLabel}
          primaryAction={nextStep.primaryAction}
          secondaryLabel={nextStep.secondaryLabel}
          secondaryTo={nextStep.secondaryTo}
        />

        <section className="today-panel essay-capabilities-panel">
          <div className="today-section-heading">
            <div>
              <p className="today-eyebrow">Maquina</p>
              <h2>Status da IA</h2>
            </div>
          </div>
          <div className="essay-capability-grid">
            <article className="essay-capability-card">
              <span>LLM</span>
              <strong>{capabilities?.llm.enabled ? "Ligado" : "Desligado"}</strong>
              <small>{capabilities?.llm.provider ?? "sem provider"} / {capabilities?.llm.model ?? "sem modelo"}</small>
            </article>
            <article className="essay-capability-card">
              <span>Correcao</span>
              <strong>{capabilities?.features.essay_correction_enabled ? "Disponivel" : "Indisponivel"}</strong>
              <small>{correctionEnabled ? "Botao liberado" : "Bloqueada nesta maquina"}</small>
            </article>
            <article className="essay-capability-card">
              <span>Estudo</span>
              <strong>{capabilities?.features.essay_study_enabled ? "Disponivel" : "Indisponivel"}</strong>
              <small>{studyEnabled ? "Chat liberado apos correcao" : "Chat bloqueado"}</small>
            </article>
          </div>
          {!correctionEnabled ? <p className="essay-unavailable-copy">{unavailableMessage}</p> : null}
        </section>

        <div className="essay-grid">
          <section className="today-panel essay-form-panel">
            <div className="today-section-heading">
              <div>
                <p className="today-eyebrow">Texto</p>
                <h2>Nova redacao</h2>
              </div>
              <span className="essay-word-count">{wordCount} palavras</span>
            </div>

            <div className="essay-form">
              <label className="today-form-field">
                Tema
                <input
                  className="app-input"
                  value={theme}
                  onChange={(event) => setTheme(event.target.value)}
                  placeholder="Ex.: Desafios para democratizar o acesso a saude no Brasil"
                />
              </label>

              <label className="today-form-field">
                Redacao
                <textarea
                  className="app-input essay-textarea"
                  value={essayText}
                  onChange={(event) => setEssayText(event.target.value)}
                  placeholder="Cole ou escreva sua redacao aqui."
                />
              </label>

              <label className="today-form-field">
                Observacoes ou objetivo
                <textarea
                  className="app-input"
                  value={studentGoal}
                  onChange={(event) => setStudentGoal(event.target.value)}
                  placeholder="Ex.: Quero focar em repertorio e proposta de intervencao."
                />
              </label>

              <div className="essay-mode-tabs" role="tablist" aria-label="Modo de correcao">
                <button
                  type="button"
                  className={essayTab === "automatic" ? "is-active" : ""}
                  onClick={() => setEssayTab("automatic")}
                >
                  Automatica
                </button>
                <button
                  type="button"
                  className={essayTab === "manual" ? "is-active" : ""}
                  onClick={() => setEssayTab("manual")}
                >
                  Externa/manual
                </button>
              </div>

              {essayTab === "automatic" ? (
                <section className="essay-mode-panel">
                  <label className="today-form-field">
                    Modo
                    <select className="app-input" value={mode} onChange={(event) => setMode(event.target.value as EssayCorrectionMode)}>
                      {correctionModeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {formError ? <p className="today-form-error">{formError}</p> : null}

                  <div className="today-action-row">
                    <button
                      type="button"
                      className="app-primary-action app-primary-action-blue"
                      disabled={!correctionEnabled || correctionMutation.isPending}
                      onClick={submitCorrection}
                    >
                      {correctionMutation.isPending ? "Corrigindo..." : "Corrigir com IA"}
                    </button>
                  </div>

                  {correctionMutation.isPending ? (
                    <p className="essay-loading-copy">
                      Correcao em andamento. Modelos locais podem demorar um pouco; pode deixar a pagina quietinha aqui.
                    </p>
                  ) : null}
                </section>
              ) : (
                <section className="essay-mode-panel essay-manual-panel">
                  <div className="essay-manual-prompt-box">
                    <div>
                      <strong>Correcao em outra IA</strong>
                      <p>Copie um prompt estruturado, cole no ChatGPT, Gemini, Claude ou DeepSeek e registre o resultado aqui.</p>
                    </div>
                    <button type="button" className="app-secondary-action" onClick={copyExternalPrompt}>
                      Copiar prompt para IA externa
                    </button>
                  </div>
                  {copyFeedback ? <p className="essay-loading-copy">{copyFeedback}</p> : null}

                  <label className="today-form-field">
                    Provider externo usado
                    <select
                      className="app-input"
                      value={manualProvider}
                      onChange={(event) => setManualProvider(event.target.value as EssayExternalProvider)}
                    >
                      {externalProviderOptions.map((provider) => (
                        <option key={provider} value={provider}>
                          {provider}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="essay-manual-score-grid">
                    {(Object.keys(manualScores) as ManualScoreKey[]).map((key) => (
                      <label key={key} className="today-form-field">
                        {key.toUpperCase()}
                        <select
                          className="app-input"
                          value={manualScores[key]}
                          onChange={(event) =>
                            setManualScores((current) => ({ ...current, [key]: Number(event.target.value) }))
                          }
                        >
                          {allowedCompetencyScores.map((score) => (
                            <option key={score} value={score}>
                              {score}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <article className="essay-manual-total">
                      <span>Total</span>
                      <strong>{manualTotal}</strong>
                    </article>
                  </div>

                  <label className="today-form-field">
                    Pontos fortes
                    <textarea
                      className="app-input"
                      value={manualStrengths}
                      onChange={(event) => setManualStrengths(event.target.value)}
                      placeholder="Um item por linha."
                    />
                  </label>
                  <label className="today-form-field">
                    Pontos fracos
                    <textarea
                      className="app-input"
                      value={manualWeaknesses}
                      onChange={(event) => setManualWeaknesses(event.target.value)}
                      placeholder="Um item por linha."
                    />
                  </label>
                  <label className="today-form-field">
                    Plano de melhoria
                    <textarea
                      className="app-input"
                      value={manualImprovementPlan}
                      onChange={(event) => setManualImprovementPlan(event.target.value)}
                      placeholder="Um item por linha."
                    />
                  </label>
                  <label className="today-form-field">
                    Observacoes
                    <textarea
                      className="app-input"
                      value={manualNotes}
                      onChange={(event) => setManualNotes(event.target.value)}
                      placeholder="Opcional."
                    />
                  </label>

                  {manualError ? <p className="today-form-error">{manualError}</p> : null}

                  <div className="today-action-row">
                    <button
                      type="button"
                      className="app-primary-action app-primary-action-blue"
                      disabled={manualCorrectionMutation.isPending}
                      onClick={submitManualCorrection}
                    >
                      {manualCorrectionMutation.isPending ? "Salvando..." : "Registrar correcao manual"}
                    </button>
                  </div>
                </section>
              )}
            </div>
          </section>

          <section className="today-panel essay-side-panel">
            <div className="today-section-heading">
              <div>
                <p className="today-eyebrow">Fluxo</p>
                <h2>Estado atual</h2>
              </div>
            </div>
            <div className="essay-state-list">
              <article className={`essay-state-card ${theme.trim() ? "is-done" : ""}`}>
                <strong>Tema</strong>
                <span>{theme.trim() ? "preenchido" : "pendente"}</span>
              </article>
              <article className={`essay-state-card ${essayText.trim() ? "is-done" : ""}`}>
                <strong>Texto</strong>
                <span>{essayText.trim() ? `${wordCount} palavras` : "pendente"}</span>
              </article>
              <article className={`essay-state-card ${correction ? "is-done" : ""}`}>
                <strong>Correcao</strong>
                <span>{correction ? `id ${correction.id}` : "aguardando"}</span>
              </article>
              <article className={`essay-state-card ${studySession ? "is-done" : ""}`}>
                <strong>Estudo</strong>
                <span>{studySession ? studySession.status : "opcional"}</span>
              </article>
            </div>
          </section>
        </div>

        {correction ? <CorrectionResult result={correction} /> : (
          <section className="today-panel essay-empty-result">
            <strong>Nenhuma correcao nesta sessao ainda.</strong>
            <p>Quando a IA estiver disponivel, a correcao persistida aparece aqui com nota, competencias e plano.</p>
          </section>
        )}

        <section className="today-panel essay-study-panel">
          <div className="today-section-heading essay-study-heading">
            <div>
              <p className="today-eyebrow">Estudo</p>
              <h2>Chat da redacao</h2>
            </div>
            <button
              type="button"
              className="app-secondary-action lessons-small-action"
              disabled={!studyEnabled || !correction || createStudyMutation.isPending}
              onClick={() => createStudyMutation.mutate()}
            >
              {createStudyMutation.isPending ? "Abrindo..." : "Estudar esta redacao"}
            </button>
          </div>

          {!studyEnabled ? (
            <p className="today-empty-copy">Estudo por IA indisponivel nesta maquina. Habilite um provider compativel nesta instalacao.</p>
          ) : !correction ? (
            <p className="today-empty-copy">Corrija uma redacao antes de abrir o estudo assistido.</p>
          ) : null}

          {studyError ? <p className="today-form-error">{studyError}</p> : null}

          {studySession ? (
            <div className="essay-chat">
              <div className="essay-chat-meta">
                <span>Status: {studySession.status}</span>
                <span>Mensagens: {studySession.messages_count}</span>
                <span>Tokens: {studySession.tokens_total}/{studySession.token_limit}</span>
              </div>

              <div className="essay-chat-list">
                {studySession.messages.length > 0 ? (
                  studySession.messages.map((message) => <StudyMessage key={message.id} message={message} />)
                ) : (
                  <p className="today-empty-copy">A sessao abriu, mas ainda nao retornou mensagens.</p>
                )}
              </div>

              {studySession.can_accept_messages ? (
                <div className="essay-chat-input">
                  <input
                    className="app-input"
                    value={studyMessage}
                    onChange={(event) => setStudyMessage(event.target.value)}
                    placeholder="Pergunte como melhorar sua proxima versao."
                  />
                  <button
                    type="button"
                    className="app-primary-action app-primary-action-blue"
                    disabled={sendMessageMutation.isPending}
                    onClick={submitStudyMessage}
                  >
                    {sendMessageMutation.isPending ? "Enviando..." : "Enviar"}
                  </button>
                  <button
                    type="button"
                    className="app-secondary-action"
                    disabled={closeStudyMutation.isPending}
                    onClick={() => closeStudyMutation.mutate()}
                  >
                    {closeStudyMutation.isPending ? "Fechando..." : "Fechar sessao"}
                  </button>
                </div>
              ) : (
                <p className="today-empty-copy">Esta sessao nao aceita novas mensagens.</p>
              )}
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
