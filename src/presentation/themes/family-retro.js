// ═══════════════════════════════════════════════════════════════
// family-retro — themes: memphis (ניאו-ממפיס, השראת מילאנו 1981).
// ═══════════════════════════════════════════════════════════════
import { F, defineTheme } from './_schema.js';

const retro = [
  defineTheme({
    id: 'memphis',
    label: 'ממפיס',
    family: 'neo-memphis',
    blurb: 'שובב וצבעוני — צורות גאומטריות, קווי מתאר, פופ שמח.',
    fonts: { display: F.fredoka, body: F.assistant },
    colors: {
      bg: '#fdf6ec', bgAlt: '#f7ead2', surface: '#fffdf7',
      text: '#1f1b2e', muted: '#6b6478', accent: '#ff6b6b', accent2: '#4ecdc4',
      onAccent: '#1f1b2e', border: '#e8dcc4',
    },
    bg: { kind: 'shapes', accentShape: 'circle' },
    shape: { radius: 18, accentStyle: 'block', cardElevation: false },
    motif: 'none',
    coverGradient: 'linear-gradient(135deg, #fdf6ec 0%, #ffc9a3 100%)',
    // ── שדות מורחבים ─────────────────────────────────────────────
    accents: [
      '#ff6b6b', '#4ecdc4', '#ffd93d', '#c9a6e8', '#8fe3c0', '#ff9f5b',
      '#ff9ecb', '#7fd4f0', '#c4e661', '#a3b4f5', '#ffc9a3', '#d68fef',
    ],
    texture: { kind: 'dotmatrix', opacity: 0.05, scale: 1, color: '#1f1b2e' },
    decorPack: 'memphis',
    coverStyle: 'geo',
    sectionStyle: 'poster',
    headingTreatment: 'highlight',
    bulletStyle: 'plus',
    cardStyle: 'outline',
    dividerStyle: 'zigzag',
    footerStyle: 'minimal',
    image: { treatment: 'polaroid' },
  }),
];

export default retro;
