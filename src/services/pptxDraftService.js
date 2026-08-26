// ═══════════════════════════════════════════════════════════════
// pptxDraftService.js — ייבוא מצגת קיימת (.pptx) כטיוטה, שכתוב הטקסט
// לסגנון המשתמש, וייצוא חזרה — תוך שמירה byte-for-byte על העיצוב המקורי.
//
// העיקרון: לא מרנדרים מחדש את המצגת. טוענים את ה-zip המקורי, מפרסרים כל
// שקופית ל-DOM, נוגעים אך ורק בטקסט שבתוך <a:t>, ואז מארזים את אותו zip
// בחזרה. כל מה שאינו טקסט (מיקומים, צבעים, פונטים, תמונות, מאסטרים,
// טבלאות, גרפים) נשאר זהה למקור.
// ═══════════════════════════════════════════════════════════════

import { chatWithActiveProvider, getFeatureProviderConfig, getPersonalStyleProfile, hashStyleSeed } from './aiService';
import { normalizeStyleEngine } from './styleProfileService';
import { restyleSourceOf, scoreParaAiness, acceptRestyledPara } from './restyleGate';
import { resolveRestyleBand, getRestyleAggressiveness } from './restyleAggressiveness';
import {
  selectRepairTargets, buildParaRepairPrompt, rescorePara, cleanModelText,
} from './draftDetectorPass';

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

// ═══════════════════════════════════════════════════════════════
// ייבוא לעריכה מלאה — pptx → deck model (מסלול שונה לגמרי מהטיוטה):
// כאן *לא* שומרים את העיצוב המקורי. מחלצים טקסט, הערות ותמונות,
// ומרכיבים מהם deck רגיל שהעורך והייצוא של הסטודיו יודעים לטפל בו.
// ═══════════════════════════════════════════════════════════════

const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// פורמטים רסטריים בלבד. emf/wmf/svg/tif אינם נתמכים ב-<img> וב-pptxgenjs שלנו ⇒ מדולגים.
const RASTER_MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

// תקרת גודל לתמונה מיובאת. ה-deck נשמר כ-JSON ב-deckStore (autosave) — תמונת
// ענק אחת מנפחת כל שמירה ומסכנת את מכסת האחסון. מעל התקרה מדלגים בשקט.
const MAX_IMAGE_BASE64_CHARS = 2 * 1024 * 1024;

// כל אלמנטי <a:blip> במסמך, namespace-safe (parseFromString עם prefix, בלי, או localName).
const blipsOf = (doc) => {
  if (!doc) return [];
  let els = [];
  try { els = Array.from(doc.getElementsByTagNameNS(A_NS, 'blip')); } catch { els = []; }
  if (!els.length) els = Array.from(doc.getElementsByTagName('a:blip'));
  if (!els.length) {
    try {
      els = Array.from(doc.getElementsByTagName('*')).filter((el) => el.localName === 'blip');
    } catch { els = []; }
  }
  return els;
};

const embedIdOf = (el) => {
  let id = '';
  try { id = el.getAttributeNS(R_NS, 'embed') || ''; } catch { id = ''; }
  if (!id) id = el.getAttribute('r:embed') || '';
  return String(id || '').trim();
};

// ppt/slides/slide3.xml → ppt/slides/_rels/slide3.xml.rels
const relsPathForPart = (partPath) =>
  String(partPath).replace(/([^/]+)$/, '_rels/$1.rels');

// Target ב-rels יחסי לתיקיית ה-part ('../media/image1.png' מתוך ppt/slides/).
const resolveRelTarget = (partPath, target) => {
  const raw = String(target || '').replace(/\\/g, '/').trim();
  if (!raw) return '';
  if (raw.startsWith('/')) return raw.slice(1);
  const parts = String(partPath).split('/').slice(0, -1);
  for (const seg of raw.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
};

const attrOf = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
  return m ? m[1] : '';
};

