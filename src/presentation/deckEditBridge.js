// ═══════════════════════════════════════════════════════════════
// deckEditBridge.js — הגשר בין AiSidebar לבין מודל המצגת (deck).
//
// AiSidebar לא יודע דבר על מצגות: הוא מדבר במסמך (documentContext),
// ביעדי עריכה ({kind, text, targetId}) ומצפה ל-{ok, message, partial, unresolved}.
// כאן מתרגמים את זה למודל השקופיות:
//   • deck → טקסט מסמך (מתווה + סריאליזציה של כל שקופית)
//   • שקופית נבחרת → editTarget יחיד (kind:'block', targetId `deck:<slideId>`)
//   • תשובת המודל → patch על שדות השקופית, דרך updateSlide + commitDeck
//
// עיקרון: אף פעם לא מנחשים. יעד שלא נפתר חד-משמעית לא מוחל (כמו wordEditBridge).
// אין כאן שום תלות ב-React/DOM — פונקציות טהורות + factory.
// ═══════════════════════════════════════════════════════════════

import { sanitizeSlideText, getLayout, updateSlide } from './deckModel';

// ── סריאליזציה: deck/שקופית → טקסט ─────────────────────────────────

const clean = (value) => String(value == null ? '' : value).trim();

const SLIDE_HEADING_PREFIX = '### שקופית';
const UNTITLED = '(ללא כותרת)';

/** תווית איתור קריאה לשקופית — "שקופית 3: כותרת" */
export const slideLocatorLabel = (slide, index) =>
  `שקופית ${index + 1}: ${clean(slide?.title) || UNTITLED}`;

/** שורת הכותרת של השקופית בסריאליזציה */
export const slideHeadingLine = (slide, index) =>
  `${SLIDE_HEADING_PREFIX} ${index + 1}: ${clean(slide?.title) || UNTITLED}`;

/**
 * גוף השקופית כטקסט — שדה בכל שורה, בפורמט שהפרסר יודע לקרוא בחזרה.
 * שדות ריקים מדולגים לגמרי (אין שורות "כותרת משנה: " ריקות).
 */
export const serializeSlideBody = (slide) => {
  const lines = [];
  const push = (value) => { const t = clean(value); if (t) lines.push(t); };

  push(clean(slide?.kicker) && `תווית עליונה: ${clean(slide.kicker)}`);
  push(clean(slide?.subtitle) && `כותרת משנה: ${clean(slide.subtitle)}`);
  push(clean(slide?.body));

  (Array.isArray(slide?.bullets) ? slide.bullets : []).forEach((b) => push(clean(b) && `• ${clean(b)}`));

  (Array.isArray(slide?.columns) ? slide.columns : []).forEach((col) => {
    const heading = clean(col?.heading);
    const bullets = (Array.isArray(col?.bullets) ? col.bullets : []).map(clean).filter(Boolean);
    if (!heading && !bullets.length) return;
    push(`עמודה: ${heading || UNTITLED}`);
    bullets.forEach((b) => push(`• ${b}`));
  });

  (Array.isArray(slide?.stats) ? slide.stats : []).forEach((st) => {
    const value = clean(st?.value);
    const label = clean(st?.label);
    const caption = clean(st?.caption);
    if (!value && !label) return;
    push(`נתון: ${value}${label ? ` — ${label}` : ''}${caption ? ` (${caption})` : ''}`);
  });

  (Array.isArray(slide?.steps) ? slide.steps : []).forEach((st, i) => {
    const title = clean(st?.title);
    const body = clean(st?.body);
    if (!title && !body) return;
    push(`שלב ${i + 1}: ${title || UNTITLED}${body ? `: ${body}` : ''}`);
  });

  push(clean(slide?.notes) && `הערות מרצה: ${clean(slide.notes)}`);

  return lines.join('\n');
};

/** שקופית שלמה כטקסט (כותרת + גוף) — זה גם ה-target.text של יעד העריכה. */
export const serializeSlide = (slide, index) =>
  [slideHeadingLine(slide, index), serializeSlideBody(slide)].filter(Boolean).join('\n');

const EXCERPT_MAX_CHARS = 6000;

/**
 * תצלום המצגת בפורמט documentContext של AiSidebar:
 *   outlineText — מתווה כותרות ממוספר (זול, נכנס לכל פרומפט)
 *   text        — הסריאליזציה המלאה (משמש בקריאות עם קונטקסט מלא)
 *   excerptText — אותו דבר, חתוך ל-6000 תווים
 */
