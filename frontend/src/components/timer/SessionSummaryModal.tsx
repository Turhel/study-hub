import { useState } from "react";

import { saveTimerSession } from "../../lib/api";
import { buildTimerSessionPayload, formatTime, saveLocalSession, summarizeSession } from "../../lib/timer";
import type { SessionSummaryForm, TimerSession } from "../../lib/timerTypes";

type SessionSummaryModalProps = {
  session: TimerSession;
  onClose: () => void;
};

export default function SessionSummaryModal({ session, onClose }: SessionSummaryModalProps) {
  const summary = summarizeSession(session);
  const [form, setForm] = useState<SessionSummaryForm>({
    difficulty: "media",
    perceivedVolume: "ok",
    notes: "",
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    saveLocalSession({
      ...session,
      setup: {
        ...session.setup,
      },
    });
    localStorage.setItem("study-hub-timer-last-summary-form", JSON.stringify(form));

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const response = await saveTimerSession(buildTimerSessionPayload(session, form));
      setStatusMessage(`Sessao salva no backend (#${response.id}).`);
      window.setTimeout(onClose, 700);
    } catch {
      setStatusMessage("Sessao mantida localmente, mas nao foi salva no backend.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-ink-900/95 p-5 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-focus-400">Sessao encerrada</p>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-50">Resumo rapido</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <p className="rounded-lg bg-white/[0.04] p-3 text-zinc-300">Total<br /><strong className="text-lg text-zinc-50">{summary.totalQuestions}</strong></p>
          <p className="rounded-lg bg-white/[0.04] p-3 text-zinc-300">Concluidas<br /><strong className="text-lg text-focus-400">{summary.completedQuestions}</strong></p>
          <p className="rounded-lg bg-white/[0.04] p-3 text-zinc-300">Puladas<br /><strong className="text-lg text-ember-400">{summary.skippedQuestions}</strong></p>
          <p className="rounded-lg bg-white/[0.04] p-3 text-zinc-300">Media<br /><strong className="text-lg text-zinc-50">{formatTime(summary.averageCompletedSeconds)}</strong></p>
          <p className="col-span-2 rounded-lg bg-white/[0.04] p-3 text-zinc-300">
            Acima do alvo <strong className="text-zinc-50">{summary.overTargetQuestions}</strong>
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-sm text-zinc-400">
            Dificuldade geral
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-zinc-100"
              value={form.difficulty}
              onChange={(event) => setForm((current) => ({ ...current, difficulty: event.target.value as SessionSummaryForm["difficulty"] }))}
            >
              <option value="baixa">Baixa</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </label>
          <label className="block text-sm text-zinc-400">
            Volume percebido
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-zinc-100"
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
          <label className="block text-sm text-zinc-400">
            Observacoes
            <textarea
              className="mt-1 min-h-20 w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-zinc-100"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold" onClick={onClose}>
            Fechar
          </button>
          <button className="rounded-lg bg-focus-500 px-3 py-2 text-sm font-semibold text-ink-950 disabled:opacity-60" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
        </div>
        {statusMessage ? <p className="mt-3 text-sm text-zinc-400">{statusMessage}</p> : null}
      </div>
    </div>
  );
}
