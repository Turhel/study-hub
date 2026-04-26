type TimerControlsProps = {
  isRunning: boolean;
  isPaused: boolean;
  hasSession: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onStart: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onComplete: () => void;
  onSkip: () => void;
  onToggleHistory: () => void;
  onOpenFloating: () => void;
  onFinish: () => void;
};

export default function TimerControls({
  isRunning,
  isPaused,
  hasSession,
  canGoPrevious,
  canGoNext,
  onStart,
  onPause,
  onPrevious,
  onNext,
  onComplete,
  onSkip,
  onToggleHistory,
  onOpenFloating,
  onFinish,
}: TimerControlsProps) {
  return (
    <div className="space-y-3">
      {!hasSession ? <button className="timer-primary-action" onClick={onStart}>Comecar treino</button> : null}

      {hasSession ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button className="timer-widget-button" onClick={onPause}>
              {isPaused ? "Retomar" : "Pausar"}
            </button>
            <button className="timer-widget-button" onClick={onOpenFloating}>
              Controle flutuante
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button className="timer-widget-button" onClick={onPrevious} disabled={!canGoPrevious || (!isRunning && !isPaused)}>
              Anterior
            </button>
            <button className="timer-widget-button" onClick={onNext} disabled={!canGoNext || (!isRunning && !isPaused)}>
              Proxima
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button className="timer-widget-button" onClick={onComplete} disabled={!isRunning && !isPaused}>
              Concluir
            </button>
            <button className="timer-widget-button" onClick={onSkip} disabled={!isRunning && !isPaused}>
              Pular
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button className="timer-widget-button" onClick={onToggleHistory}>
              Ver todas
            </button>
            <button className="timer-widget-button-danger" onClick={onFinish}>
              Finalizar
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
