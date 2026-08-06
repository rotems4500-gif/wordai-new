// scanLinks.js — סורק את הדף אחרי קישורים לקבצים ומניח את הרשימה על
// window.__wordflowClipLinks. מוזרק לפי דרישה (activeTab) בלחיצת המשתמש בלבד.
//
// ⚠️ כמו extract.js: לא מסתמכים על ערך ההחזרה של executeScript({files}) — esbuild
// עוטף ב-IIFE וערך הסיום תמיד undefined. background קורא את הגלובל בקריאה שנייה.
//
// דפוס ה-URL מאומץ מ-pdf-grabber (פרויקט oil price): נקודות קצה רבות של קבצים
// חסרות סיומת (Moodle pluginfile, ?type=staticpdf, /download).

const FILE_URL = /\.(pdf|docx?|pptx?|xlsx?|txt|rtf|csv)(?:[?#]|$)|[?&](?:type|format|mode|action)=[^&]*(?:pdf|doc|ppt|xls)|\/(?:download|getpdf|pdf)\b/i;
// Moodle: קישור למשאב הוא /mod/resource/view.php?id=N — הקובץ עצמו מאחורי הפניה.
const MOODLE_RESOURCE = /\/mod\/(?:resource|folder)\/view\.php\?id=\d+/i;

const EXT_FROM_URL = (url) => {
  const m = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url);
  return m ? m[1].toLowerCase() : '';
};

window.__wordflowClipLinks = (function scanPageFileLinks() {
  const seen = new Set();
  const out = [];

  const push = (rawHref, label, kind) => {
    if (!rawHref) return;
    let abs;
    try {
      abs = new URL(rawHref, location.href).href;
    } catch {
      return;
    }
    if (!/^https?:/i.test(abs) || seen.has(abs)) return;
    seen.add(abs);
    out.push({
      url: abs,
      title: String(label || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      ext: EXT_FROM_URL(abs),
      kind, // 'direct' = קישור לקובץ · 'resource' = דף ביניים שצריך לעקוב אחריו
    });
  };

  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    const label = a.innerText || a.textContent || a.getAttribute('title') || '';
    if (FILE_URL.test(href)) push(href, label, 'direct');
    else if (MOODLE_RESOURCE.test(href)) push(href, label, 'resource');
  }

  // מסמכים מוטמעים בדף (embed/object/iframe) — לא תמיד יש להם <a> מקביל.
  for (const el of document.querySelectorAll('embed[src], object[data], iframe[src]')) {
    const src = el.getAttribute('src') || el.getAttribute('data');
    if (src && FILE_URL.test(src)) push(src, document.title, 'direct');
  }

  return { pageTitle: document.title || '', links: out.slice(0, 60) };
})();
