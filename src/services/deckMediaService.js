// ═══════════════════════════════════════════════════════════════
// deckMediaService.js — שכבת המדיה של סטודיו המצגות:
//   1. תמונות פר-שקופית (prompt מודע-ערכה, לא הטקסט הגולמי של המשתמש)
//   2. אינפוגרפיקות — גרף מנתונים אמיתיים (QuickChart, חינם) או דיאגרמה מחוללת
//   3. רקעים מעוצבים לשקופית
//   4. יצירת ערכת עיצוב שלמה ב-AI (colors+fonts+enums → resolveTheme)
//
// כל תמונה עוברת דחיסה ל-JPEG לפני שהיא נשמרת ב-deck: מצגת עם 15 תמונות
// PNG מלאות הגיעה לעשרות MB, וייצוא ה-PPTX מטמיע אותן כ-base64.
// ═══════════════════════════════════════════════════════════════

import { generateAiImage } from './imageService';
import { renderQuickChart } from './chartService';
import { chatWithActiveProvider } from './aiService';
import { layoutHasImage } from '../presentation/deckModel';
import { resolveTheme } from '../presentation/themes/_schema';

const MAX_IMAGE_EDGE = 1280;
const JPEG_QUALITY = 0.86;

// ── דחיסה: dataUrl → JPEG מוקטן ──────────────────────────────────
export const compressImageDataUrl = async (dataUrl, { maxEdge = MAX_IMAGE_EDGE, quality = JPEG_QUALITY } = {}) => {
  const src = String(dataUrl || '');
  if (!src.startsWith('data:image/')) return src;
  if (typeof document === 'undefined' || typeof Image === 'undefined') return src;
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image decode failed'));
      el.src = src;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round((img.width || maxEdge) * scale));
    const height = Math.max(1, Math.round((img.height || maxEdge) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    // רקע לבן: JPEG בלי אלפא, ובלי זה שקיפות הופכת לשחור.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const out = canvas.toDataURL('image/jpeg', quality);
    return out && out.length < src.length ? out : src;
  } catch {
    return src;
  }
};

// ── תיאור הערכה כטקסט, להזרקה לפרומפט התמונה ─────────────────────
const describeThemeForPrompt = (theme = {}) => {
  const colors = theme.colors || {};
  const parts = [
    colors.bg ? `background ${colors.bg}` : '',
    colors.accent ? `accent ${colors.accent}` : '',
    colors.accent2 ? `secondary ${colors.accent2}` : '',
    theme.family ? `${theme.family} visual family` : '',
  ].filter(Boolean);
  return parts.join(', ');
};

const slideTextSummary = (slide = {}) => [
  slide.title,
  slide.subtitle,
  ...(Array.isArray(slide.bullets) ? slide.bullets : []),
  slide.body,
  ...(Array.isArray(slide.steps) ? slide.steps.map((s) => `${s?.title || ''} ${s?.body || ''}`) : []),
].filter(Boolean).join(' · ').slice(0, 600);

/**
 * buildSlideImagePrompt — פרומפט מודע-ערכה ומודע-תוכן.
 * בעבר נשלח הטקסט הגולמי מתיבת החיפוש, בלי סגנון ובלי יחס-גובה.
 */
export const buildSlideImagePrompt = (slide = {}, theme = {}, { style = 'photo', deck = null } = {}) => {
  const subject = String(slide?.image?.query || '').trim() || slideTextSummary(slide) || String(deck?.meta?.topic || '').trim();
  const palette = describeThemeForPrompt(theme);
  const styleLine = style === 'illustration'
    ? 'Modern flat vector illustration, clean shapes, generous negative space.'
    : style === 'abstract'
      ? 'Abstract non-representational composition: soft gradients, geometric shapes, no objects, no text.'
      : 'Editorial photograph, natural light, shallow depth of field, no text overlay.';
  return [
    `Create a 16:9 presentation visual. ${styleLine}`,
    palette ? `Match this color palette: ${palette}.` : '',
    'No words, letters, captions or watermarks anywhere in the image.',
    'Leave the composition uncluttered so slide text can sit on top comfortably.',
    `Subject: ${subject || 'abstract professional background'}`,
  ].filter(Boolean).join('\n');
};