export const buildDeckDocumentSnapshot = (deck) => {
  const slides = Array.isArray(deck?.slides) ? deck.slides : [];
  if (!slides.length) return { excerptText: '', text: '', outlineText: '' };

  const outlineText = [
    `מתווה המצגת "${clean(deck?.title) || 'ללא שם'}" (${slides.length} שקופיות):`,
    ...slides.map((s, i) => `${i + 1}. ${clean(s?.title) || UNTITLED} (${getLayout(s?.layout)?.label || s?.layout || ''})`),
  ].join('\n');

  const text = slides.map((s, i) => serializeSlide(s, i)).join('\n\n');
  const excerptText = text.length > EXCERPT_MAX_CHARS
    ? `${text.slice(0, EXCERPT_MAX_CHARS)}\n…`
    : text;

  return { excerptText, text, outlineText };
};

/**
 * מצב יעד העריכה עבור AiSidebar: {selection, block, active}.
 * אין כרגע מושג של "בחירת טקסט בתוך שקופית", ולכן selection תמיד null
 * וה-block (השקופית הנבחרת במלואה) הוא היעד הפעיל.
 */
export const buildDeckEditTargetState = (deck, selectedSlideId) => {
  const slides = Array.isArray(deck?.slides) ? deck.slides : [];
  const index = slides.findIndex((s) => s?.id === selectedSlideId);
  const slide = index >= 0 ? slides[index] : null;
  if (!slide) return { selection: null, block: null, active: null };

  const block = {
    kind: 'block',
    text: serializeSlide(slide, index),
    targetId: `deck:${slide.id}`,
    locatorLabel: slideLocatorLabel(slide, index),
    headingText: clean(slide.title),
  };
  return { selection: null, block, active: block };
};

// ── פרסר: טקסט חופשי מהמודל → שדות שקופית ──────────────────────────

const BULLET_LINE = /^\s*(?:[-*+•▸‣►·]|\d+[.)])\s+/;
const HEADING_PREFIX = /^\s*#{0,6}\s*(?:שקופית|slide)\s*\d*\s*[:.\-–—]?\s*/i;
const LEADING_HASHES = /^\s*#{1,6}\s+/;

// תוויות שדה. הסדר קריטי: "כותרת משנה" לפני "כותרת", "הערות מרצה" לפני "הערות".
const FIELD_LABELS = [
  { field: 'subtitle', keys: ['כותרת משנה', 'תת-כותרת', 'תת כותרת', 'subtitle'] },
  { field: 'title', keys: ['כותרת'] },
  { field: 'kicker', keys: ['תווית עליונה', 'תווית', 'kicker'] },
  { field: 'notes', keys: ['הערות מרצה', 'הערות למרצה', 'הערות', 'notes'] },
];
const COLUMN_KEYS = ['עמודה', 'צד', 'column'];
const STAT_KEYS = ['נתון', 'מספר', 'stat'];
const STEP_KEYS = ['שלב', 'step'];

