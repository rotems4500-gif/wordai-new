// extract.js — content script שרץ ברגע injection (chrome.scripting.executeScript)
// מריץ Readability על שכפול של המסמך ומחזיר {title, textContent, url, excerpt} כתוצאת ה-executeScript.
import { Readability } from '@mozilla/readability';

(function extractReadablePage() {
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
