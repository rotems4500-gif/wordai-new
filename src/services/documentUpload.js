// קריאת מסמך טקסט להזרמה לסטודיו SPSS / עבודת סיום (טיוטה, קובץ משימה וכו').
// בדסקטופ (Tauri) פותחים דיאלוג native שמחזיר HTML+טקסט (תומך docx/txt/html דרך ה-shim);
// בדפדפן: txt/md/html נקראים ישירות, ו-Word (docx) + PDF מחולצים דרך materialExtractBrowser.

import { extractMaterialTextFromBytes } from './materialExtractBrowser';
import { extractSpvTablesText, extractSpvChartImages } from './spvOutputParser';
import {
  CHART_IMAGE_EXTENSIONS,
  readImageFileAsBase64,
  describeChartImages,
  extractDocxChartImages,
  extractPdfChartPageImages,
} from './chartVisionService';

// קבצים שנקראים כטקסט/HTML גולמי (file.text()).
const BROWSER_TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'html', 'htm', 'csv', 'tsv', 'rtf', 'xml', 'log'];
// קבצים עשירים שמחולצים לטקסט דרך המחלץ (mammoth ל-docx, pdfjs ל-PDF, XLSX ל-Excel).
const BROWSER_RICH_EXTENSIONS = ['docx', 'pdf', 'xlsx', 'xls'];
// קובץ Output נייטיב של SPSS (.spv) — ZIP עם טבלאות light בינאריות; פענוח ב-spvOutputParser.
const SPV_EXTENSION = 'spv';
const MAX_EXTRACT_CHARS = 100000;

// טיוטה/משימה: מסמכי טקסט רגילים.
export const BROWSER_DOC_ACCEPT = '.txt,.md,.markdown,.html,.htm,.docx,.pdf';
// פלט SPSS: כולל גם פורמטים שמייצאים אליהם Output — Excel, csv, html, .spv נייטיב,
// ותמונות גרפים (נקראות דרך מודל vision — ראה chartVisionService).
export const BROWSER_OUTPUT_ACCEPT = '.txt,.md,.html,.htm,.csv,.tsv,.rtf,.docx,.pdf,.xlsx,.xls,.spv,.png,.jpg,.jpeg,.webp,.gif,.bmp';

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const plainTextToHtml = (text = '') => {
  const blocks = String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/);
  const html = blocks
    .map((block) => {
      const inner = escapeHtml(block.trim()).replace(/\n/g, '<br>');
      return inner ? `<p>${inner}</p>` : '';
    })
    .filter(Boolean)
    .join('');
  return html || '<p></p>';
};

const titleFromName = (name = '') => String(name || '')
  .replace(/\.[^.]+$/, '')
  .replace(/[_-]+/g, ' ')
  .trim() || 'מסמך';

// מנרמל פלט מדיאלוג/קובץ ל-{ name, title, html, text, source }.
export const normalizeDocumentPayload = (payload = {}) => {
  const resolvedName = String(
    payload.name
    || String(payload.filePath || '').split(/[\\/]/).pop()
    || payload.title
    || 'מסמך'
  ).trim() || 'מסמך';
  const text = String(payload.text || '').trim();
  const html = String(payload.html || '').trim()
    || (text ? plainTextToHtml(text) : '<p></p>');
  return {
    name: resolvedName,
    title: String(payload.title || titleFromName(resolvedName)).trim() || titleFromName(resolvedName),
    html,
    text: text || String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    filePath: String(payload.filePath || '').trim(),
    source: String(payload.source || 'upload').trim() || 'upload',
  };
};

// מנסה לפתוח מסמך דרך דיאלוג הדסקטופ.
// מחזיר { unsupported } אם אין דסקטופ, { canceled } אם בוטל, אחרת { doc }.
export const pickDesktopDocument = async () => {
  if (!(typeof window !== 'undefined' && window.desktopApp?.openDocumentDialog)) {
    return { unsupported: true };
  }
  const result = await window.desktopApp.openDocumentDialog();
  if (result?.canceled) return { canceled: true };
  if (result?.ok === false || result?.error) {
    throw new Error(result?.error || 'טעינת הקובץ נכשלה.');
  }
  return { doc: normalizeDocumentPayload({ ...result, source: 'desktop' }) };
};

