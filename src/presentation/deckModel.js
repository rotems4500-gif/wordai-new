// ═══════════════════════════════════════════════════════════════
// deckModel.js — מודל הנתונים של מצגת (deck). מקור האמת היחיד.
// מצגת = אובייקט JSON עם מערך שקופיות. לא HTML, לא TipTap.
// ═══════════════════════════════════════════════════════════════

import { DECK_THEMES, DEFAULT_THEME_ID } from './deckThemes';

// פריסות שקופית נתמכות. כל layout יודע אילו שדות הוא מציג.
export const SLIDE_LAYOUTS = [
  { id: 'cover',         label: 'שער',            hasImage: true,  fields: ['title', 'subtitle'] },
  { id: 'section',       label: 'מפריד נושא',     hasImage: false, fields: ['title', 'subtitle'] },
  { id: 'title-bullets', label: 'כותרת + נקודות', hasImage: false, fields: ['title', 'bullets'] },
  { id: 'image-right',   label: 'טקסט + תמונה',   hasImage: true,  fields: ['title', 'bullets'] },
  { id: 'image-left',    label: 'תמונה + טקסט',   hasImage: true,  fields: ['title', 'bullets'] },
  { id: 'image-full',    label: 'תמונה מלאה',     hasImage: true,  fields: ['title', 'subtitle'] },
  { id: 'two-column',    label: 'שתי עמודות',     hasImage: false, fields: ['title', 'columns'] },
  { id: 'comparison',    label: 'השוואה',         hasImage: false, fields: ['title', 'columns'] },
  { id: 'stat',          label: 'מספרים / נתונים', hasImage: false, fields: ['title', 'stats'] },
  { id: 'steps',         label: 'שלבים / תהליך',  hasImage: false, fields: ['title', 'steps'] },
  { id: 'agenda',        label: 'סדר יום',        hasImage: false, fields: ['title', 'bullets'] },
  { id: 'timeline',      label: 'ציר זמן',        hasImage: false, fields: ['title', 'steps'] },
  { id: 'big-statement', label: 'משפט מפתח',      hasImage: false, fields: ['body', 'subtitle'] },
  { id: 'quote',         label: 'ציטוט',          hasImage: false, fields: ['body', 'subtitle'] },
  { id: 'closing',       label: 'סיכום / סיום',   hasImage: true,  fields: ['title', 'bullets'] },
];

export const SLIDE_LAYOUT_IDS = SLIDE_LAYOUTS.map((l) => l.id);

export const getLayout = (layoutId) =>
  SLIDE_LAYOUTS.find((l) => l.id === layoutId) || SLIDE_LAYOUTS[2];

export const layoutHasImage = (layoutId) => Boolean(getLayout(layoutId)?.hasImage);

// ── יצירת מזהים ייחודיים ─────────────────────────────────────────
let idCounter = 0;
const makeId = (prefix = 'slide') => {
  idCounter += 1;
  const stamp = (typeof performance !== 'undefined' && performance.now)
    ? Math.floor(performance.now())
    : idCounter;
  return `${prefix}-${stamp}-${idCounter}`;
};

// ── factory לשקופית בודדת ───────────────────────────────────────
export const createSlide = (overrides = {}) => ({
  id: makeId('slide'),
  layout: 'title-bullets',
  title: '',
  subtitle: '',
  kicker: '',             // תווית עליונה קטנה מעל הכותרת (אופציונלי)
  bullets: [],            // string[]
  body: '',               // טקסט חופשי (ציטוט / פסקה)
  columns: [              // לפריסת two-column/comparison: [{ heading, bullets[] }, ...]
    { heading: '', bullets: [] },
    { heading: '', bullets: [] },
  ],
  stats: [],              // לפריסת stat: [{ value, label, caption }]
  steps: [],              // לפריסת steps: [{ title, body }]
  image: null,            // { source:'stock'|'ai'|'upload'|'chart'|'infographic', url, dataUrl, query, alt, attribution, model, provider, prompt, pending }
  bgImage: null,          // רקע מחולל: { dataUrl, url, opacity, scrim, prompt, model }
  video: null,            // סרטון שנוצר ב-AI: { dataUrl, mime, prompt, model } — תופס את חריץ התמונה בפריסה
  visual: '',             // '' | 'chart' | 'infographic' — המלצת המודל לסוג הוויזואל
  notes: '',              // הערות מרצה
  accent: '',             // override צבע אקסנט (אופציונלי)
  bgVariant: '',          // '' / 'auto' = רוטציה אוטומטית | id מתוך BG_VARIANTS
  exportMode: '',         // '' = אוטומטי לפי הפריסה | 'image' | 'native'
  ...overrides,
});

