// ═══════════════════════════════════════════════════════════════
// deckThemes.js — ערכות עיצוב למצגת.
// כל theme מגדיר צבעים/פונט פעם אחת, וממנו נגזרים גם רנדר ה-CSS
// וגם מיפוי הצבעים ל-PPTX (pptxgenjs מצפה ל-hex בלי #).
// ═══════════════════════════════════════════════════════════════

export const DECK_THEMES = [
  {
    id: 'premium',
    label: 'פרימיום',
    blurb: 'נקי ויוקרתי — הנהלה, מכירה, פיץ׳.',
    fontFamily: "'Heebo', 'Segoe UI', sans-serif",
    colors: {
      bg: '#0f172a',
      bgAlt: '#1e293b',
      surface: '#111c33',
      text: '#f8fafc',
      muted: '#94a3b8',
      accent: '#22d3ee',
      accent2: '#0ea5e9',
      onAccent: '#04121f',
    },
    coverGradient: 'linear-gradient(135deg, #0ea5e9 0%, #22d3ee 100%)',
  },
  {
    id: 'cinematic',
    label: 'קולנועי',
    blurb: 'פתיחים חזקים, נראות עשירה, אימפקט.',
    fontFamily: "'Heebo', 'Segoe UI', sans-serif",
    colors: {
      bg: '#1a1206',
      bgAlt: '#2b1d09',
      surface: '#241708',
      text: '#fff7ed',
      muted: '#d6b88f',
      accent: '#f59e0b',
      accent2: '#f43f5e',
      onAccent: '#1a1206',
    },
    coverGradient: 'linear-gradient(135deg, #f59e0b 0%, #f43f5e 100%)',
  },
  {
    id: 'academic',
    label: 'אקדמי',
    blurb: 'היררכיה ברורה, פחות רעש, יותר טיעון.',
    fontFamily: "'Heebo', 'Segoe UI', sans-serif",
    colors: {
      bg: '#ffffff',
      bgAlt: '#f1f5f9',
      surface: '#f8fafc',
      text: '#0f172a',
      muted: '#475569',
      accent: '#2563eb',
      accent2: '#4f46e5',
      onAccent: '#ffffff',
    },
    coverGradient: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
  },
  {
    id: 'bold',
    label: 'נועז',
    blurb: 'ליינים חדים, שקופיות קצרות, אימפקט גבוה.',
    fontFamily: "'Heebo', 'Segoe UI', sans-serif",
    colors: {
      bg: '#10071f',
      bgAlt: '#1d0b38',
      surface: '#170a2b',
      text: '#faf5ff',
      muted: '#c4b5fd',
      accent: '#d946ef',
      accent2: '#8b5cf6',
      onAccent: '#10071f',
    },
    coverGradient: 'linear-gradient(135deg, #d946ef 0%, #8b5cf6 100%)',
  },
];

export const DEFAULT_THEME_ID = 'premium';

export const getThemeById = (themeId) =>
  DECK_THEMES.find((t) => t.id === themeId) || DECK_THEMES.find((t) => t.id === DEFAULT_THEME_ID);

// hex בלי '#' עבור pptxgenjs
export const hex = (color) => String(color || '').replace('#', '').toUpperCase();
