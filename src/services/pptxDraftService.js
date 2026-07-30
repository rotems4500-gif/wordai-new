// ═══════════════════════════════════════════════════════════════
// pptxDraftService.js — ייבוא מצגת קיימת (.pptx) כטיוטה, שכתוב הטקסט
// לסגנון המשתמש, וייצוא חזרה — תוך שמירה byte-for-byte על העיצוב המקורי.
//
// העיקרון: לא מרנדרים מחדש את המצגת. טוענים את ה-zip המקורי, מפרסרים כל
// שקופית ל-DOM, נוגעים אך ורק בטקסט שבתוך <a:t>, ואז מארזים את אותו zip
// בחזרה. כל מה שאינו טקסט (מיקומים, צבעים, פונטים, תמונות, מאסטרים,
// טבלאות, גרפים) נשאר זהה למקור.
// ═══════════════════════════════════════════════════════════════

import { chatWithActiveProvider, getFeatureProviderConfig, hashStyleSeed } from './aiService';

// כמה שקופיות לשלוח ב-prompt אחד (איזון בין מספר קריאות לאורך פלט).
const SLIDE_BATCH = 8;
// תקרת תווים לפסקה בודדת שנשלחת למודל (הגנה מפני אאוטליירים).
const MAX_PARA_CHARS = 2000;

const slideNumOf = (p) => Number((p.match(/slide(\d+)\.xml$/i) || [])[1] || 0);

let paraIdCounter = 0;
const nextParaId = () => { paraIdCounter += 1; return `p${paraIdCounter}`; };

// שולף את הצהרת ה-XML המקורית (PowerPoint רגיש לה) כדי לשחזר בסריאליזציה.
const extractDecl = (xml = '') => {
  const m = String(xml).match(/^\s*<\?xml[^>]*\?>/i);
  return m ? m[0] : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
};

// climb עד שמוצאים <p:sp> ומחזירים את type של ה-placeholder (title/ctrTitle/body/...).
const placeholderTypeFor = (paraEl) => {
  let node = paraEl.parentNode;
  while (node && node.nodeType === 1) {
    if (node.localName === 'sp') {
      const ph = node.getElementsByTagName('p:ph')[0];
      return ph ? (ph.getAttribute('type') || 'body') : 'body';
    }
    node = node.parentNode;
  }
  return '';
};

// בונה רשומת פסקה אחת מתוך אלמנט <a:p>. מחזיר null אם אין טקסט לעריכה.
const buildPara = (paraEl, kind) => {
  const runs = Array.from(paraEl.getElementsByTagName('a:t'));
  if (!runs.length) return null;
  const text = runs.map((r) => r.textContent || '').join('');
  if (!text.trim()) return null;
  const phType = placeholderTypeFor(paraEl);
  return {
    id: nextParaId(),
    kind,
    text,
    original: text,
    runs,                                   // צמתי <a:t> חיים — לכתיבה חזרה
    titleish: phType === 'title' || phType === 'ctrTitle',
  };
};

// כותב טקסט חדש בחזרה לפסקה: ריצה ראשונה מקבלת את כל הטקסט, השאר מתרוקנות
// (שומר על אלמנטי ה-runs ועיצובם, רק הטקסט משתנה).
const writePara = (para) => {
  if (!para.runs.length) return;
  para.runs[0].textContent = para.text;
  for (let i = 1; i < para.runs.length; i += 1) para.runs[i].textContent = '';
};

