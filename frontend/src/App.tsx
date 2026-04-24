import { Navigate, NavLink, Route, Routes } from "react-router-dom";

import TimerPage from "./pages/TimerPage";
import TodayPage from "./pages/TodayPage";

const navigationItems = [
  { label: "Foco do dia", path: "/" },
  { label: "Timer", path: "/timer" },
];

const futureItems = ["Trilha", "Revisoes", "Redacao"];

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-brand">
          <span className="app-brand-badge">SH</span>
          <div>
            <p className="app-brand-title">Study Hub</p>
            <p className="app-brand-subtitle">Hub pessoal para estudo com menos ruido.</p>
          </div>
        </div>

        <nav className="app-topbar-nav" aria-label="Principal">
          {navigationItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `app-topbar-link ${isActive ? "app-topbar-link-active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}

          {futureItems.map((item) => (
            <span key={item} className="app-topbar-link app-topbar-link-muted">
              {item}
            </span>
          ))}
        </nav>
      </header>

      <div className="app-content">
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/timer" element={<TimerPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
