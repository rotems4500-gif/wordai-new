// entry של תוסף ה-Word (taskpane). mount סובלני: רץ גם בדפדפן רגיל בלי Office
// (לפיתוח UI), וגם במארח Word אחרי Office.onReady.
import React from 'react';
import { createRoot } from 'react-dom/client';
import AddinApp from './AddinApp';

const mount = (officeHost) => {
  const rootEl = document.getElementById('addin-root');
  if (!rootEl) return;
  createRoot(rootEl).render(<AddinApp officeHost={officeHost} />);
};

// feature-check למארחים עתיקים (Trident) — המניפסט כבר דורש WordApi 1.3,
// אבל אם בכל זאת הגענו לכאן בלי יכולות מודרניות, מציגים הודעה במקום קריסה.
if (typeof Promise === 'undefined' || typeof Promise.allSettled !== 'function') {
  const rootEl = document.getElementById('addin-root');
  if (rootEl) {
    rootEl.innerHTML = '<div style="padding:16px;font-family:sans-serif;direction:rtl;text-align:right">נדרשת גרסת Word עדכנית (Microsoft 365) כדי להריץ את WordFlow AI.</div>';
  }
} else if (typeof Office !== 'undefined' && Office?.onReady) {
  Office.onReady((info) => {
    mount(info?.host === Office.HostType.Word ? 'word' : 'none');
  });
} else {
  // דפדפן רגיל — פיתוח UI בלי Word
  mount('none');
}
