import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  closeEssayStudySession,
  createEssayCorrection,
  createEssayStudySession,
  getSystemCapabilities,
  sendEssayStudyMessage,
} from "../lib/api";
import type {
  EssayCompetencyResult,
  EssayCorrectionMode,
  EssayCorrectionStoredResponse,
  EssayStudyMessageResponse,
  EssayStudySessionResponse,
} from "../lib/types";

const correctionModeOptions: Array<{ value: EssayCorrectionMode; label: string }> = [
  { value: "detailed", label: "Detalhada" },
  { value: "score_only", label: "Nota rapida" },
  { value: "teach", label: "Modo estudo" },
];

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

export default function EssayPage() {
  const [theme, setTheme] = useState("");
  const [essayText, setEssayText] = useState("");
  const [studentGoal, setStudentGoal] = useState("");
  const [mode, setMode] = useState<EssayCorrectionMode>("detailed");
  const [formError, setFormError] = useState<string | null>(null);
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
    ? "Correcao por IA esta indisponivel nesta maquina. Use o PC principal com LM Studio ligado."
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
                <span>{correction ? `id ${correction.id}` : "aguardando IA"}</span>
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
            <p className="today-empty-copy">Estudo por IA indisponivel nesta maquina. Use o PC principal com LM Studio ligado.</p>
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
