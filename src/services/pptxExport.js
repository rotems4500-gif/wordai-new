// ═══════════════════════════════════════════════════════════════
// pptxExport.js — deck JSON → קובץ .pptx (pptxgenjs).
// שני מסלולי ייצוא (hybrid):
//   native  — צורות/טקסט אמיתיים, עריכים ב-PowerPoint. תיקון bidi לשמות לטיניים.
//   image   — רסטר DOM ל-PNG, נאמנות עיצוב מלאה (פונט+רקע+bidi נצרבים).
// profile קובע: 'editable' = הכל native | 'faithful' = הכל image | 'auto' = מעורב per-slide.
// ═══════════════════════════════════════════════════════════════

import PptxGenJS from 'pptxgenjs';
import { getThemeById, hex, getSlideAccent, getThemeFontNames } from '../presentation/deckThemes';
import { getFontEmbedCss } from './fontEmbed';
import { getSlideBaseColor } from '../presentation/slideBackgrounds';
import { getSlideExportMode, deckDecorSeed } from '../presentation/deckModel';
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
// מחרוזת של ספרות/סימנים בלבד ('87%', '1.5M' בלי אות, '2019-2024', '3:1').
// ⚠️ נמדד: תיוגה כ-he-IL + rtlMode הפך אותה ב-PowerPoint ל-'%87'. אין בה
// שום תו עברי — היא חייבת לצאת כ-run לטיני (en-US) בלי rtlMode.
const RE_PURE_NUMERIC = /^[\d\s.,%+\-–—/:()]+$/;

