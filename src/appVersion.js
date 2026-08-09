// גרסת האפליקציה — מוזרקת בזמן build מ-package.json (vite define __APP_VERSION__).
// מקור אמת יחיד במקום מספרים קשיחים מפוזרים (open-items #1, #55).
/* global __APP_VERSION__ */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__
  ? __APP_VERSION__
  : '';

export const APP_VERSION_LABEL = APP_VERSION ? `v${APP_VERSION}` : '';

// מונה build — עולה ב-1 בכל פריסה/בנייה שנמסרת לרותם, גם כשגרסת החבילה לא זזה.
// מוצג בסרגל העליון כדי שאפשר יהיה לדעת במבט אם הקוד שרץ הוא החדש.
// ⚠️ העלאה כאן חייבת ללכת יחד עם הקפצת מספר המטמון ב-public/sw.js — אחרת
// ה-service worker מגיש את ה-index הישן והמונה החדש בכלל לא מגיע למסך.
export const BUILD_NUMBER = 2;

export const BUILD_LABEL = `b${BUILD_NUMBER}`;
