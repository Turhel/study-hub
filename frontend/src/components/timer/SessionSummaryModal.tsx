import { useMemo, useState } from "react";

import { saveTimerSession } from "../../lib/api";
import { buildTimerSessionPayload, formatTime, saveLocalSession, summarizeSession } from "../../lib/timer";
import type { ExternalQuestionDraft, SessionSummaryForm, TimerSession } from "../../lib/timerTypes";

type SessionSummaryModalProps = {
  session: TimerSession;
  onClose: () => void;
};

function buildInitialDrafts(session: TimerSession): ExternalQuestionDraft[] {
  return session.questions
    .filter((question) => question.elapsedSeconds > 0 || question.status === "completed" || question.status === "skipped")
    .map((question) => ({
      questionNumber: question.index + 1,
      textBlocks: [""],
      imageLabel: "",
      imagePreviewUrl: null,
      prompt: "",
      options: ["", "", "", "", ""],
      correctOptionIndex: null,
      wasCorrect: "",
      peerAccuracy: "",
      personalDifficulty: "media",
      notes: "",
    }));
}

function saveExternalDraftsLocally(session: TimerSession, drafts: ExternalQuestionDraft[]) {
  const saved = JSON.parse(localStorage.getItem("study-hub-external-question-drafts") ?? "[]") as Array<Record<string, unknown>>;
  const payload = {
    savedAt: new Date().toISOString(),
    setup: session.setup,
    totalElapsedSeconds: session.totalElapsedSeconds,
    drafts,
  };
  localStorage.setItem("study-hub-external-question-drafts", JSON.stringify([payload, ...saved].slice(0, 10)));
}

function suggestedPersonalDifficulty(elapsedSeconds: number, targetSeconds: number, current: ExternalQuestionDraft["personalDifficulty"]) {
  const overtimeRatio = targetSeconds > 0 ? elapsedSeconds / targetSeconds : 1;

  if (overtimeRatio >= 1.8) {
    return current === "alta" ? "alta" : "alta";
  }
  if (overtimeRatio >= 1.25) {
    return current === "baixa" ? "media" : current;
  }
  return current;
}

