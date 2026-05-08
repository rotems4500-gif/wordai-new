const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
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

function decodeXmlEntities(value = '') {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint) => String.fromCodePoint(parseInt(codePoint, 16)))
    .replace(/&#(\d+);/g, (_match, codePoint) => String.fromCodePoint(parseInt(codePoint, 10)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function compareSlidePaths(left = '', right = '') {
  const leftNumber = Number(String(left).match(/slide(\d+)\.xml$/i)?.[1] || 0);
  const rightNumber = Number(String(right).match(/slide(\d+)\.xml$/i)?.[1] || 0);
  return leftNumber - rightNumber;
}

function parseXmlAttributes(rawAttributes = '') {
  const attributes = {};
  String(rawAttributes || '').replace(/([A-Za-z_][\w:.-]*)\s*=\s*(['"])([\s\S]*?)\2/g, (_match, name, _quote, value) => {
    attributes[name] = value;
    return _match;
  });
  return attributes;
}

function resolveArchivePath(baseDir = '', relativePath = '') {
  const normalizedBaseDir = String(baseDir || '').replace(/\\/g, '/');
  const normalizedRelativePath = String(relativePath || '').replace(/\\/g, '/').trim();
  if (!normalizedRelativePath) return '';
  if (/^[a-z]+:/i.test(normalizedRelativePath)) return '';
  return path.posix.normalize(path.posix.join(normalizedBaseDir || '.', normalizedRelativePath)).replace(/^\.\//, '');
}

async function resolvePptxSlidePaths(archive) {
  const fallbackSlidePaths = Object.keys(archive.files)
    .filter((entryPath) => /^ppt\/slides\/slide\d+\.xml$/i.test(entryPath))
    .sort(compareSlidePaths);

  if (!fallbackSlidePaths.length) return [];

  let presentationXml = '';
  let presentationRelsXml = '';
  try {
    presentationXml = await archive.file('ppt/presentation.xml')?.async('string');
    presentationRelsXml = await archive.file('ppt/_rels/presentation.xml.rels')?.async('string');
  } catch {
    return fallbackSlidePaths;
  }

  if (!presentationXml || !presentationRelsXml) {
    return fallbackSlidePaths;
  }

  const relationshipTargets = new Map();
  for (const match of presentationRelsXml.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/gi)) {
    const attributes = parseXmlAttributes(match[1]);
    const relId = String(attributes.Id || '').trim();
    const target = resolveArchivePath('ppt', attributes.Target || '');
    if (!relId || !target) continue;
    if (!/^ppt\/slides\/slide\d+\.xml$/i.test(target)) continue;
    if (!archive.file(target)) continue;
    relationshipTargets.set(relId, target);
  }

  const orderedSlidePaths = [];
  const seenPaths = new Set();
  for (const match of presentationXml.matchAll(/<p:sldId\b([^>]*)\/?>(?:<\/p:sldId>)?/gi)) {
    const attributes = parseXmlAttributes(match[1]);
    const relId = String(attributes['r:id'] || '').trim();
    const slidePath = relationshipTargets.get(relId);
    if (!slidePath || seenPaths.has(slidePath)) continue;
    seenPaths.add(slidePath);
    orderedSlidePaths.push(slidePath);
  }

  return orderedSlidePaths.length ? orderedSlidePaths : fallbackSlidePaths;
}

function extractPptxParagraphText(paragraphXml = '') {
  let text = '';
  const tokenPattern = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br(?:\s[^>]*)?\s*(?:\/>|><\/a:br>)|<a:tab(?:\s[^>]*)?\s*(?:\/>|><\/a:tab>)/gi;

  for (const match of String(paragraphXml || '').matchAll(tokenPattern)) {
    if (typeof match[1] === 'string') {
      text += decodeXmlEntities(match[1]);
      continue;
    }
    const token = String(match[0] || '').toLowerCase();
    if (token.startsWith('<a:br')) {
      text += '\n';
      continue;
    }
    if (token.startsWith('<a:tab')) {
      text += ' ';
    }
  }

  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractPptxParagraphs(slideXml = '') {
  return Array.from(String(slideXml || '').matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi))
    .map((match) => extractPptxParagraphText(match[1]))
    .filter(Boolean);
}

async function extractPptxTextFromBuffer(buffer, { maxLength = DEFAULT_MAX_LENGTH } = {}) {
  let archive;
  try {
    archive = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error('pptx-read-failed');
  }

  const slidePaths = await resolvePptxSlidePaths(archive);

  if (!slidePaths.length) {
    throw new Error('empty-pptx-text');
  }

  const slideSections = [];
  for (const [slideIndex, slidePath] of slidePaths.entries()) {
    let slideXml = '';
    try {
      slideXml = await archive.file(slidePath)?.async('string');
    } catch {
      slideXml = '';
    }
    if (!slideXml) continue;

    const paragraphs = extractPptxParagraphs(slideXml);
    if (!paragraphs.length) continue;
    slideSections.push(`שקופית ${slideIndex + 1}:\n${paragraphs.join('\n\n')}`);
  }

  const extractedText = trimToLength(slideSections.join('\n\n'), maxLength);
  if (!extractedText) throw new Error('empty-pptx-text');
  return extractedText;
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

  if (ext === '.pptx') {
    return extractPptxTextFromBuffer(buffer, { maxLength });
  }

  if (ext === '.xlsx' || ext === '.xls') {
    return extractSpreadsheetTextFromBuffer(buffer, { maxLength });
  }

  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    return extractImageTextFromBuffer(buffer, { maxLength, ocrCacheDir, ocrDataDir });
  }

  if (['.txt', '.md', '.markdown', '.html', '.htm', '.json', '.csv', '.tsv', '.rtf', '.xml', '.yml', '.yaml', '.log', '.svg'].includes(ext)) {
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