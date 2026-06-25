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

// Normalize sav-reader's polymorphic `missing` field into one stable shape:
//   { discrete: number[], range: {min,max}|null }  (or null when none declared).
// sav-reader gives: a bare number (1 discrete), number[] (2-3 discrete),
// {min,max} (range), or {min,max,value} (range + 1 discrete).
const normalizeDeclaredMissing = (missing) => {
  if (missing === null || missing === undefined) return null;
  const discrete = [];
  let range = null;
  if (typeof missing === 'number') {
    if (Number.isFinite(missing)) discrete.push(missing);
  } else if (Array.isArray(missing)) {
    missing.forEach((value) => {
      if (typeof value === 'number' && Number.isFinite(value)) discrete.push(value);
    });
  } else if (typeof missing === 'object') {
    const min = Number(missing.min);
    const max = Number(missing.max);
    if (Number.isFinite(min) && Number.isFinite(max)) range = { min, max };
    if (typeof missing.value === 'number' && Number.isFinite(missing.value)) discrete.push(missing.value);
  }
  if (!discrete.length && !range) return null;
  return { discrete, range };
};

const normalizeSpssSavCellValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  return String(value);
};

// Builds a binary-mode Readable that emits the whole buffer then ends. We do NOT
// use sav-reader's SavBufferReader because it calls `stream.Readable.from(buffer)`,
// and readable-stream's browser build throws "Readable.from is not available in
// the browser". Driving SavReader with our own Readable sidesteps that entirely.
// Binary mode (not objectMode) is required so AsyncReader's `.read(len)` returns
// exact byte counts.
const createBufferReadable = (Readable, buffer) => {
  const readable = new Readable({ read() {} });
  readable.push(buffer);
  readable.push(null);
  return readable;
};

// readable-stream (under stream-browserify) references the Node `process` global
// for nextTick/env. It isn't polyfilled by Vite, so without this it throws
// "process is not defined". Provide a minimal browser shim.
const ensureProcessShim = () => {
  const proc = globalThis.process || (globalThis.process = {});
  if (!proc.env) proc.env = {};
  if (typeof proc.nextTick !== 'function') {
    proc.nextTick = (cb, ...args) => queueMicrotask(() => cb(...args));
  }
  if (proc.browser === undefined) proc.browser = true;
};

const readSpssSavFileInBrowser = async (file) => {
  try {
    ensureProcessShim();
    const { Buffer } = await import('buffer');
    if (!globalThis.Buffer) globalThis.Buffer = Buffer;

    const streamMod = await import('stream');
    const Readable = streamMod.Readable || streamMod.default?.Readable || streamMod.default;
    const { SavReader } = await import('sav-reader-core');
    const readable = createBufferReadable(Readable, Buffer.from(await file.arrayBuffer()));
    const sav = new SavReader(readable);
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
          // Declared user-missing values from the SAV dictionary. sav-reader exposes
          // `missing` as: a number (one discrete), an array (2-3 discrete), or a
          // {min,max[,value]} object (a range, optionally plus one discrete value).
          // This is the authoritative source for the "contaminated stats" red flag —
          // if 98/99 are declared missing here, SPSS already excludes them.
          declaredMissing: normalizeDeclaredMissing(variable?.missing),
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