// מפרק "תווית: ערך" — התווית חייבת להיות אחת מהמוכרות, אחרת השורה היא טקסט רגיל
// (משפט עברי עם נקודתיים באמצע לא ייחשב בטעות לשדה).
const splitLabeled = (line, keys) => {
  const idx = line.indexOf(':');
  if (idx <= 0) return null;
  const label = line.slice(0, idx).trim().replace(/^[#*\s]+/, '');
  const normalized = label.replace(/\s+\d+$/, '').trim(); // "שלב 2" → "שלב"
  if (!keys.some((k) => normalized.toLowerCase() === k.toLowerCase())) return null;
  return line.slice(idx + 1).trim();
};

const parseStatLine = (value) => {
  let rest = clean(value);
  let caption = '';
  const capMatch = rest.match(/\(([^)]*)\)\s*$/);
  if (capMatch) { caption = capMatch[1].trim(); rest = rest.slice(0, capMatch.index).trim(); }
  const parts = rest.split(/\s+[—–-]\s+/);
  const statValue = clean(parts.shift());
  const label = clean(parts.join(' — '));
  return {
    value: sanitizeSlideText(statValue),
    label: sanitizeSlideText(label),
    caption: sanitizeSlideText(caption),
  };
};

const parseStepLine = (value) => {
  const rest = clean(value);
  const sepIdx = rest.search(/[:—–]/);
  if (sepIdx < 0) return { title: sanitizeSlideText(rest), body: '' };
  return {
    title: sanitizeSlideText(rest.slice(0, sepIdx)),
    body: sanitizeSlideText(rest.slice(sepIdx + 1)),
  };
};

/**
 * מפרק תשובת מודל לשדות שקופית. מחזיר רק את מה שנמצא בפועל —
 * שדה שלא הופיע בטקסט מוחזר ריק ולא נכתב על השקופית (ר' buildSlidePatch).
 *
 *   שורה ראשונה (אחרי הסרת "### שקופית N:") ⇒ כותרת
 *   "• " / "- " / "1. "                     ⇒ נקודה (או נקודה בעמודה, אם קדמה לה "עמודה:")
 *   "כותרת משנה:" / "תווית עליונה:" / "הערות מרצה:" ⇒ השדה המתאים
 *   "נתון:" / "שלב:" / "עמודה:"             ⇒ stats / steps / columns
 *   כל שאר השורות                            ⇒ plain (יהפוך ל-body או לנקודות)
 */
export const parseSlideContent = (raw) => {
  const out = {
    title: '', subtitle: '', kicker: '', notes: '',
    // titleExplicit — הכותרת הגיעה מתווית "כותרת:" ולא מהשורה הראשונה. מבדיל
    // בין "זו הכותרת" לבין "זו פשוט השורה הראשונה של הטקסט" (חשוב לפריסת ציטוט).
    titleExplicit: false,
    bullets: [], columns: [], stats: [], steps: [], plain: [],
  };
  const lines = String(raw == null ? '' : raw).split(/\r?\n/);
  let titleTaken = false;
  let currentColumn = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (BULLET_LINE.test(line)) {
      const text = sanitizeSlideText(line.replace(BULLET_LINE, ''));
      if (!text) continue;
      if (currentColumn) currentColumn.bullets.push(text);
      else out.bullets.push(text);
      continue;
    }

    const columnValue = splitLabeled(line, COLUMN_KEYS);
    if (columnValue != null) {
      currentColumn = { heading: sanitizeSlideText(columnValue), bullets: [] };
      out.columns.push(currentColumn);
      continue;
    }

    const statValue = splitLabeled(line, STAT_KEYS);
    if (statValue != null) {
      const stat = parseStatLine(statValue);
      if (stat.value || stat.label) out.stats.push(stat);
      continue;
    }

    const stepValue = splitLabeled(line, STEP_KEYS);
    if (stepValue != null) {
      const step = parseStepLine(stepValue);
      if (step.title || step.body) out.steps.push(step);
      continue;
    }

    let matchedField = false;
    for (const { field, keys } of FIELD_LABELS) {
      const value = splitLabeled(line, keys);
      if (value == null) continue;
      matchedField = true;
      const text = sanitizeSlideText(value);
      if (field === 'title') { if (text) { out.title = text; out.titleExplicit = true; titleTaken = true; } }
      else if (text) out[field] = text;
      break;
    }
    if (matchedField) continue;

    if (!titleTaken) {
      const stripped = HEADING_PREFIX.test(line)
        ? line.replace(HEADING_PREFIX, '')
        : line.replace(LEADING_HASHES, '');
      const text = sanitizeSlideText(stripped);
      titleTaken = true;
      if (text) out.title = text;
      continue;
    }

    const text = sanitizeSlideText(line);
    if (text) out.plain.push(text);
  }

  out.columns = out.columns.filter((c) => c.heading || c.bullets.length);
  return out;
};

/**
 * הופך תוצאת פרסור ל-patch על שקופית קיימת.
 * ⚠️ כותבים רק שדות שנמצאו בפועל — תשובה שלא הזכירה נקודות לא מוחקת אותן.
 * מחיקת שדה נעשית ב-inspector, לא דרך הצ'אט (הימנעות ממחיקה בשוגג).
 * layout / image / bgImage / exportMode לא נגעים בהם.
 */
