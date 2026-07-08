// ═══════════════════════════════════════════════════════════════
// deckThemes.js — ערכות עיצוב למצגת (aggregator).
// theme = לא רק צבעים אלא *שפת עיצוב* שלמה:
//   colors  — פלטה
//   fonts   — זיווג display (כותרת) + body (גוף)
//   bg      — טיפול רקע שמרונדר מאחורי כל שקף (mesh/shapes/rail/grid/glow/plain)
//   shape   — radius, סגנון accent, האם כרטיסים מורמים
//   motif   — קישוט גלובלי (מספר שקף ענק / ללא)
// כל זה נגזר פעם אחת ומשמש גם את ה-CSS (SlideRenderer) וגם את ה-PPTX.
// pptxgenjs מצפה ל-hex בלי '#'.
//
// ה-themes עצמם חיים ב-themes/ (core + family-*). כאן רק צובר + helpers.
// resolveTheme ממלא שדות סכימה חדשים עם defaults נגזרים — ה-6 המקוריים
// יוצאים זהים בכל השדות המקוריים.
// ═══════════════════════════════════════════════════════════════
import { FAMILIES } from './themes/index.js';
import { F, resolveTheme } from './themes/_schema.js';
import { THEME_ACCENTS as CORE_THEME_ACCENTS } from './themes/core.js';

// re-export של מפת ה-font-stacks, למקרה שמישהו מייבא F מכאן.
export { F };

export const DECK_THEMES = FAMILIES.flat().map(resolveTheme);

// פלטת accents לרוטציה per-slide — צבעים הרמוניים שקריאים על רקע ה-theme.
export const THEME_ACCENTS = CORE_THEME_ACCENTS;

// accent לשקף בודד: override ידני גובר; אחרת theme.accents (סכימה חדשה),
// אחרת THEME_ACCENTS לפי id, אחרת [accent, accent2]. רוטציה לפי אינדקס.
export const getSlideAccent = (theme, slide, index = 0) => {
  if (slide?.accent && slide.accent.trim()) return slide.accent.trim();
  const list =
    (Array.isArray(theme?.accents) && theme.accents.length ? theme.accents : null) ||
    THEME_ACCENTS[theme?.id] ||
    [theme?.colors?.accent, theme?.colors?.accent2].filter(Boolean);
  if (!list.length) return theme?.colors?.accent || '#38bdf8';
  const i = Number.isFinite(index) ? index : 0;
  return list[((i % list.length) + list.length) % list.length];
};

export const DEFAULT_THEME_ID = 'premium';

export const getThemeById = (themeId) =>
  DECK_THEMES.find((t) => t.id === themeId) || DECK_THEMES.find((t) => t.id === DEFAULT_THEME_ID) || DECK_THEMES[0];

// hex בלי '#' עבור pptxgenjs
export const hex = (color) => String(color || '').replace('#', '').toUpperCase();

// שם המשפחה הראשון מתוך CSS font-stack ("'Rubik', 'Segoe UI', sans-serif" → "Rubik").
// pptxgenjs צריך שם פונט בודד ל-fontFace, לא stack שלם.
export const primaryFontName = (cssStack) => {
  const first = String(cssStack || '').split(',')[0].trim();
  const name = first.replace(/^['"]|['"]$/g, '').trim(); // מסיר גרשיים עוטפים
  return name || 'Heebo';
};

// שמות פונט (display + body) לייצוא native, נגזרים מ-font-stack של ה-theme.
export const getThemeFontNames = (theme) => ({
  display: primaryFontName(theme?.fonts?.display || theme?.fonts?.body) || 'Heebo',
  body: primaryFontName(theme?.fonts?.body || theme?.fonts?.display) || 'Heebo',
});

// בודק אם רקע ה-theme בהיר (משפיע על overlay/contrast בייצוא)
export const isLightTheme = (theme) => {
  const bg = String(theme?.colors?.bg || '').replace('#', '');
  if (bg.length < 6) return false;
  const r = parseInt(bg.slice(0, 2), 16);
  const g = parseInt(bg.slice(2, 4), 16);
  const b = parseInt(bg.slice(4, 6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 150;
};
