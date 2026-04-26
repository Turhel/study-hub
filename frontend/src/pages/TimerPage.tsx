import { useLocation } from "react-router-dom";

import FloatingTimer from "../components/timer/FloatingTimer";
import type { TimerLaunchPreset } from "../lib/timerTypes";

export default function TimerPage() {
  const location = useLocation();
  const preset = (location.state as { timerPreset?: TimerLaunchPreset } | null)?.timerPreset ?? null;

  return <FloatingTimer preset={preset} />;
}
