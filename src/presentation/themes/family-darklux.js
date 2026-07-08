// family-darklux — obsidian (יוקרה כהה, זהב שמפניה) + deco (ארט-דקו, אמרלד+זהב).
import { F, defineTheme } from './_schema.js';

const family = [
  defineTheme({
    id: 'obsidian',
    label: 'אובסידיאן',
    family: 'dark-lux',
    blurb: 'שחור עמוק וזהב מוברש — יוקרה, הנהלה בכירה, פרימיום אמיתי.',
    fonts: { display: F.frank, body: F.heebo },
    colors: {
      bg: '#0a0a0c', bgAlt: '#141317', surface: '#17161b',
      text: '#f4f0e6', muted: '#a89f8c', accent: '#c9a961', accent2: '#9c7a4a',
      onAccent: '#1a1408', border: '#2e2a22',
    },
    bg: { kind: 'glow', corner: 'top-right' },
    shape: { radius: 8, accentStyle: 'bar', cardElevation: false },
    motif: 'none',
    coverGradient: 'linear-gradient(150deg, #0a0a0c 0%, #1c1812 70%, #2a2214 100%)',

    // ── סכימה מורחבת ──
    accents: [
      '#c9a961', // champagne gold
      '#d8bc7a', // light gold
      '#b08d4f', // bronze gold
      '#e3d3a8', // pale champagne
      '#9c7a4a', // bronze
      '#d4c08a', // sand gold
      '#c2955c', // amber gold
      '#efe3c0', // ivory
      '#b8a06a', // olive gold
      '#d9a86a', // warm terracotta-gold
      '#a9b08a', // muted sage
      '#cbb27e', // wheat
    ],
    texture: { kind: 'grain', opacity: 0.05, scale: 1, color: 'muted' },
    decorPack: 'darklux',
    coverStyle: 'poster',
    sectionStyle: 'numbered',
    headingTreatment: 'kickerRule',
    bulletStyle: 'dash',
    cardStyle: 'outline',
    dividerStyle: 'line',
    footerStyle: 'ruled',
    image: { treatment: 'frame' },
  }),

  defineTheme({
    id: 'deco',
    label: 'ארט דקו',
    family: 'art-deco',
    blurb: 'אמרלד עמוק וזהב מטאלי, גאומטריה סימטרית — גטסבי, אירועים, מותג נועז.',
    fonts: { display: F.suez, body: F.assistant },
    colors: {
      bg: '#0a2e26', bgAlt: '#0e3a30', surface: '#104035',
      text: '#f2ead2', muted: '#a8b8a4', accent: '#d4af37', accent2: '#a34a5f',
      onAccent: '#14100a', border: '#2a5246',
    },
    bg: { kind: 'glow', corner: 'top-right' },
    shape: { radius: 2, accentStyle: 'underline', cardElevation: false },
    motif: 'index',
    coverGradient: 'linear-gradient(160deg, #0a2e26 0%, #0e3d31 55%, #123f2f 100%)',

    // ── סכימה מורחבת ──
    accents: [
      '#d4af37', // metallic gold
      '#e5c96a', // light gold
      '#c39b2e', // deep gold
      '#f0e2b0', // cream gold
      '#7ec9a8', // light jade
      '#e8d290', // champagne
      '#9fdcc0', // seafoam
      '#d9b85c', // brass
      '#d98a9a', // dusty rose
      '#efdfa8', // pale brass
      '#a8d2b8', // mint jade
      '#e0c078', // honey gold
    ],
    texture: { kind: 'halftone', opacity: 0.04, scale: 1, color: 'accent' },
    decorPack: 'deco',
    coverStyle: 'geo',
    sectionStyle: 'poster',
    headingTreatment: 'boxed',
    bulletStyle: 'plus',
    cardStyle: 'outline',
    dividerStyle: 'gradient',
    footerStyle: 'ruled',
    image: { treatment: 'border', borderColor: '#d4af37' },
  }),
];

export default family;
