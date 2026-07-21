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
export function buildScaffoldHtml(spec, { includeQuotaHints = true } = {}) {
  const sections = Array.isArray(spec?.sections) ? spec.sections.filter((s) => s?.enabled !== false) : [];
  if (!sections.length) return '<p></p>';

  const parts = [];
  const title = String(spec?.title || '').trim();
  if (title) parts.push(`<h1>${escapeHtml(title)}</h1>`);

  sections.forEach((section) => {
    parts.push(`<h2>${escapeHtml(section.title || `סעיף ${section.order}`)}</h2>`);
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
