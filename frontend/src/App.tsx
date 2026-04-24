import type { ReactNode } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";

import TimerPage from "./pages/TimerPage";
import TodayPage from "./pages/TodayPage";

const navigationItems = [
  {
    label: "Foco do dia",
    path: "/",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="#E8F2FF" />
        <path d="M12 4.5l2.2 4.46 4.92.72-3.56 3.47.84 4.9L12 15.7l-4.4 2.35.84-4.9-3.56-3.47 4.92-.72L12 4.5z" fill="#3AA0FF" />
        <path d="M12 7.25l1.2 2.42 2.68.39-1.94 1.89.46 2.67L12 13.33l-2.4 1.29.46-2.67-1.94-1.89 2.68-.39L12 7.25z" fill="#7ED957" />
      </svg>
    ),
  },
  {
    label: "Timer",
    path: "/timer",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="7.5" y="2.5" width="9" height="3" rx="1.5" fill="#2C2C2C" />
        <circle cx="12" cy="13" r="7.5" fill="#EAF6FF" />
        <path d="M12 6a7 7 0 100 14 7 7 0 000-14zm0 1.8a5.2 5.2 0 11-.01 10.4A5.2 5.2 0 0112 7.8z" fill="#3AA0FF" />
        <path d="M12.9 9.2v3.27l2.45 1.4-.75 1.31-3.2-1.84V9.2h1.5z" fill="#FFB648" />
      </svg>
    ),
  },
];

const futureItems = [
  {
    label: "Aprender",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4l7.5 3.6L12 11.2 4.5 7.6 12 4z" fill="#57C84D" />
        <path d="M6 9.4L12 12l6-2.6V16L12 19 6 16V9.4z" fill="#3AA0FF" />
        <path d="M12 12l6-2.6V16L12 19v-7z" fill="#228BE6" />
      </svg>
    ),
  },
  {
    label: "Revisoes",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5.2a6.8 6.8 0 015.9 10.18l1.73 1-.74 1.28-1.73-1A6.8 6.8 0 1112 5.2z" fill="#EAF6FF" />
        <path d="M12 6.7a5.3 5.3 0 105.3 5.3h1.5A6.8 6.8 0 1112 5.2v1.5z" fill="#8F63FF" />
        <path d="M12.75 8.25v3.44l2.55 1.53-.77 1.28-3.28-1.96V8.25h1.5z" fill="#FFB648" />
      </svg>
    ),
  },
  {
    label: "Redacao",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="4" width="10" height="14" rx="2" fill="#EAF6FF" />
        <path d="M7.2 8h5.6v1.4H7.2V8zm0 3h5.6v1.4H7.2V11zm0 3h3.6v1.4H7.2V14z" fill="#3AA0FF" />
        <path d="M14.3 7.1l3.6 3.6-5.7 5.7H8.6v-3.6l5.7-5.7z" fill="#FF8A34" />
        <path d="M17.1 4.9a1.6 1.6 0 012.26 2.26l-.8.8-2.26-2.26.8-.8z" fill="#FFCF59" />
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

function HoverPanelButton({
  label,
  icon,
  panelClassName,
  children,
}: {
  label: string;
  icon: ReactNode;
  panelClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="topbar-hover-group">
      <button type="button" className="app-topbar-link topbar-hover-trigger" aria-haspopup="true">
        <span className="app-topbar-link-icon">{icon}</span>
        <span>{label}</span>
      </button>
      <div className={`topbar-hover-panel ${panelClassName ?? ""}`.trim()}>{children}</div>
    </div>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-row">
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

          <div className="app-topbar-actions">
            <HoverPanelButton
              label="Ofensiva"
              icon={
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M13.2 2.2s1.3 2.43.2 4.4c-.5.9-.48 1.88.04 2.74 1.58-.53 2.78-1.98 2.92-3.79 2.49 1.83 4.14 4.5 4.14 7.53 0 4.82-3.47 8.22-8.38 8.22C7.31 21.3 4 17.95 4 13.57c0-3.02 1.61-5.75 4.15-7.78.08 1.5.82 2.93 2 3.7.2-1.7 1.06-3.35 2.68-5.13.9-.99.37-2.16.37-2.16z" fill="#FF8A34" />
                  <path d="M12.3 11.2c1.85 0 3.2 1.44 3.2 3.38 0 1.99-1.43 3.4-3.42 3.4-2.08 0-3.58-1.5-3.58-3.54 0-1.62 1-2.98 2.45-3.95.04.74.45 1.42 1.08 1.87.09-.42.24-.81.52-1.16.42-.53.58-1 .64-1.42.41.39.75.86 1.02 1.42l-.9.62a2.8 2.8 0 00-1.01-1.38z" fill="#FFCF59" />
                </svg>
              }
              panelClassName="topbar-hover-panel-compact"
            >
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
            </HoverPanelButton>

            <HoverPanelButton
              label="Estrelas"
              icon={
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2.5l2.56 5.18 5.72.83-4.14 4.04.98 5.7L12 15.44l-5.12 2.7.98-5.7-4.14-4.04 5.72-.83L12 2.5z" fill="#FFCF59" />
                  <path d="M12 6.5l1.22 2.46 2.73.4-1.98 1.93.47 2.72L12 12.73l-2.44 1.28.47-2.72-1.98-1.93 2.73-.4L12 6.5z" fill="#FF8A34" />
                </svg>
              }
              panelClassName="topbar-hover-panel-wide"
            >
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
            </HoverPanelButton>
          </div>
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