// מפת rId → Target פנימי. regex ולא DOMParser: ה-rels קובץ שטוח וידוע,
// והפונקציה נקראת גם מהרנס Node שאין בו DOMParser.
const readRelsMap = async (zip, partPath) => {
  const relPath = relsPathForPart(partPath);
  const file = zip.files?.[relPath] || (zip.file ? zip.file(relPath) : null);
  if (!file) return new Map();
  let xml = '';
  try { xml = await file.async('string'); } catch { return new Map(); }
  const map = new Map();
  const re = /<Relationship\b[^>]*>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const tag = m[0];
    const id = attrOf(tag, 'Id');
    const target = attrOf(tag, 'Target');
    // קישור חיצוני (TargetMode="External") אינו קיים ב-zip ⇒ אין מה לחלץ.
    if (!id || !target || /TargetMode="External"/i.test(tag)) continue;
    map.set(id, target);
  }
  return map;
};

/**
 * extractSlideImages — התמונה הרסטרית הראשונה בכל שקופית, כ-dataUrl.
 * @param {object} draft - תוצאת importPptxDraft.
 * @returns {Promise<Map<string, {source:'upload', dataUrl:string, alt:string}>>} slidePath → image
 */
export const extractSlideImages = async (draft) => {
  const out = new Map();
  const zip = draft?.zip;
  if (!zip) return out;

  // מטמון פר-part: אותה תמונה יכולה לחזור בכמה שקופיות.
  const dataUrlCache = new Map();

  for (const slide of draft?.slides || []) {
    if (!slide?.doc) continue;
    const blips = blipsOf(slide.doc);
    if (!blips.length) continue;

    let rels = null;
    for (const blip of blips) {
      const rId = embedIdOf(blip);
      if (!rId) continue;
      if (!rels) rels = await readRelsMap(zip, slide.slidePath);
      const target = rels.get(rId);
      if (!target) continue;
      const path = resolveRelTarget(slide.slidePath, target);
      if (!path) continue;

      if (dataUrlCache.has(path)) {
        const cached = dataUrlCache.get(path);
        if (cached) { out.set(slide.slidePath, { source: 'upload', dataUrl: cached, alt: '' }); break; }
        continue;                                  // דילוג שכבר הוכרע (וקטורי/גדול מדי)
      }

      const ext = (path.split('.').pop() || '').toLowerCase();
      const mime = RASTER_MIME_BY_EXT[ext];
      if (!mime) { dataUrlCache.set(path, null); continue; }

      const file = zip.files?.[path] || (zip.file ? zip.file(path) : null);
      if (!file) { dataUrlCache.set(path, null); continue; }

      let base64 = '';
      try { base64 = await file.async('base64'); } catch { base64 = ''; }
      if (!base64 || base64.length > MAX_IMAGE_BASE64_CHARS) { dataUrlCache.set(path, null); continue; }

      const dataUrl = `data:${mime};base64,${base64}`;
      dataUrlCache.set(path, dataUrl);
      out.set(slide.slidePath, { source: 'upload', dataUrl, alt: '' });
      break;                                       // תמונה ראשונה בלבד לכל שקופית
    }
  }

  return out;
};

// אורך מינימלי שממנו פסקה בודדת נחשבת "משפט מפתח" ולא תבליט.
const BIG_STATEMENT_MIN_CHARS = 120;
// תקרת התבליטים ב-normalizeSlide (toStringArray) — העודף עובר להערות.
const MAX_BULLETS = 8;

const fileStem = (name = '') => String(name).replace(/\.[a-z0-9]+$/i, '').trim();

/**
 * pptxDraftToDeck — הופך טיוטת pptx ל-deck גולמי לעורך המצגות המלא.
 * הקורא אחראי ל-normalizeDeck (הוא זה שמנקה טקסט וחותך תבליטים).
 * ⚠️ אסינכרוני: חילוץ התמונות קורא מה-zip.
 * @param {object} draft - תוצאת importPptxDraft.
 * @returns {Promise<object>} deck גולמי.
 */
