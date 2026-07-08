// documentLayout — מודל layout ברמת מסמך (שוליים/כיוון/גודל/כותרות/מספרי עמוד/סימן מים/גבולות/צבע).
// מקור אמת יחיד גם לתצוגה (CSS) וגם לייצוא DOCX (browserDocxExport.buildDocxSectionFromLayout).

export const MARGIN_PRESETS_CM = {
  normal: 2.54,
  narrow: 1.27,
  moderate: 1.91,
  wide: 3.81,
  centered: 5,
};

export const PAGE_SIZES_CM = {
  a4: [21, 29.7],
  a3: [29.7, 42],
  letter: [21.59, 27.94],
  legal: [21.59, 35.56],
};

export const DEFAULT_DOCUMENT_LAYOUT = {
  margins: 'normal',            // מפתח מתוך MARGIN_PRESETS_CM
  orientation: 'portrait',      // portrait | landscape
  pageSize: 'a4',               // מפתח מתוך PAGE_SIZES_CM
  header: null,                 // { preset, text } | null
  footer: null,                 // { preset, text, pageNumber } | null
  pageNumbers: false,           // מספרי עמוד בכותרת תחתונה בייצוא
  watermark: null,              // { text, color, opacity } | null
  pageBorder: null,             // { style, color, sizePt } | null
  pageColor: '',                // צבע רקע עמוד (hex/css)
};

const LAYOUT_STORAGE_KEY = 'wordai_document_layout';

export const normalizeDocumentLayout = (raw = {}) => {
  const safe = raw && typeof raw === 'object' ? raw : {};
  return {
    ...DEFAULT_DOCUMENT_LAYOUT,
    ...safe,
    margins: MARGIN_PRESETS_CM[safe.margins] ? safe.margins : DEFAULT_DOCUMENT_LAYOUT.margins,
    orientation: safe.orientation === 'landscape' ? 'landscape' : 'portrait',
    pageSize: PAGE_SIZES_CM[safe.pageSize] ? safe.pageSize : DEFAULT_DOCUMENT_LAYOUT.pageSize,
  };
};

export const loadPersistedDocumentLayout = () => {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    return raw ? normalizeDocumentLayout(JSON.parse(raw)) : { ...DEFAULT_DOCUMENT_LAYOUT };
  } catch {
    return { ...DEFAULT_DOCUMENT_LAYOUT };
  }
};

export const persistDocumentLayout = (layout) => {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(normalizeDocumentLayout(layout)));
  } catch {
    // localStorage לא זמין — לא קריטי
  }
};

export const getLayoutMarginCm = (layout = DEFAULT_DOCUMENT_LAYOUT) => (
  MARGIN_PRESETS_CM[layout?.margins] || MARGIN_PRESETS_CM.normal
);

// גודל עמוד בפועל בס"מ, אחרי כיוון (landscape מחליף רוחב/גובה)
export const getLayoutPageSizeCm = (layout = DEFAULT_DOCUMENT_LAYOUT) => {
  const [w, h] = PAGE_SIZES_CM[layout?.pageSize] || PAGE_SIZES_CM.a4;
  return layout?.orientation === 'landscape' ? { width: h, height: w } : { width: w, height: h };
};

// css hex "#rrggbb"/"rgb(...)" → "RRGGBB" עבור docx (ללא #)
export const cssColorToDocxHex = (cssColor = '') => {
  const value = String(cssColor || '').trim();
  if (!value) return '';
  const hexMatch = value.match(/^#?([0-9a-f]{6})$/i);
  if (hexMatch) return hexMatch[1].toUpperCase();
  const shortHex = value.match(/^#?([0-9a-f]{3})$/i);
  if (shortHex) return shortHex[1].split('').map((c) => c + c).join('').toUpperCase();
  const rgbMatch = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    return [rgbMatch[1], rgbMatch[2], rgbMatch[3]]
      .map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }
  return '';
};