export const buildSlidePatch = (slide, parsed) => {
  const patch = {};
  const fields = getLayout(slide?.layout)?.fields || [];
  const bodyBearing = fields.includes('body');
  const titleBearing = fields.includes('title');

  const bullets = [...parsed.bullets];
  const plain = [...parsed.plain];

  // פריסות ציטוט/משפט-מפתח לא מציגות כותרת אלא body. שורה ראשונה שנקלטה שם
  // ככותרת היא בפועל תחילת הטקסט — בלי הקיפול הזה העריכה נראית כאילו לא קרתה.
  let title = parsed.title;
  if (title && !parsed.titleExplicit && !titleBearing && bodyBearing) {
    plain.unshift(title);
    title = '';
  }

  if (title) patch.title = title;
  if (parsed.subtitle) patch.subtitle = parsed.subtitle;
  if (parsed.kicker) patch.kicker = parsed.kicker;
  if (parsed.notes) patch.notes = parsed.notes;

  if (plain.length) {
    if (bodyBearing) patch.body = plain.join(' ');
    else bullets.push(...plain);
  }
  if (bullets.length) patch.bullets = bullets.slice(0, 8);
  if (parsed.stats.length) patch.stats = parsed.stats.slice(0, 4);
  if (parsed.steps.length) patch.steps = parsed.steps.slice(0, 6);
  if (parsed.columns.length) {
    patch.columns = parsed.columns.slice(0, 3).map((c) => ({ heading: c.heading, bullets: c.bullets.slice(0, 8) }));
  }

  // שדות שנכתבו אך הפריסה הנוכחית לא מציגה — מדווחים למשתמש במקום לשנות פריסה
  // מאחורי גבו (החלפת פריסה היא החלטה עיצובית, לא תוצר לוואי של עריכת טקסט).
  const hiddenLabels = [];
  const checkHidden = (key, field, label) => {
    if (patch[key] !== undefined && !fields.includes(field)) hiddenLabels.push(label);
  };
  checkHidden('title', 'title', 'כותרת');
  checkHidden('bullets', 'bullets', 'נקודות');
  checkHidden('body', 'body', 'טקסט חופשי');
  checkHidden('subtitle', 'subtitle', 'כותרת משנה');
  checkHidden('stats', 'stats', 'מספרים');
  checkHidden('steps', 'steps', 'שלבים');
  checkHidden('columns', 'columns', 'עמודות');

  return { patch, hiddenLabels };
};

// ── רזולוציית יעד ────────────────────────────────────────────────

const normalizeCompare = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * מוצא את השקופית שאליה מתייחס היעד.
 * 1. targetId בפורמט `deck:<slideId>` — הדרך הרגילה.
 * 2. נפילה לאחור: התאמת target.text מול הסריאליזציה / הגוף / הכותרת.
 *    נדרשת התאמה יחידה. 0 או >1 ⇒ null (לא מנחשים).
 */
export const findSlideForTarget = (deck, target) => {
  const slides = Array.isArray(deck?.slides) ? deck.slides : [];
  if (!slides.length) return null;

  const targetId = clean(target?.targetId);
  if (targetId.startsWith('deck:')) {
    const slideId = targetId.slice('deck:'.length);
    const index = slides.findIndex((s) => s?.id === slideId);
    return index >= 0 ? { slide: slides[index], index } : null;
  }

  const needle = normalizeCompare(target?.text);
  if (!needle) return null;
  const matches = [];
  slides.forEach((slide, index) => {
    const candidates = [
      normalizeCompare(serializeSlide(slide, index)),
      normalizeCompare(serializeSlideBody(slide)),
      normalizeCompare(slide?.title),
    ].filter(Boolean);
    if (candidates.includes(needle)) matches.push({ slide, index });
  });
  return matches.length === 1 ? matches[0] : null;
};

// ── ה-factory שהסטודיו משתמש בו ──────────────────────────────────

const AMBIGUOUS_MESSAGE = 'לא זוהתה שקופית יעד חד-משמעית';

/**
 * createDeckEditBridge({ getDeck, commitDeck, showToast }) → { applyEdit, applyEditBatch }
 *
 *   getDeck    — () => deck עדכני (בסטודיו: () => deckRef.current)
 *   commitDeck — מקבל דק מוכן או (prev) => next; דוחף להיסטוריית ה-undo
 *   showToast  — אופציונלי, לחיווי הצלחה
 *
 * ההחלה עצמה נעשית בצורה פונקציונלית מול המצב העדכני ביותר, כי תשובת המודל
 * מגיעה אחרי אסינכרון ארוך והמשתמש כבר יכול היה לערוך שקופיות אחרות.
 */
