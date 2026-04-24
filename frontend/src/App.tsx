import { Navigate, NavLink, Route, Routes } from "react-router-dom";

import TimerPage from "./pages/TimerPage";
import TodayPage from "./pages/TodayPage";

const navigationItems = [
  {
    label: "Foco do dia",
    path: "/",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l2.9 5.88 6.5.95-4.7 4.58 1.1 6.47L12 17.8 6.2 20.88l1.1-6.47-4.7-4.58 6.5-.95L12 3z" />
      </svg>
    ),
  },
  {
    label: "Timer",
    path: "/timer",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 2h6v2H9zM12 8a5 5 0 100 10 5 5 0 000-10zm0-4a8 8 0 110 16 8 8 0 010-16zm6.3.3l1.4 1.4-1.9 1.9-1.4-1.4 1.9-1.9z" />
      </svg>
    ),
  },
];

const futureItems = [
  {
    label: "Aprender",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l9 4.5-9 4.5-9-4.5L12 3zm-7 7.7l7 3.5 7-3.5V16h2v-6.4l-9 4.5-9-4.5V16h2v-5.3zm3 6.2h8v2H8z" />
      </svg>
    ),
  },
  {
    label: "Revisoes",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5a7 7 0 017 7h2l-3 3-3-3h2a5 5 0 10-1.5 3.5l1.4 1.4A7 7 0 1112 5z" />
      </svg>
    ),
  },
  {
    label: "Redacao",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 17.2V20h2.8l8.2-8.2-2.8-2.8L4 17.2zm12-10.8l2.8 2.8 1.4-1.4a1 1 0 000-1.4L18.8 5a1 1 0 00-1.4 0L16 6.4z" />
      </svg>
    ),
  },
];

const streakDays = [
  { label: "Ter", done: false },
  { label: "Qua", done: false },
  { label: "Qui", done: false },
  { label: "Sex", done: true },
  { label: "Sab", done: false },
  { label: "Dom", done: false },
  { label: "Seg", done: false },
];

const masteryItems = ["Linguagens", "Matematica", "Humanas", "Natureza"];

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <nav className="app-topbar-nav" aria-label="Principal">
          {navigationItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `app-topbar-link ${isActive ? "app-topbar-link-active" : ""}`}
            >
              <span className="app-topbar-link-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}

          {futureItems.map((item) => (
            <span key={item.label} className="app-topbar-link app-topbar-link-muted">
              <span className="app-topbar-link-icon">{item.icon}</span>
              <span>{item.label}</span>
            </span>
          ))}
        </nav>

        <div className="app-topbar-status">
          <section className="topbar-stat-card">
            <div className="topbar-stat-card-head">
              <div>
                <h2>Comece uma ofensiva</h2>
                <p>Responda um bloco de questoes por dia para comecar sua sequencia.</p>
              </div>
              <div className="topbar-stat-icon topbar-stat-icon-fire" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M13.5 2s1.2 3-.4 5.3c-1.1 1.6-1.4 2.8-.8 4 .7-.4 1.2-1 1.5-1.9 2.7 1.5 5.2 4.4 5.2 8 0 4-2.9 6.6-6.8 6.6-4.2 0-7.2-2.8-7.2-6.8 0-3.7 2.2-6.6 4.9-8.7.1 1 .5 1.8 1.1 2.4.2-1.8 1-3.4 2.5-5.2C14.8 4.5 13.5 2 13.5 2z" />
                </svg>
              </div>
            </div>

            <div className="topbar-streak-row">
              {streakDays.map((day) => (
                <div key={day.label} className="topbar-streak-day">
                  <span>{day.label}</span>
                  <i className={day.done ? "is-active" : ""} />
                </div>
              ))}
            </div>
          </section>

          <section className="topbar-stat-card">
            <div className="topbar-stat-card-head">
              <div>
                <h2>Ganhe sua primeira estrela</h2>
                <p>Cada estrela representa uma questao que voce acertou.</p>
              </div>
              <div className="topbar-stat-icon topbar-stat-icon-star" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 2l3 6.6 7 .8-5.2 4.9 1.5 7-6.3-3.6-6.3 3.6 1.5-7L2 9.4l7-.8L12 2z" />
                </svg>
              </div>
            </div>

            <div className="topbar-mastery-grid">
              {masteryItems.map((item) => (
                <article key={item} className="topbar-mastery-item">
                  <strong>{item}</strong>
                  <span>0</span>
                  <small>Estrelas</small>
                </article>
              ))}
            </div>
          </section>
        </div>
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
