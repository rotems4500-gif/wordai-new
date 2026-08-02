// נורמליזציה של הערות שוליים ב-HTML נכנס אל הפורמט שה-FootnoteNode מבין:
//   <sup data-type="footnote" data-footnote-text="..." data-footnote-number="1">[1]</sup>
//
// למה זה נחוץ: mammoth ממיר הערת שוליים של Word ל-<sup><a href="#footnote-1"> ורשימת
// <ol> בסוף המסמך. ב-TipTap ה-anchor והרשימה הופכים לזבל מנותק, ואם מוחקים אותם
// ידנית טקסט ההערה נעלם. כאן מחברים את הסימון לטקסט לפני שהמסמך נכנס לעורך.
// מטופל גם המימוש הישן של האפליקציה (<sup class="footnote-ref" title="..."> +
// <p><small id="fn-N">) — שם הטקסט שרד רק בזכות פסקה בתחתית המסמך.

const escapeHtmlAttr = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const cleanNoteText = (element) => {
  if (!element) return '';
  const clone = element.cloneNode(true);
  // קישור החזרה (↑) שמammoth מוסיף בסוף כל הערה
  clone.querySelectorAll('a[href^="#footnote-ref"], a[href^="#endnote-ref"]').forEach((a) => a.remove());
  return String(clone.textContent || '').replace(/\s+/g, ' ').replace(/\s*↑\s*$/, '').trim();
};

const buildFootnoteSup = (text, number) =>
  `<sup data-type="footnote" data-footnote-text="${escapeHtmlAttr(text)}" data-footnote-number="${number}" class="footnote-ref">[${number}]</sup>`;

export const normalizeImportedFootnotes = (html = '') => {
  const source = String(html || '');
  if (!source.trim()) return source;
  if (typeof DOMParser === 'undefined') return source;
  if (!/footnote|endnote|id=["']fn-/i.test(source)) return source;

  let doc;
  try {
    doc = new DOMParser().parseFromString(`<body><div data-wf-root="1">${source}</div></body>`, 'text/html');
  } catch {
    return source;
  }
  const root = doc?.querySelector('[data-wf-root="1"]');
  if (!root) return source;

  const consumedNotes = new Set();
  let counter = 0;

  const takeNoteText = (id) => {
    if (!id) return '';
    const target = root.querySelector(`[id="${CSS.escape(id)}"]`);
    if (!target) return '';
    consumedNotes.add(target);
    return cleanNoteText(target);
  };

  // 1) mammoth: <sup><a href="#footnote-1" id="footnote-ref-1">[1]</a></sup>
  root.querySelectorAll('sup').forEach((sup) => {
    if (sup.getAttribute('data-type') === 'footnote') return;
    const anchor = sup.querySelector('a[href^="#footnote-"], a[href^="#endnote-"]');
    let text = '';
    if (anchor) {
      text = takeNoteText(String(anchor.getAttribute('href') || '').slice(1));
    } else if (sup.classList.contains('footnote-ref')) {
      // 2) המימוש הישן של האפליקציה: הטקסט ב-title, ואם אין — בפסקה <small id="fn-N">
      text = String(sup.getAttribute('title') || '').trim();
      // גם אם הטקסט הגיע מה-title, הפסקה בתחתית המסמך (<small id="fn-N">) חייבת
      // להיעלם — אחרת ההערה תופיע פעמיים אחרי ההמרה.
      const legacyId = String(sup.getAttribute('id') || '').replace(/^fnref-/, '');
      const legacyNote = legacyId ? root.querySelector(`[id="fn-${CSS.escape(legacyId)}"]`) : null;
      if (legacyNote) {
        consumedNotes.add(legacyNote);
        if (!text) text = String(legacyNote.textContent || '').replace(/^\s*\d+\s*/, '').trim();
      }
    }
    if (!text) return;
    counter += 1;
    const replacement = doc.createElement('template');
    replacement.innerHTML = buildFootnoteSup(text, counter);
    sup.replaceWith(replacement.content.firstChild);
  });

  // הסרת גופי ההערות שנצרכו (פריט רשימה / פסקה שלמים)
  consumedNotes.forEach((node) => {
    const container = node.closest?.('li') || node.closest?.('p') || node;
    const list = container?.parentElement;
    container?.remove();
    if (list && (list.tagName === 'OL' || list.tagName === 'UL') && !list.children.length) list.remove();
  });

  return root.innerHTML;
};

export default normalizeImportedFootnotes;
