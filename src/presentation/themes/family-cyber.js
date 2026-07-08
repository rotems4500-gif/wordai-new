// family-cyber — neon (סייברפאנק, ציאן+מגנטה) + terminal (טרמינל רטרו, ירוק זרחני).
import { F, defineTheme } from './_schema.js';

const family = [
  defineTheme({
    id: 'neon',
    label: 'נאון',
    family: 'cyber',
    blurb: 'לילה סייברפאנק — ציאן חשמלי ומגנטה זוהרת. טכנולוגיה, גיימינג, השקות.',
    fonts: { display: F.rubik, body: F.assistant },
    colors: {
      bg: '#05060a', bgAlt: '#0b0e18', surface: '#0e1220',
      text: '#f0f4ff', muted: '#9aa8c8', accent: '#22d3ee', accent2: '#f637ec',
      onAccent: '#05060a', border: '#1c2438',
    },
    bg: { kind: 'glow', corner: 'top-right' },
    shape: { radius: 6, accentStyle: 'block', cardElevation: false },
    motif: 'none',
    coverGradient: 'linear-gradient(140deg, #05060a 0%, #1a0b2e 65%, #0b1a2a 100%)',

    // ── סכימה מורחבת ──
    accents: [
      '#22d3ee', // electric cyan
      '#f637ec', // hot magenta
      '#a78bfa', // electric violet
      '#4ade80', // acid green
      '#fde047', // hot yellow
      '#fb923c', // laser orange
      '#38bdf8', // sky neon
      '#f472b6', // pink neon
      '#c084fc', // purple glow
      '#5eead4', // teal neon
      '#facc15', // gold neon
      '#818cf8', // indigo neon
    ],
    texture: { kind: 'scanlines', opacity: 0.05, scale: 1, color: 'accent' },
    decorPack: 'cyber',
    coverStyle: 'poster',
    sectionStyle: 'gradient',
    headingTreatment: 'bracket',
    bulletStyle: 'arrow',
    cardStyle: 'outline',
    dividerStyle: 'gradient',
    footerStyle: 'minimal',
    image: { treatment: 'border' },
  }),

  defineTheme({
    id: 'terminal',
    label: 'טרמינל',
    family: 'code',
    blurb: 'מסך זרחן ירוק, קווי סריקה וסמן מהבהב — מפתחים, דאטה, האקתונים.',
    fonts: { display: F.rubik, body: F.heebo },
    colors: {
      bg: '#0c0f0d', bgAlt: '#121712', surface: '#141a15',
      text: '#e8f5e8', muted: '#8fae94', accent: '#4ade80', accent2: '#fbbf24',
      onAccent: '#0c0f0d', border: '#22301f',
    },
    bg: { kind: 'grid' },
    shape: { radius: 8, accentStyle: 'bar', cardElevation: false },
    motif: 'none',
    coverGradient: 'linear-gradient(180deg, #0c0f0d 0%, #12210f 100%)',

    // ── סכימה מורחבת ──
    accents: [
      '#4ade80', // phosphor green
      '#fbbf24', // amber CRT
      '#86efac', // light phosphor
      '#a3e635', // lime terminal
      '#34d399', // emerald
      '#fcd34d', // light amber
      '#5eead4', // cyan terminal
      '#f87171', // alert red
      '#bef264', // yellow-green
      '#6ee7b7', // mint phosphor
      '#fde68a', // pale amber
      '#f0fdf4', // paper white
    ],
    texture: { kind: 'dotmatrix', opacity: 0.04, scale: 1, color: 'accent' },
    decorPack: 'terminal',
    coverStyle: 'terminal',
    sectionStyle: 'numbered',
    headingTreatment: 'bracket',
    bulletStyle: 'arrow',
    cardStyle: 'outline',
    dividerStyle: 'dotted',
    footerStyle: 'boxed',
    image: { treatment: 'frame' },
  }),
];

export default family;
