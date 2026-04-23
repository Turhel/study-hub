import { Navigate, NavLink, Route, Routes } from "react-router-dom";

import TodayPage from "./pages/TodayPage";
import TimerPage from "./pages/TimerPage";

const navigationItems = [
  { label: "Foco do dia", path: "/", marker: "D" },
  { label: "Timer", path: "/timer", marker: "T" },
];

const futureItems = [
  { label: "Trilha", marker: "R" },
  { label: "Revisoes", marker: "V" },
  { label: "Redacao", marker: "E" },
];

export default function App() {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">
          <span className="app-brand-mark">SH</span>
          <div className="app-sidebar-brand-copy">
            <p className="text-sm font-bold text-slate-950">Study Hub</p>
            <p className="text-xs text-slate-500">Rotina de estudo</p>
          </div>
        </div>

        <nav className="mt-8 space-y-1">
          {navigationItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `app-nav-link ${isActive ? "app-nav-link-active" : ""}`}
            >
              <span>{item.marker}</span>
              <span className="app-nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-8 border-t border-slate-950/10 pt-6">
          <p className="app-sidebar-section-label mb-3 text-xs font-semibold uppercase text-slate-400">Em breve</p>
          <div className="space-y-1">
            {futureItems.map((item) => (
              <span key={item.label} className="app-nav-link app-nav-link-disabled">
                <span>{item.marker}</span>
                <span className="app-nav-label">{item.label}</span>
              </span>
            ))}
          </div>
        </div>
      </aside>

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