// ── factory לדק שלם ─────────────────────────────────────────────
export const createDeck = (overrides = {}) => ({
  id: makeId('deck'),
  title: 'מצגת חדשה',
  themeId: DEFAULT_THEME_ID,
  meta: { audience: '', goal: '', topic: '' },
  slides: [],
  ...overrides,
});

// ── נורמליזציה של תמונה ──────────────────────────────────────────
export const IMAGE_SOURCES = ['stock', 'ai', 'upload', 'chart', 'infographic'];

const normalizeImage = (image) => {
  if (!image || typeof image !== 'object') return null;
  const url = String(image.url || '').trim();
  const dataUrl = String(image.dataUrl || '').trim();
  const query = String(image.query || '').trim();
  // ה-query נשאר כמו שהוא (אנגלית, נשלח למנוע התמונות); ה-alt הוא טקסט מוצג ⇒ מנוקה.
  const alt = sanitizeSlideText(image.alt);
  // ⚠️ בעבר תמונה בלי url/dataUrl נזרקה — וכך ה-query שהמודל מייצר לכל שקופית
  // ("image": { query, alt }) נמחק בשקט, והצינור "צור את התמונות החסרות" מת.
  // עכשיו נשמרת כ-placeholder: ה-renderer כבר יודע להציג אותה, והיוצר יודע למלא.
  if (!url && !dataUrl && !query && !alt) return null;
  const source = IMAGE_SOURCES.includes(image.source) ? image.source : 'stock';
  return {
    source,
    url,
    dataUrl,
    query,
    alt,
    attribution: String(image.attribution || '').trim(),
    // provenance ליצירה חוזרת: איזה מודל/ספק יצר, ומה היה ה-prompt המלא.
    model: String(image.model || '').trim(),
    provider: String(image.provider || '').trim(),
    prompt: String(image.prompt || '').trim(),
    pending: !url && !dataUrl,
  };
};

// ── נורמליזציה של סרטון ──────────────────────────────────────────
// ⚠️ סרטון נשמר כ-dataUrl מוטמע בגוף המצגת (IndexedDB) ומוטמע שוב ב-PPTX,
// ולכן יש תקרה קשיחה: מעל ~15MB בינארי הרשומה נזרקת ולא נשמרת בשקט חלקית.
export const VIDEO_MIMES = ['video/mp4', 'video/webm'];
export const MAX_VIDEO_DATA_URL_CHARS = 20_000_000;

const normalizeVideo = (video) => {
  if (!video || typeof video !== 'object') return null;
  const dataUrl = String(video.dataUrl || '').trim();
  if (!dataUrl.startsWith('data:video/')) return null;
  if (dataUrl.length > MAX_VIDEO_DATA_URL_CHARS) return null;
  // ה-mime הסמכותי הוא זה שבתוך ה-dataUrl; השדה הנפרד רק מגבה אותו.
  const fromUrl = dataUrl.slice(5).split(';')[0].trim().toLowerCase();
  const declared = String(video.mime || '').trim().toLowerCase();
  const mime = VIDEO_MIMES.includes(fromUrl)
    ? fromUrl
    : (VIDEO_MIMES.includes(declared) ? declared : '');
  if (!mime) return null;
  return {
    dataUrl, // ⚠️ לא עובר sanitize — זה payload בינארי, לא טקסט מוצג
    mime,
    prompt: String(video.prompt || '').trim(),
    model: String(video.model || '').trim(),
  };
};