export const pptxDraftToDeck = async (draft) => {
  const srcSlides = Array.isArray(draft?.slides) ? draft.slides : [];
  const images = await extractSlideImages(draft);

  const firstTitle = (srcSlides[0]?.paras || []).find((p) => p.titleish && p.kind === 'body')?.text;
  const deckTitle = String(firstTitle || '').trim() || fileStem(draft?.fileName) || 'מצגת מיובאת';

  const slides = srcSlides.map((slide, index) => {
    const paras = Array.isArray(slide.paras) ? slide.paras : [];
    const titlePara = paras.find((p) => p.titleish && p.kind === 'body') || null;
    const bodyTexts = paras
      .filter((p) => p.kind === 'body' && p !== titlePara)
      .map((p) => String(p.text || '').trim())
      .filter(Boolean);
    const notesTexts = paras
      .filter((p) => p.kind === 'notes')
      .map((p) => String(p.text || '').trim())
      .filter(Boolean);

    const title = String(titlePara?.text || '').trim();
    const image = images.get(slide.slidePath) || null;

    const bullets = bodyTexts.slice(0, MAX_BULLETS);
    const overflow = bodyTexts.slice(MAX_BULLETS);
    const notesParts = [...notesTexts];
    // תקרת ה-8 של normalizeSlide הייתה מוחקת את העודף בשקט — נשמר בהערות.
    if (overflow.length) notesParts.push(`טקסט נוסף מהשקף המקורי: ${overflow.join(' | ')}`);
    const notes = notesParts.join('\n');

    // ── בחירת פריסה: ההיסק היחיד כאן. אין ניחוש תוכן, רק מבנה. ──
    if (index === 0 && bodyTexts.length <= 1) {
      return {
        layout: 'cover',
        title: title || deckTitle,
        subtitle: bodyTexts[0] || '',
        notes,
        ...(image ? { image } : {}),
      };
    }
    if (!bodyTexts.length) {
      // שקף בלי טקסט גוף: אם יש בו תמונה זו שקופית-תמונה, אחרת מפריד נושא.
      return image
        ? { layout: 'image-full', title: title || `שקופית ${index + 1}`, subtitle: '', image, notes }
        : { layout: 'section', title: title || `שקופית ${index + 1}`, subtitle: '', notes };
    }
    if (bodyTexts.length === 1 && bodyTexts[0].length > BIG_STATEMENT_MIN_CHARS) {
      // משפט ארוך יחיד — כותרת יורדת ל-subtitle כדי שתמשיך להופיע בפריסה הזו.
      return { layout: 'big-statement', title, body: bodyTexts[0], subtitle: title, notes };
    }
    if (image) {
      return { layout: 'image-right', title: title || `שקופית ${index + 1}`, bullets, image, notes };
    }
    return { layout: 'title-bullets', title: title || `שקופית ${index + 1}`, bullets, notes };
  });

  return {
    title: deckTitle,
    slides,
    meta: {
      topic: deckTitle,
      source: 'pptx-import',
      originalFileName: String(draft?.fileName || ''),
    },
  };
};

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

