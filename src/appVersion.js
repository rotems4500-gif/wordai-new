// גרסת האפליקציה — מוזרקת בזמן build מ-package.json (vite define __APP_VERSION__).
// מקור אמת יחיד במקום מספרים קשיחים מפוזרים (open-items #1, #55).
/* global __APP_VERSION__ */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__
  ? __APP_VERSION__
  : '';

export const APP_VERSION_LABEL = APP_VERSION ? `v${APP_VERSION}` : '';