// רקע מחולל לשקופית — נפרד מ-image כדי שלא יתנגש בתוכן של הפריסה.
const normalizeBgImage = (bgImage) => {
  if (!bgImage || typeof bgImage !== 'object') return null;
  const url = String(bgImage.url || '').trim();
  const dataUrl = String(bgImage.dataUrl || '').trim();
  if (!url && !dataUrl) return null;
  const opacityRaw = Number(bgImage.opacity);
  return {
    url,
    dataUrl,
    opacity: Number.isFinite(opacityRaw) ? Math.min(1, Math.max(0.05, opacityRaw)) : 0.55,
    // scrim = שכבת צבע-הרקע מעל התמונה, כדי שהטקסט יישאר קריא.
    scrim: bgImage.scrim === false ? false : true,
    prompt: String(bgImage.prompt || '').trim(),
    model: String(bgImage.model || '').trim(),
  };
};

// ── ניקוי טקסט שהגיע מ-LLM ───────────────────────────────────────
// כל שדה טקסט בשקופית אמור להיות טקסט נקי בעברית. המודל בכל זאת מדליף
// markdown, תגי HTML, ישויות, תווי כיווניות וסימני תבליט — והם מגיעים כמו
// שהם ל-render ול-PPTX. פונקציה טהורה, ללא תלות ב-DOM (רצה גם ב-Node).
export const sanitizeSlideText = (value) => {
  if (value == null) return '';
  let text = String(value);
  // 1. תווי בקרה
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  // 2. תווי כיווניות (bidi) — שוברים את ה-RTL של המנוע שלנו
  text = text.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
  // 3. תגי HTML תחומים בלבד — '<' בודד בתוך טקסט ("<5%") נשאר
  text = text.replace(/<\/?[a-zA-Z][^<>]{0,80}>/g, '');
  // 4. ישויות HTML נפוצות (&amp; אחרון כדי ש-&amp;lt; לא ייפתח פעמיים)
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
  // 5. פירוק markdown — רק סמנים מזווגים, כך ש-"5*3" ו-"מנכ\"ל" שורדים
  text = text
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1');
  // תחיליות שורה (כותרת md / תבליט / מספור) — רק בתחילת המחרוזת
  text = text
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*[-*+•▸‣►]\s+/, '')
    .replace(/^\s*\d+\.\s+/, '');
  // 6. שלוש נקודות / אליפסיס תלויות בסוף
  text = text.replace(/\s*(\.{3}|…)\s*$/, '');
  // 7. רצפי רווחים → רווח יחיד
  return text.replace(/\s+/g, ' ').trim();
};

// accent שהגיע מהמודל הוא טקסט חופשי ("כחול", "rgb(…)") לא פחות מהפעמים שהוא hex.
// ערך לא-hex נשמר בעבר כמו שהוא והודלף ל-CSS ול-pptxgenjs. כאן נשאר רק hex תקין.
const normalizeAccent = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(withHash) ? withHash : '';
};

const toStringArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeSlideText(item))
    .filter(Boolean)
    .slice(0, 8);
};