const splitBidi = (text) => {
  const str = String(text == null ? '' : text);
  if (!str) return [{ t: '', lang: 'he-IL' }];
  if (RE_PURE_NUMERIC.test(str)) return [{ t: str, lang: 'en-US' }];
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
// lang/rtlMode נקבעים לפי הכיווניות בפועל ואסור ש-extra ידרוס אותם — run לטיני
// (או מספרי) עם rtlMode:true הוא בדיוק הבאג שהפך '87%' ל-'%87'.
const toRuns = (text, extra = {}) =>
  splitBidi(text).map((r) => ({
    text: r.t,
    options: { ...extra, lang: r.lang, rtlMode: r.lang === 'he-IL' },
  }));

// כותרות/מספרים — פונט ה-display של ה-theme; גוף/בולטים — פונט ה-body.
// שם הפונט מגיע מה-theme (getThemeFontNames), עם fallback ל-Heebo.
const titleOpts = (color, font = 'Heebo') => ({
  fontFace: font, bold: true, color, rtlMode: true, align: 'right', valign: 'top',
});
const bodyOpts = (color, font = 'Heebo') => ({
  fontFace: font, color, rtlMode: true, align: 'right', valign: 'top',
});

// טקסט יחיד עם תיקון bidi
const putText = (slide, text, opts) => slide.addText(toRuns(text), opts);

// בולטים — כל בולט = פסקה; מפוצל ל-runs עם bullet על הראשון ו-breakLine על האחרון
const addBullets = (slide, bullets, { x, y, w, h, color, fontSize = 18, font = 'Heebo' }) => {
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
  slide.addText(objs, { x, y, w, h, ...bodyOpts(color, font), fontSize, lineSpacingMultiple: 1.3, paraSpaceAfter: 8 });
};

// פוטר native: שם הדק מימין + מספר שקף משמאל, בתחתית השקף. תואם ל-Footer של SlideRenderer.
const addFooter = (slide, { deckTitle, index, color, font = 'Heebo' }) => {
  const y = H - 0.35;
  if (deckTitle) putText(slide, deckTitle, { x: W - 4.5, y, w: 4.0, h: 0.3, ...bodyOpts(color, font), fontSize: 9, align: 'right', valign: 'middle' });
  if (index != null) putText(slide, String(index + 1).padStart(2, '0'), { x: 0.5, y, w: 1.0, h: 0.3, ...bodyOpts(color, font), fontSize: 9, align: 'left', valign: 'middle' });
};

// קיקר native: תווית קטנה מודגשת בצבע accent מעל הכותרת (רק כשמוגדר).
const addKicker = (slide, kicker, { x, y, w, color, font = 'Heebo' }) => {
  if (!kicker) return;
  putText(slide, kicker, { x, y, w, h: 0.4, fontFace: font, bold: true, color, rtlMode: true, align: 'right', valign: 'top', fontSize: 13, charSpacing: 1 });
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

// תקציב-זמן קשיח לשלב הצריבה. renderSlideToPng כבר מגביל שקף בודד ל-20s, אבל
// שלבים שקודמים לו (document.fonts.ready, פענוח תמונות) יכולים להיתקע ללא הגבלה —
// למשל בחלון/טאב חבוי שבו rAF אינו יורה. בלי התקציב הזה הייצוא נתקע בשקט לנצח;
// איתו הוא מידרדר לשקפים ללא צריבה + אזהרה בעברית.
const RASTER_PHASE_BUDGET_MS = 90000;
const withRasterBudget = async (promise, label, warnings) => {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => {
          warnings.push(`${label} דילג על צריבת העיצוב (חריגת זמן) — הייצוא הושלם בלי הרקעים המעוצבים`);
          resolve({ map: new Map(), failures: [] });
        }, RASTER_PHASE_BUDGET_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * buildPptxBase64 — מחזיר { base64, warnings }.
 *   base64   — ה-pptx כ-base64 string
 *   warnings — string[] בעברית על שקפים שיצאו ב-fallback (צריבה נכשלה)
 * @param {object} deck
 * @param {{profile?: 'auto'|'editable'|'faithful', pixelRatio?: number}} options
 */
export const buildPptxBase64 = async (deck, { profile = 'auto', pixelRatio = 2 } = {}) => {
  // ערכה שנוצרה ב-AI גוברת על themeId — אותה שכבה שמשמשת את המסך (SlideStage),
  // כך שהייצוא הנייטיב מקבל את אותם צבעים/פונטים בדיוק.
  const theme = (deck?.customTheme && deck.customTheme.colors) ? deck.customTheme : getThemeById(deck.themeId);
  const c = theme.colors;
  const bg = hex(c.bg);
  const text = hex(c.text);
  const muted = hex(c.muted);
  // שמות הפונט של ה-theme (display לכותרות/מספרים, body לגוף/בולטים)
  const fonts = getThemeFontNames(theme);
  const fD = fonts.display;
  const fB = fonts.body;
  // per-slide accent: רוטציה מפלטת ה-theme (override ידני גובר). hex בלי '#'.
  // אותו היסט פר-דק שה-renderer משתמש בו — אחרת האקסנטים בייצוא לא תואמים למסך.
  const decorSeed = deckDecorSeed(deck?.id || '');
  const accentAt = (s, i) => hex(getSlideAccent(theme, s, i, decorSeed));
  const warnings = [];

  const hasVideo = (s) => !!String(s?.video?.dataUrl || '');

  // מצב ייצוא לכל שקף לפי ה-profile
  // ⚠️ שקף עם סרטון יוצא תמיד native: במסלול ה-image הוא נצרב לרסטר,
  // והסרטון היה נעלם מה-PPTX בשקט (rasterו של <video> הוא מלבן ▶ בלבד).
  const modeFor = (s) => {
    if (hasVideo(s)) return 'native';
    if (profile === 'editable') return 'native';
    if (profile === 'faithful') return 'image';
    return getSlideExportMode(s);
  };
  deck.slides.forEach((s, i) => {
    if (hasVideo(s) && (profile === 'faithful' || getSlideExportMode(s) === 'image')) {
      warnings.push(`שקף ${i + 1} יוצא במצב ניתן-לעריכה כדי לשמר את הסרטון`);
    }
  });

  // סרטון תופס את חריץ התמונה של הפריסה. pptxgenjs דורש data עם כותרת base64,
  // וגוזר את הסיומת מתוך ה-mime שב-dataUrl (data:video/mp4;base64 → mp4).
  const addSlideVideo = (slide, s, box) => {
    try {
      slide.addMedia({ type: 'video', data: s.video.dataUrl, ...box });
      return true;
    } catch {
      warnings.push('סרטון אחד לא הוטמע בייצוא');
      return false;
    }
  };

  // קודם ממירים כל תמונה ל-dataUrl (גם לשקפי image — אחרת html-to-image נכשל על CORS)
  const images = await resolveImages(deck);

  // CSS פונטים מוטמע לצריבות — בלעדיו הטקסט בצריבה מרונדר ב-fallback
  // (ה-SVG נטען כ-<img> מבודד). נכשל → null → הצריבה ממשיכה בלי (skipFonts).
  const fontCss = await getFontEmbedCss([fD, fB]);

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
  // JPEG q0.92 — בלתי-מובחן מ-PNG בתצוגה אך קטן פי ~6 (דק faithful ירד מ~27MB ל~4MB)
  const { map: pngMap, failures: imgFailures } = imageModeSlides.length
    ? await withRasterBudget(renderSlidesToPng(imageModeSlides, deck.themeId, { pixelRatio, deckTitle: deck.title, format: 'jpeg', quality: 0.92, fontCss, customTheme: deck?.customTheme || null, deckId: deck?.id || '' }), 'ייצוא התמונות', warnings)
    : { map: new Map(), failures: [] };
  // שקף image שצריבתו נכשלה → יוצא native (fallback). מתריעים למשתמש.
  imgFailures.forEach((f) => warnings.push(`שקף ${f.index + 1} יוצא במצב פשוט (צריבת עיצוב נכשלה)`));

  // רקעי native — צורבים את שכבת העיצוב בלבד (bgOnly) לכל שקף native,
  // כדי לשמר את שפת העיצוב במקום רקע בצבע אחיד. pixelRatio 1.5 מספיק לרקע,
  // ו-JPEG כי גרדיאנטים נדחסים פי ~10 מ-PNG (בלי שקיפות ברקע ממילא).
  // שקפי image שצריבתם המלאה נכשלה מצטרפים לרשימה — שיקבלו לפחות רקע מעוצב.
  const failedImageSlides = imageModeSlides.filter(({ slide }) => !pngMap.has(slide.id));
  const nativeModeSlides = deck.slides
    .map((s, i) => ({ slide: s, index: i }))
    .filter(({ slide }) => modeFor(slide) === 'native')
    .concat(failedImageSlides);
  const { map: bgMap, failures: bgFailures } = nativeModeSlides.length
    ? await withRasterBudget(renderSlidesToPng(nativeModeSlides, deck.themeId, { pixelRatio: 1.5, bgOnly: true, format: 'jpeg', fontCss, customTheme: deck?.customTheme || null, deckId: deck?.id || '' }), 'צריבת הרקעים', warnings)
    : { map: new Map(), failures: [] };
  // רקע native שצריבתו נכשלה → יוצא בצבע אחיד (fallback). מתריעים למשתמש.
  bgFailures.forEach((f) => warnings.push(`שקף ${f.index + 1} יוצא עם רקע אחיד (צריבת רקע נכשלה)`));

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WF16x9', width: W, height: H });
  pptx.layout = 'WF16x9';
  pptx.title = deck.title || 'מצגת';

  deck.slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    // רקע: לשקפי native — JPEG של שכבת העיצוב (אם נצרב), אחרת צבע אחיד.
    // path נדרש רק כרמז סיומת — בלעדיו pptxgenjs כותב את ה-JPEG כ-.png
    // (PowerPoint סולח, Google Slides/Keynote עלולים לא). ה-data גובר על ה-path.
    const bgPng = bgMap.get(s.id);
    slide.background = bgPng ? { data: bgPng, path: 'bg.jpeg' } : { color: hex(getSlideBaseColor(theme, i)) };

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

    if (layout === 'cover') {
      // תמונה קיימת → קומפוזיציה מפוצלת: תמונה בשמאל 45%, טקסט מיושר-ימין בימין 55% (תואם ל-SlideRenderer).
      if (imgData) {
        const imgW = W * 0.45;
        slide.addImage({ data: imgData, x: 0, y: 0, w: imgW, h: H, sizing: { type: 'cover', w: imgW, h: H } });
        slide.addShape(pptx.ShapeType.rect, { x: imgW, y: 0, w: W - imgW, h: H, fill: { color: bg } });
        addKicker(slide, s.kicker, { x: imgW + 0.7, y: 2.6, w: W - imgW - 1.4, color: ac, font: fB });
        slide.addShape(pptx.ShapeType.rect, { x: imgW + 0.7, y: 1.0, w: 1.0, h: 0.12, fill: { color: ac } });
        putText(slide, s.title || 'כותרת', { x: imgW + 0.7, y: s.kicker ? 2.95 : 2.6, w: W - imgW - 1.4, h: 2.0, ...titleOpts(text, fD), fontSize: 40 });
        if (s.subtitle) putText(slide, s.subtitle, { x: imgW + 0.7, y: 4.6, w: W - imgW - 1.4, h: 1.0, ...bodyOpts(muted, fB), fontSize: 20 });
        return;
      }
      addKicker(slide, s.kicker, { x: 0.8, y: 1.9, w: W - 1.6, color: ac, font: fB });
      slide.addShape(pptx.ShapeType.rect, { x: W - 2.0, y: 1.0, w: 1.0, h: 0.12, fill: { color: ac } });
      putText(slide, s.title || 'כותרת', { x: 0.8, y: s.kicker ? 2.75 : 2.4, w: W - 1.6, h: 2.0, ...titleOpts(text, fD), fontSize: 44 });
      if (s.subtitle) putText(slide, s.subtitle, { x: 0.8, y: 4.4, w: W - 1.6, h: 1.0, ...bodyOpts(muted, fB), fontSize: 22 });
      return;
    }

    if (layout === 'section') {
      // מפריד: הרקע (coverGradient אטום) נצרב דרך bgOnly raster — כאן רק טקסט לבן ממורכז שיתאים לו.
      slide.addShape(pptx.ShapeType.rect, { x: W / 2 - 0.5, y: 1.0, w: 1.0, h: 0.1, fill: { color: 'FFFFFF' } });
      putText(slide, s.title || 'מפריד נושא', { x: 0.8, y: 2.6, w: W - 1.6, h: 1.6, fontFace: fD, bold: true, color: 'FFFFFF', rtlMode: true, align: 'center', valign: 'top', fontSize: 40 });
      if (s.subtitle) putText(slide, s.subtitle, { x: 0.8, y: 4.2, w: W - 1.6, h: 1.0, fontFace: fB, color: 'FFFFFF', rtlMode: true, align: 'center', valign: 'top', fontSize: 22 });
      return;
    }

    if (layout === 'quote') {
      // ⚠️ בלי גליפים קשיחים: גרש הפתיחה בגודל 96 ('”') וגם המקף שלפני הייחוס
      // ('— ') נדפסו כתו לטיני בתוך פסקה עברית ונדדו לצד הלא-נכון. במקומם —
      // פס accent מעוגל (צורה, לא טקסט) והייחוס כטקסט עברי נקי בצבע ה-accent.
      slide.addShape(pptx.ShapeType.roundRect, { x: W - 1.6, y: 1.0, w: 0.8, h: 0.14, fill: { color: ac }, rectRadius: 0.07 });
      putText(slide, s.body || 'ציטוט', { x: 1.0, y: 2.0, w: W - 2.0, h: 3.0, ...titleOpts(text, fD), fontSize: 32, valign: 'middle' });
      if (s.subtitle) putText(slide, s.subtitle, { x: 1.0, y: 5.2, w: W - 2.0, h: 0.8, ...bodyOpts(muted, fB), fontSize: 18, bold: true, color: ac });
      addFooter(slide, { deckTitle: deck.title, index: i, color: muted, font: fB });
      return;
    }

    if (layout === 'image-full') {
      if (hasVideo(s)) addSlideVideo(slide, s, { x: 0, y: 0, w: W, h: H });
      else if (imgData) slide.addImage({ data: imgData, x: 0, y: 0, w: W, h: H, sizing: { type: 'cover', w: W, h: H } });
      if (s.title) {
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: H - 2.0, w: W, h: 2.0, fill: { color: bg, transparency: 25 } });
        putText(slide, s.title, { x: 0.8, y: H - 1.7, w: W - 1.6, h: 1.0, ...titleOpts(text, fD), fontSize: 30 });
      }
      return;
    }

    if (layout === 'image-right' || layout === 'image-left') {
      const imgW = W * 0.46;
      const imgOnRight = layout === 'image-right';
      const imgX = imgOnRight ? W - imgW : 0;
      const txtX = imgOnRight ? 0.8 : imgW + 0.6;
      const txtW = W - imgW - 1.4;
      if (hasVideo(s)) {
        slide.addShape(pptx.ShapeType.rect, { x: imgX, y: 0, w: imgW, h: H, fill: { color: hex(c.bgAlt) } });
        addSlideVideo(slide, s, { x: imgX, y: 0, w: imgW, h: H });
      } else if (imgData) slide.addImage({ data: imgData, x: imgX, y: 0, w: imgW, h: H, sizing: { type: 'cover', w: imgW, h: H } });
      else slide.addShape(pptx.ShapeType.rect, { x: imgX, y: 0, w: imgW, h: H, fill: { color: hex(c.bgAlt) } });
      addKicker(slide, s.kicker, { x: txtX, y: 0.6, w: txtW, color: ac, font: fB });
      putText(slide, s.title || 'כותרת', { x: txtX, y: s.kicker ? 1.05 : 0.9, w: txtW, h: 1.2, ...titleOpts(text, fD), fontSize: 30 });
      slide.addShape(pptx.ShapeType.rect, { x: txtX + txtW - 0.7, y: 2.1, w: 0.7, h: 0.1, fill: { color: ac } });
      addBullets(slide, s.bullets, { x: txtX, y: 2.5, w: txtW, h: 4.0, color: text, fontSize: 18, font: fB });
      addFooter(slide, { deckTitle: deck.title, index: i, color: muted, font: fB });
      return;
    }

    if (layout === 'two-column') {
      slide.addShape(pptx.ShapeType.rect, { x: W - 1.6, y: 0.7, w: 0.7, h: 0.1, fill: { color: ac } });
      addKicker(slide, s.kicker, { x: 0.8, y: 0.5, w: W - 1.6, color: ac, font: fB });
      putText(slide, s.title || 'כותרת', { x: 0.8, y: s.kicker ? 0.85 : 0.8, w: W - 1.6, h: 1.0, ...titleOpts(text, fD), fontSize: 30 });
      const cols = (s.columns || []).slice(0, 3);
      const gap = 0.4;
      const colW = (W - 1.6 - gap * (cols.length - 1)) / Math.max(1, cols.length);
      cols.forEach((col, ci) => {
        const x = 0.8 + ci * (colW + gap);
        slide.addShape(pptx.ShapeType.roundRect, { x, y: 2.2, w: colW, h: 4.6, fill: { color: hex(c.surface) }, line: { color: hex(c.border || c.bgAlt), width: 0.75 }, rectRadius: 0.1 });
        if (col.heading) putText(slide, col.heading, { x: x + 0.2, y: 2.45, w: colW - 0.4, h: 0.7, ...titleOpts(ac, fD), fontSize: 20 });
        addBullets(slide, col.bullets, { x: x + 0.2, y: 3.2, w: colW - 0.4, h: 3.4, color: text, fontSize: 15, font: fB });
      });
      addFooter(slide, { deckTitle: deck.title, index: i, color: muted, font: fB });
      return;
    }

    if (layout === 'big-statement') {
      slide.addShape(pptx.ShapeType.rect, { x: 0.8, y: 2.2, w: 1.0, h: 0.13, fill: { color: ac } });
      putText(slide, s.body || 'משפט מפתח', { x: 0.8, y: 2.6, w: W - 1.6, h: 2.6, ...titleOpts(text, fD), fontSize: 40 });
      if (s.subtitle) putText(slide, s.subtitle, { x: 0.8, y: 5.4, w: W - 1.6, h: 0.8, ...bodyOpts(muted, fB), fontSize: 22 });
      addFooter(slide, { deckTitle: deck.title, index: i, color: muted, font: fB });
      return;
    }

    if (layout === 'stat') {
      slide.addShape(pptx.ShapeType.rect, { x: W - 1.6, y: 0.7, w: 0.7, h: 0.1, fill: { color: ac } });
      addKicker(slide, s.kicker, { x: 0.8, y: 0.5, w: W - 1.6, color: ac, font: fB });
      putText(slide, s.title || 'נתונים', { x: 0.8, y: s.kicker ? 0.85 : 0.8, w: W - 1.6, h: 1.0, ...titleOpts(text, fD), fontSize: 30 });
      const stats = (s.stats || []).slice(0, 4);
      const n = Math.max(1, stats.length);
      const gap = 0.4;
      const colW = (W - 1.6 - gap * (n - 1)) / n;
      stats.forEach((st, si) => {
        const x = 0.8 + si * (colW + gap);
        putText(slide, st.value || '', { x, y: 2.4, w: colW, h: 1.6, fontFace: fD, bold: true, color: ac, rtlMode: true, align: 'right', valign: 'top', fontSize: 54 });
        putText(slide, st.label || '', { x, y: 4.0, w: colW, h: 0.7, ...titleOpts(text, fD), fontSize: 20 });
        if (st.caption) putText(slide, st.caption, { x, y: 4.7, w: colW, h: 1.6, ...bodyOpts(muted, fB), fontSize: 14 });
      });
      addFooter(slide, { deckTitle: deck.title, index: i, color: muted, font: fB });
      return;
    }

    if (layout === 'steps') {
      slide.addShape(pptx.ShapeType.rect, { x: W - 1.6, y: 0.7, w: 0.7, h: 0.1, fill: { color: ac } });
      addKicker(slide, s.kicker, { x: 0.8, y: 0.5, w: W - 1.6, color: ac, font: fB });
      putText(slide, s.title || 'תהליך', { x: 0.8, y: s.kicker ? 0.85 : 0.8, w: W - 1.6, h: 1.0, ...titleOpts(text, fD), fontSize: 30 });
      const steps = (s.steps || []).slice(0, 6);
      const n = Math.max(1, steps.length);
      const gap = 0.4;
      const colW = (W - 1.6 - gap * (n - 1)) / n;
      steps.forEach((st, si) => {
        const x = 0.8 + si * (colW + gap);
        slide.addShape(pptx.ShapeType.ellipse, { x: x + colW - 0.75, y: 2.3, w: 0.75, h: 0.75, fill: { color: ac } });
        slide.addText(`${si + 1}`, { x: x + colW - 0.75, y: 2.3, w: 0.75, h: 0.75, align: 'center', valign: 'middle', fontFace: fD, bold: true, color: hex(c.onAccent || c.bg), fontSize: 24 });
        putText(slide, st.title || '', { x, y: 3.3, w: colW, h: 0.8, ...titleOpts(text, fD), fontSize: 20 });
        if (st.body) putText(slide, st.body, { x, y: 4.1, w: colW, h: 2.4, ...bodyOpts(muted, fB), fontSize: 14 });
      });
      addFooter(slide, { deckTitle: deck.title, index: i, color: muted, font: fB });
      return;
    }

    if (layout === 'agenda') {
      slide.addShape(pptx.ShapeType.rect, { x: W - 1.6, y: 0.7, w: 0.7, h: 0.1, fill: { color: ac } });
      addKicker(slide, s.kicker, { x: 0.8, y: 0.5, w: W - 1.6, color: ac, font: fB });
      putText(slide, s.title || 'סדר יום', { x: 0.8, y: s.kicker ? 0.85 : 0.8, w: W - 1.6, h: 1.0, ...titleOpts(text, fD), fontSize: 30 });
      const items = (s.bullets || []).slice(0, 8);
      const half = Math.ceil(items.length / 2);
      const rightCol = items.slice(0, half);
      const leftCol = items.slice(half);
      const gap = 0.5;
      const colW = (W - 1.6 - gap) / 2;
      const rowH = 0.85;
      const addAgendaCol = (list, x, offset) => {
        list.forEach((b, i) => {
          const y = 2.3 + i * rowH;
          putText(slide, String(offset + i + 1).padStart(2, '0'), { x, y, w: 0.9, h: rowH - 0.1, fontFace: fD, bold: true, color: ac, rtlMode: true, align: 'right', valign: 'top', fontSize: 22 });
          putText(slide, b, { x, y: y + 0.4, w: colW, h: rowH - 0.4, ...bodyOpts(text, fB), fontSize: 16 });
        });
      };
      // ימין = עמודה ראשונה (RTL): ה-x הימני ביותר הוא colW השני מהקצה
      addAgendaCol(rightCol, W - 0.8 - colW, 0);
      if (leftCol.length) addAgendaCol(leftCol, W - 0.8 - colW * 2 - gap, half);
      addFooter(slide, { deckTitle: deck.title, index: i, color: muted, font: fB });
      return;
    }

    if (layout === 'timeline') {
      slide.addShape(pptx.ShapeType.rect, { x: W - 1.6, y: 0.7, w: 0.7, h: 0.1, fill: { color: ac } });
      addKicker(slide, s.kicker, { x: 0.8, y: 0.5, w: W - 1.6, color: ac, font: fB });
      putText(slide, s.title || 'ציר זמן', { x: 0.8, y: s.kicker ? 0.85 : 0.8, w: W - 1.6, h: 1.0, ...titleOpts(text, fD), fontSize: 30 });
      const steps = (s.steps || []).slice(0, 6);
      const n = Math.max(1, steps.length);
      const gap = 0.3;
      const colW = (W - 1.6 - gap * (n - 1)) / n;
      const lineY = 4.0;
      slide.addShape(pptx.ShapeType.rect, { x: 0.8, y: lineY, w: W - 1.6, h: 0.03, fill: { color: hex(c.bgAlt) } });
      steps.forEach((st, si) => {
        const x = 0.8 + si * (colW + gap);
        const nodeSize = 0.22;
        putText(slide, st.title || '', { x, y: lineY - 1.15, w: colW, h: 1.0, fontFace: fD, bold: true, color: ac, rtlMode: true, align: 'center', valign: 'bottom', fontSize: 18 });
        slide.addShape(pptx.ShapeType.ellipse, { x: x + colW / 2 - nodeSize / 2, y: lineY - nodeSize / 2 + 0.015, w: nodeSize, h: nodeSize, fill: { color: ac } });
        if (st.body) putText(slide, st.body, { x, y: lineY + 0.3, w: colW, h: 1.6, fontFace: fB, color: muted, rtlMode: true, align: 'center', valign: 'top', fontSize: 13 });
      });
      addFooter(slide, { deckTitle: deck.title, index: i, color: muted, font: fB });
      return;
    }

    if (layout === 'comparison') {
      slide.addShape(pptx.ShapeType.rect, { x: W - 1.6, y: 0.7, w: 0.7, h: 0.1, fill: { color: ac } });
      addKicker(slide, s.kicker, { x: 0.8, y: 0.5, w: W - 1.6, color: ac, font: fB });
      putText(slide, s.title || 'השוואה', { x: 0.8, y: s.kicker ? 0.85 : 0.8, w: W - 1.6, h: 1.0, ...titleOpts(text, fD), fontSize: 30 });
      const cols = (s.columns || []).slice(0, 2);
      const accent2 = hex(c.accent2 || c.accent);
      const gap = 0.6;
      const colW = (W - 1.6 - gap) / 2;
      cols.forEach((col, ci) => {
        const x = 0.8 + ci * (colW + gap);
        const sa = ci % 2 === 0 ? ac : accent2;
        slide.addShape(pptx.ShapeType.roundRect, { x, y: 2.2, w: colW, h: 4.6, fill: { color: hex(c.surface) }, line: { color: hex(c.border || c.bgAlt), width: 0.75 }, rectRadius: 0.1 });
        if (col.heading) putText(slide, col.heading, { x: x + 0.2, y: 2.45, w: colW - 0.4, h: 0.7, fontFace: fD, bold: true, color: sa, rtlMode: true, align: 'right', valign: 'top', fontSize: 22 });
        addBullets(slide, col.bullets, { x: x + 0.2, y: 3.3, w: colW - 0.4, h: 3.3, color: text, fontSize: 16, font: fB });
      });
      addFooter(slide, { deckTitle: deck.title, index: i, color: muted, font: fB });
      return;
    }

    // title-bullets / closing
    slide.addShape(pptx.ShapeType.rect, { x: W - 1.6, y: 0.7, w: 0.7, h: 0.1, fill: { color: ac } });
    addKicker(slide, s.kicker, { x: 0.8, y: 0.5, w: W - 1.6, color: ac, font: fB });
    putText(slide, s.title || 'כותרת השקופית', { x: 0.8, y: s.kicker ? 0.85 : 0.8, w: W - 1.6, h: 1.2, ...titleOpts(text, fD), fontSize: 32 });
    if (s.subtitle) putText(slide, s.subtitle, { x: 0.8, y: 1.9, w: W - 1.6, h: 0.7, ...bodyOpts(muted, fB), fontSize: 20 });
    const hasImg = Boolean(imgData) || hasVideo(s);
    const bulletsW = hasImg ? (W - 1.6) * 0.58 : W - 1.6;
    addBullets(slide, s.bullets, { x: hasImg ? (W - 0.8 - bulletsW) : 0.8, y: s.subtitle ? 2.7 : 2.4, w: bulletsW, h: 4.0, color: text, fontSize: 20, font: fB });
    if (hasVideo(s)) addSlideVideo(slide, s, { x: 0.8, y: 2.7, w: (W - 1.6) * 0.38, h: 3.8 });
    else if (imgData) slide.addImage({ data: imgData, x: 0.8, y: 2.7, w: (W - 1.6) * 0.38, h: 3.8, sizing: { type: 'cover', w: (W - 1.6) * 0.38, h: 3.8 } });
    addFooter(slide, { deckTitle: deck.title, index: i, color: muted, font: fB });
  });

  const base64 = await pptx.write('base64');
  return { base64, warnings };
};
