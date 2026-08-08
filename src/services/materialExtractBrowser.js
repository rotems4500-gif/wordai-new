// materialExtractBrowser.js — חילוץ טקסט מקבצים בדפדפן (מחליף את materialExtraction.cjs של Electron).
// משתמש בספריות שכבר ב-bundle: mammoth (docx), xlsx, jszip (pptx). טקסט גולמי לטקסטואליים.
// pdf + OCR לתמונות עדיין לא נתמכים בבנייה הזו — מחזירים הודעה חיננית (TODO).

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'html', 'htm', 'json', 'csv', 'tsv', 'rtf', 'xml', 'yml', 'yaml', 'log', 'svg',
]);

const getExtension = (fileName = '') => String(fileName || '').split('.').pop().toLowerCase();

const clampText = (text = '', maxLength = 12000) => {
  const clean = String(text || '').replace(/\u0000/g, '').trim();
  if (maxLength > 0 && clean.length > maxLength) return clean.slice(0, maxLength);
  return clean;
};

// Smart text decode: SPSS exports "Text - UTF16" with a BOM; plain TextDecoder('utf-8')
// turns that into gibberish. Detect BOM / null-byte pattern before falling back to UTF-8.
export const decodeTextSmart = (bytes) => {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  const sample = u8.subarray(0, Math.min(u8.length, 4096));
  let evenNulls = 0; let oddNulls = 0;
  for (let i = 0; i < sample.length; i += 1) {
    if (sample[i] === 0) { if (i % 2 === 0) evenNulls += 1; else oddNulls += 1; }
  }
  const half = Math.max(1, Math.floor(sample.length / 2));
  if (oddNulls / half > 0.3) return new TextDecoder('utf-16le').decode(u8);
  if (evenNulls / half > 0.3) return new TextDecoder('utf-16be').decode(u8);
  return new TextDecoder('utf-8').decode(u8);
};

const decodeText = (uint8) => {
  try {
    return decodeTextSmart(uint8);
  } catch {
    return '';
  }
};

const extractDocx = async (uint8) => {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength) });
  return result?.value || '';
};

const extractXlsx = async (uint8) => {
  const XLSX = await import('xlsx');
  // SPSS "Export → Excel" מפיק לפעמים טבלת HTML עם סיומת .xls (לא XLSX/BIFF אמיתי).
  // SheetJS נופל על ארכיון כזה — מזהים לפי החתימה ומפרשים כ-HTML במקום.
  const head = decodeText(uint8.subarray(0, 512)).toLowerCase();
  const looksLikeHtml = head.includes('<html') || head.includes('<table') || head.includes('<!doctype html');
  const wb = looksLikeHtml
    ? XLSX.read(decodeText(uint8), { type: 'string' })
    : XLSX.read(uint8, { type: 'array' });
  const lines = [];
  const sheetNames = (wb.SheetNames || []).slice(0, 8);
  for (const name of sheetNames) {
    lines.push(`# ${name}`);
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
    rows.slice(0, 200).forEach((row) => {
      const cells = (Array.isArray(row) ? row : []).slice(0, 16).map((c) => (c == null ? '' : String(c)));
      if (cells.some((c) => c.trim())) lines.push(cells.join('\t'));
    });
  }
  return lines.join('\n');
};

/**
 * מרכיב שורות מתוך items של pdfjs לפי הקואורדינטה האנכית.
 *
 * ⚠️ הגרסה הקודמת עשתה `items.join(' ')` — כלומר **עמוד שלם הפך לשורה אחת**.
 * נמדד על 30 קבצי הנחיות אמיתיים: 87% מהם ייצרו אפס סעיפים, כי מפריד הסעיפים
 * מזהה מספור בתחילת שורה (`1.`, `2.`) ולא היו שורות בכלל. זה גם פגע בפרובננס
 * של הראיות — `sectionHint` נשען על זיהוי כותרות, שגם הן נעלמו.
 *
 * item.transform[5] הוא ה-Y. פריטים באותו גובה (בתוך סבולת) שייכים לאותה שורה.
 */
const LINE_Y_TOLERANCE = 2.5;

