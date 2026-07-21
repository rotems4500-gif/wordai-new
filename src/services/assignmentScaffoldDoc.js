// assignmentScaffoldDoc.js — המרת spec של מטלה למסמך התחלתי, וזיהוי הסעיף שהסמן בו.
//
// המסמך שנפתח הוא *שלד בלבד*: כותרת לכל סעיף + שורת מכסה. אין טקסט מומצא — זה כל
// העיקרון של המסלול בלי מפתח. הראיות לא מוזרקות למסמך אלא חיות בפאנל הצדדי.
//
// זיהוי סעיף לפי הסמן: TipTap מסיר attributes לא-מוכרים מ-heading, ולכן אי אפשר
// לסמוך על data-section-id ששורד סבב עריכה. במקום זה מתאימים לפי *טקסט הכותרת* —
// הכותרות ייחודיות בתוך מטלה אחת, וזה שורד העתקה/הדבקה ושינוי סדר.
//
// LEAF: אין תלות בשירותים אחרים.

const escapeHtml = (s = '') => String(s || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// נרמול להשוואת כותרות: מסיר ניקוד, סימני פיסוק וקידומת מספור.
export function normalizeHeadingKey(text) {
  return String(text || '')
    .replace(/[֑-ׇ]/g, '')
    .replace(/^\s*(?:\d+(?:\.\d+)*|[א-ת])['׳]?\s*[.)]\s*/, '')
    .replace(/[.,:;–—\-"'״׳]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * בונה HTML התחלתי מה-spec.
 *
 * @param {object} spec
 * @param {{includeQuotaHints?:boolean}} opts
 * @returns {string}
 */
// תתי-הדרישות של הסעיף כפי שהמרצה ניסח אותן ("א. הציגו... ב. פרטו...").
// המפריד הוא סימון הפריט עצמו, כי בטקסט שחולץ מ-PDF הם לרוב על שורות נפרדות
// אבל לפעמים רצופים.
// ⚠️ ה-lookahead `(?![\d])` הכרחי: בלעדיו "ווב 2.0" נחתך באמצע, כי "2." נראה
// כמו סימון פריט. אותה מלכודת בדיוק כמו בזיהוי הסעיפים עצמם.
const SUB_ITEM_SPLIT = /\n(?=\s*(?:[א-ת]['׳]?\s*[.)]|[•\-–—*]|\d+\s*[.)])\s*(?![\d]))/;
const SUB_ITEM_MARK = /^\s*(?:[א-ת]['׳]?\s*[.)]|[•\-–—*]|\d+\s*[.)])\s*/;
const MAX_SUB_ITEMS = 8;
const MIN_SUB_ITEM_WORDS = 3;

/**
 * מפרק את הנחיית הסעיף לתתי-דרישות. מחזיר [] כשאין חלוקה ברורה.
 */
function splitSubRequirements(instructions) {
  const raw = String(instructions || '').trim();
  if (!raw) return [];
  const parts = raw.split(SUB_ITEM_SPLIT)
    .map((p) => p.replace(SUB_ITEM_MARK, '').replace(/\s+/g, ' ').trim())
    .filter((p) => p && p.split(/\s+/).length >= MIN_SUB_ITEM_WORDS);
  // פחות משניים אינו חלוקה — זו פשוט ההנחיה.
  return parts.length >= 2 ? parts.slice(0, MAX_SUB_ITEMS) : [];
}

/**
 * בונה HTML התחלתי מה-spec.
 *
 * @param {object} spec
 * @param {{includeQuotaHints?:boolean, includeInstructions?:boolean}} opts
 * @returns {string}
 */
export function buildScaffoldHtml(spec, { includeQuotaHints = true, includeInstructions = true } = {}) {
  const sections = Array.isArray(spec?.sections) ? spec.sections.filter((s) => s?.enabled !== false) : [];
  if (!sections.length) return '<p></p>';

  const parts = [];
  const title = String(spec?.title || '').trim();
  if (title) parts.push(`<h1>${escapeHtml(title)}</h1>`);

  sections.forEach((section) => {
    parts.push(`<h2>${escapeHtml(section.title || `סעיף ${section.order}`)}</h2>`);

    // ⚠️ ההנחיה של הסעיף חייבת להגיע למסמך. היא ישבה ב-spec ובפאנל בלבד, וכך
    // המשתמש קיבל כותרת חשופה ומכסת מילים — בלי חמש תתי-הדרישות שהמרצה כתב
    // ("מי השחקנים", "מהו סלע המחלוקת"...). זה מה שהפך שלד *נכון* לשלד חסר תועלת:
    // צריך היה לחזור להנחיות המקוריות כדי לדעת מה בכלל לכתוב.
    if (includeInstructions) {
      const subs = splitSubRequirements(section.instructions);
      if (subs.length) {
        parts.push(`<ul>${subs.map((s) => `<li><em>${escapeHtml(s)}</em></li>`).join('')}</ul>`);
      } else {
        const oneLine = String(section.instructions || '').replace(/\s+/g, ' ').trim();
        if (oneLine) parts.push(`<p><em>${escapeHtml(oneLine)}</em></p>`);
      }
    }

    if (includeQuotaHints && section.wordQuota) {
      // רמז המכסה הוא פסקה רגילה ולא placeholder: TipTap לא שומר nodes לא-מוכרים,
      // והמשתמש ממילא מוחק אותה כשהוא מתחיל לכתוב. הסימון החזותי הוא בפאנל.
      parts.push(`<p><em>[${escapeHtml(String(section.wordQuota))} מילים בערך]</em></p>`);
    } else {
      parts.push('<p></p>');
    }
  });

  return parts.join('\n');
}

// גוף סעיף כפרוזה → פסקאות. המודל מפריד פסקאות בשורה ריקה, אבל לא תמיד —
// שורה בודדת ארוכה היא עדיין פסקה אחת תקינה.
//
// ⚠️ המודל התבקש פרוזה, אבל לפעמים מחזיר בכל זאת <p>…</p> (נצפה ב-e2e). בלי
// הניקוי הזה ה-escape הופך אותן ל-&lt;p&gt; והמשתמש רואה תגיות כטקסט במסמך.
// מסירים את התגיות ומתייחסים ל-</p> ול-<br> כגבול פסקה, כדי לא לאבד את החלוקה.
function stripModelHtml(text) {
  return String(text || '')
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function prosaToParagraphs(text) {
  return stripModelHtml(text)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('\n');
}

/**
 * מרכיב את פלט draftWholeWork למסמך: כותרת, סעיפים כתובים, סעיפים חסומים עם
 * סימון, וביבליוגרפיה. TipTap מסנן nodes לא-מוכרים (div/blockquote) — ולכן רק
 * h1/h2/p/hr/em/a.
 *
 * @param {object} spec
 * @param {{sections?:Array, blocked?:Array, bibliography?:Array}} draft פלט draftWholeWork
 * @returns {string} HTML
 */
export function buildWholeWorkHtml(spec, draft = {}) {
  const parts = [];
  const title = String(spec?.title || '').trim();
  if (title) parts.push(`<h1>${escapeHtml(title)}</h1>`);

  // סדר הסעיפים נקבע ע"י ה-spec ולא ע"י סדר החזרה של המודל — כך סעיף חסום
  // נשאר במקומו הנכון בעבודה במקום להידחק לסוף.
  const written = new Map((draft.sections || []).map((s) => [s.id, s]));
  const blockedIds = new Set((draft.blocked || []).map((b) => b.id));
  const specSections = Array.isArray(spec?.sections) ? spec.sections.filter((s) => s?.enabled !== false) : [];

  specSections.forEach((section) => {
    parts.push(`<h2>${escapeHtml(section.title || '')}</h2>`);
    const hit = written.get(section.id);
    if (hit) {
      parts.push(prosaToParagraphs(hit.text));
    } else if (blockedIds.has(section.id)) {
      parts.push(`<p><em>[דרוש מקור — הסעיף לא נכתב כי לא נמצא לו חומר תומך]</em></p>`);
    } else {
      parts.push('<p></p>');
    }
  });

  // סעיפים שהמודל ניסח בכותרת שלא זוהתה — לא נזרקים, נספחים בסוף עם סימון.
  (draft.sections || []).filter((s) => !specSections.some((x) => x.id === s.id)).forEach((s) => {
    parts.push(`<h2>${escapeHtml(s.title || 'סעיף נוסף')}</h2>`);
    parts.push(prosaToParagraphs(s.text));
  });

  const bib = Array.isArray(draft.bibliography) ? draft.bibliography : [];
  if (bib.length) {
    parts.push('<hr>');
    parts.push('<h2>ביבליוגרפיה</h2>');
    bib.forEach((entry) => {
      const link = entry.url
        ? ` <a href="${escapeHtml(entry.url)}">${escapeHtml(entry.url)}</a>`
        : '';
      // מקור שנשמר כתקציר בלבד מסומן גם ברשימה — המשתמש צריך לדעת לפני הגשה.
      const mark = entry.weak ? ' <em>(תקציר בלבד — לא נקרא הטקסט המלא)</em>' : '';
      parts.push(`<p>${escapeHtml(entry.title)}.${link}${mark}</p>`);
    });
  }

  return parts.join('\n');
}

/**
 * מוצא את הסעיף שהסמן נמצא בו — הכותרת הקרובה ביותר שקודמת למיקום הסמן.
 *
 * @param {object} editor TipTap editor
 * @param {object} spec
 * @returns {{sectionId:string, title:string}|null}
 */
export function findSectionAtCursor(editor, spec) {
  const sections = Array.isArray(spec?.sections) ? spec.sections : [];
  if (!editor?.state || !sections.length) return null;

  const { doc, selection } = editor.state;
  const cursorPos = selection?.from ?? 0;

  let lastHeading = null;
  doc.descendants((node, pos) => {
    if (pos > cursorPos) return false; // כל מה שמעבר לסמן לא רלוונטי
    if (node.type?.name === 'heading') lastHeading = node.textContent;
    return true;
  });
  if (!lastHeading) return null;

  const key = normalizeHeadingKey(lastHeading);
  const match = sections.find((s) => normalizeHeadingKey(s.title) === key);
  return match ? { sectionId: match.id, title: match.title } : null;
}

/**
 * סופר מילים בגוף סעיף — מהכותרת שלו עד הכותרת הבאה. משמש למד ההתקדמות מול המכסה.
 *
 * @returns {number}
 */
export function countSectionWords(editor, sectionTitle) {
  if (!editor?.state || !sectionTitle) return 0;
  const key = normalizeHeadingKey(sectionTitle);
  const { doc } = editor.state;

  let inside = false;
  let words = 0;
  doc.descendants((node) => {
    if (node.type?.name === 'heading') {
      const hit = normalizeHeadingKey(node.textContent) === key;
      if (inside && !hit) inside = false;
      else if (hit) inside = true;
      return true;
    }
    if (!inside || !node.isTextblock) return true;
    const text = node.textContent || '';
    // שורת רמז המכסה לא נספרת — אחרת המד מתחיל מ-3 מילים.
    if (/^\s*\[\d+\s+מילים בערך\]\s*$/.test(text)) return true;
    words += (text.match(/[֐-׿A-Za-z0-9'"׳״-]+/g) || []).length;
    return true;
  });
  return words;
}

// שורת רמז המכסה שנוצרה ב-buildScaffoldHtml.
export const QUOTA_HINT_RE = /^\s*\[\d+\s+מילים בערך\]\s*$/;

/**
 * מזריק תוכן במיקום הסמן — ואם הסמן יושב בשורת רמז המכסה, *מחליף* אותה.
 * בלי זה הרמז שורד ומתערבב בטקסט ("...מעורבות הורית [400 מילים בערך]").
 *
 * @param {object} editor TipTap editor
 * @param {string} content HTML או טקסט
 * @returns {boolean} האם הוזרק
 */
export function insertReplacingQuotaHint(editor, content) {
  if (!editor?.state) return false;
  const { $from } = editor.state.selection;
  const parent = $from.parent;

  if (parent?.isTextblock && QUOTA_HINT_RE.test(parent.textContent || '')) {
    const start = $from.start();
    const end = start + parent.content.size;
    editor.chain().focus().insertContentAt({ from: start, to: end }, content).run();
    return true;
  }
  editor.chain().focus().insertContent(content).run();
  return true;
}

/**
 * ציטוט מוכן להדבקה: הטקסט + ייחוס. לא מנוסח מחדש — זו ציטטה מהמקור.
 * @returns {string} HTML
 */
export function buildQuoteHtml(item, { maxWords = 45 } = {}) {
  const words = String(item?.text || '').split(/\s+/).filter(Boolean);
  const snippet = words.length > maxWords ? `${words.slice(0, maxWords).join(' ')}…` : words.join(' ');
  const cite = [String(item?.sourceTitle || '').trim(), item?.pageHint ? `עמ' ${item.pageHint}` : '']
    .filter(Boolean)
    .join(', ');
  return `<p>"${escapeHtml(snippet)}" <em>(${escapeHtml(cite)})</em></p>`;
}
