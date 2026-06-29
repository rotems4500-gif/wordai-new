// ═══════════════════════════════════════════════════════════════
// pptxExport.js — deck JSON → קובץ .pptx (pptxgenjs).
// שני מסלולי ייצוא (hybrid):
//   native  — צורות/טקסט אמיתיים, עריכים ב-PowerPoint. תיקון bidi לשמות לטיניים.
//   image   — רסטר DOM ל-PNG, נאמנות עיצוב מלאה (פונט+רקע+bidi נצרבים).
// profile קובע: 'editable' = הכל native | 'faithful' = הכל image | 'auto' = מעורב per-slide.
// ═══════════════════════════════════════════════════════════════

import PptxGenJS from 'pptxgenjs';
import { getThemeById, hex, getSlideAccent } from '../presentation/deckThemes';
import { getSlideBaseColor } from '../presentation/slideBackgrounds';
import { getSlideExportMode } from '../presentation/deckModel';
import { renderSlidesToPng } from './slideImageRender';
import { fetchImageAsDataUrl } from './imageService';

const W = 13.333; // רוחב שקופית 16:9 באינצ'ים
const H = 7.5;

// ── תיקון bidi (RTL + שמות/מונחים לטיניים) ───────────────────────
// בפסקה עברית, רצף לטיני (Wolfsfeld, 2011) מתהפך ב-PowerPoint אלא אם
// הוא run נפרד עם lang="en-US". מפצלים את הטקסט ל-runs לפי כיווניות.
const RE_HAS_LATIN = /[A-Za-z]/;
const RE_HAS_HEB = /[֐-׿יִ-ﭏ]/;
// רצף לטיני: מתחיל באות לטינית, ממשיך באותיות/ספרות/פיסוק פנימי (בלי סוגריים/;)
const RE_LATIN_SEG = /[A-Za-z][A-Za-z0-9.,'’"&/:\-]*(?:\s+[A-Za-z0-9][A-Za-z0-9.,'’"&/:\-]*)*/g;

const splitBidi = (text) => {
  const str = String(text == null ? '' : text);
  if (!str) return [{ t: '', lang: 'he-IL' }];
  if (!RE_HAS_HEB.test(str)) return [{ t: str, lang: RE_HAS_LATIN.test(str) ? 'en-US' : 'he-IL' }];
  if (!RE_HAS_LATIN.test(str)) return [{ t: str, lang: 'he-IL' }];
  const runs = [];
  let last = 0;
  let m;
  RE_LATIN_SEG.lastIndex = 0;
  // eslint-disable-next-line no-cond-assign
  while ((m = RE_LATIN_SEG.exec(str))) {
    if (m.index > last) runs.push({ t: str.slice(last, m.index), lang: 'he-IL' });
    runs.push({ t: m[0], lang: 'en-US' });
    last = m.index + m[0].length;
  }
  if (last < str.length) runs.push({ t: str.slice(last), lang: 'he-IL' });
  return runs;
};

// מחרוזת → מערך runs ל-pptxgenjs (font/color/size מגיעים מ-opts של ה-textbox)
const toRuns = (text, extra = {}) =>
  splitBidi(text).map((r) => ({
    text: r.t,
    options: { lang: r.lang, rtlMode: r.lang === 'he-IL', ...extra },
  }));

const titleOpts = (color) => ({
  fontFace: 'Heebo', bold: true, color, rtlMode: true, align: 'right', valign: 'top',
});
const bodyOpts = (color) => ({
  fontFace: 'Heebo', color, rtlMode: true, align: 'right', valign: 'top',
});

// טקסט יחיד עם תיקון bidi
const putText = (slide, text, opts) => slide.addText(toRuns(text), opts);

// בולטים — כל בולט = פסקה; מפוצל ל-runs עם bullet על הראשון ו-breakLine על האחרון
const addBullets = (slide, bullets, { x, y, w, h, color, fontSize = 18 }) => {
  if (!bullets || !bullets.length) return;
  const objs = [];
  bullets.forEach((b) => {
    const runs = splitBidi(b);
    runs.forEach((r, i) => objs.push({
      text: r.t,
      options: {
        lang: r.lang,
        rtlMode: r.lang === 'he-IL',
        ...(i === 0 ? { bullet: { code: '2022' } } : {}),
        ...(i === runs.length - 1 ? { breakLine: true } : {}),
      },
    }));
  });
  slide.addText(objs, { x, y, w, h, ...bodyOpts(color), fontSize, lineSpacingMultiple: 1.3, paraSpaceAfter: 8 });
};

// משיג dataUrl לכל תמונה בדק (במקביל), כי pptx צריך base64 מוטמע
const resolveImages = async (deck) => {
  const map = new Map();
  const slidesWithImg = deck.slides.filter((s) => s.image && (s.image.dataUrl || s.image.url));
  await Promise.all(slidesWithImg.map(async (s) => {
    try {
      const src = s.image.dataUrl || s.image.url;
      const dataUrl = src.startsWith('data:') ? src : await fetchImageAsDataUrl(src);
      if (dataUrl) map.set(s.id, dataUrl);
    } catch {
      // תמונה שנכשלה — מדלגים, השקופית עדיין נבנית
    }
  }));
  return map;
};

/**
 * buildPptxBase64 — מחזיר את ה-pptx כ-base64 string.
 * @param {object} deck
 * @param {{profile?: 'auto'|'editable'|'faithful', pixelRatio?: number}} options
 */
export const buildPptxBase64 = async (deck, { profile = 'auto', pixelRatio = 2 } = {}) => {
  const theme = getThemeById(deck.themeId);
  const c = theme.colors;
  const bg = hex(c.bg);
  const text = hex(c.text);
  const muted = hex(c.muted);
  // per-slide accent: רוטציה מפלטת ה-theme (override ידני גובר). hex בלי '#'.
  const accentAt = (s, i) => hex(getSlideAccent(theme, s, i));

  // מצב ייצוא לכל שקף לפי ה-profile
  const modeFor = (s) => {
    if (profile === 'editable') return 'native';
    if (profile === 'faithful') return 'image';
    return getSlideExportMode(s);
  };

  // קודם ממירים כל תמונה ל-dataUrl (גם לשקפי image — אחרת html-to-image נכשל על CORS)
  const images = await resolveImages(deck);

  // pre-render של שקפי image במקביל (DOM → PNG). מזריקים dataUrl כדי לעקוף CORS;
  // notes נשמרות אמיתיות בנפרד בלולאה למטה.
  const imageModeSlides = deck.slides
    .map((s, i) => ({ slide: s, index: i }))
    .filter(({ slide }) => modeFor(slide) === 'image')
    .map(({ slide, index }) => {
      const resolved = images.get(slide.id);
      const withData = resolved && slide.image
        ? { ...slide, image: { ...slide.image, dataUrl: resolved, url: '' } }
        : slide;
      return { slide: withData, index };
    });
  const pngMap = imageModeSlides.length
    ? await renderSlidesToPng(imageModeSlides, deck.themeId, { pixelRatio })
    : new Map();

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WF16x9', width: W, height: H });
  pptx.layout = 'WF16x9';
  pptx.title = deck.title || 'מצגת';

  deck.slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: hex(getSlideBaseColor(theme, i)) };

    // מסלול image — שקף מרונדר כתמונה מלאה. notes נשארות אמיתיות.
    if (modeFor(s) === 'image' && pngMap.has(s.id)) {
      slide.addImage({ data: pngMap.get(s.id), x: 0, y: 0, w: W, h: H });
      if (s.notes) slide.addNotes(s.notes);
      return;
    }

    const ac = accentAt(s, i);
    const imgData = images.get(s.id);
    const layout = s.layout || 'title-bullets';

    if (s.notes) slide.addNotes(s.notes);

    if (layout === 'cover' || layout === 'section') {
      if (imgData && layout === 'cover') {
        slide.addImage({ data: imgData, x: 0, y: 0, w: W, h: H, sizing: { type: 'cover', w: W, h: H } });
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: bg, transparency: 35 } });
      }
      slide.addShape(pptx.ShapeType.rect, { x: W - 2.0, y: 1.0, w: 1.0, h: 0.12, fill: { color: ac } });
      putText(slide, s.title || 'כותרת', { x: 0.8, y: 2.4, w: W - 1.6, h: 2.0, ...titleOpts(text), fontSize: 44, align: layout === 'section' ? 'center' : 'right' });
      if (s.subtitle) putText(slide, s.subtitle, { x: 0.8, y: 4.4, w: W - 1.6, h: 1.0, ...bodyOpts(muted), fontSize: 22, align: layout === 'section' ? 'center' : 'right' });
      return;
    }

    if (layout === 'quote') {
      slide.addText('”', { x: 0.8, y: 0.6, w: 2, h: 1.5, fontFace: 'Heebo', bold: true, color: ac, fontSize: 96, align: 'right' });
      putText(slide, s.body || 'ציטוט', { x: 1.0, y: 2.0, w: W - 2.0, h: 3.0, ...titleOpts(text), fontSize: 32, valign: 'middle' });
      if (s.subtitle) putText(slide, `— ${s.subtitle}`, { x: 1.0, y: 5.2, w: W - 2.0, h: 0.8, ...bodyOpts(muted), fontSize: 20 });
      return;
    }

    if (layout === 'image-full') {
      if (imgData) slide.addImage({ data: imgData, x: 0, y: 0, w: W, h: H, sizing: { type: 'cover', w: W, h: H } });
      if (s.title) {
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: H - 2.0, w: W, h: 2.0, fill: { color: bg, transparency: 25 } });
        putText(slide, s.title, { x: 0.8, y: H - 1.7, w: W - 1.6, h: 1.0, ...titleOpts(text), fontSize: 30 });
      }
      return;
    }

    if (layout === 'image-right' || layout === 'image-left') {
      const imgW = W * 0.46;
      const imgOnRight = layout === 'image-right';
      const imgX = imgOnRight ? W - imgW : 0;
      const txtX = imgOnRight ? 0.8 : imgW + 0.6;
      const txtW = W - imgW - 1.4;
      if (imgData) slide.addImage({ data: imgData, x: imgX, y: 0, w: imgW, h: H, sizing: { type: 'cover', w: imgW, h: H } });
      else slide.addShape(pptx.ShapeType.rect, { x: imgX, y: 0, w: imgW, h: H, fill: { color: hex(c.bgAlt) } });
      putText(slide, s.title || 'כותרת', { x: txtX, y: 0.9, w: txtW, h: 1.2, ...titleOpts(text), fontSize: 30 });
      slide.addShape(pptx.ShapeType.rect, { x: txtX + txtW - 0.7, y: 2.1, w: 0.7, h: 0.1, fill: { color: ac } });
      addBullets(slide, s.bullets, { x: txtX, y: 2.5, w: txtW, h: 4.0, color: text, fontSize: 18 });
      return;
    }

    if (layout === 'two-column') {
      slide.addShape(pptx.ShapeType.rect, { x: W - 1.6, y: 0.7, w: 0.7, h: 0.1, fill: { color: ac } });
      putText(slide, s.title || 'כותרת', { x: 0.8, y: 0.8, w: W - 1.6, h: 1.0, ...titleOpts(text), fontSize: 30 });
      const cols = (s.columns || []).slice(0, 3);
      const gap = 0.4;
      const colW = (W - 1.6 - gap * (cols.length - 1)) / Math.max(1, cols.length);
      cols.forEach((col, i) => {
        const x = 0.8 + i * (colW + gap);
        slide.addShape(pptx.ShapeType.roundRect, { x, y: 2.2, w: colW, h: 4.6, fill: { color: hex(c.surface) }, line: { color: hex(c.border || c.bgAlt), width: 0.75 }, rectRadius: 0.1 });
        if (col.heading) putText(slide, col.heading, { x: x + 0.2, y: 2.45, w: colW - 0.4, h: 0.7, ...titleOpts(ac), fontSize: 20 });
        addBullets(slide, col.bullets, { x: x + 0.2, y: 3.2, w: colW - 0.4, h: 3.4, color: text, fontSize: 15 });
      });
      return;
    }

    if (layout === 'big-statement') {
      slide.addShape(pptx.ShapeType.rect, { x: 0.8, y: 2.2, w: 1.0, h: 0.13, fill: { color: ac } });
      putText(slide, s.body || 'משפט מפתח', { x: 0.8, y: 2.6, w: W - 1.6, h: 2.6, ...titleOpts(text), fontSize: 40 });
      if (s.subtitle) putText(slide, s.subtitle, { x: 0.8, y: 5.4, w: W - 1.6, h: 0.8, ...bodyOpts(muted), fontSize: 22 });
      return;
    }

    if (layout === 'stat') {
      slide.addShape(pptx.ShapeType.rect, { x: W - 1.6, y: 0.7, w: 0.7, h: 0.1, fill: { color: ac } });
      putText(slide, s.title || 'נתונים', { x: 0.8, y: 0.8, w: W - 1.6, h: 1.0, ...titleOpts(text), fontSize: 30 });
      const stats = (s.stats || []).slice(0, 4);
      const n = Math.max(1, stats.length);
      const gap = 0.4;
      const colW = (W - 1.6 - gap * (n - 1)) / n;
      stats.forEach((st, i) => {
        const x = 0.8 + i * (colW + gap);
        putText(slide, st.value || '', { x, y: 2.4, w: colW, h: 1.6, fontFace: 'Heebo', bold: true, color: ac, rtlMode: true, align: 'right', valign: 'top', fontSize: 54 });
        putText(slide, st.label || '', { x, y: 4.0, w: colW, h: 0.7, ...titleOpts(text), fontSize: 20 });
        if (st.caption) putText(slide, st.caption, { x, y: 4.7, w: colW, h: 1.6, ...bodyOpts(muted), fontSize: 14 });
      });
      return;
    }

    if (layout === 'steps') {
      slide.addShape(pptx.ShapeType.rect, { x: W - 1.6, y: 0.7, w: 0.7, h: 0.1, fill: { color: ac } });
      putText(slide, s.title || 'תהליך', { x: 0.8, y: 0.8, w: W - 1.6, h: 1.0, ...titleOpts(text), fontSize: 30 });
      const steps = (s.steps || []).slice(0, 6);
      const n = Math.max(1, steps.length);
      const gap = 0.4;
      const colW = (W - 1.6 - gap * (n - 1)) / n;
      steps.forEach((st, i) => {
        const x = 0.8 + i * (colW + gap);
        slide.addShape(pptx.ShapeType.ellipse, { x: x + colW - 0.75, y: 2.3, w: 0.75, h: 0.75, fill: { color: ac } });
        slide.addText(`${i + 1}`, { x: x + colW - 0.75, y: 2.3, w: 0.75, h: 0.75, align: 'center', valign: 'middle', fontFace: 'Heebo', bold: true, color: hex(c.onAccent || c.bg), fontSize: 24 });
        putText(slide, st.title || '', { x, y: 3.3, w: colW, h: 0.8, ...titleOpts(text), fontSize: 20 });
        if (st.body) putText(slide, st.body, { x, y: 4.1, w: colW, h: 2.4, ...bodyOpts(muted), fontSize: 14 });
      });
      return;
    }

    if (layout === 'comparison') {
      slide.addShape(pptx.ShapeType.rect, { x: W - 1.6, y: 0.7, w: 0.7, h: 0.1, fill: { color: ac } });
      putText(slide, s.title || 'השוואה', { x: 0.8, y: 0.8, w: W - 1.6, h: 1.0, ...titleOpts(text), fontSize: 30 });
      const cols = (s.columns || []).slice(0, 2);
      const accent2 = hex(c.accent2 || c.accent);
      const gap = 0.6;
      const colW = (W - 1.6 - gap) / 2;
      cols.forEach((col, i) => {
        const x = 0.8 + i * (colW + gap);
        const sa = i % 2 === 0 ? ac : accent2;
        slide.addShape(pptx.ShapeType.roundRect, { x, y: 2.2, w: colW, h: 4.6, fill: { color: hex(c.surface) }, line: { color: hex(c.border || c.bgAlt), width: 0.75 }, rectRadius: 0.1 });
        if (col.heading) putText(slide, col.heading, { x: x + 0.2, y: 2.45, w: colW - 0.4, h: 0.7, fontFace: 'Heebo', bold: true, color: sa, rtlMode: true, align: 'right', valign: 'top', fontSize: 22 });
        addBullets(slide, col.bullets, { x: x + 0.2, y: 3.3, w: colW - 0.4, h: 3.3, color: text, fontSize: 16 });
      });
      return;
    }

    // title-bullets / closing
    slide.addShape(pptx.ShapeType.rect, { x: W - 1.6, y: 0.7, w: 0.7, h: 0.1, fill: { color: ac } });
    putText(slide, s.title || 'כותרת השקופית', { x: 0.8, y: 0.8, w: W - 1.6, h: 1.2, ...titleOpts(text), fontSize: 32 });
    if (s.subtitle) putText(slide, s.subtitle, { x: 0.8, y: 1.9, w: W - 1.6, h: 0.7, ...bodyOpts(muted), fontSize: 20 });
    const hasImg = Boolean(imgData);
    const bulletsW = hasImg ? (W - 1.6) * 0.58 : W - 1.6;
    addBullets(slide, s.bullets, { x: hasImg ? (W - 0.8 - bulletsW) : 0.8, y: s.subtitle ? 2.7 : 2.4, w: bulletsW, h: 4.0, color: text, fontSize: 20 });
    if (hasImg) slide.addImage({ data: imgData, x: 0.8, y: 2.7, w: (W - 1.6) * 0.38, h: 3.8, sizing: { type: 'cover', w: (W - 1.6) * 0.38, h: 3.8 } });
  });

  return pptx.write('base64');
};