/**
 * האם צריך רווח בין שני פריטים סמוכים באותה שורה.
 *
 * ⚠️ בלי זה מקבלים "בשיטתAPA", "לפחות5מקורות", "לשבעהמאמריםלפחות" — pdfjs מפצל
 * לפי run של גופן, לא לפי מילה, והרווחים הם מרווח גיאומטרי ולא תווים. חיבור נאיבי
 * מדביק מילים ושובר כל regex שמחפש מונח או מספר. נמדד על מטלות אמיתיות.
 *
 * עברית היא RTL — הפריט הבא נמצא **שמאלה**, ולכן הפער מחושב הפוך. בודקים את שני
 * הכיוונים ולוקחים את החיובי, כדי שאותו קוד יעבוד גם על מסמך אנגלי.
 */
const needsSpace = (prev, cur) => {
  if (!prev || !cur) return false;
  const prevStr = String(prev.str ?? '');
  const curStr = String(cur.str ?? '');
  if (!prevStr || !curStr) return false;
  // כבר יש רווח באחד הצדדים — לא מוסיפים עוד.
  if (/\s$/.test(prevStr) || /^\s/.test(curStr)) return false;

  const px = prev.transform?.[4];
  const cx = cur.transform?.[4];
  if (typeof px !== 'number' || typeof cx !== 'number') return false;
  const pw = Number(prev.width) || 0;
  const cw = Number(cur.width) || 0;

  const gapRtl = px - (cx + cw);   // הפריט הבא משמאל (עברית)
  const gapLtr = cx - (px + pw);   // הפריט הבא מימין (אנגלית)
  const gap = Math.max(gapRtl, gapLtr);
  if (gap <= 0) return false;

  // סף יחסי לרוחב תו ממוצע — גופן קטן צריך סף קטן יותר.
  const avgChar = (pw / Math.max(1, prevStr.length) + cw / Math.max(1, curStr.length)) / 2;
  return gap >= Math.max(0.8, avgChar * 0.28);
};

// exported — ה-harness (tools/test-bench/scaffold-e2e) מריץ את אותה הרכבת שורות
// על pdfjs-legacy ב-Node, כדי שהמדידה תהיה על הקוד האמיתי ולא על העתק.
export const itemsToLines = (items = []) => {
  const lines = [];
  let current = null;

  items.forEach((item) => {
    const str = String(item?.str ?? '');
    // pdfjs מסמן שבירת שורה מפורשת; מכבדים אותה גם כשה-Y לא זז.
    const y = Array.isArray(item?.transform) ? item.transform[5] : null;

    if (current && y !== null && Math.abs(current.y - y) <= LINE_Y_TOLERANCE) {
      if (needsSpace(current.lastItem, item)) current.parts.push(' ');
      current.parts.push(str);
      if (str) current.lastItem = item;
    } else {
      if (current) lines.push(current);
      current = { y, parts: [str], lastItem: str ? item : null };
    }
    if (item?.hasEOL) { lines.push(current); current = null; }
  });
  if (current) lines.push(current);

  return lines
    .map((line) => line.parts.join('').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
};

// טעינת pdfjs פעם אחת (גם מסלול הטקסט וגם מסלול ה-OCR צריכים אותה).
let pdfjsPromise = null;
const loadPdfjs = () => {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
    // ⚠️ promise דחוי נשאר בקאש לנצח: כשל רשת יחיד בטעינת ה-chunk/worker היה
    // הורג כל חילוץ ותצוגה מקדימה של PDF עד לרענון הדף. מאפסים כדי שינסה שוב.
    pdfjsPromise.catch(() => { pdfjsPromise = null; });
  }
  return pdfjsPromise;
};

const extractPdf = async (uint8, maxLength) => {
  const pdfjs = await loadPdfjs();
  // עותק — pdfjs משנה את ה-buffer
  const data = uint8.slice();
  const doc = await pdfjs.getDocument({ data }).promise;
  const parts = [];
  let total = 0;
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = itemsToLines(content.items);
    parts.push(pageText);
    total += pageText.length;
    if (maxLength > 0 && total > maxLength) break;
  }
  const pages = doc.numPages;
  try { await doc.destroy(); } catch { /* no-op */ }
  const text = parts.join('\n\n');
  // PDF סרוק (תמונות בלבד) מחזיר מחרוזת ריקה ו-ok:true, ואז הקובץ "נקלט" בשקט עם
  // אפס קטעים. נמדד על שלושה מקורות אמיתיים (פוקויאמה ×2, קולקה 125 עמ') שנספרו
  // כ"דולגו" בלי סיבה. מסמנים במפורש כדי שהמשתמש יידע שצריך OCR/גרסה טקסטואלית.
  const perPage = pages > 0 ? text.replace(/\s/g, '').length / pages : 0;
  const scanned = pages > 0 && perPage < 30;
  // ⚠️ garbled — קידוד גופן שבור: יש "שכבת טקסט" אבל היא ג'יבריש (")Ntur: nttxnt").
  // נמדד על קורפוס קורס אמיתי: 8 מתוך 15 מקורות עבריים היו כאלה, עברו את מבחן
  // הסרוק, והורעלו לתוך האינדקס הסמנטי — האחזור קרס כולו בגללם. מנותבים ל-OCR
  // בדיוק כמו סרוקים.
  const garbled = !scanned && pureTokenRatio(text) < GARBLE_FLOOR;
  return { text, pages, scanned: scanned || garbled, garbled };
};