const buildRestylePrompt = (batch, instructions, band = null) => {
  const slideBlocks = batch.map(({ index, paras }) => ({
    i: index,
    paras: paras.map((p) => {
      const src = restyleSourceOf(p);
      return {
        t: src.length > MAX_PARA_CHARS ? src.slice(0, MAX_PARA_CHARS) : src,
        ...(p._aiFlagged ? { ai: 1 } : {}),
      };
    }),
  }));
  return `לפניך טקסט גולמי משקופיות במצגת קיימת. שכתב כל פסקה כך שתישמע בסגנון הכתיבה האישי של המשתמש (ראה פרופיל הסגנון שסופק לך), בלי לשנות את המשמעות, העובדות או המספרים.

חוקים נוקשים:
- פסקה עם "ai":1 זוהתה על-ידי גלאי אוטומטי כגנרית/מכונתית — חובה לשכתב אותה בקול המשתמש. אסור להחזיר אותה ללא שינוי.
- אם פסקה כבר נשמעת טבעית ובסגנון המשתמש, או שהיא כותרת/נקודה קצרה — החזר אותה ללא שינוי, אות באות.
- שמור בדיוק על אותו מספר פסקאות בכל שקופית ועל אותו סדר. אל תוסיף, תמזג או תמחק פסקאות.
- פסקה קצרה (כותרת/נקודה) נשארת קצרה. אל תנפח טקסט של שקופית לפסקה.
- אל תוסיף מספור, תבליטים, גרשיים או markdown — רק הטקסט עצמו.
- עברית.${band?.promptSuffix ? `\n- ${band.promptSuffix}` : ''}${instructions ? `\n- הנחיה נוספת מהמשתמש: ${instructions}` : ''}

קלט (JSON):
${JSON.stringify({ slides: slideBlocks }, null, 0)}

החזר JSON תקין בלבד באותו מבנה בדיוק, אותם מפתחות i, אותו מספר פסקאות בכל שקופית, כל פסקה כאובייקט עם שדה t (בלי שדה ai בפלט):
{"slides":[{"i":<מספר>,"paras":[{"t":"..."},{"t":"..."}]}]}`;
};

// פסקה מהפלט יכולה לחזור כמחרוזת (החוזה הישן) או כאובייקט {t} (החוזה החדש).
// מודלים מחזירים את שתי הצורות — קורא שמכיר רק אחת מהן מפיל שקופיות שלמות בשקט.
const paraTextOf = (item) => {
  if (item == null) return '';
  if (typeof item === 'string') return item.trim();
  if (typeof item === 'object') return String(item.t == null ? '' : item.t).trim();
  return String(item).trim();
};

/**
 * restylePptxDraft — משכתב את כל פסקאות הטקסט בטיוטה לסגנון המשתמש (in-place).
 * מעדכן את ה-DOM ואת שדות ה-text של הפסקאות. מחזיר {changed} מספר פסקאות ששונו.
 * @param {object} draft
 * @param {object} opts - { instructions, slideIds?, onProgress, signal, aggressiveness? }
 */
