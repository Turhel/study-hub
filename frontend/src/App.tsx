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
        <circle cx="12" cy="12" r="9" fill="#EEF7FF" />
        <circle cx="12" cy="12" r="5.8" fill="#8ED0FF" />
        <circle cx="12" cy="12" r="3.2" fill="#3AA0FF" />
        <circle cx="12" cy="12" r="1.4" fill="#FFCF59" />
        <path d="M17.55 4.2l.6 1.8 1.9.05-1.5 1.15.54 1.8-1.52-1.06-1.57 1.06.56-1.8-1.5-1.15 1.88-.05.61-1.8z" fill="#FFB648" />
      </svg>
    ),
  },
  {
    label: "Timer",
    path: "/timer",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="8.1" y="2.8" width="7.8" height="2.6" rx="1.3" fill="#584D65" />
        <circle cx="12" cy="13" r="7.7" fill="#EAF6FF" />
        <circle cx="12" cy="13" r="6.1" fill="#FFFFFF" />
        <path d="M12 6.6a6.4 6.4 0 106.4 6.4h-1.6A4.8 4.8 0 1112 8.2V6.6z" fill="#66C3FF" />
        <path d="M12.8 9.2v3.45l2.62 1.52-.78 1.3-3.34-1.94V9.2h1.52z" fill="#FFB648" />
        <circle cx="12" cy="13" r="1.1" fill="#584D65" />
      </svg>
    ),
  },
];

const futureItems = [
  {
    label: "Aprender",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.2 6.1A2.1 2.1 0 017.3 4h3.7v14H7.35A2.15 2.15 0 015.2 15.85V6.1z" fill="#59C86B" />
        <path d="M12.95 4h3.75a2.1 2.1 0 012.1 2.1v9.75A2.15 2.15 0 0116.65 18h-3.7V4z" fill="#3AA0FF" />
        <path d="M7.1 6.35h2.6v1.2H7.1zm0 2.15h2.6v1.2H7.1zm7.15-2.15h2.65v1.2h-2.65zm0 2.15h2.65v1.2h-2.65z" fill="#FFFFFF" />
        <path d="M11 5.1h1.95V18H11z" fill="#FFCF59" />
      </svg>
    ),
  },
  {
    label: "Revisoes",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" fill="#F3EEFF" />
        <path d="M12 5.15a6.85 6.85 0 015.86 10.4l1.52.9-.76 1.3-1.56-.9A6.85 6.85 0 1112 5.15z" fill="#9A72FF" />
        <path d="M6.9 11.6L4.5 9.3l.95-.95 1.45 1.4V6.4H8.3v4.6c0 .33-.27.6-.6.6H6.9zm10.2.8h-1.4V17.6h-1.4v-4.6c0-.33.27-.6.6-.6h.75l2.45 2.35-.98.95-1.42-1.35z" fill="#FFB648" />
      </svg>
    ),
  },
  {
    label: "Redacao",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.7" y="3.7" width="10.6" height="14.8" rx="2.4" fill="#EAF6FF" />
        <path d="M7.1 7.6h5.8V9H7.1zm0 2.9h5.8v1.4H7.1zm0 2.9h3.9v1.4H7.1z" fill="#58B8FF" />
        <path d="M14.6 7.05l3.35 3.35-5.95 5.95H8.65V13l5.95-5.95z" fill="#FF8A34" />
        <path d="M17.25 4.95a1.52 1.52 0 012.15 2.15l-.82.82-2.16-2.16.83-.81z" fill="#FFCF59" />
        <path d="M9.25 16.35l1.78-.32-1.46-1.46-.32 1.78z" fill="#584D65" />
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
  icon,
  panelClassName,
  children,
}: {
  icon: ReactNode;
  panelClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="topbar-hover-group">
      <button type="button" className="topbar-hover-icon" aria-haspopup="true">
        <span className="topbar-hover-icon-glyph">{icon}</span>
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