/**
 * רינדור עמוד בודד של PDF לתמונת תצוגה מקדימה (data URL).
 * לא מחלץ טקסט ולא מריץ OCR — נועד לתצוגה בלבד (תיבת הקליפים).
 *
 * ⚠️ שני הגוצ'אס של נתיב ה-OCR חלים גם כאן: עותק של הבייטים (pdf.js מנטרל את
 * ה-buffer המקורי) ו-intent:'print' (רינדור רגיל תלוי rAF שלא נורה בטאב מוסתר).
 * canvas רגיל ולא OffscreenCanvas — רק לו יש toDataURL.
 *
 * @param {Uint8Array} uint8
 * @param {{page?:number, maxWidth?:number, quality?:number}} opts
 * @returns {Promise<{dataUrl:string, numPages:number, width:number, height:number}>}
 */
export const renderPdfPageToDataUrl = async (uint8, opts = {}) => {
  const { page = 1, maxWidth = 360, quality = 0.72 } = opts || {};
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: uint8.slice() }).promise;
  try {
    const numPages = doc.numPages;
    const pageNumber = Math.min(Math.max(1, Math.round(Number(page) || 1)), numPages);
    const pdfPage = await doc.getPage(pageNumber);
    const baseViewport = pdfPage.getViewport({ scale: 1 });
    const scale = Math.max(0.05, maxWidth / (baseViewport.width || maxWidth));
    const viewport = pdfPage.getViewport({ scale });
    const width = Math.max(1, Math.ceil(viewport.width));
    const height = Math.max(1, Math.ceil(viewport.height));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    // רקע לבן — PDF שקוף על JPEG יוצא שחור.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    await pdfPage.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    canvas.width = 0;
    canvas.height = 0;
    try { pdfPage.cleanup(); } catch { /* no-op */ }
    return { dataUrl, numPages, width, height };
  } finally {
    try { await doc.destroy(); } catch { /* no-op */ }
  }
};

/**
 * חילוץ הערות (annotations) מ-PDF — לקליטת משוב מרצה מקובץ מוחזר.
 * דטרמיניסטי: page.getAnnotations() של pdf.js, בלי רינדור ובלי OCR.
 *
 * עוגן להערות מרקר/קו (Highlight/Underline/StrikeOut): חיתוך גיאומטרי של
 * quadPoints עם פריטי getTextContent — הטקסט שהפריט המסומן חופף אליו.
 * הערות Text/FreeText מקבלות כעוגן את השורה הקרובה ביותר אנכית.
 *
 * @param {Uint8Array} uint8
 * @returns {Promise<{ok:boolean, annotations:Array<{kind:string, author:string,
 *          text:string, anchorExcerpt:string, page:number}>, pages?:number, error?:string}>}
 */
