// family-tech — themes מתוכננים: glass (זכוכית / glassmorphism).
import { F, defineTheme } from './_schema.js';

const familyTech = [
  defineTheme({
    id: 'glass',
    label: 'זכוכית',
    family: 'glassmorphism',
    blurb: 'עומק אינדיגו-סגול, כרטיסי זכוכית זוהרים — עדין ומודרני.',
    fonts: { display: F.rubik, body: F.assistant },
    colors: {
      bg: '#1e1b4b', bgAlt: '#2e1a5e', surface: '#2c2569',
      text: '#f5f3ff', muted: '#c7c2e8', accent: '#a5b4fc', accent2: '#c4b5fd',
      onAccent: '#1e1b4b', border: '#3d3577',
    },
    bg: { kind: 'mesh', blobs: ['accent', 'accent2'] },
    shape: { radius: 24, accentStyle: 'boxed', cardElevation: true },
    motif: 'index',
    coverGradient: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 60%, #6d28d9 100%)',

    accents: [
      '#a5b4fc', '#e0e7ff', '#c4b5fd', '#ddd6fe',
      '#93c5fd', '#bfdbfe', '#d8b4fe', '#f0abfc',
      '#99f6e4', '#a7f3d0', '#fbcfe8', '#fecdd3',
    ],
    texture: { kind: 'noise', opacity: 0.04, scale: 1, color: '#e0e7ff' },
    decorPack: 'glass',
    coverStyle: 'gradient',
    sectionStyle: 'gradient',
    headingTreatment: 'boxed',
    bulletStyle: 'dot',
    cardStyle: 'glass',
    dividerStyle: 'gradient',
    footerStyle: 'minimal',
    image: { treatment: 'rounded', radius: 20 },
  }),
];

export default familyTech;
