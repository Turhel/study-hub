import { Navigate, NavLink, Route, Routes } from "react-router-dom";

import TodayPage from "./pages/TodayPage";
import TimerPage from "./pages/TimerPage";

const navigationItems = [
  { label: "Hoje", path: "/", marker: "01" },
  { label: "Timer", path: "/timer", marker: "02" },
];

const futureItems = ["Roadmap", "Revisoes", "Redacao"];

export default function App() {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">
          <span className="app-brand-mark">SH</span>
          <div>
            <p className="text-sm font-bold text-white">Study Hub</p>
            <p className="text-xs text-slate-500">ENEM / Medicina</p>
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
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-8 border-t border-white/10 pt-6">
          <p className="mb-3 text-xs font-semibold uppercase text-slate-500">Em breve</p>
          <div className="space-y-1">
            {futureItems.map((item) => (
              <span key={item} className="app-nav-link app-nav-link-disabled">
                {item}
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
