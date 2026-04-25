import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";

import { getGamificationSummary } from "./lib/api";
import LessonsPage from "./pages/LessonsPage";
import StatsPage from "./pages/StatsPage";
import TimerPage from "./pages/TimerPage";
import TodayPage from "./pages/TodayPage";

type ThemeMode = "light" | "dark";

const navigationItems = [
  { label: "Foco do dia", path: "/", icon: <FocusEmojiIcon /> },
  { label: "Aulas", path: "/lessons", icon: <BooksEmojiIcon /> },
  { label: "Estatisticas", path: "/stats", icon: <StatsEmojiIcon /> },
  { label: "Timer", path: "/timer", icon: <TimerEmojiIcon /> },
];

const futureItems = [
  { label: "Revisoes", icon: <ReviewEmojiIcon /> },
  { label: "Redacao", icon: <MemoEmojiIcon /> },
];

const profileMenuItems = [
  { label: "Minha conta", icon: "👤" },
  { label: "Configuracoes", icon: "⚙️" },
  { label: "Preferencias de estudo", icon: "🧠" },
  { label: "Exportar progresso", icon: "📦" },
];

const weekdays = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];

const weekdayLabels: Record<string, string> = {
  seg: "Seg",
  ter: "Ter",
  qua: "Qua",
  qui: "Qui",
  sex: "Sex",
  sab: "Sab",
  dom: "Dom",
};

const masterySummaryItems = [
  { label: "Questoes", key: "question_mastery_stars" },
  { label: "Revisoes", key: "review_mastery_stars" },
  { label: "Consistencia", key: "consistency_mastery_stars" },
  { label: "Dominados", key: "mastered_subjects_count" },
] as const;

function FocusEmojiIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="11.5" fill="#EEF8FF" />
      <circle cx="16" cy="16" r="8" fill="#7CC8FF" />
      <circle cx="16" cy="16" r="4.8" fill="#2F9BFF" />
      <circle cx="16" cy="16" r="2.2" fill="#FFCF59" />
      <path d="M23.8 6.2l.85 2.53 2.66.07-2.1 1.61.77 2.53-2.15-1.5-2.2 1.5.78-2.53-2.1-1.6 2.64-.08.85-2.53z" fill="#FF9F43" />
    </svg>
  );
}

function TimerEmojiIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="10.8" y="3.8" width="10.4" height="3.4" rx="1.7" fill="#5C516A" />
      <rect x="21.5" y="5.4" width="2.3" height="4.3" rx="1.15" transform="rotate(40 21.5 5.4)" fill="#7CC8FF" />
      <circle cx="16" cy="17.5" r="10.3" fill="#EAF7FF" />
      <circle cx="16" cy="17.5" r="8.1" fill="#FFFFFF" />
      <path d="M16 8.8a8.7 8.7 0 018.7 8.7h-2.1a6.6 6.6 0 10-1.93 4.67l1.48 1.48A8.7 8.7 0 1116 8.8z" fill="#5AB8FF" />
      <path d="M16.9 12v4.66l3.55 2.06-1.06 1.77-4.53-2.63V12h2.04z" fill="#FFB648" />
      <circle cx="16" cy="17.5" r="1.35" fill="#5C516A" />
    </svg>
  );
}

function StatsEmojiIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4.8" y="5.2" width="22.4" height="21.6" rx="5.2" fill="#EAF7FF" />
      <path d="M9.1 21.6h3.6v-6.9H9.1v6.9zm5.5 0h3.6V10.4h-3.6v11.2zm5.5 0h3.6v-9h-3.6v9z" fill="#39AAF0" />
      <path d="M8.8 9.3h8.9v1.7H8.8zm0 3h5.7V14H8.8z" fill="#5C516A" opacity="0.65" />
      <circle cx="23.6" cy="8.6" r="2.6" fill="#FFCF59" />
    </svg>
  );
}

function BooksEmojiIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4.8" y="8.2" width="8.3" height="18" rx="2.4" fill="#4CCB63" />
      <rect x="11.4" y="6.2" width="8.7" height="20" rx="2.5" fill="#FFCF59" />
      <rect x="18.4" y="7.2" width="8.8" height="19" rx="2.5" fill="#3AA0FF" />
      <path d="M6.8 11.3h4.2v1.45H6.8zm0 3.1h4.2v1.45H6.8zm6.4-4h5.2v1.45h-5.2zm0 3.1h5.2v1.45h-5.2zm7.2-1.2h4.8v1.45h-4.8zm0 3.1h4.8v1.45h-4.8z" fill="#FFFFFF" />
    </svg>
  );
}

function ReviewEmojiIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="11.5" fill="#F3EEFF" />
      <path d="M16 7.7a8.3 8.3 0 017.12 12.58l2.15 1.25-1.07 1.83-2.2-1.27A8.3 8.3 0 1116 7.7z" fill="#9672FF" />
      <path d="M10.1 11.9L7 9l1.35-1.34 1.98 1.92V5.75h1.98v6.15c0 .44-.36.8-.8.8H10.1zm11.77 1.1h-1.98v5.02H17.9v-6.15c0-.44.35-.8.8-.8h1.06l3.34 3.2-1.23 1.34-2-1.9z" fill="#FFB648" />
    </svg>
  );
}

function MemoEmojiIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="6" y="4.6" width="14.1" height="19.6" rx="2.8" fill="#EAF6FF" />
      <path d="M9.2 9.6h7.7v1.7H9.2zm0 3.9h7.7v1.7H9.2zm0 3.9h5.2v1.7H9.2z" fill="#58B8FF" />
      <path d="M19.35 9.1l4.45 4.45-7.54 7.54h-4.45v-4.45l7.54-7.54z" fill="#FF8A34" />
      <path d="M22.82 6.32a2.02 2.02 0 012.86 2.86l-1.1 1.1-2.86-2.86 1.1-1.1z" fill="#FFCF59" />
      <path d="M12.65 20.1l2.37-.44-1.93-1.93-.44 2.37z" fill="#5C516A" />
    </svg>
  );
}

function StarEmojiIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 1.85l4.2 8.48 9.35 1.35-6.77 6.61 1.6 9.31L16 22.92 7.62 27.6l1.6-9.31-6.77-6.6 9.35-1.36L16 1.85z" fill="#FFD452" />
      <path d="M16 6.95l2 4.04 4.48.65-3.24 3.16.76 4.47L16 17.02l-4 2.25.76-4.47-3.24-3.16 4.48-.65L16 6.95z" fill="#FF9D32" />
    </svg>
  );
}

