import { Navigate, Route, Routes } from "react-router-dom";

import TodayPage from "./pages/TodayPage";
import TimerPage from "./pages/TimerPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<TodayPage />} />
      <Route path="/timer" element={<TimerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
