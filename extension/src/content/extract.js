// extract.js — content script שרץ ברגע injection (chrome.scripting.executeScript)
// מריץ Readability על שכפול של המסמך ומניח {title, textContent, url, excerpt} על
// window.__wordflowClipExtract.
//
// ⚠️ לא מסתמכים על ערך ההחזרה של executeScript({files}): esbuild עוטף ב-IIFE עם גוף
// בלוק, ולכן ערך הסיום של הסקריפט הוא תמיד undefined והתוצאה נבלעת. background קורא
// את הגלובל בקריאה שנייה (אותו isolated world, אותו window).
import { Readability } from '@mozilla/readability';

window.__wordflowClipExtract = (function extractReadablePage() {
  try {
    const documentClone = document.cloneNode(true);
    const article = new Readability(documentClone).parse();

    if (!article || !article.textContent || !article.textContent.trim()) {
      // נפילה חזרה ל-body.innerText אם Readability לא הצליח לחלץ מאמר (למשל SPA לא-סטנדרטי)
      return {
        title: document.title || '',
        textContent: document.body ? document.body.innerText : '',
        url: location.href,
        excerpt: '',
      };
    }

    return {
      title: article.title || document.title || '',
      textContent: article.textContent,
      url: location.href,
      excerpt: article.excerpt || '',
    };
  } catch (err) {
    console.error('[wordflow][extract] שגיאה בחילוץ תוכן:', err);
    return {
      title: document.title || '',
      textContent: document.body ? document.body.innerText : '',
      url: location.href,
      excerpt: '',
      error: String(err && err.message ? err.message : err),
    };
  }
})();
