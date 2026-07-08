// family-organic — sandstone (אבן חול, אורגני-חמים) + pastel (פסטל, רך-חלומי).
import { F, defineTheme } from './_schema.js';

const family = [
  defineTheme({
    id: 'sandstone',
    label: 'אבן חול',
    family: 'organic-warm',
    blurb: 'חום אדמתי, אלגנטי ורגוע — סיפור, טבע, מותג אותנטי.',
    fonts: { display: F.frank, body: F.alef },
    colors: {
      bg: '#f3ece1', bgAlt: '#ece1d0', surface: '#f8f2e6',
      text: '#2d2419', muted: '#6b5f4e', accent: '#a5502d', accent2: '#5f7233',
      onAccent: '#faf6ee', border: '#e0d3bd',
    },
    bg: { kind: 'glow', corner: 'bottom-left' },
    shape: { radius: 16, accentStyle: 'underline', cardElevation: false },
    motif: 'none',
    coverGradient: 'linear-gradient(135deg, #f3ece1 0%, #e8c9ab 100%)',

    // ── סכימה מורחבת ──
    accents: [
      '#a5502d', // terracotta
      '#5f7233', // olive
      '#96631e', // ochre
      '#a8583f', // clay
      '#557047', // sage
      '#9c4a2e', // rust
      '#8a6a45', // sand-brown
      '#4f6a3a', // moss
      '#a45a5a', // dusty rose
      '#a8542e', // burnt sienna
      '#875f16', // deep gold
      '#954934', // brick
    ],
    texture: { kind: 'topo', opacity: 0.05, scale: 1, color: 'accent' },
    decorPack: 'organic',
    coverStyle: 'split',
    sectionStyle: 'sidebar',
    headingTreatment: 'underline',
    bulletStyle: 'dot',
    cardStyle: 'flat',
    dividerStyle: 'dotted',
    footerStyle: 'minimal',
    image: { treatment: 'rounded', radius: 16 },
  }),

  defineTheme({
    id: 'pastel',
    label: 'פסטל',
    family: 'soft-pastel',
    blurb: 'רך וחלומי, לוונדר ופסטלים עמוקים דיים לקריאות — מצגות אישיות, יצירתיות, לייף-סטייל.',
    fonts: { display: F.fredoka, body: F.assistant },
    colors: {
      bg: '#faf8fd', bgAlt: '#f3edfa', surface: '#ffffff',
      text: '#3d2c4a', muted: '#6f5f82', accent: '#7c5fc9', accent2: '#bf4771',
      onAccent: '#ffffff', border: '#ece3f5',
    },
    bg: { kind: 'mesh', blobs: ['accent', 'accent2'] },
    shape: { radius: 26, accentStyle: 'block', cardElevation: true },
    motif: 'none',
    coverGradient: 'linear-gradient(135deg, #ede7fb 0%, #fbe4ec 55%, #e3f5ec 100%)',

    // ── סכימה מורחבת ──
    accents: [
      '#7c5fc9', // lilac
      '#bf4771', // rose
      '#237571', // teal
      '#a85a26', // peach
      '#5f6fc4', // periwinkle
      '#2d7852', // mint-deep
      '#8a6a12', // butter-deep
      '#b53f28', // coral
      '#8a4a8f', // plum-berry
      '#2f6aa8', // sky-deep
      '#47702c', // moss-green
      '#a34a9c', // magenta
    ],
    texture: { kind: 'none' },
    decorPack: 'pastel',
    coverStyle: 'gradient',
    sectionStyle: 'gradient',
    headingTreatment: 'highlight',
    bulletStyle: 'dot',
    cardStyle: 'elevated',
    dividerStyle: 'gradient',
    footerStyle: 'minimal',
    image: { treatment: 'rounded', radius: 24 },
  }),
];

export default family;