// ── נורמליזציה של שקופית (כולל קלט גולמי מ-LLM) ──────────────────
export const normalizeSlide = (raw = {}) => {
  const base = createSlide();
  const layout = SLIDE_LAYOUT_IDS.includes(raw.layout) ? raw.layout : base.layout;

  let columns = base.columns;
  if (Array.isArray(raw.columns) && raw.columns.length) {
    columns = raw.columns.slice(0, 3).map((col) => ({
      heading: sanitizeSlideText(col?.heading),
      bullets: toStringArray(col?.bullets),
    }));
  }

  const stats = Array.isArray(raw.stats)
    ? raw.stats.slice(0, 4).map((s) => ({
        value: sanitizeSlideText(s?.value),
        label: sanitizeSlideText(s?.label),
        caption: sanitizeSlideText(s?.caption),
      })).filter((s) => s.value || s.label)
    : [];

  const steps = Array.isArray(raw.steps)
    ? raw.steps.slice(0, 6).map((s) => ({
        title: sanitizeSlideText(s?.title),
        body: sanitizeSlideText(s?.body),
      })).filter((s) => s.title || s.body)
    : [];

  return {
    ...base,
    id: String(raw.id || base.id),
    layout,
    title: sanitizeSlideText(raw.title),
    subtitle: sanitizeSlideText(raw.subtitle),
    kicker: sanitizeSlideText(raw.kicker),
    bullets: toStringArray(raw.bullets),
    body: sanitizeSlideText(raw.body),
    columns,
    stats,
    steps,
    image: normalizeImage(raw.image),
    bgImage: normalizeBgImage(raw.bgImage),
    video: normalizeVideo(raw.video),
    // המלצת ויזואל מהמודל: 'chart' (סדרת מספרים אמיתית) / 'infographic' (מבנה/תהליך).
    // מניע את כפתור "אינפוגרפיקה" לבחור כלי בלי לנחש, ומסומן ב-UI כהצעה.
    visual: ['chart', 'infographic'].includes(raw.visual) ? raw.visual : '',
    notes: sanitizeSlideText(raw.notes),
    accent: normalizeAccent(raw.accent),
    bgVariant: BG_VARIANT_IDS.includes(raw.bgVariant) ? raw.bgVariant : '',
    exportMode: ['image', 'native'].includes(raw.exportMode) ? raw.exportMode : '',
  };
};

// ── ספריית רקעי-שקף (variants) ───────────────────────────────────
// כל variant הוא טיפול רקע בצבעי ה-theme. רוטציה אוטומטית נותנת נוכחות
// שונה לכל שקף בלי שניים רצופים זהים. ה-render עצמו ב-slideBackgrounds.jsx.
export const BG_VARIANTS = [
  { id: 'auto', label: 'אוטומטי' },
  { id: 'none', label: 'נקי' },
  { id: 'mesh', label: 'ערפל' },
  { id: 'glowTR', label: 'זוהר עליון' },
  { id: 'glowBL', label: 'זוהר תחתון' },
  { id: 'shapes', label: 'עיגולים' },
  { id: 'grid', label: 'רשת נקודות' },
  { id: 'band', label: 'רצועה' },
  { id: 'arcTR', label: 'קשת ימין' },
  { id: 'arcBL', label: 'קשת שמאל' },
  { id: 'diagonal', label: 'אלכסון' },
  { id: 'ring', label: 'טבעת' },
  { id: 'stripes', label: 'פסים' },
  { id: 'dotsCorner', label: 'אשכול נקודות' },
  // ── variants חדשים (WP0.3) ──
  { id: 'waves', label: 'גלים' },
  { id: 'blobOutline', label: 'קווי מתאר' },
  { id: 'plusGrid', label: 'רשת פלוס' },
  { id: 'concentric', label: 'טבעות' },
  { id: 'halftoneCorner', label: 'הדפס רשת' },
  { id: 'topo', label: 'קווי גובה' },
  { id: 'confetti', label: 'קונפטי' },
  { id: 'circuit', label: 'מעגל מודפס' },
  { id: 'sunburst', label: 'קרני שמש' },
  { id: 'scanlines', label: 'קווי סריקה' },
  { id: 'crosshatch', label: 'שתי וערב' },
  { id: 'cornerBracket', label: 'סוגריים' },
  { id: 'gridLines', label: 'רשת אדריכלית' },
];
export const BG_VARIANT_IDS = BG_VARIANTS.map((v) => v.id);

