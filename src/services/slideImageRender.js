// ═══════════════════════════════════════════════════════════════
// slideImageRender.js — מנוע ה-hybrid export.
// מרנדר SlideStage (אותו רנדרר של המסך) offscreen ב-1280×720,
// וצורב ל-PNG dataURL. כך שקפי "hero" מקבלים חופש עיצוב מלא של CSS,
// והפונט + ה-bidi (RTL+לטינית) נצרבים נכון לתוך התמונה.
// ═══════════════════════════════════════════════════════════════

import React from 'react';
import { createRoot } from 'react-dom/client';
import { toPng, toJpeg } from 'html-to-image';
import { SlideStage, STAGE_W, STAGE_H } from '../presentation/SlideRenderer';

// ממתין לטעינת פונטים (Heebo/Rubik/Secular One וכו') לפני הצריבה
const waitForFonts = async () => {
  try { if (document.fonts?.ready) await document.fonts.ready; } catch { /* no-op */ }
};

// ממתין שכל ה-<img> בתוך ה-host יסיימו להיטען (תמונות stock/upload)
const waitForImages = (host) =>
  Promise.all([...host.querySelectorAll('img')].map((img) =>
    img.complete ? null : new Promise((res) => { img.onload = res; img.onerror = res; })));

// rAF נחנק כשהחלון ברקע/ממוזער (throttling של הדפדפן/WebView2) — בלי fallback
// הייצוא נתקע עד ה-timeout וכל הצריבות נכשלות. race עם setTimeout מבטיח התקדמות.
const nextFrame = () => Promise.race([
  new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))),
  new Promise((res) => setTimeout(res, 300)),
]);

// גם html-to-image עצמו ממתין ל-rAF פנימי (createImage) שלא יורה בטאב חבוי —
// הצריבה נתקעת לנצח וכל שקף נופל ל-timeout. בזמן צריבה מחליפים rAF זמנית
// ב-shim מבוסס setTimeout (refcount לצריבות מקבילות). ל-render offscreen אין
// משמעות ל-vsync, וה-rAF המקורי משוחזר מיד בסיום.
let rafPatchDepth = 0;
let originalRaf = null;
const patchRafForHiddenTab = () => {
  rafPatchDepth += 1;
  if (rafPatchDepth > 1) return;
  originalRaf = window.requestAnimationFrame;
  window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 16);
};
const restoreRaf = () => {
  rafPatchDepth = Math.max(0, rafPatchDepth - 1);
  if (rafPatchDepth > 0 || !originalRaf) return;
  window.requestAnimationFrame = originalRaf;
  originalRaf = null;
};

/**
 * renderSlideToPng — שקף בודד → PNG dataURL בגודל 1280×720 (×pixelRatio).
 * @param {object} slide   שקף מהמודל
 * @param {string} themeId
 * @param {number|null} index  למוטיב מספר השקף
 * @param {{pixelRatio?:number, bgOnly?:boolean, deckTitle?:string}} opts  bgOnly=רק שכבת הרקע (לצריבת רקע native); deckTitle=לצריבת הפוטר
 */
export const renderSlideToPng = async (slide, themeId, index = null, { pixelRatio = 2, bgOnly = false, deckTitle = '', format = 'png', quality = 0.85, fontCss = null } = {}) => {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${STAGE_W}px;height:${STAGE_H}px;pointer-events:none;z-index:-1;`;
  document.body.appendChild(host);

  const root = createRoot(host);
  patchRafForHiddenTab();
  try {
    root.render(React.createElement(SlideStage, { slide, themeId, index, bgOnly, deckTitle }));
    await nextFrame();
    await waitForFonts();
    await waitForImages(host);
    await nextFrame();

    const target = host.firstElementChild || host;
    // fontCss (מ-fontEmbed.js) — @font-face עם data-URI שמוזרק ל-SVG, כדי שהצריבה
    // תרונדר בפונטים האמיתיים (ה-SVG נטען כ-<img> מבודד ולא רואה את פונטי הדף).
    // skipFonts:true נשאר כרשת ביטחון כשאין fontCss — לא מושך CSS cross-origin
    // (נתקע ב-WebView2/CSP); fontEmbedCSS גובר על skipFonts כשהוא קיים.
    // format:'jpeg' לרקעים (bgOnly) — גרדיאנטים נדחסים פי ~10 מ-PNG בלי אובדן נראה.
    const raster = format === 'jpeg' ? toJpeg : toPng;
    const png = raster(target, {
      width: STAGE_W,
      height: STAGE_H,
      pixelRatio,
      cacheBust: true,
      skipFonts: true,
      ...(fontCss ? { fontEmbedCSS: fontCss } : {}),
      ...(format === 'jpeg' ? { quality, backgroundColor: '#ffffff' } : {}),
      style: { transform: 'none', margin: '0' },
    });
    // timeout כדי שייצוא לא ייתקע אם הרסטר נכשל — נופלים ל-native לשקף הזה.
    return await Promise.race([
      png,
      new Promise((_, reject) => setTimeout(() => reject(new Error('slide raster timeout')), 20000)),
    ]);
  } finally {
    restoreRaf();
    root.unmount();
    host.remove();
  }
};

/**
 * renderSlidesToPng — מרנדר מספר שקפים במקביל.
 * מחזיר { map: Map(slideId → dataUrl), failures: [{ id, index, error }] }.
 * שקף שנכשל מושמט מה-Map ונרשם ב-failures (ה-renderer הראשי נופל ל-native/רקע-אחיד).
 */
export const renderSlidesToPng = async (slides, themeId, opts = {}) => {
  const map = new Map();
  const failures = [];
  await Promise.all(slides.map(async ({ slide, index }) => {
    try {
      const png = await renderSlideToPng(slide, themeId, index, opts);
      if (png) map.set(slide.id, png);
      else failures.push({ id: slide.id, index, error: 'empty raster' });
    } catch (e) {
      failures.push({ id: slide.id, index, error: String(e?.message || e) });
    }
  }));
  return { map, failures };
};