// מפת slide -> notesSlide דרך ה-rels.
const notesPathForSlide = async (zip, slidePath) => {
  const relPath = slidePath.replace(/slides\/([^/]+)$/i, 'slides/_rels/$1.rels');
  const relFile = zip.files[relPath];
  if (!relFile) return null;
  const relXml = await relFile.async('string');
  const m = relXml.match(/Target="([^"]*notesSlides\/[^"]+)"/i);
  if (!m) return null;
  // הנתיב ב-rels יחסי (../notesSlides/..) — מנרמלים לשורש ppt/.
  const target = m[1].replace(/^\.\.\//, '');
  return target.startsWith('ppt/') ? target : `ppt/${target}`;
};

/**
 * importPptxDraft — מפרסר .pptx לטיוטה הניתנת לעריכת טקסט.
 * @param {Uint8Array} uint8 - בייטים של קובץ ה-pptx.
 * @param {string} fileName
 * @returns {Promise<object>} draft (כולל את ה-zip ואת ה-DOMים לכתיבה חזרה).
 */
export const importPptxDraft = async (uint8, fileName = 'presentation.pptx') => {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(uint8);
  const parser = new DOMParser();

  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => slideNumOf(a) - slideNumOf(b));

  if (!slidePaths.length) throw new Error('הקובץ לא נראה כמצגת PowerPoint תקינה.');

  const parseOk = (doc) => doc && !doc.getElementsByTagName('parsererror').length;

  const slides = [];
  for (const slidePath of slidePaths) {
    const xml = await zip.files[slidePath].async('string');
    const doc = parser.parseFromString(xml, 'application/xml');
    // אם הפרסור נכשל — שומרים את ה-XML המקורי כמות שהוא ולא נוגעים בשקופית.
    if (!parseOk(doc)) {
      slides.push({ slidePath, doc: null, decl: '', rawXml: xml, notesPath: null, notesDoc: null, notesDecl: null, title: `שקופית ${slides.length + 1}`, paras: [] });
      continue;
    }
    const paraEls = Array.from(doc.getElementsByTagName('a:p'));
    const paras = paraEls.map((el) => buildPara(el, 'body')).filter(Boolean);

    // notes (אם קיימים) — רק ה-placeholder מסוג body.
    let notesPath = null; let notesDoc = null; let notesDecl = null;
    try {
      notesPath = await notesPathForSlide(zip, slidePath);
      if (notesPath && zip.files[notesPath]) {
        const notesXml = await zip.files[notesPath].async('string');
        const parsedNotes = parser.parseFromString(notesXml, 'application/xml');
        if (!parseOk(parsedNotes)) throw new Error('notes parse failed');
        notesDoc = parsedNotes;
        notesDecl = extractDecl(notesXml);
        const bodyShapes = Array.from(notesDoc.getElementsByTagName('p:sp'))
          .filter((sp) => {
            const ph = sp.getElementsByTagName('p:ph')[0];
            return ph && ph.getAttribute('type') === 'body';
          });
        for (const sp of bodyShapes) {
          for (const el of Array.from(sp.getElementsByTagName('a:p'))) {
            const p = buildPara(el, 'notes');
            if (p) paras.push(p);
          }
        }
      }
    } catch { /* notes אופציונליים — מתעלמים מכשל */ }

    const titlePara = paras.find((p) => p.titleish && p.kind === 'body');
    slides.push({
      slidePath,
      doc,
      decl: extractDecl(xml),
      notesPath,
      notesDoc,
      notesDecl,
      title: (titlePara?.text || '').trim() || `שקופית ${slides.length + 1}`,
      paras,
    });
  }

  return { fileName, zip, slides };
};

// מחזיר את כל הפסקאות הניתנות לעריכה לאורך הטיוטה (סדר יציב).
export const draftParas = (draft) => draft.slides.flatMap((s) => s.paras);

