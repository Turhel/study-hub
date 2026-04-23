import { Navigate, Route, Routes } from "react-router-dom";

import AdaptiveDock from "./components/AdaptiveDock";
import TodayPage from "./pages/TodayPage";
import TimerPage from "./pages/TimerPage";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/timer" element={<TimerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AdaptiveDock />
    </>
  );
}