export const restylePptxDraft = async (draft, opts = {}) => {
  const { instructions = '', slideIds = null, onProgress = () => {}, signal, aggressiveness = null } = opts;
  // עוצמת השכתוב: ערך מפורש מהקורא, אחרת מה שהמשתמש קבע בסליידר (scope מצגת).
  const band = resolveRestyleBand(Number.isFinite(aggressiveness) ? aggressiveness : getRestyleAggressiveness('pptx'));
  const explicitSelection = Array.isArray(slideIds) && slideIds.length > 0;
  let targetSlides = draft.slides
    .map((slide, index) => ({ slide, index }))
    .filter(({ slide }) => (slideIds ? slideIds.includes(slide.slidePath) : true))
    .filter(({ slide }) => slide.paras.length);

  if (!targetSlides.length) return { changed: 0 };

  // סימון פר-פסקה לפני החלוקה ל-batches: הגלאי מחליט מה גנרי, לא המודל.
  // תבליט קצר מקבל ok:false מהגלאי (פחות מ-25 מילים) — ואז הוא פשוט לא מסומן.
  for (const { slide } of targetSlides) {
    for (const para of slide.paras) {
      const src = restyleSourceOf(para).trim();
      const scored = src.length >= band.minRestyleChars ? scoreParaAiness(src) : null;
      para._aiFlagged = Boolean(scored && scored.score >= scored.threshold);
    }
  }

  // ברצועה העדינה נוגעים רק בשקופיות שיש בהן פסקה מסומנת. בחירה מפורשת עוקפת.
  if (band.onlyFlagged && !explicitSelection) {
    targetSlides = targetSlides.filter(({ slide }) => slide.paras.some((p) => p._aiFlagged));
    if (!targetSlides.length) return { changed: 0 };
  }

  // פרופיל המנוע לשער הקבלה (never-net-worse). כשל טעינה ⇒ שער אורך בלבד.
  let styleEngine = null;
  try { styleEngine = normalizeStyleEngine(getPersonalStyleProfile()?.styleEngine); } catch { /* לא קריטי */ }

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
      temperature: band.temperature,
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
  const changedParaIds = new Set();
  // retryPass: בסבב החוזר מחילים אך ורק את הפסקאות העיקשות (מסומנות ולא שונו) —
  // שקופית נשלחת בשלמותה כדי לשמור על חוזה מספר-הפסקאות, אבל השאר לא נוגעים בהן שוב.
  const runBatch = async (batch, extraInstructions, countProgress, retryPass = false) => {
    const prompt = buildRestylePrompt(
      batch.map(({ slide, index }) => ({ index, paras: slide.paras })),
      extraInstructions,
      band,
    );
    let parsed;
    try { parsed = extractJson(await runChat(prompt)); }
    catch {
      if (countProgress) { done += batch.length; onProgress(done, targetSlides.length); }
      return;
    }

    const bySlide = new Map((Array.isArray(parsed.slides) ? parsed.slides : []).map((s) => [Number(s.i), s.paras]));
    for (const { slide, index } of batch) {
      const newParas = bySlide.get(index);
      // אם המודל לא שמר על מספר הפסקאות — מדלגים על השקופית (בטוח, לא משבש).
      if (Array.isArray(newParas) && newParas.length === slide.paras.length) {
        slide.paras.forEach((para, pi) => {
          // ברצועה העדינה מחילים רק את הפסקאות שסומנו (אלא אם הבחירה מפורשת).
          if (band.onlyFlagged && !explicitSelection && !para._aiFlagged) return;
          if (retryPass && (!para._aiFlagged || changedParaIds.has(para.id))) return;
          const next = paraTextOf(newParas[pi]);
          const source = restyleSourceOf(para);
          if (!next || next === para.text) return;
          if (!acceptRestyledPara(source, para.text, next, styleEngine, para._aiFlagged, band)) return;
          para.text = next;
          para.restyledByAi = true;
          writePara(para);
          changedParaIds.add(para.id);
          changed += 1;
        });
        slide.title = (slide.paras.find((p) => p.titleish && p.kind === 'body')?.text || slide.title);
      }
      if (countProgress) done += 1;
    }
    if (countProgress) onProgress(done, targetSlides.length);
  };

  for (const batch of batches) {
    await runBatch(batch, instructions, true);
  }

  // סבב-חוזר יחיד: פסקאות שהגלאי סימן כגנריות אבל חזרו ללא שינוי. בלי זה
  // "חובה לשכתב" נשארת בקשה — מודל שמתעלם ממנה משאיר טקסט-AI במצגת בשקט.
  const stubbornSlides = targetSlides
    .map(({ slide, index }) => ({ index, slide, paras: slide.paras.filter((p) => p._aiFlagged && !changedParaIds.has(p.id)) }))
    .filter((entry) => entry.paras.length);
  if (stubbornSlides.length) {
    const retryNote = [String(instructions || '').trim(),
      'הפסקאות שסומנו ב-"ai":1 חזרו ללא שינוי בסבב הקודם. הפעם שכתוב מלא הוא חובה: החזר לכל פסקה כזו ניסוח שונה מהותית מהקלט, באותה משמעות ובקול המשתמש.']
      .filter(Boolean).join('\n');
    for (let i = 0; i < stubbornSlides.length; i += SLIDE_BATCH) {
      await runBatch(stubbornSlides.slice(i, i + SLIDE_BATCH).map(({ index, slide }) => ({ index, slide })), retryNote, false, true);
    }
  }

  return { changed };
};