export const extractPdfAnnotations = async (uint8) => {
  const MARKUP_SUBTYPES = { Highlight: 'highlight', Underline: 'highlight', StrikeOut: 'deletion', Squiggly: 'highlight' };
  const NOTE_SUBTYPES = { Text: 'comment', FreeText: 'comment' };
  try {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: uint8.slice() }).promise;
    const annotations = [];
    try {
      for (let i = 1; i <= doc.numPages; i += 1) {
        const page = await doc.getPage(i);
        const annots = await page.getAnnotations();
        if (!annots.length) continue;
        const content = await page.getTextContent();
        const items = content.items.filter((it) => String(it?.str || '').trim());

        // חפיפת מלבנים: פריט טקסט (transform[4/5] + width/height) מול rect ההערה.
        const overlapText = (rect) => {
          if (!Array.isArray(rect) || rect.length < 4) return '';
          const [x1, y1, x2, y2] = [Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3])];
          const parts = [];
          for (const it of items) {
            const ix = it.transform[4];
            const iy = it.transform[5];
            const iw = it.width || 0;
            const ih = it.height || 8;
            if (ix < x2 && ix + iw > x1 && iy < y2 && iy + ih > y1) parts.push(it.str);
          }
          return parts.join(' ').replace(/\s+/g, ' ').trim();
        };

        for (const a of annots) {
          const subtype = String(a?.subtype || '');
          const contents = String(a?.contentsObj?.str ?? a?.contents ?? '').trim();
          const author = String(a?.titleObj?.str ?? a?.title ?? '').trim();
          if (MARKUP_SUBTYPES[subtype]) {
            // quadPoints: רביעיות נקודות פר-שורה מסומנת; fallback ל-rect.
            let anchor = '';
            const quads = a?.quadPoints;
            if (quads && quads.length) {
              const anchorParts = [];
              // pdf.js מחזיר Float32Array שטוח (x,y ×4 לכל quad) או מערך נקודות.
              const flat = ArrayBuffer.isView(quads) ? Array.from(quads) : quads.flat(2).flatMap((p) => (typeof p === 'object' ? [p.x, p.y] : [p]));
              for (let q = 0; q + 7 < flat.length; q += 8) {
                const xs = [flat[q], flat[q + 2], flat[q + 4], flat[q + 6]];
                const ys = [flat[q + 1], flat[q + 3], flat[q + 5], flat[q + 7]];
                anchorParts.push(overlapText([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]));
              }
              anchor = anchorParts.filter(Boolean).join(' ');
            }
            if (!anchor) anchor = overlapText(a?.rect);
            if (!anchor && !contents) continue;
            annotations.push({
              kind: contents ? 'comment' : MARKUP_SUBTYPES[subtype],
              author,
              text: contents,
              anchorExcerpt: anchor,
              page: i,
            });
          } else if (NOTE_SUBTYPES[subtype] && contents) {
            // פתק צף: העוגן הוא השורה הקרובה אנכית למיקום הפתק.
            let anchor = '';
            if (Array.isArray(a?.rect)) {
              const y = (a.rect[1] + a.rect[3]) / 2;
              let bestDist = Infinity;
              let bestLine = '';
              for (const it of items) {
                const d = Math.abs(it.transform[5] - y);
                if (d < bestDist) { bestDist = d; bestLine = it.str; }
              }
              if (bestDist < 40) anchor = bestLine;
            }
            annotations.push({ kind: 'comment', author, text: contents, anchorExcerpt: anchor, page: i });
          }
        }
      }
      return { ok: true, annotations, pages: doc.numPages };
    } finally {
      try { await doc.destroy(); } catch { /* no-op */ }
    }
  } catch (err) {
    const detail = [err?.name, err?.message].filter(Boolean).join(': ');
    return { ok: false, annotations: [], error: detail || String(err) || 'שגיאת חילוץ הערות PDF' };
  }
};