// רצף הרוטציה האוטומטית (אינדקס שקף → variant). אין שניים רצופים זהים.
const AUTO_BG_SEQUENCE = ['mesh', 'arcTR', 'shapes', 'band', 'glowBL', 'grid', 'diagonal', 'ring', 'glowTR', 'stripes', 'dotsCorner'];
// פריסות עם טיפול רקע חזק משלהן — לא מוסיפים variant.
const OWN_BG_LAYOUTS = new Set(['cover', 'section', 'image-full']);

// ── decor packs — רצפי רוטציה בעלי אופי, אחד לכל משפחת theme ─────────
// theme.decorPack (מ-resolveTheme) בוחר את הרצף. null = התנהגות legacy (AUTO).
// כל רצף מערבב variants ישנים+חדשים בהתאם ל-vibe; אין שניים רצופים זהים.
export const DECOR_PACKS = {
  darklux:  ['gridLines', 'cornerBracket', 'glowTR', 'ring', 'sunburst', 'band', 'concentric', 'glowBL'],
  swiss:    ['plusGrid', 'gridLines', 'cornerBracket', 'diagonal', 'band', 'crosshatch', 'stripes'],
  cyber:    ['circuit', 'scanlines', 'glowTR', 'grid', 'concentric', 'gridLines', 'glowBL'],
  organic:  ['waves', 'topo', 'blobOutline', 'mesh', 'arcBL', 'concentric', 'arcTR'],
  memphis:  ['confetti', 'shapes', 'blobOutline', 'dotsCorner', 'ring', 'waves', 'stripes'],
  deco:     ['sunburst', 'concentric', 'cornerBracket', 'stripes', 'ring', 'band', 'gridLines'],
  mono:     ['crosshatch', 'gridLines', 'plusGrid', 'diagonal', 'scanlines', 'cornerBracket', 'stripes'],
  glass:    ['concentric', 'mesh', 'glowBL', 'ring', 'blobOutline', 'glowTR', 'arcTR'],
  pastel:   ['blobOutline', 'waves', 'dotsCorner', 'mesh', 'confetti', 'arcBL', 'concentric'],
  terminal: ['scanlines', 'gridLines', 'circuit', 'plusGrid', 'crosshatch', 'grid', 'band'],
  midnight: ['gridLines', 'band', 'glowBL', 'cornerBracket', 'sunburst', 'concentric', 'glowTR'],
  brutal:   ['cornerBracket', 'stripes', 'plusGrid', 'diagonal', 'shapes', 'gridLines', 'band'],
};

// מחזיר את רצף הרוטציה עבור theme — pack מוגדר אם קיים, אחרת AUTO (legacy).
export const getDecorSequence = (theme) => {
  const pack = theme?.decorPack;
  return (pack && DECOR_PACKS[pack]) ? DECOR_PACKS[pack] : AUTO_BG_SEQUENCE;
};

