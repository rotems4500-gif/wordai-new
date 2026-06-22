// ═══════════════════════════════════════════════════════════════
// pptxExport.js — deck JSON → קובץ .pptx (pptxgenjs).
// ממפה layouts/theme לשקופיות PowerPoint. תמונות מוטמעות כ-base64.
// ═══════════════════════════════════════════════════════════════

import PptxGenJS from 'pptxgenjs';
import { getThemeById, hex } from '../presentation/deckThemes';
import { fetchImageAsDataUrl } from './imageService';

const W = 13.333; // רוחב שקופית 16:9 באינצ'ים
const H = 7.5;

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

const titleOpts = (color) => ({
  fontFace: 'Heebo', bold: true, color, rtlMode: true, align: 'right', valign: 'top',
});
const bodyOpts = (color) => ({
  fontFace: 'Heebo', color, rtlMode: true, align: 'right', valign: 'top',
});

const addBullets = (slide, bullets, { x, y, w, h, color, fontSize = 18 }) => {
  if (!bullets || !bullets.length) return;
  slide.addText(
    bullets.map((b) => ({ text: b, options: { bullet: { code: '2022' }, breakLine: true } })),
    { x, y, w, h, ...bodyOpts(color), fontSize, lineSpacingMultiple: 1.3, paraSpaceAfter: 8 },
  );
};

/**
 * buildPptxBase64 — מחזיר את ה-pptx כ-base64 string.
 */
export const buildPptxBase64 = async (deck) => {
  const theme = getThemeById(deck.themeId);
  const c = theme.colors;
  const bg = hex(c.bg);
  const text = hex(c.text);
  const muted = hex(c.muted);
  const accent = (s) => hex((s?.accent && s.accent.trim()) || c.accent);

  const images = await resolveImages(deck);

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WF16x9', width: W, height: H });
  pptx.layout = 'WF16x9';
  pptx.title = deck.title || 'מצגת';

  deck.slides.forEach((s) => {
    const slide = pptx.addSlide();
    slide.background = { color: bg };
    const ac = accent(s);
    const imgData = images.get(s.id);
    const layout = s.layout || 'title-bullets';

    if (s.notes) slide.addNotes(s.notes);

    if (layout === 'cover' || layout === 'section') {
      if (imgData && layout === 'cover') {
        slide.addImage({ data: imgData, x: 0, y: 0, w: W, h: H, sizing: { type: 'cover', w: W, h: H } });
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: bg, transparency: 35 } });
      }
      slide.addShape(pptx.ShapeType.rect, { x: W - 2.0, y: 1.0, w: 1.0, h: 0.12, fill: { color: ac } });
      slide.addText(s.title || 'כותרת', { x: 0.8, y: 2.4, w: W - 1.6, h: 2.0, ...titleOpts(text), fontSize: 44, align: layout === 'section' ? 'center' : 'right' });
      if (s.subtitle) slide.addText(s.subtitle, { x: 0.8, y: 4.4, w: W - 1.6, h: 1.0, ...bodyOpts(muted), fontSize: 22, align: layout === 'section' ? 'center' : 'right' });
      return;
    }

    if (layout === 'quote') {
      slide.addText('”', { x: 0.8, y: 0.6, w: 2, h: 1.5, fontFace: 'Heebo', bold: true, color: ac, fontSize: 96, align: 'right' });
      slide.addText(s.body || 'ציטוט', { x: 1.0, y: 2.0, w: W - 2.0, h: 3.0, ...titleOpts(text), fontSize: 32, valign: 'middle' });
      if (s.subtitle) slide.addText(`— ${s.subtitle}`, { x: 1.0, y: 5.2, w: W - 2.0, h: 0.8, ...bodyOpts(muted), fontSize: 20 });
      return;
    }

    if (layout === 'image-full') {
      if (imgData) slide.addImage({ data: imgData, x: 0, y: 0, w: W, h: H, sizing: { type: 'cover', w: W, h: H } });
      if (s.title) {
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: H - 2.0, w: W, h: 2.0, fill: { color: bg, transparency: 25 } });
        slide.addText(s.title, { x: 0.8, y: H - 1.7, w: W - 1.6, h: 1.0, ...titleOpts(text), fontSize: 30 });
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
      slide.addText(s.title || 'כותרת', { x: txtX, y: 0.9, w: txtW, h: 1.2, ...titleOpts(text), fontSize: 30 });
      slide.addShape(pptx.ShapeType.rect, { x: txtX + txtW - 0.7, y: 2.1, w: 0.7, h: 0.1, fill: { color: ac } });
      addBullets(slide, s.bullets, { x: txtX, y: 2.5, w: txtW, h: 4.0, color: text, fontSize: 18 });
      return;
    }

    if (layout === 'two-column') {
      slide.addShape(pptx.ShapeType.rect, { x: W - 1.6, y: 0.7, w: 0.7, h: 0.1, fill: { color: ac } });
      slide.addText(s.title || 'כותרת', { x: 0.8, y: 0.8, w: W - 1.6, h: 1.0, ...titleOpts(text), fontSize: 30 });
      const cols = (s.columns || []).slice(0, 3);
      const gap = 0.4;
      const colW = (W - 1.6 - gap * (cols.length - 1)) / Math.max(1, cols.length);
      cols.forEach((col, i) => {
        const x = 0.8 + i * (colW + gap);
        slide.addShape(pptx.ShapeType.roundRect, { x, y: 2.2, w: colW, h: 4.6, fill: { color: hex(c.surface) }, rectRadius: 0.1 });
        if (col.heading) slide.addText(col.heading, { x: x + 0.2, y: 2.45, w: colW - 0.4, h: 0.7, ...titleOpts(ac), fontSize: 20 });
        addBullets(slide, col.bullets, { x: x + 0.2, y: 3.2, w: colW - 0.4, h: 3.4, color: text, fontSize: 15 });
      });
      return;
    }

    // title-bullets / closing
    slide.addShape(pptx.ShapeType.rect, { x: W - 1.6, y: 0.7, w: 0.7, h: 0.1, fill: { color: ac } });
    slide.addText(s.title || 'כותרת השקופית', { x: 0.8, y: 0.8, w: W - 1.6, h: 1.2, ...titleOpts(text), fontSize: 32 });
    if (s.subtitle) slide.addText(s.subtitle, { x: 0.8, y: 1.9, w: W - 1.6, h: 0.7, ...bodyOpts(muted), fontSize: 20 });
    const hasImg = Boolean(imgData);
    const bulletsW = hasImg ? (W - 1.6) * 0.58 : W - 1.6;
    addBullets(slide, s.bullets, { x: hasImg ? (W - 0.8 - bulletsW) : 0.8, y: s.subtitle ? 2.7 : 2.4, w: bulletsW, h: 4.0, color: text, fontSize: 20 });
    if (hasImg) slide.addImage({ data: imgData, x: 0.8, y: 2.7, w: (W - 1.6) * 0.38, h: 3.8, sizing: { type: 'cover', w: (W - 1.6) * 0.38, h: 3.8 } });
  });

  return pptx.write('base64');
};
