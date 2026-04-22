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

  const metrics = [
    { label: "Total", value: summary.totalQuestions },
    { label: "Concluidas", value: summary.completedQuestions },
    { label: "Puladas", value: summary.skippedQuestions },
    { label: "Media", value: formatTime(summary.averageCompletedSeconds) },
    { label: "Acima do alvo", value: summary.overTargetQuestions },
  ];

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/75 p-3">
      <div className="w-full max-w-[310px] rounded-lg border border-white/10 bg-[#202020] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.55)]">
        <p className="text-[11px] font-semibold uppercase tracking-normal text-sky-300">Sessao encerrada</p>
        <h2 className="mt-1 text-xl font-semibold text-zinc-50">Resumo rapido</h2>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {metrics.map((metric) => (
            <div key={metric.label} className={metric.label === "Acima do alvo" ? "timer-mini-stat col-span-2" : "timer-mini-stat"}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
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
              className="timer-input mt-1 min-h-16 resize-none"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="timer-widget-button" onClick={onClose}>
            Fechar
          </button>
          <button className="timer-primary-action py-2 text-sm disabled:opacity-60" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
        </div>
        {statusMessage ? <p className="mt-3 text-[11px] text-zinc-400">{statusMessage}</p> : null}
      </div>
    </div>
  );
}
