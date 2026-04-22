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
    <div className="space-y-3">
      <button className="timer-primary-action" onClick={onStart}>
        {hasSession ? "Confirmar questao" : "Iniciar sessao"}
      </button>

      {hasSession ? (
        <div className="grid grid-cols-4 gap-2">
          <button className="timer-widget-button" onClick={onPause} disabled={!isRunning && !isPaused}>
            {isPaused ? "Retomar" : "Pausar"}
          </button>
          <button className="timer-widget-button" onClick={onNext} disabled={!isRunning && !isPaused}>
            Proxima
          </button>
          <button className="timer-widget-button" onClick={onToggleHistory}>
            Historico
          </button>
          <button className="timer-widget-button-danger" onClick={onFinish}>
            Fim
          </button>
        </div>
      ) : null}
    </div>
  );
}