// יחס הטוקנים ה"טהורים": עברית נקייה / לטינית נקייה / מספר (בתוספת פיסוק סופי).
// קבצים תקינים נמדדו 0.71–0.95; שבורי-קידוד 0.12–0.25. הסף באמצע הרווח.
const GARBLE_FLOOR = 0.5;
export function pureTokenRatio(text) {
  const tokens = (String(text || '').match(/\S+/g) || []).slice(0, 2000);
  if (tokens.length < 40) return 1; // קצר מדי לשפוט — מבחן הסרוק יטפל
  const pure = tokens.filter((x) => /^[֐-׿]{2,}[.,;:!?'"׳״)]?$|^[A-Za-z]{2,}[.,;:!?'")]?$|^\d+([.,]\d+)?$/.test(x)).length;
  return pure / tokens.length;
}

// ‎tesseract.js מוגש **מאירוח עצמי** (public/ocr, ראה scripts/copy-tesseract.mjs):
// ברירת המחדל שלו — CDN של jsDelivr — נחסמת ע"י ה-CSP של האתר (worker-src),
// וכל PDF סרוק נפל ב"שגיאת חילוץ". נמדד באתר החי (SecurityError על construct Worker).
// אירוח עצמי גם עובד offline בדסקטופ. עדיין עוטפים בזמן-קצוב — רשת איטית בטעינה ראשונה.
const OCR_TIMEOUT_MS = 90000;

const ocrWorkerOptions = () => {
  const base = typeof document !== 'undefined' ? document.baseURI : '/';
  return {
    workerPath: new URL('ocr/worker.min.js', base).href,
    corePath: new URL('ocr/', base).href,
    langPath: new URL('ocr/lang', base).href,
  };
};

const withTimeout = (promise, ms, timeoutMessage) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

export const extractImageOcr = async (uint8) => {
  const { createWorker } = await import('tesseract.js');
  const worker = await withTimeout(
    createWorker('heb+eng', 1, ocrWorkerOptions()),
    OCR_TIMEOUT_MS,
    'אתחול מנוע ה-OCR נכשל (ייתכן חיבור איטי או חסום). נסה שוב או חלץ את הטקסט ידנית.',
  );
  try {
    const blob = new Blob([uint8]);
    const { data } = await withTimeout(
      worker.recognize(blob),
      OCR_TIMEOUT_MS,
      'זיהוי הטקסט בתמונה ארך יותר מדי והופסק. נסה תמונה קטנה או ברורה יותר.',
    );
    return data?.text || '';
  } finally {
    try { await worker.terminate(); } catch { /* no-op */ }
  }
};

// OCR על PDF סרוק: כל עמוד מרונדר ל-canvas ועובר זיהוי.
//
// ⚠️ worker אחד לכל הקובץ. אתחול tesseract עולה שניות (הורדת core+heb.traineddata),
// ולכן worker לעמוד היה הופך מסמך של 35 עמודים לדקות של אתחולים בלבד.
//
// scale 2.0: ברזולוציה הטבעית (1.0) הזיהוי בעברית מתפרק. 2.0 הוא הפשרה בין דיוק
// לזיכרון — עמוד A4 יוצא ~1700×2400, שזה ~16MB ל-canvas אחד. משחררים אותו מיד.
const OCR_PAGE_SCALE = 2.0;
const OCR_MAX_PAGES = 60; // תקרה: מעבר לזה זמן ההמתנה כבר לא סביר בדפדפן.

const extractPdfOcr = async (uint8, maxLength, onProgress) => {
  const pdfjs = await loadPdfjs();
  const { createWorker } = await import('tesseract.js');
  const doc = await pdfjs.getDocument({ data: uint8.slice() }).promise;
  const pages = Math.min(doc.numPages, OCR_MAX_PAGES);
  const worker = await withTimeout(
    createWorker('heb+eng', 1, ocrWorkerOptions()),
    OCR_TIMEOUT_MS,
    'אתחול מנוע ה-OCR נכשל (ייתכן חיבור איטי או חסום).',
  );
  const parts = [];
  let total = 0;
  try {
    for (let i = 1; i <= pages; i += 1) {
      if (typeof onProgress === 'function') { try { onProgress({ page: i, pages }); } catch { /* no-op */ } }
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: OCR_PAGE_SCALE });
      const w = Math.ceil(viewport.width);
      const h = Math.ceil(viewport.height);
      const canvas = typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h });
      const ctx = canvas.getContext('2d', { willReadFrequently: false });
      // ⚠️ intent:'print' — לא בגלל הדפסה. pdf.js מריץ את הרינדור הרגיל דרך
      // requestAnimationFrame (`useRequestAnimationFrame: !intentPrint`), ו-rAF לא
      // נורה בטאב מוסתר. נמדד: טאב ברקע ⇒ 0 ticks ⇒ ה-render לא נפתר לעולם וכל
      // ה-OCR נתקע בעמוד הראשון. 'print' מבטל את הלולאה הזו. אותה מלכודת כמו ב-
      // PresentationStudio.
      await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;
      try {
        const { data } = await withTimeout(
          worker.recognize(canvas),
          OCR_TIMEOUT_MS,
          `זיהוי עמוד ${i} ארך יותר מדי והופסק.`,
        );
        const pageText = String(data?.text || '').trim();
        if (pageText) { parts.push(pageText); total += pageText.length; }
      } finally {
        // שחרור מיידי — בלי זה 35 canvasים של 16MB נשארים חיים עד ה-GC.
        canvas.width = 0; canvas.height = 0;
        page.cleanup();
      }
      if (maxLength > 0 && total > maxLength) break;
      // נשימה ל-UI בין עמודים.
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    try { await worker.terminate(); } catch { /* no-op */ }
    try { await doc.destroy(); } catch { /* no-op */ }
  }
  return { text: cleanOcrText(parts.join('\n\n')), pages: doc.numPages, ocrPages: pages };
};

