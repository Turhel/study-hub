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

function FireEmojiIcon({ idPrefix }: { idPrefix: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path
        fill={`url(#${idPrefix}-a)`}
        d="M12.5554 8.93525c1.5367-2.39746 2.4462-4.61157 2.9208-6.17691.1819-.59994.9502-.84569 1.4062-.41557 6.8725 6.48124 9.1187 11.42943 9.5669 17.14803.3281 5.5313-2.3906 10.4532-9.6875 10.4532-6.85071 0-11.90633-4.7813-11.21886-12.3594.41085-4.529 2.17156-7.97922 3.57924-10.03311.4381-.6392 1.35082-.64847 1.85572-.06057l1.2591 1.46627c.0868.10103.2465.09017.3184-.02194Z"
      />
      <path
        fill={`url(#${idPrefix}-b)`}
        d="M12.5554 8.93525c1.5367-2.39746 2.4462-4.61157 2.9208-6.17691.1819-.59994.9502-.84569 1.4062-.41557 6.8725 6.48124 9.1187 11.42943 9.5669 17.14803.3281 5.5313-2.3906 10.4532-9.6875 10.4532-6.85071 0-11.90633-4.7813-11.21886-12.3594.41085-4.529 2.17156-7.97922 3.57924-10.03311.4381-.6392 1.35082-.64847 1.85572-.06057l1.2591 1.46627c.0868.10103.2465.09017.3184-.02194Z"
      />
      <path
        fill={`url(#${idPrefix}-c)`}
        d="M12.5554 8.93525c1.5367-2.39746 2.4462-4.61157 2.9208-6.17691.1819-.59994.9502-.84569 1.4062-.41557 6.8725 6.48124 9.1187 11.42943 9.5669 17.14803.3281 5.5313-2.3906 10.4532-9.6875 10.4532-6.85071 0-11.90633-4.7813-11.21886-12.3594.41085-4.529 2.17156-7.97922 3.57924-10.03311.4381-.6392 1.35082-.64847 1.85572-.06057l1.2591 1.46627c.0868.10103.2465.09017.3184-.02194Z"
      />
      <path
        fill={`url(#${idPrefix}-d)`}
        d="M12.5554 8.93525c1.5367-2.39746 2.4462-4.61157 2.9208-6.17691.1819-.59994.9502-.84569 1.4062-.41557 6.8725 6.48124 9.1187 11.42943 9.5669 17.14803.3281 5.5313-2.3906 10.4532-9.6875 10.4532-6.85071 0-11.90633-4.7813-11.21886-12.3594.41085-4.529 2.17156-7.97922 3.57924-10.03311.4381-.6392 1.35082-.64847 1.85572-.06057l1.2591 1.46627c.0868.10103.2465.09017.3184-.02194Z"
      />
      <path
        fill={`url(#${idPrefix}-e)`}
        d="M12.5554 8.93525c1.5367-2.39746 2.4462-4.61157 2.9208-6.17691.1819-.59994.9502-.84569 1.4062-.41557 6.8725 6.48124 9.1187 11.42943 9.5669 17.14803.3281 5.5313-2.3906 10.4532-9.6875 10.4532-6.85071 0-11.90633-4.7813-11.21886-12.3594.41085-4.529 2.17156-7.97922 3.57924-10.03311.4381-.6392 1.35082-.64847 1.85572-.06057l1.2591 1.46627c.0868.10103.2465.09017.3184-.02194Z"
      />
      <path
        fill={`url(#${idPrefix}-f)`}
        d="M12.5554 8.93525c1.5367-2.39746 2.4462-4.61157 2.9208-6.17691.1819-.59994.9502-.84569 1.4062-.41557 6.8725 6.48124 9.1187 11.42943 9.5669 17.14803.3281 5.5313-2.3906 10.4532-9.6875 10.4532-6.85071 0-11.90633-4.7813-11.21886-12.3594.41085-4.529 2.17156-7.97922 3.57924-10.03311.4381-.6392 1.35082-.64847 1.85572-.06057l1.2591 1.46627c.0868.10103.2465.09017.3184-.02194Z"
      />
      <path
        fill={`url(#${idPrefix}-g)`}
        d="M12.5554 8.93525c1.5367-2.39746 2.4462-4.61157 2.9208-6.17691.1819-.59994.9502-.84569 1.4062-.41557 6.8725 6.48124 9.1187 11.42943 9.5669 17.14803.3281 5.5313-2.3906 10.4532-9.6875 10.4532-6.85071 0-11.90633-4.7813-11.21886-12.3594.41085-4.529 2.17156-7.97922 3.57924-10.03311.4381-.6392 1.35082-.64847 1.85572-.06057l1.2591 1.46627c.0868.10103.2465.09017.3184-.02194Z"
      />
      <path
        fill={`url(#${idPrefix}-h)`}
        d="M12.5554 8.93525c1.5367-2.39746 2.4462-4.61157 2.9208-6.17691.1819-.59994.9502-.84569 1.4062-.41557 6.8725 6.48124 9.1187 11.42943 9.5669 17.14803.3281 5.5313-2.3906 10.4532-9.6875 10.4532-6.85071 0-11.90633-4.7813-11.21886-12.3594.41085-4.529 2.17156-7.97922 3.57924-10.03311.4381-.6392 1.35082-.64847 1.85572-.06057l1.2591 1.46627c.0868.10103.2465.09017.3184-.02194Z"
      />
      <g filter={`url(#${idPrefix}-i)`}>
        <path
          fill={`url(#${idPrefix}-j)`}
          d="M10.1782 19.8769c1.3023-3.0993 3.9746-6.5289 5.7792-8.3894.5099-.5257 1.3341-.5351 1.8727-.0388 3.4612 3.189 4.5031 6.072 5.3873 9.4282.9198 3.4917 0 9.1177-6.9216 9.1177-5.9607 0-8.02561-5.5772-6.1176-10.1177Z"
        />
        <path
          fill={`url(#${idPrefix}-k)`}
          d="M10.1782 19.8769c1.3023-3.0993 3.9746-6.5289 5.7792-8.3894.5099-.5257 1.3341-.5351 1.8727-.0388 3.4612 3.189 4.5031 6.072 5.3873 9.4282.9198 3.4917 0 9.1177-6.9216 9.1177-5.9607 0-8.02561-5.5772-6.1176-10.1177Z"
        />
        <path
          fill={`url(#${idPrefix}-l)`}
          d="M10.1782 19.8769c1.3023-3.0993 3.9746-6.5289 5.7792-8.3894.5099-.5257 1.3341-.5351 1.8727-.0388 3.4612 3.189 4.5031 6.072 5.3873 9.4282.9198 3.4917 0 9.1177-6.9216 9.1177-5.9607 0-8.02561-5.5772-6.1176-10.1177Z"
        />
      </g>
      <path
        fill={`url(#${idPrefix}-m)`}
        d="M10.1782 19.8769c1.3023-3.0993 3.9746-6.5289 5.7792-8.3894.5099-.5257 1.3341-.5351 1.8727-.0388 3.4612 3.189 4.5031 6.072 5.3873 9.4282.9198 3.4917 0 9.1177-6.9216 9.1177-5.9607 0-8.02561-5.5772-6.1176-10.1177Z"
      />
      <path
        fill={`url(#${idPrefix}-n)`}
        d="M10.1782 19.8769c1.3023-3.0993 3.9746-6.5289 5.7792-8.3894.5099-.5257 1.3341-.5351 1.8727-.0388 3.4612 3.189 4.5031 6.072 5.3873 9.4282.9198 3.4917 0 9.1177-6.9216 9.1177-5.9607 0-8.02561-5.5772-6.1176-10.1177Z"
      />
      <g filter={`url(#${idPrefix}-o)`}>
        <path
          fill={`url(#${idPrefix}-p)`}
          d="M11.8137 11.5385c2.3154-3.38999 3.6694-7.05706 4.0829-7.96197-.603 4.6348-2.3602 8.02817-5.6679 12.39807-2.64616 3.496-3.12394 6.4888-3.10096 7.2171-.82693-5.5617 1.79167-7.4157 4.68596-11.6532Z"
        />
      </g>
      <g filter={`url(#${idPrefix}-q)`}>
        <path
          fill={`url(#${idPrefix}-r)`}
          d="M9.81366 7.87422C8.5136 9.4879 5.9295 13.9638 5.99348 18.9582c1.28144-5.1224 4.27572-6.7367 3.82018-11.08398Z"
        />
      </g>
      <defs>
        <radialGradient id={`${idPrefix}-a`} cx="0" cy="0" r="1" gradientTransform="matrix(-17.09808 -.15697 .23672 -25.78501 24.0023 19.72)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF953D" />
          <stop offset="1" stopColor="#FF5141" />
        </radialGradient>
        <radialGradient id={`${idPrefix}-b`} cx="0" cy="0" r="1" gradientTransform="matrix(-9.58662 -3.88551 6.70473 -16.5424 10.3724 15.6549)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#CE5327" />
          <stop offset="1" stopColor="#CE5327" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${idPrefix}-d`} cx="0" cy="0" r="1" gradientTransform="matrix(2.83591 1.26351 -10.45887 23.47458 4.95718 14.3914)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFAA7B" />
          <stop offset="1" stopColor="#FFAA7B" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${idPrefix}-e`} cx="0" cy="0" r="1" gradientTransform="matrix(.843 3.74668 -4.675 1.05188 9.31032 6.25095)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF5E47" />
          <stop offset="1" stopColor="#FF5E47" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${idPrefix}-f`} cx="0" cy="0" r="1" gradientTransform="matrix(.37467 10.13047 -9.3768 .3468 16.429 1.36584)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF2F3C" />
          <stop offset="1" stopColor="#FF2F3C" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${idPrefix}-g`} cx="0" cy="0" r="1" gradientTransform="matrix(2.07795 .9835 -1.9737 4.17002 13.9 4.79911)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF846C" />
          <stop offset="1" stopColor="#FF846C" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${idPrefix}-h`} cx="0" cy="0" r="1" gradientTransform="matrix(-.89842 2.09375 -.4798 -.20588 12.4577 8.20959)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFA682" />
          <stop offset="1" stopColor="#FFA682" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${idPrefix}-j`} cx="0" cy="0" r="1" gradientTransform="matrix(-9.82978 -1.98953 2.47754 -12.2409 21.2046 24.3762)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFDA2F" />
          <stop offset="1" stopColor="#FF8E41" />
        </radialGradient>
        <radialGradient id={`${idPrefix}-k`} cx="0" cy="0" r="1" gradientTransform="matrix(5.05803 13.20707 -11.47514 4.39474 12.4013 8.59263)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FD5639" />
          <stop offset="1" stopColor="#FE5533" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${idPrefix}-l`} cx="0" cy="0" r="1" gradientTransform="matrix(-9.74917 .98358 -2.40823 -23.87023 19.239 20.6289)" gradientUnits="userSpaceOnUse">
          <stop offset=".627719" stopColor="#D7812D" stopOpacity="0" />
          <stop offset="1" stopColor="#D7812D" />
        </radialGradient>
        <radialGradient id={`${idPrefix}-n`} cx="0" cy="0" r="1" gradientTransform="matrix(-12.83239 9.6478 -6.98132 -9.28575 22.9857 18.8023)" gradientUnits="userSpaceOnUse">
          <stop offset=".772305" stopColor="#F18A52" stopOpacity="0" />
          <stop offset="1" stopColor="#F18A52" />
        </radialGradient>
        <linearGradient id={`${idPrefix}-c`} x1="18.3364" x2="18.3364" y1="29.944" y2="24.8455" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF7583" />
          <stop offset="1" stopColor="#FF7583" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-m`} x1="16.5026" x2="16.5026" y1="10.6122" y2="14.2595" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F95131" />
          <stop offset="1" stopColor="#F95131" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-p`} x1="14.9957" x2="7.65549" y1="4.2552" y2="22.7319" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF7558" />
          <stop offset="1" stopColor="#F38758" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-r`} x1="9.54097" x2="5.58208" y1="8.14373" y2="19.4793" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF815B" />
          <stop offset="1" stopColor="#FF9C6D" />
        </linearGradient>
        <filter id={`${idPrefix}-i`} width="14.5255" height="18.9099" x="9.48987" y="11.0846" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feColorMatrix in="SourceAlpha" result="hardAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
          <feOffset dx=".5" />
          <feGaussianBlur stdDeviation=".25" />
          <feComposite in2="hardAlpha" k2="-1" k3="1" operator="arithmetic" />
          <feColorMatrix values="0 0 0 0 0.952941 0 0 0 0 0.615686 0 0 0 0 0.364706 0 0 0 1 0" />
          <feBlend in2="shape" result="effect1_innerShadow_18_15821" />
        </filter>
        <filter id={`${idPrefix}-o`} width="11.4237" height="22.1152" x="5.7229" y="2.32654" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur result="effect1_foregroundBlur_18_15821" stdDeviation=".625" />
        </filter>
        <filter id={`${idPrefix}-q`} width="6.86804" height="14.0839" x="4.49231" y="6.37427" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur result="effect1_foregroundBlur_18_15821" stdDeviation=".75" />
        </filter>
      </defs>
    </svg>
  );
}

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
                <FireEmojiIcon idPrefix="fire-trigger" />
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
                    <FireEmojiIcon idPrefix="fire-panel" />
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
