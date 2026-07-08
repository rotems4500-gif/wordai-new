// ═══════════════════════════════════════════════════════════════
// themes/_schema.js — סכימת theme מורחבת + נורמליזציה.
// theme = *שפת עיצוב* שלמה (ראה deckThemes.js). כאן:
//   F            — מפת font-stacks משותפת לכל משפחות ה-themes.
//   defineTheme  — מסמן זהות (readability בקבצי המשפחה).
//   resolveTheme — ממלא שדות אופציונליים חדשים עם defaults שנגזרים
//                  מהשדות הקיימים, כך שה-6 הישנים לא משתנים.
// ═══════════════════════════════════════════════════════════════

// פונטים — כולם כבר נטענים ב-index.html (Google Fonts).
export const F = {
  rubik: "'Rubik', 'Segoe UI', sans-serif",          // display גאומטרי נקי
  secular: "'Secular One', 'Rubik', sans-serif",     // display כבד לאימפקט
  frank: "'Frank Ruhl Libre', Georgia, serif",       // serif אלגנטי
  miriam: "'Miriam Libre', 'Rubik', sans-serif",     // display עם אופי
  heebo: "'Heebo', 'Segoe UI', sans-serif",          // body נייטרלי
  assistant: "'Assistant', 'Segoe UI', sans-serif",  // body מודרני
  alef: "'Alef', 'Segoe UI', sans-serif",            // body קריא
  suez: "'Suez One','Frank Ruhl Libre',serif",
  fredoka: "'Fredoka','Assistant',sans-serif",
  karantina: "'Karantina','Secular One',sans-serif",
};

// מסמן זהות — עוטף אובייקט theme בקבצי המשפחה לקריאוּת בלבד.
export function defineTheme(obj) {
  return obj;
}

// רשימות enum לוֶלידציה/UI עתידיים.
export const HEADING_TREATMENTS = ['bar', 'block', 'underline', 'rail', 'bracket', 'boxed', 'highlight', 'kickerRule', 'oversizeNumber'];
export const BULLET_STYLES = ['check', 'dash', 'square', 'arrow', 'dot', 'plus', 'number'];
export const CARD_STYLES = ['elevated', 'flat', 'outline', 'glass'];
export const COVER_STYLES = ['gradient', 'split', 'poster', 'typographic', 'geo', 'editorial', 'terminal'];
export const SECTION_STYLES = ['gradient', 'numbered', 'sidebar', 'poster'];
export const TEXTURE_KINDS = ['none', 'noise', 'grain', 'halftone', 'topo', 'dotmatrix', 'scanlines', 'crosshatch'];
export const FOOTER_STYLES = ['minimal', 'ruled', 'boxed', 'none'];
export const DIVIDER_STYLES = ['line', 'dotted', 'gradient', 'zigzag'];
export const IMAGE_TREATMENTS = ['plain', 'rounded', 'frame', 'border', 'duotone', 'polaroid'];

// נורמליזציה: ממלא שדות חדשים עם defaults נגזרים. ה-themes הישנים
// (בלי השדות האלה) יוצאים זהים לחלוטין בכל השדות המקוריים.
export function resolveTheme(raw) {
  const t = { ...raw };
  t.family ??= 'classic';
  t.accents ??= null;
  t.texture ??= { kind: 'none' };
  t.decorPack ??= null;
  t.coverStyle ??= 'gradient';
  t.sectionStyle ??= 'gradient';
  t.headingTreatment ??= raw.shape?.accentStyle ?? 'bar';
  t.bulletStyle ??= 'check';
  t.cardStyle ??= (raw.shape?.cardElevation ? 'elevated' : 'flat');
  t.dividerStyle ??= 'line';
  t.footerStyle ??= 'minimal';
  t.image ??= { treatment: 'plain' };
  return t;
}
