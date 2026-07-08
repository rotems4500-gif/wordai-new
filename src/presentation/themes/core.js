// ═══════════════════════════════════════════════════════════════
// themes/core.js — 6 ה-themes המקוריים (verbatim), עם תיוג family.
// הערכים זהים למה שהיה ב-deckThemes.js לפני הפיצול. אין לשנות ערכים.
// ═══════════════════════════════════════════════════════════════
import { F, defineTheme } from './_schema.js';

const core = [
  defineTheme({
    id: 'premium',
    label: 'פרימיום',
    family: 'tech-corporate',
    blurb: 'נקי ויוקרתי — הנהלה, מכירה, פיץ׳.',
    fonts: { display: F.rubik, body: F.heebo },
    colors: {
      bg: '#0b1220', bgAlt: '#16223a', surface: '#16243f',
      text: '#f8fafc', muted: '#9fb3cd', accent: '#38bdf8', accent2: '#6366f1',
      onAccent: '#04121f', border: '#24344f',
    },
    bg: { kind: 'mesh', blobs: ['accent', 'accent2'] },
    shape: { radius: 22, accentStyle: 'bar', cardElevation: true },
    motif: 'index',
    coverGradient: 'linear-gradient(135deg, #6366f1 0%, #38bdf8 100%)',
  }),
  defineTheme({
    id: 'cinematic',
    label: 'קולנועי',
    family: 'warm-editorial',
    blurb: 'פתיחים חזקים, נראות עשירה, אימפקט.',
    fonts: { display: F.secular, body: F.assistant },
    colors: {
      bg: '#160f08', bgAlt: '#2a1c0c', surface: '#241708',
      text: '#fff7ed', muted: '#d8b98e', accent: '#f59e0b', accent2: '#f43f5e',
      onAccent: '#160f08', border: '#3a2912',
    },
    bg: { kind: 'glow', corner: 'top-right' },
    shape: { radius: 16, accentStyle: 'block', cardElevation: true },
    motif: 'index',
    coverGradient: 'linear-gradient(135deg, #f59e0b 0%, #f43f5e 100%)',
  }),
  defineTheme({
    id: 'academic',
    label: 'אקדמי',
    family: 'light-editorial',
    blurb: 'היררכיה ברורה, פחות רעש, יותר טיעון.',
    fonts: { display: F.frank, body: F.heebo },
    colors: {
      bg: '#ffffff', bgAlt: '#eef2f7', surface: '#f5f8fc',
      text: '#0f172a', muted: '#516179', accent: '#2563eb', accent2: '#0ea5e9',
      onAccent: '#ffffff', border: '#dbe3ee',
    },
    bg: { kind: 'rail', side: 'right' },
    shape: { radius: 10, accentStyle: 'underline', cardElevation: false },
    motif: 'none',
    coverGradient: 'linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)',
  }),
  defineTheme({
    id: 'bold',
    label: 'נועז',
    family: 'neon-pop',
    blurb: 'ליינים חדים, שקופיות קצרות, אימפקט גבוה.',
    fonts: { display: F.secular, body: F.heebo },
    colors: {
      bg: '#0f0420', bgAlt: '#241046', surface: '#1c0a3a',
      text: '#faf5ff', muted: '#c4b5fd', accent: '#e879f9', accent2: '#8b5cf6',
      onAccent: '#0f0420', border: '#34195e',
    },
    bg: { kind: 'shapes', accentShape: 'circle' },
    shape: { radius: 28, accentStyle: 'block', cardElevation: true },
    motif: 'index',
    coverGradient: 'linear-gradient(135deg, #e879f9 0%, #8b5cf6 100%)',
  }),
  // ── חדשים ─────────────────────────────────────────────────────
  defineTheme({
    id: 'editorial',
    label: 'מגזין',
    family: 'print-editorial',
    blurb: 'נקי, אוורירי, טיפוגרפי — מסמך/מאמר/מותג.',
    fonts: { display: F.miriam, body: F.alef },
    colors: {
      bg: '#faf7f2', bgAlt: '#efe9df', surface: '#ffffff',
      text: '#1c1917', muted: '#6b6258', accent: '#b91c1c', accent2: '#1c1917',
      onAccent: '#ffffff', border: '#e2dbd0',
    },
    bg: { kind: 'grid' },
    shape: { radius: 6, accentStyle: 'underline', cardElevation: false },
    motif: 'index',
    coverGradient: 'linear-gradient(135deg, #b91c1c 0%, #1c1917 100%)',
  }),
  defineTheme({
    id: 'aurora',
    label: 'אורורה',
    family: 'tech-gradient',
    blurb: 'מודרני, גרדיאנטים רכים, טק/סטארטאפ.',
    fonts: { display: F.rubik, body: F.assistant },
    colors: {
      bg: '#0a0f1e', bgAlt: '#101a33', surface: '#101b35',
      text: '#f0f9ff', muted: '#94a8c9', accent: '#2dd4bf', accent2: '#a855f7',
      onAccent: '#031416', border: '#1d2b4a',
    },
    bg: { kind: 'mesh', blobs: ['accent', 'accent2'] },
    shape: { radius: 24, accentStyle: 'rail', cardElevation: true },
    motif: 'index',
    coverGradient: 'linear-gradient(135deg, #2dd4bf 0%, #a855f7 100%)',
  }),
];

// פלטת accents לרוטציה per-slide — צבעים הרמוניים שקריאים על רקע ה-theme.
// נותן לכל שקף נוכחות צבעונית משלו בלי לצאת מהשפה של ה-theme.
export const THEME_ACCENTS = {
  premium: ['#38bdf8', '#6366f1', '#22d3ee', '#34d399', '#a78bfa', '#2dd4bf', '#818cf8', '#06b6d4', '#4ade80', '#f472b6', '#fbbf24', '#fb7185'],
  cinematic: ['#f59e0b', '#f43f5e', '#fb923c', '#fbbf24', '#fb7185', '#fca5a5', '#fdba74', '#f87171', '#facc15', '#e879f9', '#2dd4bf', '#38bdf8'],
  academic: ['#2563eb', '#0ea5e9', '#4f46e5', '#0891b2', '#7c3aed', '#0d9488', '#1d4ed8', '#0369a1', '#9333ea', '#c2410c', '#15803d', '#be123c'],
  bold: ['#e879f9', '#8b5cf6', '#22d3ee', '#fb7185', '#facc15', '#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#2dd4bf', '#fb923c', '#4ade80'],
  editorial: ['#b91c1c', '#0f766e', '#b45309', '#1c1917', '#7c3aed', '#1d4ed8', '#9f1239', '#115e59', '#854d0e', '#4338ca', '#166534', '#a21caf'],
  aurora: ['#2dd4bf', '#a855f7', '#38bdf8', '#f472b6', '#facc15', '#4ade80', '#22d3ee', '#c084fc', '#60a5fa', '#fb7185', '#5eead4', '#fcd34d'],
};

export default core;
