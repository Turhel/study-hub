type TimerControlsProps = {
  isRunning: boolean;
  isPaused: boolean;
  hasSession: boolean;
  onStart: () => void;
  onPause: () => void;
  onNext: () => void;
  onToggleHistory: () => void;
  onFinish: () => void;
};

export default function TimerControls({
  isRunning,
  isPaused,
  hasSession,
  onStart,
  onPause,
  onNext,
  onToggleHistory,
  onFinish,
}: TimerControlsProps) {
  return (
    <div className="space-y-2">
      <button
        className="w-full rounded-lg bg-focus-500 px-3 py-3 text-sm font-bold text-ink-950 transition hover:bg-focus-400"
        onClick={onStart}
      >
        {hasSession ? "Confirmar questao" : "Iniciar sessao"}
      </button>
      {hasSession ? (
        <div className="grid grid-cols-4 gap-2">
          <button className="timer-chip-button" onClick={onPause} disabled={!isRunning}>
            {isPaused ? "Retomar" : "Pausar"}
          </button>
          <button className="timer-chip-button" onClick={onNext} disabled={!isRunning}>
            Proxima
          </button>
          <button className="timer-chip-button" onClick={onToggleHistory}>
            Historico
          </button>
          <button className="timer-chip-button-danger" onClick={onFinish} disabled={!isRunning}>
            Fim
          </button>
        </div>
      ) : null}
    </div>
  );
}
