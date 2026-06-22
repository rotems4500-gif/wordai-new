// Shared data-file ingestion for the SPSS surfaces (simple tab + project wizard).
// Reads SAV / CSV / Excel / TSV / TXT into a normalized analysis object.
// Extracted from SpssSyntaxStudio so both surfaces share one source of truth.

import { parseCsvText, parseSpssSavDataset } from './spssSyntaxService';

export const SUPPORTED_DATA_FILE_ACCEPT = '.csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.tsv,text/tab-separated-values,.txt,text/plain,.sav,application/x-spss-sav';

const TEXT_TABULAR_EXTENSIONS = new Set(['csv', 'tsv', 'txt']);
const EXCEL_TABULAR_EXTENSIONS = new Set(['xlsx', 'xls']);

const getFileExtension = (fileName = '') => {
  const cleanName = String(fileName || '').trim().toLowerCase();
  const match = cleanName.match(/\.([^.]+)$/);
  return match?.[1] || '';
};

const readExcelFileAsCsvText = async (file) => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const firstSheetName = workbook.SheetNames?.[0] || '';
  if (!firstSheetName) throw new Error('לא נמצא גיליון בקובץ Excel.');

  const worksheet = workbook.Sheets[firstSheetName];
  const csvText = XLSX.utils.sheet_to_csv(worksheet, { blankrows: false });
  if (!String(csvText || '').trim()) throw new Error('הגיליון הראשון בקובץ Excel ריק.');
  return csvText;
};

const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
  };
  reader.onerror = () => reject(reader.error || new Error('קריאת הקובץ נכשלה.'));
  reader.readAsDataURL(file);
});

const normalizeSpssSavCellValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  return String(value);
};

const readSpssSavFileInBrowser = async (file) => {
  try {
    const { Buffer } = await import('buffer');
    if (!globalThis.Buffer) globalThis.Buffer = Buffer;

    const { SavBufferReader } = await import('sav-reader');
    const sav = new SavBufferReader(Buffer.from(await file.arrayBuffer()));
    await sav.open();

    const variables = Array.isArray(sav.meta?.sysvars)
      ? sav.meta.sysvars.map((variable) => ({
          name: String(variable?.name || '').trim(),
          label: String(variable?.label || '').trim(),
          type: variable?.type === 0 ? 'numeric' : 'string',
          valueLabels: typeof sav.meta?.getValueLabels === 'function'
            ? (sav.meta.getValueLabels(variable?.name) || []).map((entry) => ({
                value: normalizeSpssSavCellValue(entry?.val),
                label: String(entry?.label || '').trim(),
              }))
            : [],
        })).filter((variable) => variable.name)
      : [];

    if (!variables.length) {
      throw new Error('לא זוהו משתנים בקובץ ה-SAV.');
    }

    const rawRows = await sav.readAllRows(true);
    const rows = (Array.isArray(rawRows) ? rawRows : []).map((row) => {
      const normalizedRow = {};
      variables.forEach((variable) => {
        normalizedRow[variable.name] = normalizeSpssSavCellValue(row?.[variable.name]);
      });
      return normalizedRow;
    });

    if (!rows.length) {
      throw new Error('קובץ ה-SAV נקרא, אבל לא נמצאו בו שורות נתונים.');
    }

    return {
      ok: true,
      fileName: String(file?.name || '').trim(),
      rowCount: rows.length,
      columnCount: variables.length,
      variables,
      rows,
    };
  } catch (error) {
    const message = String(error?.message || '').trim();
    if (/ZLIB compressed data not supported/i.test(message)) {
      return { ok: false, error: 'קובץ ה-SAV דחוס בפורמט ZLIB/ZSAV שאינו נתמך כרגע. שמור אותו מתוך SPSS כ-SAV רגיל ונסה שוב.' };
    }
    if (/Not a valid \.sav file/i.test(message)) {
      return { ok: false, error: 'זה לא נראה כמו קובץ SAV תקין של SPSS.' };
    }
    return { ok: false, error: message || 'קריאת קובץ ה-SAV נכשלה.' };
  }
};

const readSpssSavFileAsAnalysis = async (file) => {
  const result = window.desktopApp?.parseSpssSavData
    ? await window.desktopApp.parseSpssSavData({
        fileName: file?.name || 'dataset.sav',
        dataBase64: await readFileAsBase64(file),
      })
    : await readSpssSavFileInBrowser(file);

  if (!result?.ok) {
    throw new Error(result?.error || 'קריאת קובץ ה-SAV נכשלה.');
  }

  return parseSpssSavDataset(result);
};

// Returns either a parsed analysis object (SAV path) or raw text (tabular path).
export const readTabularUploadAsText = async (file) => {
  const extension = getFileExtension(file?.name);
  const mimeType = String(file?.type || '').toLowerCase();

  if (extension === 'sav') {
    return readSpssSavFileAsAnalysis(file);
  }

  if (TEXT_TABULAR_EXTENSIONS.has(extension) || mimeType.startsWith('text/')) {
    return file.text();
  }

  if (EXCEL_TABULAR_EXTENSIONS.has(extension) || mimeType.includes('spreadsheet') || mimeType === 'application/vnd.ms-excel') {
    return readExcelFileAsCsvText(file);
  }

  throw new Error('סוג הקובץ לא נתמך. אפשר להעלות SAV, CSV, XLSX, XLS, TSV או TXT.');
};

// One-shot: File -> normalized analysis object (throws on failure).
export const readDataFileToAnalysis = async (file) => {
  if (!file) throw new Error('לא נבחר קובץ נתונים.');
  const content = await readTabularUploadAsText(file);
  return typeof content === 'string'
    ? parseCsvText(content, { fileName: file.name })
    : content;
};