const finishImage = async (raw, extra = {}) => ({
  source: 'ai',
  url: '',
  query: '',
  alt: '',
  attribution: 'נוצר ב-AI',
  ...extra,
  dataUrl: await compressImageDataUrl(raw.dataUrl || ''),
  model: raw.model || extra.model || '',
  provider: raw.provider || '',
  pending: false,
});

/**
 * generateSlideImage — תמונה לשקופית לפי הערכה והתוכן.
 * @param {object} opts { style:'photo'|'illustration'|'abstract', model, provider, signal }
 */
export const generateSlideImage = async (slide, theme, { style = 'photo', model = '', provider = '', signal, deck = null } = {}) => {
  const prompt = buildSlideImagePrompt(slide, theme, { style, deck });
  const raw = await generateAiImage(prompt, { featureId: 'presentations', model, provider, signal, aspectRatio: '16:9' });
  return finishImage(raw, {
    query: String(slide?.image?.query || '').trim() || String(slide?.title || '').trim(),
    alt: String(slide?.image?.alt || slide?.title || '').trim(),
    prompt,
  });
};

/**
 * generateSlideBackground — רקע מלא לשקופית (מופשט, בלי טקסט, בלי מוקד).
 * מוחזר לשדה bgImage הנפרד ולא ל-image, כדי לא לדרוס את תוכן הפריסה.
 */
export const generateSlideBackground = async (slide, theme, { model = '', provider = '', signal } = {}) => {
  const prompt = buildSlideImagePrompt(slide, theme, { style: 'abstract' });
  const raw = await generateAiImage(prompt, { featureId: 'presentations', model, provider, signal, aspectRatio: '16:9' });
  return {
    dataUrl: await compressImageDataUrl(raw.dataUrl || ''),
    url: '',
    opacity: 0.55,
    scrim: true,
    prompt,
    model: raw.model || model || '',
  };
};

const MAX_LABEL_CHARS = 40;
const cutLabel = (text) => {
  const clean = String(text || '').trim();
  return clean.length > MAX_LABEL_CHARS ? `${clean.slice(0, MAX_LABEL_CHARS - 1).trim()}…` : clean;
};

// שנה (1900-2100) היא בדרך כלל הציר ולא הערך — "בשנת 2019 עלה השיעור ל-42%".
const isYearToken = (token) => /^\d{4}$/.test(token) && Number(token) >= 1900 && Number(token) <= 2100;

/**
 * bulletToPoint — בולט אחד → { label, value }.
 * ⚠️ הגרסה הקודמת לקחה את **המספר הראשון** בשורה ומחקה אותו ממנה עם replace
 * גלובלי-ראשון: "2019: 42% מהמשיבים" נתן value=2019 ותווית "42% מהמשיבים".
 * כאן: אוספים את כל המספרים, מעדיפים את האחרון (הערך בא בדרך כלל אחרי ההקשר),
 * ומדלגים על שנה כשיש מספר אחר; מוסר רק המספר שנבחר.
 */
