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

const itemsToLines = (items = []) => {
  const lines = [];
  let current = null;

  items.forEach((item) => {
    const str = String(item?.str ?? '');
    // pdfjs מסמן שבירת שורה מפורשת; מכבדים אותה גם כשה-Y לא זז.
    const y = Array.isArray(item?.transform) ? item.transform[5] : null;

    if (current && y !== null && Math.abs(current.y - y) <= LINE_Y_TOLERANCE) {
      current.parts.push(str);
    } else {
      if (current) lines.push(current);
      current = { y, parts: [str] };
    }
    if (item?.hasEOL) { lines.push(current); current = null; }
  });
  if (current) lines.push(current);

  return lines
    .map((line) => line.parts.join('').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
};

const extractPdf = async (uint8, maxLength) => {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
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
  try { await doc.destroy(); } catch { /* no-op */ }
  return parts.join('\n\n');
};

// ‎tesseract.js מוריד את ה-core(wasm) ואת נתוני השפה מ-CDN בזמן ריצה. אם הרשת איטית/חסומה
// (או offline) הקריאה עלולה להיתקע ללא קצה — לכן עוטפים כל שלב בזמן-קצוב וכושלים בחן.
const OCR_TIMEOUT_MS = 90000;

const withTimeout = (promise, ms, timeoutMessage) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const extractImageOcr = async (uint8) => {
  const { createWorker } = await import('tesseract.js');
  const worker = await withTimeout(
    createWorker('heb+eng'),
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

// uint8: Uint8Array. מחזיר { ok, text } או { ok:false, error }.
export const extractMaterialTextFromBytes = async (fileName, uint8, maxLength = 12000) => {
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
      text = await extractPdf(uint8, maxLength);
    } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) {
      text = await extractImageOcr(uint8);
    } else {
      return { ok: true, text: '' };
    }
    return { ok: true, text: clampText(text, maxLength) };
  } catch (err) {
    return { ok: false, error: err?.message || 'שגיאת חילוץ' };
  }
};