function FireEmojiIcon({ idPrefix }: { idPrefix: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path fill={`url(#${idPrefix}-a)`} d="M12.5554 8.93525c1.5367-2.39746 2.4462-4.61157 2.9208-6.17691.1819-.59994.9502-.84569 1.4062-.41557 6.8725 6.48124 9.1187 11.42943 9.5669 17.14803.3281 5.5313-2.3906 10.4532-9.6875 10.4532-6.85071 0-11.90633-4.7813-11.21886-12.3594.41085-4.529 2.17156-7.97922 3.57924-10.03311.4381-.6392 1.35082-.64847 1.85572-.06057l1.2591 1.46627c.0868.10103.2465.09017.3184-.02194Z" />
      <path fill={`url(#${idPrefix}-b)`} d="M12.5554 8.93525c1.5367-2.39746 2.4462-4.61157 2.9208-6.17691.1819-.59994.9502-.84569 1.4062-.41557 6.8725 6.48124 9.1187 11.42943 9.5669 17.14803.3281 5.5313-2.3906 10.4532-9.6875 10.4532-6.85071 0-11.90633-4.7813-11.21886-12.3594.41085-4.529 2.17156-7.97922 3.57924-10.03311.4381-.6392 1.35082-.64847 1.85572-.06057l1.2591 1.46627c.0868.10103.2465.09017.3184-.02194Z" />
      <path fill={`url(#${idPrefix}-c)`} d="M12.5554 8.93525c1.5367-2.39746 2.4462-4.61157 2.9208-6.17691.1819-.59994.9502-.84569 1.4062-.41557 6.8725 6.48124 9.1187 11.42943 9.5669 17.14803.3281 5.5313-2.3906 10.4532-9.6875 10.4532-6.85071 0-11.90633-4.7813-11.21886-12.3594.41085-4.529 2.17156-7.97922 3.57924-10.03311.4381-.6392 1.35082-.64847 1.85572-.06057l1.2591 1.46627c.0868.10103.2465.09017.3184-.02194Z" />
      <path fill={`url(#${idPrefix}-d)`} d="M12.5554 8.93525c1.5367-2.39746 2.4462-4.61157 2.9208-6.17691.1819-.59994.9502-.84569 1.4062-.41557 6.8725 6.48124 9.1187 11.42943 9.5669 17.14803.3281 5.5313-2.3906 10.4532-9.6875 10.4532-6.85071 0-11.90633-4.7813-11.21886-12.3594.41085-4.529 2.17156-7.97922 3.57924-10.03311.4381-.6392 1.35082-.64847 1.85572-.06057l1.2591 1.46627c.0868.10103.2465.09017.3184-.02194Z" />
      <path fill={`url(#${idPrefix}-e)`} d="M12.5554 8.93525c1.5367-2.39746 2.4462-4.61157 2.9208-6.17691.1819-.59994.9502-.84569 1.4062-.41557 6.8725 6.48124 9.1187 11.42943 9.5669 17.14803.3281 5.5313-2.3906 10.4532-9.6875 10.4532-6.85071 0-11.90633-4.7813-11.21886-12.3594.41085-4.529 2.17156-7.97922 3.57924-10.03311.4381-.6392 1.35082-.64847 1.85572-.06057l1.2591 1.46627c.0868.10103.2465.09017.3184-.02194Z" />
      <path fill={`url(#${idPrefix}-f)`} d="M12.5554 8.93525c1.5367-2.39746 2.4462-4.61157 2.9208-6.17691.1819-.59994.9502-.84569 1.4062-.41557 6.8725 6.48124 9.1187 11.42943 9.5669 17.14803.3281 5.5313-2.3906 10.4532-9.6875 10.4532-6.85071 0-11.90633-4.7813-11.21886-12.3594.41085-4.529 2.17156-7.97922 3.57924-10.03311.4381-.6392 1.35082-.64847 1.85572-.06057l1.2591 1.46627c.0868.10103.2465.09017.3184-.02194Z" />
      <path fill={`url(#${idPrefix}-g)`} d="M12.5554 8.93525c1.5367-2.39746 2.4462-4.61157 2.9208-6.17691.1819-.59994.9502-.84569 1.4062-.41557 6.8725 6.48124 9.1187 11.42943 9.5669 17.14803.3281 5.5313-2.3906 10.4532-9.6875 10.4532-6.85071 0-11.90633-4.7813-11.21886-12.3594.41085-4.529 2.17156-7.97922 3.57924-10.03311.4381-.6392 1.35082-.64847 1.85572-.06057l1.2591 1.46627c.0868.10103.2465.09017.3184-.02194Z" />
      <path fill={`url(#${idPrefix}-h)`} d="M12.5554 8.93525c1.5367-2.39746 2.4462-4.61157 2.9208-6.17691.1819-.59994.9502-.84569 1.4062-.41557 6.8725 6.48124 9.1187 11.42943 9.5669 17.14803.3281 5.5313-2.3906 10.4532-9.6875 10.4532-6.85071 0-11.90633-4.7813-11.21886-12.3594.41085-4.529 2.17156-7.97922 3.57924-10.03311.4381-.6392 1.35082-.64847 1.85572-.06057l1.2591 1.46627c.0868.10103.2465.09017.3184-.02194Z" />
      <g filter={`url(#${idPrefix}-i)`}>
        <path fill={`url(#${idPrefix}-j)`} d="M10.1782 19.8769c1.3023-3.0993 3.9746-6.5289 5.7792-8.3894.5099-.5257 1.3341-.5351 1.8727-.0388 3.4612 3.189 4.5031 6.072 5.3873 9.4282.9198 3.4917 0 9.1177-6.9216 9.1177-5.9607 0-8.02561-5.5772-6.1176-10.1177Z" />
        <path fill={`url(#${idPrefix}-k)`} d="M10.1782 19.8769c1.3023-3.0993 3.9746-6.5289 5.7792-8.3894.5099-.5257 1.3341-.5351 1.8727-.0388 3.4612 3.189 4.5031 6.072 5.3873 9.4282.9198 3.4917 0 9.1177-6.9216 9.1177-5.9607 0-8.02561-5.5772-6.1176-10.1177Z" />
        <path fill={`url(#${idPrefix}-l)`} d="M10.1782 19.8769c1.3023-3.0993 3.9746-6.5289 5.7792-8.3894.5099-.5257 1.3341-.5351 1.8727-.0388 3.4612 3.189 4.5031 6.072 5.3873 9.4282.9198 3.4917 0 9.1177-6.9216 9.1177-5.9607 0-8.02561-5.5772-6.1176-10.1177Z" />
      </g>
      <path fill={`url(#${idPrefix}-m)`} d="M10.1782 19.8769c1.3023-3.0993 3.9746-6.5289 5.7792-8.3894.5099-.5257 1.3341-.5351 1.8727-.0388 3.4612 3.189 4.5031 6.072 5.3873 9.4282.9198 3.4917 0 9.1177-6.9216 9.1177-5.9607 0-8.02561-5.5772-6.1176-10.1177Z" />
      <path fill={`url(#${idPrefix}-n)`} d="M10.1782 19.8769c1.3023-3.0993 3.9746-6.5289 5.7792-8.3894.5099-.5257 1.3341-.5351 1.8727-.0388 3.4612 3.189 4.5031 6.072 5.3873 9.4282.9198 3.4917 0 9.1177-6.9216 9.1177-5.9607 0-8.02561-5.5772-6.1176-10.1177Z" />
      <g filter={`url(#${idPrefix}-o)`}>
        <path fill={`url(#${idPrefix}-p)`} d="M11.8137 11.5385c2.3154-3.38999 3.6694-7.05706 4.0829-7.96197-.603 4.6348-2.3602 8.02817-5.6679 12.39807-2.64616 3.496-3.12394 6.4888-3.10096 7.2171-.82693-5.5617 1.79167-7.4157 4.68596-11.6532Z" />
      </g>
      <g filter={`url(#${idPrefix}-q)`}>
        <path fill={`url(#${idPrefix}-r)`} d="M9.81366 7.87422C8.5136 9.4879 5.9295 13.9638 5.99348 18.9582c1.28144-5.1224 4.27572-6.7367 3.82018-11.08398Z" />
      </g>
      <defs>
        <radialGradient id={`${idPrefix}-a`} cx="0" cy="0" r="1" gradientTransform="matrix(-17.09808 -.15697 .23672 -25.78501 24.0023 19.72)" gradientUnits="userSpaceOnUse"><stop stopColor="#FF953D" /><stop offset="1" stopColor="#FF5141" /></radialGradient>
        <radialGradient id={`${idPrefix}-b`} cx="0" cy="0" r="1" gradientTransform="matrix(-9.58662 -3.88551 6.70473 -16.5424 10.3724 15.6549)" gradientUnits="userSpaceOnUse"><stop stopColor="#CE5327" /><stop offset="1" stopColor="#CE5327" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${idPrefix}-d`} cx="0" cy="0" r="1" gradientTransform="matrix(2.83591 1.26351 -10.45887 23.47458 4.95718 14.3914)" gradientUnits="userSpaceOnUse"><stop stopColor="#FFAA7B" /><stop offset="1" stopColor="#FFAA7B" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${idPrefix}-e`} cx="0" cy="0" r="1" gradientTransform="matrix(.843 3.74668 -4.675 1.05188 9.31032 6.25095)" gradientUnits="userSpaceOnUse"><stop stopColor="#FF5E47" /><stop offset="1" stopColor="#FF5E47" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${idPrefix}-f`} cx="0" cy="0" r="1" gradientTransform="matrix(.37467 10.13047 -9.3768 .3468 16.429 1.36584)" gradientUnits="userSpaceOnUse"><stop stopColor="#FF2F3C" /><stop offset="1" stopColor="#FF2F3C" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${idPrefix}-g`} cx="0" cy="0" r="1" gradientTransform="matrix(2.07795 .9835 -1.9737 4.17002 13.9 4.79911)" gradientUnits="userSpaceOnUse"><stop stopColor="#FF846C" /><stop offset="1" stopColor="#FF846C" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${idPrefix}-h`} cx="0" cy="0" r="1" gradientTransform="matrix(-.89842 2.09375 -.4798 -.20588 12.4577 8.20959)" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA682" /><stop offset="1" stopColor="#FFA682" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${idPrefix}-j`} cx="0" cy="0" r="1" gradientTransform="matrix(-9.82978 -1.98953 2.47754 -12.2409 21.2046 24.3762)" gradientUnits="userSpaceOnUse"><stop stopColor="#FFDA2F" /><stop offset="1" stopColor="#FF8E41" /></radialGradient>
        <radialGradient id={`${idPrefix}-k`} cx="0" cy="0" r="1" gradientTransform="matrix(5.05803 13.20707 -11.47514 4.39474 12.4013 8.59263)" gradientUnits="userSpaceOnUse"><stop stopColor="#FD5639" /><stop offset="1" stopColor="#FE5533" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${idPrefix}-l`} cx="0" cy="0" r="1" gradientTransform="matrix(-9.74917 .98358 -2.40823 -23.87023 19.239 20.6289)" gradientUnits="userSpaceOnUse"><stop offset=".627719" stopColor="#D7812D" stopOpacity="0" /><stop offset="1" stopColor="#D7812D" /></radialGradient>
        <radialGradient id={`${idPrefix}-n`} cx="0" cy="0" r="1" gradientTransform="matrix(-12.83239 9.6478 -6.98132 -9.28575 22.9857 18.8023)" gradientUnits="userSpaceOnUse"><stop offset=".772305" stopColor="#F18A52" stopOpacity="0" /><stop offset="1" stopColor="#F18A52" /></radialGradient>
        <linearGradient id={`${idPrefix}-c`} x1="18.3364" x2="18.3364" y1="29.944" y2="24.8455" gradientUnits="userSpaceOnUse"><stop stopColor="#FF7583" /><stop offset="1" stopColor="#FF7583" stopOpacity="0" /></linearGradient>
        <linearGradient id={`${idPrefix}-m`} x1="16.5026" x2="16.5026" y1="10.6122" y2="14.2595" gradientUnits="userSpaceOnUse"><stop stopColor="#F95131" /><stop offset="1" stopColor="#F95131" stopOpacity="0" /></linearGradient>
        <linearGradient id={`${idPrefix}-p`} x1="14.9957" x2="7.65549" y1="4.2552" y2="22.7319" gradientUnits="userSpaceOnUse"><stop stopColor="#FF7558" /><stop offset="1" stopColor="#F38758" /></linearGradient>
        <linearGradient id={`${idPrefix}-r`} x1="9.54097" x2="5.58208" y1="8.14373" y2="19.4793" gradientUnits="userSpaceOnUse"><stop stopColor="#FF815B" /><stop offset="1" stopColor="#FF9C6D" /></linearGradient>
        <filter id={`${idPrefix}-i`} width="14.5255" height="18.9099" x="9.48987" y="11.0846" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feColorMatrix in="SourceAlpha" result="hardAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" /><feOffset dx=".5" /><feGaussianBlur stdDeviation=".25" /><feComposite in2="hardAlpha" k2="-1" k3="1" operator="arithmetic" /><feColorMatrix values="0 0 0 0 0.952941 0 0 0 0 0.615686 0 0 0 0 0.364706 0 0 0 1 0" /><feBlend in2="shape" result="effect1_innerShadow_18_15821" /></filter>
        <filter id={`${idPrefix}-o`} width="11.4237" height="22.1152" x="5.7229" y="2.32654" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur result="effect1_foregroundBlur_18_15821" stdDeviation=".625" /></filter>
        <filter id={`${idPrefix}-q`} width="6.86804" height="14.0839" x="4.49231" y="6.37427" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur result="effect1_foregroundBlur_18_15821" stdDeviation=".75" /></filter>
      </defs>
    </svg>
  );
}

function AvatarIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="3" width="26" height="26" rx="8" fill="#1E2430" />
      <rect x="4.5" y="4.5" width="23" height="23" rx="7" fill="none" stroke="#5D677C" strokeWidth="1.2" />
      <circle cx="16" cy="12.4" r="4.1" fill="none" stroke="#F5F7FB" strokeWidth="1.7" />
      <path d="M9.1 23.2c1.6-3.85 4.27-5.8 6.9-5.8 2.63 0 5.3 1.95 6.9 5.8" fill="none" stroke="#F5F7FB" strokeWidth="1.7" strokeLinecap="round" />
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

function formatDate(value?: string | null): string {
  if (!value) {
    return "Sem registro";
  }

  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "light";
    }

    const stored = window.localStorage.getItem("study-hub-theme");
    if (stored === "light" || stored === "dark") {
      return stored;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const gamificationQuery = useQuery({
    queryKey: ["gamification-summary"],
    queryFn: getGamificationSummary,
    retry: false,
  });

  const streak = gamificationQuery.data?.streak;
  const mastery = gamificationQuery.data?.mastery;
  const activeWeekdays = new Set(streak?.active_weekdays ?? []);
  const streakDays = weekdays.map((day) => ({
    label: weekdayLabels[day],
    done: activeWeekdays.has(day),
  }));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("study-hub-theme", theme);
  }, [theme]);

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
            <HoverPanelButton icon={<FireEmojiIcon idPrefix="fire-trigger" />} panelClassName="topbar-hover-panel-compact">
              <section className="topbar-stat-card">
                <div className="topbar-stat-card-head">
                  <div>
                    <h2>{streak ? `${streak.current_streak_days} dias de ofensiva` : "Ofensiva"}</h2>
                    <p>
                      {gamificationQuery.isError
                        ? "Dados indisponiveis agora."
                        : streak?.studied_today
                          ? `Voce estudou hoje. Ultimo registro: ${formatDate(streak.last_study_date)}.`
                          : `Registre questoes hoje para manter a sequencia. Ultimo registro: ${formatDate(streak?.last_study_date)}.`}
                    </p>
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
                <p className="topbar-stat-note">Maior sequencia: {streak?.longest_streak_days ?? 0} dias</p>
              </section>
            </HoverPanelButton>

            <HoverPanelButton icon={<StarEmojiIcon />} panelClassName="topbar-hover-panel-wide">
              <section className="topbar-stat-card">
                <div className="topbar-stat-card-head">
                  <div>
                    <h2>{mastery ? `${mastery.total_mastery_stars} estrelas` : "Maestria"}</h2>
                    <p>
                      {gamificationQuery.isError
                        ? "Maestria indisponivel agora."
                        : mastery && mastery.total_mastery_stars > 0
                          ? `${mastery.mastered_subjects_count} assuntos dominados.`
                          : "Registre questoes e revisoes para gerar suas primeiras estrelas."}
                    </p>
                  </div>
                  <div className="topbar-stat-icon topbar-stat-icon-star" aria-hidden="true">
                    <StarEmojiIcon />
                  </div>
                </div>

                <div className="topbar-mastery-grid">
                  {masterySummaryItems.map((item) => (
                    <article key={item.label} className="topbar-mastery-item">
                      <strong>{item.label}</strong>
                      <span>{mastery?.[item.key] ?? 0}</span>
                      <small>Estrelas</small>
                    </article>
                  ))}
                </div>
                <div className="topbar-mastery-subjects">
                  {(mastery?.top_mastery_subjects ?? []).slice(0, 3).map((subject) => (
                    <span key={subject.subject_id}>
                      {subject.subject_name} - {subject.stars} estrelas
                    </span>
                  ))}
                  {mastery && mastery.top_mastery_subjects.length === 0 ? (
                    <span>Nenhum assunto com maestria ainda.</span>
                  ) : null}
                </div>
              </section>
            </HoverPanelButton>

            <HoverPanelButton icon={<AvatarIcon />} panelClassName="topbar-hover-panel-profile">
              <section className="topbar-profile-card">
                <div className="topbar-profile-header">
                  <div>
                    <h2>Ola, Thullyo</h2>
                    <p>Seu hub pessoal de estudo, sem ruido e sem camadas desnecessarias.</p>
                  </div>
                  <div className="topbar-profile-avatar" aria-hidden="true">
                    <AvatarIcon />
                  </div>
                </div>

                <div className="topbar-profile-meta">
                  <span>ENEM / Medicina</span>
                  <span>Rotina pessoal</span>
                </div>

                <div className="topbar-profile-menu">
                  <button
                    type="button"
                    className="topbar-profile-item"
                    onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
                  >
                    <span className="topbar-profile-item-icon" aria-hidden="true">
                      {theme === "light" ? "🌙" : "☀️"}
                    </span>
                    <span>{theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}</span>
                    <span className="topbar-profile-item-arrow" aria-hidden="true">
                      →
                    </span>
                  </button>

                  {profileMenuItems.map((item) => (
                    <button key={item.label} type="button" className="topbar-profile-item">
                      <span className="topbar-profile-item-icon" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                      <span className="topbar-profile-item-arrow" aria-hidden="true">
                        →
                      </span>
                    </button>
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
          <Route path="/lessons" element={<LessonsPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/timer" element={<TimerPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
