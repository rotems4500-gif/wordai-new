// extract.js — content script שרץ ברגע injection (chrome.scripting.executeScript)
// מריץ Readability על שכפול של המסמך ומניח {title, textContent, url, excerpt, via} על
// window.__wordflowClipExtract.
//
// ⚠️ לא מסתמכים על ערך ההחזרה של executeScript({files}): esbuild עוטף ב-IIFE עם גוף
// בלוק, ולכן ערך הסיום של הסקריפט הוא תמיד undefined והתוצאה נבלעת. background קורא
// את הגלובל בקריאה שנייה (אותו isolated world, אותו window).
import { Readability } from '@mozilla/readability';

// שרשרת נפילה-חזרה: Readability מכוון למאמרים, ונכשל על דפי אפליקציה (Moodle, פורטלים,
// SPA). innerText מחזיר רק טקסט *מרונדר* — ריק כשהתוכן מוסתר ב-CSS או בתוך <template>,
// ואז textContent הגולמי הוא הסיכוי האחרון. via נשמר כדי שהודעת הכשל תהיה אבחנתית.
const MIN_USEFUL_CHARS = 40;

function clean(value) {
  return String(value || '').replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

window.__wordflowClipExtract = (function extractReadablePage() {
  const attempts = [];
  let readabilityError = '';

  try {
    const article = new Readability(document.cloneNode(true)).parse();
    attempts.push({ via: 'readability', text: clean(article?.textContent), title: article?.title, excerpt: article?.excerpt });
  } catch (err) {
    readabilityError = String(err && err.message ? err.message : err);
    console.error('[wordflow][extract] Readability נכשל:', err);
  }

  try {
    attempts.push({ via: 'body.innerText', text: clean(document.body?.innerText) });
    attempts.push({ via: 'documentElement.innerText', text: clean(document.documentElement?.innerText) });
    attempts.push({ via: 'body.textContent', text: clean(document.body?.textContent) });
  } catch (err) {
    console.error('[wordflow][extract] קריאת טקסט מהדף נכשלה:', err);
  }

  // הראשון שעובר את הרף; אם אף אחד לא — הארוך ביותר, כדי לא לזרוק תוכן קצר לגיטימי.
  const usable = attempts.find((a) => a.text.length >= MIN_USEFUL_CHARS)
    || attempts.slice().sort((a, b) => b.text.length - a.text.length)[0]
    || { via: 'none', text: '' };

  return {
    title: usable.title || document.title || '',
    textContent: usable.text,
    url: location.href,
    excerpt: usable.excerpt || '',
    via: usable.via,
    error: readabilityError,
    // אבחון: כמה תווים כל מסלול נתן. מגיע להודעת הכשל כשאין טקסט בכלל.
    diag: attempts.map((a) => `${a.via}=${a.text.length}`).join(' '),
  };
})();