const extractJson = (raw = '') => {
  let text = String(raw || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('המודל לא החזיר JSON תקין.');
  const candidate = text.slice(start, end + 1);
  try { return JSON.parse(candidate); }
  catch { return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1')); }
};

const buildRestylePrompt = (batch, instructions) => {
  const slideBlocks = batch.map(({ index, paras }) => ({
    i: index,
    paras: paras.map((p) => (p.text.length > MAX_PARA_CHARS ? p.text.slice(0, MAX_PARA_CHARS) : p.text)),
  }));
  return `לפניך טקסט גולמי משקופיות במצגת קיימת. שכתב כל פסקה כך שתישמע בסגנון הכתיבה האישי של המשתמש (ראה פרופיל הסגנון שסופק לך), בלי לשנות את המשמעות, העובדות או המספרים.

חוקים נוקשים:
- אם פסקה כבר נשמעת טבעית ובסגנון המשתמש, או שהיא כותרת/נקודה קצרה — החזר אותה ללא שינוי, אות באות.
- שמור בדיוק על אותו מספר פסקאות בכל שקופית ועל אותו סדר. אל תוסיף, תמזג או תמחק פסקאות.
- פסקה קצרה (כותרת/נקודה) נשארת קצרה. אל תנפח טקסט של שקופית לפסקה.
- אל תוסיף מספור, תבליטים, גרשיים או markdown — רק הטקסט עצמו.
- עברית.${instructions ? `\n- הנחיה נוספת מהמשתמש: ${instructions}` : ''}

קלט (JSON):
${JSON.stringify({ slides: slideBlocks }, null, 0)}

החזר JSON תקין בלבד באותו מבנה בדיוק, אותם מפתחות i, אותו מספר פסקאות:
{"slides":[{"i":<מספר>,"paras":["...","..."]}]}`;
};

/**
 * restylePptxDraft — משכתב את כל פסקאות הטקסט בטיוטה לסגנון המשתמש (in-place).
 * מעדכן את ה-DOM ואת שדות ה-text של הפסקאות. מחזיר {changed} מספר פסקאות ששונו.
 * @param {object} draft
 * @param {object} opts - { instructions, slideIds?, onProgress, signal }
 */
export const restylePptxDraft = async (draft, opts = {}) => {
  const { instructions = '', slideIds = null, onProgress = () => {}, signal } = opts;
  const targetSlides = draft.slides
    .map((slide, index) => ({ slide, index }))
    .filter(({ slide }) => (slideIds ? slideIds.includes(slide.slidePath) : true))
    .filter(({ slide }) => slide.paras.length);

  if (!targetSlides.length) return { changed: 0 };

  const featureOverride = getFeatureProviderConfig('presentations')?.config || null;
  // seed סגנון אחד לכל המצגת — כל ה-batches חולקים את אותה רוטציית תבניות.
  const deckSeed = hashStyleSeed(String(draft?.fileName || '') + String(draft?.slides?.[0]?.paras?.[0]?.text || ''));
  const runChat = (prompt) =>
    chatWithActiveProvider(prompt, '', 'אתה עורך לשוני שמשכתב טקסט לסגנון הכתיבה של המשתמש. החזר אך ורק JSON תקין.', {
      skipAutomation: true,
      skipMultiModel: true,
      directChat: true,
      skipSkillSelection: true,
      // שכתוב הוא משימת עריכה — טמפרטורה נמוכה מקטינה שונות מיותרת.
      temperature: 0.4,
      omitPersonalStyleStructureHints: true,
      styleEngineSeed: deckSeed,
      ...(featureOverride ? { providerConfigOverride: featureOverride } : {}),
      ...(signal ? { signal } : {}),
    });

  // חלוקה ל-batches של שקופיות.
  const batches = [];
  for (let i = 0; i < targetSlides.length; i += SLIDE_BATCH) {
    batches.push(targetSlides.slice(i, i + SLIDE_BATCH));
  }

  let changed = 0;
  let done = 0;
  for (const batch of batches) {
    const prompt = buildRestylePrompt(
      batch.map(({ slide, index }) => ({ index, paras: slide.paras })),
      instructions,
    );
    let parsed;
    try { parsed = extractJson(await runChat(prompt)); }
    catch { done += batch.length; onProgress(done, targetSlides.length); continue; }

    const bySlide = new Map((Array.isArray(parsed.slides) ? parsed.slides : []).map((s) => [Number(s.i), s.paras]));
    for (const { slide, index } of batch) {
      const newParas = bySlide.get(index);
      // אם המודל לא שמר על מספר הפסקאות — מדלגים על השקופית (בטוח, לא משבש).
      if (Array.isArray(newParas) && newParas.length === slide.paras.length) {
        slide.paras.forEach((para, pi) => {
          const next = String(newParas[pi] == null ? '' : newParas[pi]).trim();
          if (next && next !== para.text) { para.text = next; writePara(para); changed += 1; }
        });
        slide.title = (slide.paras.find((p) => p.titleish && p.kind === 'body')?.text || slide.title);
      }
      done += 1;
    }
    onProgress(done, targetSlides.length);
  }

  return { changed };
};

// מחיל עריכה ידנית של פסקה בודדת (מהממשק) על ה-DOM.
export const setParaText = (para, text) => {
  para.text = String(text == null ? '' : text);
  writePara(para);
};

// מסיר הצהרת <?xml?> מובילה מתוצאת הסריאליזציה. Chromium פולט הצהרה משלו כש-
// מסריאליזים Document שלם; אם נוסיף עליה את decl המקורי נקבל הצהרה כפולה → XML
// לא תקין ו-PowerPoint מסרב לפתוח. שורש (documentElement) לא אמור לפלוט הצהרה,
// אבל מנקים תמיד ליתר ביטחון (engine-proof).
const stripXmlDecl = (s = '') => String(s).replace(/^\s*<\?xml[^>]*\?>\s*/i, '');

// בונה XML של חלק יחיד: הצהרה אחת בלבד + גוף השורש המסריאליזד.
const serializePart = (serializer, doc, decl) =>
  `${decl}\n${stripXmlDecl(serializer.serializeToString(doc.documentElement))}`;

// מסריאליז את כל ה-DOMים בחזרה ל-zip (in-place). משותף לכל פורמטי הייצוא.
const serializeDraftIntoZip = (draft) => {
  const serializer = new XMLSerializer();
  for (const slide of draft.slides) {
    // שקופית שלא נפרסה — כותבים את ה-XML המקורי כמות שהוא.
    if (!slide.doc) { if (slide.rawXml) draft.zip.file(slide.slidePath, slide.rawXml); continue; }
    draft.zip.file(slide.slidePath, serializePart(serializer, slide.doc, slide.decl));
    if (slide.notesDoc && slide.notesPath) {
      draft.zip.file(slide.notesPath, serializePart(serializer, slide.notesDoc, slide.notesDecl));
    }
  }
};

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/**
 * exportPptxBase64 — מחזיר base64 של ה-pptx (לדיאלוג שמירה native בדסקטופ).
 */
export const exportPptxBase64 = async (draft) => {
  serializeDraftIntoZip(draft);
  return draft.zip.generateAsync({ type: 'base64' });
};

/**
 * exportPptxBlob — מחזיר Blob של ה-pptx (להורדה בדפדפן, בלי data: URL).
 */
export const exportPptxBlob = async (draft) => {
  serializeDraftIntoZip(draft);
  return draft.zip.generateAsync({ type: 'blob', mimeType: PPTX_MIME });
};