// system של סבב התיקון הממוקד (פסקה בודדת, טקסט חופשי ולא JSON).
const REPAIR_SYSTEM = 'אתה עורך לשוני. שכתב את הפסקה כך שתישמע אנושית וטבעית בקול המשתמש. החזר את הפסקה המשוכתבת בלבד, בלי הסברים.';

/**
 * repairFlaggedParas — סבב תיקון ממוקד לפסקאות שהגלאי עדיין מסמן אחרי השכתוב.
 * דורש ש-scoreDraftParas רץ קודם (הוא זה שכותב את lastAiScore/‏_lastAiResult).
 * @param {object} draft
 * @param {object} opts - { onProgress, signal, aggressiveness? }
 * @returns {Promise<{repaired:number, remaining:number}>}
 */
export async function repairFlaggedParas(draft, { onProgress = () => {}, signal, aggressiveness = null } = {}) {
  const band = resolveRestyleBand(Number.isFinite(aggressiveness) ? aggressiveness : getRestyleAggressiveness('pptx'));
  const allParas = draftParas(draft || { slides: [] });
  const targets = selectRepairTargets(allParas);
  if (!targets.length) return { repaired: 0, remaining: 0 };

  let styleEngine = null;
  try { styleEngine = normalizeStyleEngine(getPersonalStyleProfile()?.styleEngine); } catch { /* לא קריטי */ }

  const featureOverride = getFeatureProviderConfig('presentations')?.config || null;
  const deckSeed = hashStyleSeed(String(draft?.fileName || '') + String(draft?.slides?.[0]?.paras?.[0]?.text || ''));
  const runChat = (prompt) =>
    chatWithActiveProvider(prompt, '', REPAIR_SYSTEM, {
      skipAutomation: true,
      skipMultiModel: true,
      directChat: true,
      skipSkillSelection: true,
      temperature: band.temperature,
      omitPersonalStyleStructureHints: true,
      styleEngineSeed: deckSeed,
      ...(featureOverride ? { providerConfigOverride: featureOverride } : {}),
      ...(signal ? { signal } : {}),
    });

  let repaired = 0;
  let done = 0;
  for (const para of targets) {
    let next = '';
    try { next = cleanModelText(await runChat(buildParaRepairPrompt(para))); }
    catch { next = ''; }
    // הפסקה כאן מסומנת בהגדרה (selectRepairTargets) ⇒ aiFlagged=true בשער.
    if (next && next !== para.text
      && acceptRestyledPara(restyleSourceOf(para), para.text, next, styleEngine, true, band)) {
      para.text = next;
      para.restyledByAi = true;
      writePara(para);
      repaired += 1;
    }
    // הסבב נספר גם כשנדחה — אחרת פסקה עיקשת תילכד בלולאה אינסופית.
    para.aiCheckPasses = (para.aiCheckPasses || 0) + 1;
    rescorePara(para);
    done += 1;
    onProgress(done, targets.length);
  }

  // כותרת השקופית עשויה להשתנות בעקבות התיקון.
  for (const slide of draft?.slides || []) {
    slide.title = (slide.paras.find((p) => p.titleish && p.kind === 'body')?.text || slide.title);
  }

  return { repaired, remaining: selectRepairTargets(draftParas(draft || { slides: [] })).length };
}

// מחיל עריכה ידנית של פסקה בודדת (מהממשק) על ה-DOM.
// עריכה ידנית מאפסת את סימון השכתוב — שכתוב הבא יוצא מהטקסט שהמשתמש קבע.
export const setParaText = (para, text) => {
  para.text = String(text == null ? '' : text);
  para.restyledByAi = false;
  // הטקסט השתנה ⇒ הניקוד הישן ומכסת הסבבים כבר לא רלוונטיים.
  para.lastAiScore = null;
  para.aiCheckPasses = 0;
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