// deckDecorSeed — hash זעיר של מזהה הדק → היסט קבוע ברוטציית הקישוט/האקסנט.
// בלי זה כל מצגת מתחילה בדיוק באותו variant ובאותו accent, ושתי מצגות שונות
// נראות כמו תאומות. hash מקומי (ולא hashStyleSeed מ-aiService) כדי שה-renderer
// לא יגרור את מונוליט ה-AI לתוך הבאנדל של התצוגה/הייצוא.
export const deckDecorSeed = (deckId = '') => {
  const s = String(deckId || '');
  if (!s) return 0;
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

// resolveBgVariant(slide, index[, theme[, seedOffset]])
// הפרמטר השלישי theme אופציונלי ותאימות-לאחור מלאה: קריאה עם 2 ארגומנטים
// מתנהגת בדיוק כמו קודם (AUTO_BG_SEQUENCE). אם הועבר theme עם decorPack תקף,
// הרוטציה עוברת דרך אותו pack במקום ה-AUTO.
// seedOffset (deckDecorSeed) מזיז את נקודת ההתחלה ברצף — פר-דק, לא פר-שקף.
export const resolveBgVariant = (slide, index = 0, theme = null, seedOffset = 0) => {
  const v = slide?.bgVariant;
  if (v && v !== 'auto' && BG_VARIANT_IDS.includes(v)) return v;
  if (OWN_BG_LAYOUTS.has(slide?.layout)) return 'none';
  const seq = getDecorSequence(theme);
  const i = Number.isFinite(index) ? index : 0;
  const off = Number.isFinite(seedOffset) ? seedOffset : 0;
  return seq[(((i + off) % seq.length) + seq.length) % seq.length];
};

// ── מסלול ייצוא (hybrid) ─────────────────────────────────────────
// פריסות שמרונדרות כתמונה (חופש עיצוב מלא, פונט+bidi נצרבים נכון).
// השאר נשאר native-editable כדי שהטקסט/בולטים יישארו עריכים ב-PowerPoint.
export const IMAGE_EXPORT_LAYOUTS = new Set([
  'cover', 'section', 'quote', 'image-full', 'closing',
  'big-statement', 'stat', 'steps', 'comparison', 'agenda', 'timeline',
]);

export const getSlideExportMode = (slide) =>
  (slide?.exportMode === 'image' || slide?.exportMode === 'native')
    ? slide.exportMode
    : (IMAGE_EXPORT_LAYOUTS.has(slide?.layout) ? 'image' : 'native');

// ── נורמליזציה של דק שלם ─────────────────────────────────────────
export const normalizeDeck = (raw = {}) => {
  const themeId = DECK_THEMES.some((t) => t.id === raw.themeId) ? raw.themeId : DEFAULT_THEME_ID;
  const slidesSource = Array.isArray(raw.slides) ? raw.slides : [];
  const slides = slidesSource.map((slide) => normalizeSlide(slide));
  return {
    id: String(raw.id || createDeck().id),
    title: String(raw.title || 'מצגת חדשה').trim() || 'מצגת חדשה',
    themeId,
    // ערכה שנוצרה ב-AI (resolveTheme כבר מילא בה כל שדה) — נשמרת כמו שהיא
    // וגוברת על themeId ב-renderer ובייצוא. ערכה בלי colors נזרקת.
    customTheme: (raw.customTheme && raw.customTheme.colors) ? raw.customTheme : null,
    meta: {
      audience: String(raw.meta?.audience || '').trim(),
      goal: String(raw.meta?.goal || '').trim(),
      topic: String(raw.meta?.topic || '').trim(),
    },
    slides: slides.length ? slides : [normalizeSlide({ layout: 'cover', title: raw.title || 'מצגת חדשה' })],
  };
};

// ── עזרי עריכה אימוטביליים ───────────────────────────────────────
export const updateSlide = (deck, slideId, patch) => ({
  ...deck,
  slides: deck.slides.map((slide) =>
    slide.id === slideId ? { ...slide, ...(typeof patch === 'function' ? patch(slide) : patch) } : slide),
});

export const addSlideAfter = (deck, slideId, newSlide = createSlide()) => {
  const index = deck.slides.findIndex((s) => s.id === slideId);
  const slides = [...deck.slides];
  slides.splice(index < 0 ? slides.length : index + 1, 0, newSlide);
  return { ...deck, slides };
};

export const removeSlide = (deck, slideId) => {
  if (deck.slides.length <= 1) return deck;
  return { ...deck, slides: deck.slides.filter((s) => s.id !== slideId) };
};

export const moveSlide = (deck, slideId, direction) => {
  const index = deck.slides.findIndex((s) => s.id === slideId);
  if (index < 0) return deck;
  const target = index + (direction === 'up' ? -1 : 1);
  if (target < 0 || target >= deck.slides.length) return deck;
  const slides = [...deck.slides];
  [slides[index], slides[target]] = [slides[target], slides[index]];
  return { ...deck, slides };
};

export const getTheme = (themeId) =>
  DECK_THEMES.find((t) => t.id === themeId) || DECK_THEMES.find((t) => t.id === DEFAULT_THEME_ID) || DECK_THEMES[0];
