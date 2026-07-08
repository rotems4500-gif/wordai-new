// family-light — swiss (טיפוגרפי בינלאומי) + mono (מונוכרום מגזיני) + midnight (קורפורטיבי כהה-נקי).
import { F, defineTheme } from './_schema.js';

const family = [
  defineTheme({
    id: 'swiss',
    label: 'שוויצרי',
    family: 'light-swiss',
    blurb: 'לבן טהור, שחור דיו ואדום אות — הסגנון הבינלאומי. דיוק, משמעת, בהירות.',
    fonts: { display: F.rubik, body: F.heebo },
    colors: {
      bg: '#ffffff', bgAlt: '#f4f4f4', surface: '#fafafa',
      text: '#0a0a0a', muted: '#595959', accent: '#e0301e', accent2: '#0a0a0a',
      onAccent: '#ffffff', border: '#d9d9d9',
    },
    bg: { kind: 'grid' },
    shape: { radius: 0, accentStyle: 'bar', cardElevation: false },
    motif: 'index',
    coverGradient: 'linear-gradient(180deg, #ffffff 0%, #f2f2f2 100%)',

    // ── סכימה מורחבת ──
    accents: [
      '#e0301e', // signal red
      '#0a0a0a', // ink black
      '#4d4d4d', // dark gray
      '#1f5fa8', // swiss blue
      '#737373', // mid gray
      '#c24a12', // orange
      '#262626', // near black
      '#8c8c8c', // cool gray
      '#a8231a', // deep red
      '#595959', // gray
      '#33518a', // steel blue
      '#404040', // charcoal
    ],
    texture: { kind: 'none' },
    decorPack: 'swiss',
    coverStyle: 'typographic',
    sectionStyle: 'numbered',
    headingTreatment: 'kickerRule',
    bulletStyle: 'dash',
    cardStyle: 'flat',
    dividerStyle: 'line',
    footerStyle: 'ruled',
    image: { treatment: 'plain' },
  }),

  defineTheme({
    id: 'mono',
    label: 'מונוכרום',
    family: 'monochrome',
    blurb: 'גווני אפור טהורים ונגיעת אדום אחת — עריכתי, חד, בלתי מתפשר.',
    fonts: { display: F.miriam, body: F.heebo },
    colors: {
      bg: '#fafaf8', bgAlt: '#f0f0ec', surface: '#ffffff',
      text: '#141414', muted: '#5c5c5c', accent: '#111111', accent2: '#c1121f',
      onAccent: '#fafaf8', border: '#dcdcd6',
    },
    bg: { kind: 'grid' },
    shape: { radius: 2, accentStyle: 'underline', cardElevation: false },
    motif: 'none',
    coverGradient: 'linear-gradient(180deg, #fafaf8 0%, #ecece6 100%)',

    // ── סכימה מורחבת ──
    accents: [
      '#111111',
      '#c1121f', // the single red pop
      '#2b2b2b',
      '#1c1c1c',
      '#3d3d3d',
      '#222222',
      '#4f4f4f',
      '#161616',
      '#333333',
      '#292929',
      '#454545',
      '#1a1a1a',
    ],
    texture: { kind: 'crosshatch', opacity: 0.04, scale: 1, color: 'muted' },
    decorPack: 'mono',
    coverStyle: 'editorial',
    sectionStyle: 'sidebar',
    headingTreatment: 'highlight',
    bulletStyle: 'square',
    cardStyle: 'outline',
    dividerStyle: 'line',
    footerStyle: 'ruled',
    image: { treatment: 'duotone', duotone: ['#1a1a1a', '#fafaf8'] },
  }),

  defineTheme({
    id: 'midnight',
    label: 'חצות',
    family: 'corporate-clean',
    blurb: 'צפחה עמוקה וכחול יחיד ומזוקק — קורפורטיבי מודרני, רציני, נקי.',
    fonts: { display: F.rubik, body: F.heebo },
    colors: {
      bg: '#0f172a', bgAlt: '#16213c', surface: '#182644',
      text: '#f1f5f9', muted: '#94a6c4', accent: '#3b82f6', accent2: '#60a5fa',
      onAccent: '#ffffff', border: '#24365a',
    },
    bg: { kind: 'glow', corner: 'bottom-left' },
    shape: { radius: 14, accentStyle: 'bar', cardElevation: true },
    motif: 'none',
    coverGradient: 'linear-gradient(140deg, #0f172a 0%, #14275a 100%)',

    // ── סכימה מורחבת ──
    accents: [
      '#3b82f6', // blue
      '#2f6fd4', // deep blue
      '#4c8ff0', // sky blue
      '#2b5cb8', // navy blue
      '#5a9bf5', // light blue
      '#2864c8', // royal
      '#3d78dc', // azure
      '#1e56a8', // deep navy
      '#4a86e0', // cornflower
      '#336ecc', // sapphire
      '#2d62b8', // ocean
      '#4580d8', // steel blue
    ],
    texture: { kind: 'none' },
    decorPack: 'midnight',
    coverStyle: 'split',
    sectionStyle: 'gradient',
    headingTreatment: 'bar',
    bulletStyle: 'dot',
    cardStyle: 'elevated',
    dividerStyle: 'line',
    footerStyle: 'ruled',
    image: { treatment: 'rounded', radius: 14 },
  }),
];

export default family;
