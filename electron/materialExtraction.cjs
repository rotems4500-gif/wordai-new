const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const { createWorker } = require('tesseract.js');

const DEFAULT_MAX_LENGTH = 12000;
const SPREADSHEET_SHEET_LIMIT = 4;
const SPREADSHEET_ROW_LIMIT = 28;
const SPREADSHEET_COL_LIMIT = 8;
const OCR_LANGS = ['heb', 'eng'];

let ocrWorkerPromise = null;

function normalizeExtractedText(value = '') {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function resolveMaxLength(value = DEFAULT_MAX_LENGTH) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_LENGTH;
}

function trimToLength(value = '', maxLength = DEFAULT_MAX_LENGTH) {
  const normalized = normalizeExtractedText(value);
  if (!normalized) return '';
  return normalized.slice(0, resolveMaxLength(maxLength));
}

function decodeTextBuffer(buffer) {
  return trimToLength(Buffer.from(buffer).toString('utf8').replace(/\u0000/g, ''));
}

function normalizeSpreadsheetCell(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function renderSpreadsheetRows(rows = []) {
  const compactRows = rows
    .map((row) => {
      const cells = Array.from(row || []).map(normalizeSpreadsheetCell);
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      return cells;
    })
    .filter((cells) => cells.some(Boolean));

  const visibleRows = compactRows.slice(0, SPREADSHEET_ROW_LIMIT).map((cells, index) => {
    const visibleCells = cells.slice(0, SPREADSHEET_COL_LIMIT);
    const suffix = cells.length > SPREADSHEET_COL_LIMIT ? ' | ...' : '';
    return `שורה ${index + 1}: ${visibleCells.join(' | ')}${suffix}`;
  });

  if (compactRows.length > SPREADSHEET_ROW_LIMIT) {
    visibleRows.push(`... ועוד ${compactRows.length - SPREADSHEET_ROW_LIMIT} שורות`);
  }

  return visibleRows;
}

function extractSpreadsheetTextFromBuffer(buffer, { maxLength = DEFAULT_MAX_LENGTH } = {}) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      dense: true,
      raw: false,
      cellDates: false,
      cellText: true,
    });
  } catch {
    throw new Error('spreadsheet-read-failed');
  }

  const sheetSections = workbook.SheetNames.slice(0, SPREADSHEET_SHEET_LIMIT)
    .map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet || !sheet['!ref']) return '';
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: false,
      });
      const renderedRows = renderSpreadsheetRows(rows);
      if (!renderedRows.length) return '';
      return [`גיליון: ${sheetName}`, ...renderedRows].join('\n');
    })
    .filter(Boolean);

  if (workbook.SheetNames.length > SPREADSHEET_SHEET_LIMIT) {
    sheetSections.push(`... ועוד ${workbook.SheetNames.length - SPREADSHEET_SHEET_LIMIT} גיליונות`);
  }

  const extractedText = trimToLength(sheetSections.join('\n\n'), maxLength);
  if (!extractedText) throw new Error('empty-spreadsheet-text');
  return extractedText;
}

async function getOcrWorker({ ocrCacheDir = '', ocrDataDir = '' } = {}) {
  if (!ocrWorkerPromise) {
    const workerOptions = { gzip: false };
    if (ocrCacheDir) {
      fs.mkdirSync(ocrCacheDir, { recursive: true });
      workerOptions.cachePath = ocrCacheDir;
    }
    if (ocrDataDir) {
      workerOptions.langPath = ocrDataDir;
    }

    ocrWorkerPromise = createWorker(OCR_LANGS, 1, workerOptions)
      .then(async (worker) => {
        await worker.setParameters({ preserve_interword_spaces: '1' });
        return worker;
      })
      .catch((error) => {
        ocrWorkerPromise = null;
        throw error;
      });
  }

  return ocrWorkerPromise;
}

async function extractImageTextFromBuffer(buffer, { maxLength = DEFAULT_MAX_LENGTH, ocrCacheDir = '', ocrDataDir = '' } = {}) {
  let recognitionResult;
  try {
    const worker = await getOcrWorker({ ocrCacheDir, ocrDataDir });
    recognitionResult = await worker.recognize(buffer, { rotateAuto: true });
  } catch {
    throw new Error('image-ocr-failed');
  }

  const extractedText = trimToLength(recognitionResult?.data?.text || '', maxLength);
  if (!extractedText) throw new Error('empty-image-text');
  return extractedText;
}

async function extractMaterialTextFromBuffer({ buffer, fileName = '', maxLength = DEFAULT_MAX_LENGTH, ocrCacheDir = '', ocrDataDir = '' } = {}) {
  if (!buffer) return '';
  const ext = path.extname(String(fileName || '')).toLowerCase();

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    const extractedText = trimToLength(result?.value || '', maxLength);
    if (!extractedText) throw new Error('empty-docx-text');
    return extractedText;
  }

  if (ext === '.xlsx' || ext === '.xls') {
    return extractSpreadsheetTextFromBuffer(buffer, { maxLength });
  }

  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    return extractImageTextFromBuffer(buffer, { maxLength, ocrCacheDir, ocrDataDir });
  }

  if (['.txt', '.md', '.markdown', '.html', '.htm', '.json'].includes(ext)) {
    return decodeTextBuffer(buffer).slice(0, resolveMaxLength(maxLength));
  }

  return '';
}

async function extractMaterialTextFromFile(filePath, { maxLength = DEFAULT_MAX_LENGTH, ocrCacheDir = '', suppressErrors = false } = {}) {
  try {
    const buffer = fs.readFileSync(filePath);
    return await extractMaterialTextFromBuffer({
      buffer,
      fileName: path.basename(filePath),
      maxLength,
      ocrCacheDir,
    });
  } catch (error) {
    if (suppressErrors) return '';
    throw error;
  }
}

async function shutdownMaterialExtraction() {
  if (!ocrWorkerPromise) return;
  const activeWorkerPromise = ocrWorkerPromise;
  ocrWorkerPromise = null;
  try {
    const worker = await activeWorkerPromise;
    await worker.terminate();
  } catch {}
}

module.exports = {
  extractMaterialTextFromBuffer,
  extractMaterialTextFromFile,
  shutdownMaterialExtraction,
};