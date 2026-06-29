// ═══════════════════════════════════════════════════════════════
// slideImageRender.js — מנוע ה-hybrid export.
// מרנדר SlideStage (אותו רנדרר של המסך) offscreen ב-1280×720,
// וצורב ל-PNG dataURL. כך שקפי "hero" מקבלים חופש עיצוב מלא של CSS,
// והפונט + ה-bidi (RTL+לטינית) נצרבים נכון לתוך התמונה.
// ═══════════════════════════════════════════════════════════════

import React from 'react';
import { createRoot } from 'react-dom/client';
import { toPng } from 'html-to-image';
import { SlideStage, STAGE_W, STAGE_H } from '../presentation/SlideRenderer';

// ממתין לטעינת פונטים (Heebo/Rubik/Secular One וכו') לפני הצריבה
const waitForFonts = async () => {
  try { if (document.fonts?.ready) await document.fonts.ready; } catch { /* no-op */ }
};

// ממתין שכל ה-<img> בתוך ה-host יסיימו להיטען (תמונות stock/upload)
const waitForImages = (host) =>
  Promise.all([...host.querySelectorAll('img')].map((img) =>
    img.complete ? null : new Promise((res) => { img.onload = res; img.onerror = res; })));

const nextFrame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));

/**
 * renderSlideToPng — שקף בודד → PNG dataURL בגודל 1280×720 (×pixelRatio).
 * @param {object} slide   שקף מהמודל
 * @param {string} themeId
 * @param {number|null} index  למוטיב מספר השקף
 * @param {{pixelRatio?:number}} opts
 */
export const renderSlideToPng = async (slide, themeId, index = null, { pixelRatio = 2 } = {}) => {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${STAGE_W}px;height:${STAGE_H}px;pointer-events:none;z-index:-1;`;
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(React.createElement(SlideStage, { slide, themeId, index }));
    await nextFrame();
    await waitForFonts();
    await waitForImages(host);
    await nextFrame();

    const target = host.firstElementChild || host;
    // skipFonts:true — לא למשוך @font-face cross-origin (נתקע ב-WebView2/CSP).
    // הפונטים כבר טעונים במסמך, אז ה-foreignObject מרונדר איתם ממילא.
    const png = toPng(target, {
      width: STAGE_W,
      height: STAGE_H,
      pixelRatio,
      cacheBust: true,
      skipFonts: true,
      style: { transform: 'none', margin: '0' },
    });
    // timeout כדי שייצוא לא ייתקע אם הרסטר נכשל — נופלים ל-native לשקף הזה.
    return await Promise.race([
      png,
      new Promise((_, reject) => setTimeout(() => reject(new Error('slide raster timeout')), 12000)),
    ]);
  } finally {
    root.unmount();
    host.remove();
  }
};

/**
 * renderSlidesToPng — מרנדר מספר שקפים במקביל. מחזיר Map(slideId → dataUrl).
 * שקף שנכשל מושמט מה-Map (ה-renderer הראשי נופל ל-native עבורו).
 */
export const renderSlidesToPng = async (slides, themeId, opts = {}) => {
  const map = new Map();
  await Promise.all(slides.map(async ({ slide, index }) => {
    try {
      const png = await renderSlideToPng(slide, themeId, index, opts);
      if (png) map.set(slide.id, png);
    } catch { /* נכשל — fallback ל-native */ }
  }));
  return map;
};
