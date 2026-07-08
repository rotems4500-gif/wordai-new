// ═══════════════════════════════════════════════════════════════
// family-brutal — neo-brutalism. גס, שטוח, ישיר. שחור על שנהב,
// בלוקים עם מסגרת שחורה עבה, צבעי פאנק חדים. אין צללים, אין טקסטורה —
// הברוטליזם הוא היעדר קישוט, לא תוספת שלו.
// ═══════════════════════════════════════════════════════════════
import { F, defineTheme } from './_schema.js';

const brutal = [
  defineTheme({
    id: 'brutal',
    label: 'ברוטליסטי',
    family: 'brutalist',
    blurb: 'גס, ישיר, בלי פילטרים — מסגרות שחורות עבות וצבעי פאנק.',
    fonts: { display: F.karantina, body: F.heebo },
    colors: {
      bg: '#f5f2ea', bgAlt: '#efe9dc', surface: '#ffffff',
      text: '#111111', muted: '#4d4b40', accent: '#c6f24e', accent2: '#ff5c00',
      onAccent: '#111111', border: '#111111',
    },
    bg: { kind: 'shapes', accentShape: 'square' },
    shape: { radius: 0, accentStyle: 'block', cardElevation: false },
    motif: 'index',
    coverGradient: 'linear-gradient(135deg, #f5f2ea 0%, #efe9dc 100%)',

    // ── שדות מורחבים ──────────────────────────────────────────────
    accents: [
      '#c6f24e', // acid lime — accent ראשי
      '#ff5c00', // hot orange — accent2
      '#ff4d7a', // hot pink
      '#29c5ff', // electric blue
      '#ffe14d', // punk yellow
      '#3df0d8', // bright cyan
      '#b98bff', // loud violet
      '#5eff8f', // bright green
      '#ffb020', // tangerine
      '#ff5252', // cherry red
      '#7fe7ff', // sky
      '#d4ff3d', // yellow-green
    ],
    texture: { kind: 'none', opacity: 0, scale: 1, color: '#111111' },
    decorPack: 'brutal',
    coverStyle: 'typographic',
    sectionStyle: 'numbered',
    headingTreatment: 'boxed',
    bulletStyle: 'square',
    cardStyle: 'outline',
    dividerStyle: 'line',
    footerStyle: 'boxed',
    image: { treatment: 'border', borderWidth: 4, borderColor: '#111111' },
  }),
];

export default brutal;