// קורא מסמך מ-<input type="file"> בדפדפן (txt/md/html ישירות, docx/PDF דרך מחלץ).
// זורק אם הסיומת לא נתמכת או אם החילוץ נכשל.
// opts.readCharts — קריאת גרפים מוטמעים (docx/pdf/spv/תמונות) דרך מודל vision;
// מיועד להעלאות פלט SPSS, לא לטיוטות/מטלות.
export const readBrowserDocumentFile = async (file, { readCharts = false } = {}) => {
  if (!file) return null;
  const ext = String(file.name || '').toLowerCase().split('.').pop();

  if (BROWSER_TEXT_EXTENSIONS.includes(ext)) {
    const rawText = await file.text();
    const looksLikeHtml = /<(html|body|p|h1|h2|h3|div|span|br|ul|ol|li)\b/i.test(rawText);
    return normalizeDocumentPayload({
      name: file.name,
      html: looksLikeHtml ? rawText : plainTextToHtml(rawText),
      text: rawText,
      source: 'browser',
    });
  }

  if (BROWSER_RICH_EXTENSIONS.includes(ext)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await extractMaterialTextFromBytes(file.name, bytes, MAX_EXTRACT_CHARS);
    if (!result.ok) {
      throw new Error(result.error || 'חילוץ הטקסט מהקובץ נכשל.');
    }
    let text = String(result.text || '').trim();
    // גרפים מוטמעים: ב-Word הם תמונות (או EMF), ב-PDF הם תוכן עמוד — קוראים אותם
    // דרך מודל vision. כשל כאן לא מפיל את הטקסט שכבר חולץ.
    if (readCharts && (ext === 'pdf' || ext === 'docx')) {
      let chartsText = '';
      try {
        const extracted = ext === 'docx'
          ? await extractDocxChartImages(bytes)
          : await extractPdfChartPageImages(bytes);
        if (extracted.images.length) {
          const described = await describeChartImages(extracted.images);
          if (described.text && described.failures < described.total) chartsText = described.text;
        }
        if (ext === 'docx' && extracted.vectorCount && !extracted.images.length) {
          chartsText = `[נמצאו ${extracted.vectorCount} גרפים בפורמט EMF/WMF בתוך ה-Word — פורמט וקטורי של Windows שלא ניתן לקרוא בדפדפן. ייצא את ה-Output ל-PDF‏ (File → Export → PDF) והעלה אותו, או ייצא כל גרף כ-PNG והעלה כתמונה.]`;
        }
      } catch {
        /* גרפים הם תוספת — הטקסט הוא העיקר */
      }
      if (chartsText) text = text ? `${text}\n\n${chartsText}` : chartsText;
    }
    if (!text) {
      throw new Error('לא נמצא טקסט בקובץ. ייתכן שזה PDF סרוק (תמונה) ללא שכבת טקסט.');
    }
    return normalizeDocumentPayload({ name: file.name, text, source: 'browser' });
  }

  if (ext === SPV_EXTENSION) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text = '';
    try {
      text = (await extractSpvTablesText(bytes)).trim();
    } catch {
      throw new Error('קריאת קובץ ה-SPV נכשלה. ייתכן שהוא דחוס בפורמט שאינו נתמך. ב-SPSS: File → Export → Word‏/HTML‏/Excel והעלה את הקובץ שנוצר.');
    }
    // גרפים בתוך ה-SPV הם תמונות — הטבלאות לא מכסות אותם. מנסים לקרוא אותם דרך
    // מודל vision; כשל (אין מפתח/רשת) לא מפיל את הטבלאות שכבר חולצו.
    let chartsText = '';
    try {
      const chartImages = await extractSpvChartImages(bytes);
      if (chartImages.length) {
        const described = await describeChartImages(chartImages);
        if (described.text && described.failures < described.total) chartsText = described.text;
      }
    } catch {
      /* גרפים הם תוספת — הטבלאות הן העיקר */
    }
    if (chartsText) text = text ? `${text}\n\n${chartsText}` : chartsText;
    // הפענוח מחלץ כותרות, תוויות וערכים מספריים מטבלאות ה-light. אם בכל זאת לא יצא
    // פלט מספרי משמעותי (גרסת .spv לא נתמכת), מפנים לייצוא טקסט קריא במקום פלט חלקי.
    const numericTokenCount = (text.match(/\d+(?:[.,]\d+)?/g) || []).length;
    if (text.length < 120 || numericTokenCount < 8) {
      throw new Error('לא הצלחתי לחלץ את הטבלאות מקובץ ה-SPV הזה (ייתכן גרסה/דחיסה שאינה נתמכת). ב-SPSS: File → Export → Word‏/HTML‏/Excel והעלה את הקובץ שנוצר, או סמן הכל בחלון ה-Output (Ctrl+A) → Copy → הדבק כטקסט.');
    }
    return normalizeDocumentPayload({ name: file.name, text, source: 'browser' });
  }

  // תמונת גרף (png/jpg וכו') — נקראת דרך מודל vision ומוחזרת כתיאור טקסטואלי מובנה.
  if (CHART_IMAGE_EXTENSIONS.includes(ext)) {
    const image = await readImageFileAsBase64(file);
    const described = await describeChartImages([image]);
    if (!described.text || described.failures >= described.total) {
      throw new Error('קריאת הגרף מהתמונה נכשלה. ודא שמוגדר מפתח לספק עם ראייה (Gemini / OpenAI / Claude) ונסה שוב.');
    }
    return normalizeDocumentPayload({ name: file.name, text: described.text, source: 'browser' });
  }

  throw new Error('בדפדפן אפשר להעלות קובצי טקסט (txt, csv, html), Word‏ (docx), PDF, Excel‏ (xlsx), SPSS Output‏ (.spv) או תמונת גרף (png/jpg). לתוצאה הטובה ביותר עם פלט SPSS — ייצא ל-Excel‏/Word‏/HTML.');
};