const bulletToPoint = (line) => {
  const text = String(line || '').trim();
  if (!text) return null;
  const matches = [...text.matchAll(/-?\d+(?:[.,]\d+)?/g)];
  if (!matches.length) return null;
  let chosen = matches[matches.length - 1];
  if (isYearToken(chosen[0]) && matches.length > 1) {
    const alt = [...matches].reverse().find((m) => !isYearToken(m[0]));
    if (alt) chosen = alt;
  }
  const value = Number(String(chosen[0]).replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  const start = chosen.index;
  const rest = text.slice(start + chosen[0].length);
  const end = start + chosen[0].length + (rest.startsWith('%') ? 1 : 0);
  const stripped = `${text.slice(0, start)}${text.slice(end)}`
    .replace(/[—–:\-]/g, ' ').replace(/\s+/g, ' ').trim();
  // תווית שנשחקה לכלום (למשל "42%") — עדיף הבולט המלא מאשר פריט בלי שם.
  const label = stripped.length >= 3
    ? stripped
    : text.replace(/\s+/g, ' ').trim();
  if (label.length < 3) return null;
  return { label: cutLabel(label), value };
};

// מספרים בתוכן השקופית = מועמד לגרף אמיתי (QuickChart) ולא לתמונה מחוללת.
const extractSlideSeries = (slide = {}) => {
  const stats = Array.isArray(slide.stats) ? slide.stats : [];
  const fromStats = stats
    .map((s) => ({ label: cutLabel(s?.label), value: Number(String(s?.value || '').replace(/[^\d.-]/g, '')) }))
    .filter((s) => s.label && Number.isFinite(s.value));
  if (fromStats.length >= 2) return fromStats;
  const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
  const fromBullets = bullets.map(bulletToPoint).filter(Boolean);
  return fromBullets.length >= 2 ? fromBullets : [];
};

/**
 * generateSlideInfographic — גרף QuickChart מדויק מהמספרים שבשקופית (**חינם**,
 * בלי מודל תמונה). אין סדרת מספרים ⇒ נזרקת שגיאה, והקורא ממשיך למבנה ויזואלי
 * מקורי (restructureSlideAsInfographic).
 *
 * ⚠️ היה כאן מסלול שני — דיאגרמה מחוללת במודל תמונה. הוא היה **קוד מת** (כל
 * הקוראים מעבירים force:'chart'), וגם פסול לגופו: מודלי תמונה משבשים עברית
 * בתוך התמונה. נמחק במכוון; טקסט עברי אמיתי מגיע מגרף או מפריסה מובנית.
 * @returns {Promise<object>} אובייקט image לשקופית
 */
export const generateSlideInfographic = async (slide, theme, { signal } = {}) => {
  const series = extractSlideSeries(slide);
  if (series.length < 2) throw new Error('לא נמצאו מספרים בשקופית — אפשר ליצור דיאגרמה במקום גרף.');
  const accents = (Array.isArray(theme?.accents) && theme.accents.length)
    ? theme.accents
    : [theme?.colors?.accent, theme?.colors?.accent2].filter(Boolean);
  const chart = {
    type: 'bar',
    data: {
      labels: series.map((s) => s.label),
      datasets: [{
        label: String(slide?.title || '').trim() || 'נתונים',
        data: series.map((s) => s.value),
        backgroundColor: series.map((_, i) => accents[i % Math.max(1, accents.length)] || '#2563EB'),
      }],
    },
    options: { plugins: { legend: { display: false } } },
  };
  const dataUrl = await renderQuickChart({ chart, width: 1280, height: 720, signal });
  return {
    source: 'chart',
    dataUrl: await compressImageDataUrl(dataUrl),
    url: '',
    query: String(slide?.title || '').trim(),
    alt: `תרשים: ${String(slide?.title || '').trim()}`,
    attribution: 'QuickChart — מהנתונים בשקופית',
    model: 'quickchart',
    provider: 'quickchart',
    prompt: '',
    pending: false,
  };
};

/**
 * restructureSlideAsInfographic — הופך את תוכן השקופית לפריסה מובנית מקורית
 * (שלבים / ציר זמן / השוואה / מספרים) במקום תמונה מחוללת.
 *
 * ⚠️ למה לא מודל תמונות: נמדד בפועל שמודלי התמונה משבשים עברית בתוך התמונה
 * ("העילקהר", "מה ליפום שמים") — אותיות שנראות עבריות אבל חסרות פשר. פריסה
 * מקורית מרנדרת טקסט אמיתי בצבעי הערכה, נשארת עריכה, ומיוצאת נייטיב ל-PPTX.
 * @returns {Promise<object>} patch לשקופית
 */
export const restructureSlideAsInfographic = async (slide, { signal } = {}) => {
  const content = slideTextSummary(slide);
  if (!content) throw new Error('אין מספיק תוכן בשקופית כדי לבנות אינפוגרפיקה.');
  const raw = await chatWithActiveProvider(
    [
      'הפוך את תוכן השקופית למבנה ויזואלי. בחר את הפריסה שהכי מתאימה לתוכן והחזר JSON תקין בלבד:',
      '{"layout":"steps|timeline|comparison|stat","title":"כותרת קצרה","kicker":"תווית קצרה (אופציונלי)",',
      ' "steps":[{"title":"שם השלב","body":"משפט קצר"}],',
      ' "columns":[{"heading":"צד א","bullets":["נקודה"]},{"heading":"צד ב","bullets":["נקודה"]}],',
      ' "stats":[{"value":"45%","label":"תיאור קצר","caption":"הקשר"}]}',
      'כללים: steps = תהליך/שלבים (3-5). timeline = כרונולוגיה. comparison = בדיוק 2 עמודות. stat = 2-4 מספרים בולטים.',
      'החזר רק את השדה שמתאים לפריסה שבחרת. טקסט בעברית, קצר וחד. אל תמציא מספרים שלא מופיעים בתוכן.',
      '',
      `תוכן השקופית: ${content}`,
    ].join('\n'),
    '',
    'אתה מעצב מצגות שממיר טקסט למבנה ויזואלי. JSON בלבד.',
    {
      skipAutomation: true,
      skipMultiModel: true,
      directChat: true,
      skipSkillSelection: true,
      strictFormatting: true,
      omitPersonalStyleStructureHints: true,
      forceSuppressResearchRouting: true,
      thinkingBudget: 0,
      ...(signal ? { signal } : {}),
    },
  );
  const parsed = extractJson(typeof raw === 'string' ? raw : raw?.text || '');
  const layout = ['steps', 'timeline', 'comparison', 'stat'].includes(parsed?.layout) ? parsed.layout : '';
  if (!layout) throw new Error('לא הצלחתי לבנות מבנה ויזואלי מהתוכן הזה. נסה "תמונה" במקום.');
  const patch = { layout, title: String(parsed.title || slide?.title || '').trim() };
  if (parsed.kicker) patch.kicker = String(parsed.kicker).trim().slice(0, 40);
  if (layout === 'steps' || layout === 'timeline') {
    const steps = (Array.isArray(parsed.steps) ? parsed.steps : [])
      .map((s) => ({ title: String(s?.title || '').trim(), body: String(s?.body || '').trim() }))
      .filter((s) => s.title || s.body).slice(0, 6);
    if (steps.length < 2) throw new Error('לא נמצאו מספיק שלבים לבניית אינפוגרפיקה.');
    patch.steps = steps;
  } else if (layout === 'comparison') {
    const columns = (Array.isArray(parsed.columns) ? parsed.columns : [])
      .map((c) => ({ heading: String(c?.heading || '').trim(), bullets: (Array.isArray(c?.bullets) ? c.bullets : []).map((b) => String(b || '').trim()).filter(Boolean) }))
      .filter((c) => c.heading || c.bullets.length).slice(0, 2);
    if (columns.length < 2) throw new Error('לא נמצאו שני צדדים להשוואה.');
    patch.columns = columns;
  } else {
    const stats = (Array.isArray(parsed.stats) ? parsed.stats : [])
      .map((s) => ({ value: String(s?.value ?? '').trim(), label: String(s?.label || '').trim(), caption: String(s?.caption || '').trim() }))
      .filter((s) => s.value || s.label).slice(0, 4);
    if (!stats.length) throw new Error('לא נמצאו מספרים בולטים בתוכן.');
    patch.stats = stats;
  }
  // ויזואל מובנה מחליף תמונה קודמת — אחרת נשארת תמונה יתומה מהפריסה הקודמת.
  patch.image = null;
  return patch;
};

/**
 * generateMissingDeckImages — ממלא תמונות לכל השקופיות שמסומנות pending
 * (ה-query שהמודל ייצר בזמן בניית המצגת). סדרתי בכוונה — קריאות תמונה יקרות
 * ומקביליות מזמינה rate-limit.
 * @returns {Promise<{slides: Array<{slideId, image}>, failures: Array}>}
 */
export const generateMissingDeckImages = async (deck, theme, { style = 'photo', model = '', provider = '', signal, onProgress = null, limit = 24, skipSlideIds = null } = {}) => {
  const targets = (deck?.slides || [])
    .filter((slide) => slide?.image?.pending && (slide.image.query || slide.image.alt))
    .filter((slide) => !skipSlideIds?.has(slide.id))
    .slice(0, limit);
  const results = [];
  const failures = [];
  for (let i = 0; i < targets.length; i += 1) {
    if (signal?.aborted) break;
    const slide = targets[i];
    try { onProgress?.({ index: i + 1, total: targets.length, slideId: slide.id, title: slide.title }); } catch { /* noop */ }
    try {
      const image = await generateSlideImage(slide, theme, { style, model, provider, signal, deck });
      results.push({ slideId: slide.id, image });
    } catch (error) {
      if (error?.name === 'AbortError') break;
      failures.push({ slideId: slide.id, message: String(error?.message || error) });
    }
  }
  return { slides: results, failures, attempted: targets.length };
};

const countPendingImages = (deck, skipSlideIds = null) =>
  (deck?.slides || []).filter((s) => s?.image?.pending && (s.image.query || s.image.alt) && !skipSlideIds?.has(s.id)).length;

/**
 * runDeckAutoMedia — מעבר מדיה שלם על דק: תמונות חסרות (עם ניסיון חוזר) ואז
 * אינפוגרפיקות לשקופיות שסומנו visual:'chart'. הפונקציה **טהורה כלפי ה-state**:
 * מקבלת דק ומחזירה דק חדש, ולכן היא רצה זהה משלב היצירה (main.jsx) ומהעורך.
 *
 * @param {object} deck  דק מנורמל
 * @param {object} theme הערכה הפעילה (customTheme או getThemeById)
 * @param {{autoImages?:boolean, autoInfographics?:boolean, style?:string,
 *          signal?:AbortSignal, onProgress?:(text:string)=>void,
 *          imageLimit?:number, imageRetries?:number}} opts
 * @returns {Promise<{deck:object, imagesMade:number, chartsMade:number,
 *          infographicFailures:number, pendingRemaining:number, aborted:boolean}>}
 *   pendingRemaining סופר תמונות חסרות **בלי** שקופיות ה-chart (המסלול שלהן הוא
 *   האינפוגרפיקה); כישלון אינפוגרפיקה מדווח ב-infographicFailures ואינו חוסם.
 */
export const runDeckAutoMedia = async (deck, theme, {
  autoImages = false,
  autoInfographics = false,
  style = 'photo',
  signal,
  onProgress = null,
  imageLimit = 24,
  imageRetries = 1,
} = {}) => {
  let current = deck;
  let imagesMade = 0;
  let chartsMade = 0;
  let infographicFailures = 0;
  const emit = (text) => { try { onProgress?.(text); } catch { /* noop */ } };
  const applyImages = (list) => {
    if (!list?.length) return;
    const map = {};
    list.forEach(({ slideId, image }) => { map[slideId] = image; });
    current = { ...current, slides: (current.slides || []).map((s) => (map[s.id] ? { ...s, image: map[s.id] } : s)) };
  };

  // שקופית visual:'chart' תקבל אינפוגרפיקה במעבר הבא, שדורסת את שדה image.
  // בלי הדילוג הזה שילמנו על יצירת תמונה שנזרקת מיד אחר כך.
  const chartSkipIds = autoInfographics
    ? new Set((deck?.slides || []).filter((s) => s?.visual === 'chart').map((s) => s.id))
    : null;

  if (autoImages) {
    // ניסיון חוזר יחיד לשקופיות שנשארו pending — כישלון בודד הוא לרוב עומס רגעי.
    for (let attempt = 0; attempt <= imageRetries; attempt += 1) {
      if (signal?.aborted) break;
      if (!countPendingImages(current, chartSkipIds)) break;
      if (attempt > 0) emit('מנסה שוב תמונות שנכשלו…');
      // eslint-disable-next-line no-await-in-loop
      const res = await generateMissingDeckImages(current, theme, {
        style,
        signal,
        limit: imageLimit,
        skipSlideIds: chartSkipIds,
        onProgress: ({ index, total }) => emit(`יוצר תמונה ${index} מתוך ${total}…`),
      });
      applyImages(res?.slides);
      imagesMade += res?.slides?.length || 0;
      if (!res?.failures?.length) break;
    }
  }

  if (autoInfographics && !signal?.aborted) {
    const targets = (current.slides || []).filter((s) => s?.visual === 'chart');
    for (let i = 0; i < targets.length; i += 1) {
      if (signal?.aborted) break;
      emit(`ממיר שקופית ${i + 1} מתוך ${targets.length} לאינפוגרפיקה…`);
      try {
        // eslint-disable-next-line no-await-in-loop
        const image = await generateSlideInfographic(targets[i], theme, { signal });
        const id = targets[i].id;
        // פריסה שלא מציגה תמונה (stat/title-bullets) הייתה בולעת את הגרף בשקט —
        // מעבירים ל-image-full, בדיוק כמו הכפתור הידני. שדות התוכן נשמרים.
        const layout = layoutHasImage(targets[i].layout) ? null : 'image-full';
        current = {
          ...current,
          slides: (current.slides || []).map((s) => (s.id === id
            ? { ...s, image, ...(layout ? { layout } : {}) }
            : s)),
        };
        chartsMade += 1;
      } catch {
        // שקופית בלי נתונים מספריים — מדלגים, אבל סופרים. ר' pendingRemaining.
        infographicFailures += 1;
      }
    }
  }

  // ⚠️ הספירה מדלגת על שקופיות ה-chart בדיוק כמו מעבר התמונות. שקופית כזו
  // נשארת image.pending במכוון (המסלול שלה הוא אינפוגרפיקת QuickChart חינמית,
  // לא תמונת AI בתשלום) — ספירתה כאן ניפחה את pendingRemaining והפעילה את
  // שער "יצירת התמונות נכשלה" גם כשכל התמונות האמיתיות הצליחו.
  // כישלון אינפוגרפיקה מדווח בנפרד ואינו חוסם.
  return {
    deck: current,
    imagesMade,
    chartsMade,
    infographicFailures,
    pendingRemaining: countPendingImages(current, chartSkipIds),
    aborted: Boolean(signal?.aborted),
  };
};

// ── יצירת ערכת עיצוב ב-AI ────────────────────────────────────────
const THEME_FONT_CHOICES = ['rubik', 'secular', 'frank', 'miriam', 'heebo', 'assistant', 'alef', 'suez', 'fredoka', 'karantina'];

const extractJson = (raw = '') => {
  const text = String(raw || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
};

const isHex = (value) => /^#[0-9a-f]{6}$/i.test(String(value || '').trim());

/**
 * generateDeckTheme — תיאור חופשי בעברית → ערכת עיצוב מלאה.
 * resolveTheme ממלא כל שדה אופציונלי, ולכן המודל צריך להחזיר רק צבעים,
 * זיווג פונטים ובחירות enum — וכל ה-renderer עובד בלי שינוי.
 */
export const generateDeckTheme = async (description, { signal } = {}) => {
  const clean = String(description || '').trim();
  if (!clean) throw new Error('כתוב תיאור קצר של הסגנון הרצוי.');
  const raw = await chatWithActiveProvider(
    [
      'צור ערכת עיצוב למצגת לפי התיאור. החזר אך ורק JSON תקין בצורה:',
      '{"label":"שם קצר בעברית","blurb":"משפט קצר","fonts":{"display":"<key>","body":"<key>"},',
      '"colors":{"bg":"#RRGGBB","bgAlt":"#RRGGBB","surface":"#RRGGBB","text":"#RRGGBB","muted":"#RRGGBB","accent":"#RRGGBB","accent2":"#RRGGBB","onAccent":"#RRGGBB","border":"#RRGGBB"},',
      '"accents":["#RRGGBB","#RRGGBB","#RRGGBB","#RRGGBB"],',
      '"coverStyle":"gradient|split|poster|typographic|geo|editorial","headingTreatment":"bar|block|underline|rail|bracket|boxed|highlight",',
      '"bulletStyle":"check|dash|square|arrow|dot|plus","cardStyle":"elevated|flat|outline|glass","texture":{"kind":"none|noise|grain|halftone|topo","opacity":0.08}}',
      `ערכי fonts חייבים להיות אחד מ: ${THEME_FONT_CHOICES.join(', ')}.`,
      'כל הצבעים בפורמט #RRGGBB. חובה ניגודיות גבוהה בין text ל-bg (קריאוּת על מסך מוקרן), ו-onAccent חייב להיות קריא על accent.',
      '',
      `התיאור: ${clean}`,
    ].join('\n'),
    '',
    'אתה מעצב מצגות. מחזיר JSON בלבד, בלי הסברים.',
    {
      skipAutomation: true,
      skipMultiModel: true,
      directChat: true,
      skipSkillSelection: true,
      strictFormatting: true,
      omitPersonalStyleStructureHints: true,
      forceSuppressResearchRouting: true,
      thinkingBudget: 0,
      ...(signal ? { signal } : {}),
    },
  );
  const parsed = extractJson(typeof raw === 'string' ? raw : raw?.text || '');
  const colors = parsed?.colors || {};
  const required = ['bg', 'text', 'accent'];
  if (!parsed || required.some((key) => !isHex(colors[key]))) {
    throw new Error('המודל לא החזיר ערכה תקינה (חסרים צבעים). נסה תיאור אחר.');
  }
  const { F } = await import('../presentation/themes/_schema');
  const fontKey = (value, fallback) => (THEME_FONT_CHOICES.includes(String(value || '').trim()) ? F[String(value).trim()] : fallback);
  const safeColors = {
    bg: colors.bg,
    bgAlt: isHex(colors.bgAlt) ? colors.bgAlt : colors.bg,
    surface: isHex(colors.surface) ? colors.surface : colors.bgAlt || colors.bg,
    text: colors.text,
    muted: isHex(colors.muted) ? colors.muted : colors.text,
    accent: colors.accent,
    accent2: isHex(colors.accent2) ? colors.accent2 : colors.accent,
    onAccent: isHex(colors.onAccent) ? colors.onAccent : '#FFFFFF',
    border: isHex(colors.border) ? colors.border : colors.muted || colors.text,
  };
  return resolveTheme({
    id: `ai-${Date.now()}`,
    label: String(parsed.label || 'ערכה שנוצרה ב-AI').trim().slice(0, 40),
    family: 'ai',
    blurb: String(parsed.blurb || clean).trim().slice(0, 120),
    fonts: {
      display: fontKey(parsed.fonts?.display, F.rubik),
      body: fontKey(parsed.fonts?.body, F.heebo),
    },
    colors: safeColors,
    bg: { kind: 'mesh' },
    shape: { radius: 18, accentStyle: 'bar', cardElevation: true },
    motif: 'none',
    coverGradient: `linear-gradient(135deg, ${safeColors.accent}33 0%, ${safeColors.bg} 60%)`,
    accents: (Array.isArray(parsed.accents) ? parsed.accents.filter(isHex) : []).slice(0, 8).length
      ? parsed.accents.filter(isHex).slice(0, 8)
      : [safeColors.accent, safeColors.accent2],
    coverStyle: parsed.coverStyle,
    headingTreatment: parsed.headingTreatment,
    bulletStyle: parsed.bulletStyle,
    cardStyle: parsed.cardStyle,
    texture: parsed.texture && parsed.texture.kind ? parsed.texture : { kind: 'none' },
    generated: true,
  });
};