export default function SessionSummaryModal({ session, onClose }: SessionSummaryModalProps) {
  const summary = summarizeSession(session);
  const [form, setForm] = useState<SessionSummaryForm>({
    difficulty: "media",
    perceivedVolume: "ok",
    notes: "",
  });
  const [externalDrafts, setExternalDrafts] = useState<ExternalQuestionDraft[]>(() => buildInitialDrafts(session));
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(() => buildInitialDrafts(session)[0]?.questionNumber ?? null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isExternalSession = session.setup.questionSource === "external";
  const correctCount = useMemo(
    () => externalDrafts.filter((draft) => draft.wasCorrect === "correct").length,
    [externalDrafts],
  );

  function updateDraft(questionNumber: number, updater: (draft: ExternalQuestionDraft) => ExternalQuestionDraft) {
    setExternalDrafts((current) => current.map((draft) => (draft.questionNumber === questionNumber ? updater(draft) : draft)));
  }

  function addTextBlock(questionNumber: number) {
    updateDraft(questionNumber, (draft) => ({ ...draft, textBlocks: [...draft.textBlocks, ""] }));
  }

  function removeTextBlock(questionNumber: number, index: number) {
    updateDraft(questionNumber, (draft) => ({
      ...draft,
      textBlocks: draft.textBlocks.filter((_, blockIndex) => blockIndex !== index),
    }));
  }

  function addOption(questionNumber: number) {
    updateDraft(questionNumber, (draft) => ({ ...draft, options: [...draft.options, ""] }));
  }

  function removeOption(questionNumber: number, index: number) {
    updateDraft(questionNumber, (draft) => ({
      ...draft,
      options: draft.options.filter((_, optionIndex) => optionIndex !== index),
      correctOptionIndex:
        draft.correctOptionIndex === null
          ? null
          : draft.correctOptionIndex === index
            ? null
            : draft.correctOptionIndex > index
              ? draft.correctOptionIndex - 1
              : draft.correctOptionIndex,
    }));
  }

  function saveDraftsOnly() {
    saveLocalSession(session);
    saveExternalDraftsLocally(session, externalDrafts);
    localStorage.setItem("study-hub-timer-last-summary-form", JSON.stringify(form));
    setStatusMessage("Rascunho das questoes salvo localmente.");
  }

  async function handleSave() {
    saveLocalSession(session);
    localStorage.setItem("study-hub-timer-last-summary-form", JSON.stringify(form));

    if (isExternalSession) {
      saveExternalDraftsLocally(session, externalDrafts);
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const response = await saveTimerSession(buildTimerSessionPayload(session, form));
      setStatusMessage(
        isExternalSession
          ? `Sessao salva no backend (#${response.id}) e question maker guardado localmente.`
          : `Sessao salva no backend (#${response.id}).`,
      );
      window.setTimeout(onClose, 900);
    } catch {
      setStatusMessage(
        isExternalSession
          ? "Sessao e question maker ficaram salvos localmente, mas o backend nao respondeu."
          : "Sessao mantida localmente, mas nao foi salva no backend.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const metrics = [
    { label: "Total", value: summary.totalQuestions },
    { label: "Concluidas", value: summary.completedQuestions },
    { label: "Puladas", value: summary.skippedQuestions },
    { label: "Media", value: formatTime(summary.averageCompletedSeconds) },
    { label: "Acima do alvo", value: summary.overTargetQuestions },
  ];

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-black/80 p-3 sm:p-6">
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-white/10 bg-[#151a24] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.55)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-normal text-sky-300">Sessao encerrada</p>
            <h2 className="mt-1 text-2xl font-semibold text-zinc-50">Resumo do treino</h2>
            <p className="mt-2 text-sm text-zinc-400">
              {session.setup.discipline} / {session.setup.block} / {session.setup.subject}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
            <span className="rounded-full border border-white/10 px-3 py-1">{session.setup.mode}</span>
            <span className="rounded-full border border-white/10 px-3 py-1">
              {session.setup.questionSource === "db" ? "Questoes do DB" : "Questoes fora do DB"}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {metrics.map((metric) => (
            <div key={metric.label} className="timer-mini-stat">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
          <div className="space-y-3">
            <label className="block text-[11px] text-zinc-400">
              Dificuldade geral
              <select
                className="timer-input mt-1"
                value={form.difficulty}
                onChange={(event) => setForm((current) => ({ ...current, difficulty: event.target.value as SessionSummaryForm["difficulty"] }))}
              >
                <option value="baixa">Baixa</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </label>

            <label className="block text-[11px] text-zinc-400">
              Volume percebido
              <select
                className="timer-input mt-1"
                value={form.perceivedVolume}
                onChange={(event) =>
                  setForm((current) => ({ ...current, perceivedVolume: event.target.value as SessionSummaryForm["perceivedVolume"] }))
                }
              >
                <option value="baixo">Baixo</option>
                <option value="ok">Ok</option>
                <option value="alto">Alto</option>
              </select>
            </label>

            <label className="block text-[11px] text-zinc-400">
              Observacoes
              <textarea
                className="timer-input mt-1 min-h-24 resize-y"
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>

            {isExternalSession ? (
              <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-3 text-xs text-zinc-300">
                <strong className="block text-sm text-zinc-100">Question maker</strong>
                <p className="mt-1 leading-5">
                  Aqui voce descreve o que foi cada questao do PDF, livro ou apostila. Os detalhes ficam salvos localmente por
                  enquanto.
                </p>
                <p className="mt-2 text-zinc-400">Acertos marcados neste painel: {correctCount}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-zinc-300">
                <strong className="block text-sm text-zinc-100">Modo DB</strong>
                <p className="mt-1 leading-5">
                  A navegacao do treino funciona, mas a exibicao da questao do banco ainda depende de um endpoint que nao existe no
                  backend atual.
                </p>
              </div>
            )}
          </div>

          {isExternalSession ? (
            <div className="space-y-3">
              {externalDrafts.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400">
                  Nenhuma questao recebeu tempo suficiente para abrir o question maker.
                </div>
              ) : (
                externalDrafts.map((draft) => {
                  const question = session.questions[draft.questionNumber - 1];
                  const elapsed = question?.elapsedSeconds ?? 0;
                  const suggestedDifficulty = suggestedPersonalDifficulty(
                    elapsed,
                    session.setup.targetSecondsPerQuestion,
                    draft.personalDifficulty,
                  );

                  return (
                    <article key={draft.questionNumber} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <strong className="text-sm text-zinc-100">Questao {draft.questionNumber}</strong>
                          <p className="mt-1 text-xs text-zinc-400">
                            Tempo: {formatTime(elapsed)} / alvo {formatTime(session.setup.targetSecondsPerQuestion)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="timer-widget-button px-3"
                          onClick={() => setExpandedQuestion((current) => (current === draft.questionNumber ? null : draft.questionNumber))}
                        >
                          {expandedQuestion === draft.questionNumber ? "Fechar" : "Adicionar detalhes"}
                        </button>
                      </div>

                      {expandedQuestion === draft.questionNumber ? (
                        <div className="mt-3 space-y-3">
                          <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-zinc-300">
                            Sugestao de dificuldade pelo tempo: <strong className="text-zinc-100">{suggestedDifficulty}</strong>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <strong className="text-sm text-zinc-100">Textos da questao</strong>
                              <button type="button" className="timer-widget-button px-3" onClick={() => addTextBlock(draft.questionNumber)}>
                                Adicionar texto
                              </button>
                            </div>
                            {draft.textBlocks.map((block, index) => (
                              <div key={`${draft.questionNumber}-text-${index}`} className="space-y-2">
                                <textarea
                                  className="timer-input min-h-20 resize-y"
                                  value={block}
                                  onChange={(event) =>
                                    updateDraft(draft.questionNumber, (current) => ({
                                      ...current,
                                      textBlocks: current.textBlocks.map((value, blockIndex) =>
                                        blockIndex === index ? event.target.value : value,
                                      ),
                                    }))
                                  }
                                  placeholder={`Texto ${index + 1}`}
                                />
                                {draft.textBlocks.length > 1 ? (
                                  <button
                                    type="button"
                                    className="timer-widget-button px-3"
                                    onClick={() => removeTextBlock(draft.questionNumber, index)}
                                  >
                                    Remover texto
                                  </button>
                                ) : null}
                              </div>
                            ))}
                          </div>

                          <label className="block text-[11px] text-zinc-400">
                            Imagem ou grafico
                            <input
                              className="timer-input mt-1"
                              type="file"
                              accept="image/*"
                              onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                updateDraft(draft.questionNumber, (current) => ({
                                  ...current,
                                  imageLabel: file?.name ?? "",
                                  imagePreviewUrl: file ? URL.createObjectURL(file) : null,
                                }));
                              }}
                            />
                          </label>

                          {draft.imagePreviewUrl ? (
                            <div className="overflow-hidden rounded-xl border border-white/10">
                              <img src={draft.imagePreviewUrl} alt={draft.imageLabel || `Questao ${draft.questionNumber}`} className="max-h-56 w-full object-contain bg-black/20" />
                            </div>
                          ) : null}

                          <label className="block text-[11px] text-zinc-400">
                            Enunciado
                            <textarea
                              className="timer-input mt-1 min-h-24 resize-y"
                              value={draft.prompt}
                              onChange={(event) => updateDraft(draft.questionNumber, (current) => ({ ...current, prompt: event.target.value }))}
                            />
                          </label>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <strong className="text-sm text-zinc-100">Itens para marcar</strong>
                              <button type="button" className="timer-widget-button px-3" onClick={() => addOption(draft.questionNumber)}>
                                Adicionar item
                              </button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {draft.options.map((option, index) => (
                                <div key={`${draft.questionNumber}-option-${index}`} className="rounded-xl border border-white/10 bg-black/15 p-2">
                                  <label className="block text-[11px] text-zinc-400">
                                    Item {String.fromCharCode(65 + index)}
                                    <input
                                      className="timer-input mt-1"
                                      value={option}
                                      onChange={(event) =>
                                        updateDraft(draft.questionNumber, (current) => ({
                                          ...current,
                                          options: current.options.map((value, optionIndex) =>
                                            optionIndex === index ? event.target.value : value,
                                          ),
                                        }))
                                      }
                                    />
                                  </label>
                                  {draft.options.length > 2 ? (
                                    <button
                                      type="button"
                                      className="mt-2 timer-widget-button px-3"
                                      onClick={() => removeOption(draft.questionNumber, index)}
                                    >
                                      Remover item
                                    </button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block text-[11px] text-zinc-400">
                              Item correto
                              <select
                                className="timer-input mt-1"
                                value={draft.correctOptionIndex ?? ""}
                                onChange={(event) =>
                                  updateDraft(draft.questionNumber, (current) => ({
                                    ...current,
                                    correctOptionIndex: event.target.value === "" ? null : Number(event.target.value),
                                  }))
                                }
                              >
                                <option value="">Nao informar</option>
                                {draft.options.map((_, index) => (
                                  <option key={`${draft.questionNumber}-correct-${index}`} value={index}>
                                    {String.fromCharCode(65 + index)}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="block text-[11px] text-zinc-400">
                              Acertou ou errou?
                              <select
                                className="timer-input mt-1"
                                value={draft.wasCorrect}
                                onChange={(event) =>
                                  updateDraft(draft.questionNumber, (current) => ({
                                    ...current,
                                    wasCorrect: event.target.value as ExternalQuestionDraft["wasCorrect"],
                                  }))
                                }
                              >
                                <option value="">Nao informar</option>
                                <option value="correct">Acertou</option>
                                <option value="incorrect">Errou</option>
                              </select>
                            </label>

                            <label className="block text-[11px] text-zinc-400">
                              Taxa de acerto dos outros alunos (%)
                              <input
                                className="timer-input mt-1"
                                type="number"
                                min={0}
                                max={100}
                                value={draft.peerAccuracy}
                                onChange={(event) => updateDraft(draft.questionNumber, (current) => ({ ...current, peerAccuracy: event.target.value }))}
                              />
                            </label>

                            <label className="block text-[11px] text-zinc-400">
                              Dificuldade pessoal
                              <select
                                className="timer-input mt-1"
                                value={draft.personalDifficulty}
                                onChange={(event) =>
                                  updateDraft(draft.questionNumber, (current) => ({
                                    ...current,
                                    personalDifficulty: event.target.value as ExternalQuestionDraft["personalDifficulty"],
                                  }))
                                }
                              >
                                <option value="baixa">Baixa</option>
                                <option value="media">Media</option>
                                <option value="alta">Alta</option>
                              </select>
                            </label>
                          </div>

                          <label className="block text-[11px] text-zinc-400">
                            Observacoes
                            <textarea
                              className="timer-input mt-1 min-h-20 resize-y"
                              value={draft.notes}
                              onChange={(event) => updateDraft(draft.questionNumber, (current) => ({ ...current, notes: event.target.value }))}
                            />
                          </label>
                        </div>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <button className="timer-widget-button" onClick={onClose}>
            Fechar
          </button>
          <button className="timer-widget-button" onClick={saveDraftsOnly}>
            Salvar rascunho local
          </button>
          <button className="timer-primary-action py-2 text-sm disabled:opacity-60" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar sessao"}
          </button>
        </div>
        {statusMessage ? <p className="mt-3 text-[11px] text-zinc-400">{statusMessage}</p> : null}
      </div>
    </div>
  );
}