export const createDeckEditBridge = ({ getDeck, commitDeck, showToast } = {}) => {
  const readDeck = () => (typeof getDeck === 'function' ? getDeck() : null);

  const applyEdit = async ({ replacementText, target } = {}) => {
    const deck = readDeck();
    if (!deck) return { ok: false, message: 'אין מצגת פתוחה.' };
    if (!clean(replacementText)) return { ok: false, message: 'המודל לא החזיר תוכן חלופי לשקופית.' };

    const hit = findSlideForTarget(deck, target);
    if (!hit) return { ok: false, message: AMBIGUOUS_MESSAGE };

    const { patch, hiddenLabels } = buildSlidePatch(hit.slide, parseSlideContent(replacementText));
    if (!Object.keys(patch).length) {
      return { ok: false, message: 'לא זוהה תוכן שקופית בתשובה — לא שיניתי כלום.' };
    }

    commitDeck?.((prev) => (prev ? updateSlide(prev, hit.slide.id, patch) : prev));
    const warning = hiddenLabels.length
      ? ` · הפריסה "${getLayout(hit.slide.layout)?.label || hit.slide.layout}" לא מציגה ${hiddenLabels.join(', ')} — החלף פריסה כדי לראות`
      : '';
    const message = `השקופית עודכנה${warning}`;
    showToast?.(`✏️ ${slideLocatorLabel(hit.slide, hit.index)} עודכנה`, { tone: 'success' });
    return { ok: true, message };
  };

  const applyEditBatch = async ({ edits = [] } = {}) => {
    const deck = readDeck();
    if (!deck) return { ok: false, message: 'אין מצגת פתוחה.' };

    const list = Array.isArray(edits) ? edits : [];
    if (!list.length) return { ok: false, message: 'לא התקבלו עריכות תקינות להחלה.' };

    const patches = [];          // {slideId, patch}
    const unresolved = [];
    const hiddenAll = new Set();
    const seen = new Set();

    list.forEach((edit) => {
      const target = edit?.target?.text || edit?.target?.targetId
        ? edit.target
        : { text: edit?.originalText || '', targetId: edit?.targetId || '' };
      const replacement = edit?.replacement ?? edit?.replacementText ?? edit?.text ?? '';
      const label = clean(
        edit?.target?.locatorLabel || edit?.target?.headingText
        || edit?.target?.targetId || edit?.targetId || target?.text,
      ).slice(0, 60);

      if (!clean(replacement)) { unresolved.push(label || AMBIGUOUS_MESSAGE); return; }
      const hit = findSlideForTarget(deck, target);
      if (!hit || seen.has(hit.slide.id)) { unresolved.push(label || AMBIGUOUS_MESSAGE); return; }

      const { patch, hiddenLabels } = buildSlidePatch(hit.slide, parseSlideContent(replacement));
      if (!Object.keys(patch).length) { unresolved.push(label || slideLocatorLabel(hit.slide, hit.index)); return; }
      seen.add(hit.slide.id);
      hiddenLabels.forEach((l) => hiddenAll.add(l));
      patches.push({ slideId: hit.slide.id, patch });
    });

    if (!patches.length) {
      return { ok: false, unresolved, message: 'אף שקופית יעד לא זוהתה חד-משמעית.' };
    }

    // קומיט אחד לכל האצווה — אחרת כל עריכה הופכת לצעד undo נפרד.
    const byId = new Map(patches.map((p) => [p.slideId, p.patch]));
    commitDeck?.((prev) => (prev ? {
      ...prev,
      slides: (prev.slides || []).map((s) => (byId.has(s.id) ? { ...s, ...byId.get(s.id) } : s)),
    } : prev));

    const hiddenNote = hiddenAll.size ? ` · חלק מהשדות (${[...hiddenAll].join(', ')}) לא מוצגים בפריסה הנוכחית` : '';
    showToast?.(`✏️ ${patches.length} שקופיות עודכנו`, { tone: 'success' });
    if (unresolved.length) {
      return {
        ok: true,
        partial: true,
        unresolved,
        message: `עודכנו ${patches.length} שקופיות; ${unresolved.length} יעדים דולגו (לא חד-משמעיים)${hiddenNote}`,
      };
    }
    return { ok: true, message: `עודכנו ${patches.length} שקופיות${hiddenNote}` };
  };

  return { applyEdit, applyEditBatch };
};
