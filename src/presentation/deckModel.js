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
  bullets: [],            // string[]
  body: '',               // טקסט חופשי (ציטוט / פסקה)
  columns: [              // לפריסת two-column: [{ heading, bullets[] }, ...]
    { heading: '', bullets: [] },
    { heading: '', bullets: [] },
  ],
  image: null,            // { source:'stock'|'ai'|'upload', url, dataUrl, query, alt, attribution }
  notes: '',              // הערות מרצה
  accent: '',             // override צבע אקסנט (אופציונלי)
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
const normalizeImage = (image) => {
  if (!image || typeof image !== 'object') return null;
  const url = String(image.url || '').trim();
  const dataUrl = String(image.dataUrl || '').trim();
  if (!url && !dataUrl) return null;
  const source = ['stock', 'ai', 'upload'].includes(image.source) ? image.source : 'stock';
  return {
    source,
    url,
    dataUrl,
    query: String(image.query || '').trim(),
    alt: String(image.alt || '').trim(),
    attribution: String(image.attribution || '').trim(),
  };
};

const toStringArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item == null ? '' : item).trim())
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
      heading: String(col?.heading || '').trim(),
      bullets: toStringArray(col?.bullets),
    }));
  }

  return {
    ...base,
    id: String(raw.id || base.id),
    layout,
    title: String(raw.title || '').trim(),
    subtitle: String(raw.subtitle || '').trim(),
    bullets: toStringArray(raw.bullets),
    body: String(raw.body || '').trim(),
    columns,
    image: normalizeImage(raw.image),
    notes: String(raw.notes || '').trim(),
    accent: String(raw.accent || '').trim(),
  };
};

// ── נורמליזציה של דק שלם ─────────────────────────────────────────
export const normalizeDeck = (raw = {}) => {
  const themeId = DECK_THEMES.some((t) => t.id === raw.themeId) ? raw.themeId : DEFAULT_THEME_ID;
  const slidesSource = Array.isArray(raw.slides) ? raw.slides : [];
  const slides = slidesSource.map((slide) => normalizeSlide(slide));
  return {
    id: String(raw.id || createDeck().id),
    title: String(raw.title || 'מצגת חדשה').trim() || 'מצגת חדשה',
    themeId,
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