// סינון פסקאות-זבל מפלט OCR: עמודי איורים/טבלאות/טורים מעורבבים מייצרים פסקאות
// ג'יבריש שמוטמעות לאזור וקטורי מוזר ו"מתאימות" לשאילתות זרות. נמדד: שאילתת
// אסטרונומיה (בקרה שלילית) קיבלה z=4.95 מקטע כזה אצל אדם סמית. הסף מקל מהגלאי
// הקובץ-שלם (0.55) — עברית אחרי OCR מכילה רעש לגיטימי.
export function cleanOcrText(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .filter((para) => pureTokenRatio(para) >= 0.55)
    .join('\n\n');
}

const extractPptx = async (uint8) => {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(uint8);
  const slideNum = (p) => Number((p.match(/slide(\d+)\.xml$/i) || [])[1] || 0);
  // מיון מספרי (ולא לקסיקוגרפי) כדי ש-slide2 יקדים את slide10 במצגות עם 10+ שקופיות.
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => slideNum(a) - slideNum(b));
  const chunks = [];
  for (const path of slidePaths) {
    const xml = await zip.files[path].async('string');
    const texts = (xml.match(/<a:t>([\s\S]*?)<\/a:t>/gi) || [])
      .map((t) => t.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    if (texts.length) chunks.push(texts.join(' '));
  }
  return chunks.join('\n');
};

/**
 * uint8: Uint8Array. מחזיר { ok, text } או { ok:false, error }.
 * @param {{ocr?:boolean, onOcrProgress?:function}} opts
 *        ocr=true — מפעיל OCR על PDF סרוק (איטי: ~2-4 שניות לעמוד). בלעדיו קובץ
 *        סרוק מוחזר כשגיאה מפורשת, כדי שלא ייבלע בשקט כמו קודם.
 */
export const extractMaterialTextFromBytes = async (fileName, uint8, maxLength = 12000, opts = {}) => {
  const options = opts || {};
  const { ocr = false, onOcrProgress = null } = options;
  // ⚠️ הבחנה בין "לא ביקשו" ל-"ביקשו לא": ברירת המחדל של `ocr` היא false אבל
  // היא נוגעת ל-PDF סרוק בלבד. העלאת תמונה כחומר עזר קוראת בלי opts בכלל
  // ומסתמכת על ה-OCR — רק `ocr:false` מפורש (תצוגה מקדימה) מבטל אותו.
  const ocrExplicitlyOff = options.ocr === false;
  const ext = getExtension(fileName);
  try {
    let text = '';
    if (ext === 'docx') {
      text = await extractDocx(uint8);
    } else if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') {
      text = await extractXlsx(uint8);
    } else if (ext === 'pptx') {
      text = await extractPptx(uint8);
    } else if (TEXT_EXTENSIONS.has(ext)) {
      text = decodeText(uint8);
    } else if (ext === 'pdf') {
      const res = await extractPdf(uint8, maxLength);
      if (res.scanned && !ocr) {
        return {
          ok: false,
          scanned: true,
          pages: res.pages,
          error: `ה-PDF סרוק (${res.pages} עמודים ללא שכבת טקסט) — אין ממה לחלץ. צריך גרסה טקסטואלית או OCR.`,
        };
      }
      if (res.scanned) {
        const ocrRes = await extractPdfOcr(uint8, maxLength, onOcrProgress);
        if (!String(ocrRes.text || '').trim()) {
          return { ok: false, scanned: true, pages: res.pages, error: `OCR על ${ocrRes.ocrPages} עמודים לא זיהה טקסט.` };
        }
        return {
          ok: true,
          viaOcr: true,
          pages: res.pages,
          ocrPages: ocrRes.ocrPages,
          text: clampText(ocrRes.text, maxLength),
        };
      }
      text = res.text;
    } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) {
      // מבקש שביטל OCR במפורש לא יחכה 90 שניות ל-tesseract.
      if (ocrExplicitlyOff) return { ok: true, text: '', requiresOcr: true };
      text = await extractImageOcr(uint8);
    } else {
      return { ok: true, text: '' };
    }
    return { ok: true, text: clampText(text, maxLength) };
  } catch (err) {
    // שקיפות: "שגיאת חילוץ" עירומה הסתירה SecurityError של CSP במשך שבוע.
    // שם השגיאה תמיד נשמר גם כשה-message ריק.
    const detail = [err?.name, err?.message].filter(Boolean).join(': ');
    return { ok: false, error: detail || String(err) || 'שגיאת חילוץ' };
  }
};
