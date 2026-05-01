const { app, BrowserWindow, Menu, dialog, shell, ipcMain, globalShortcut, safeStorage } = require('electron');
const { autoUpdater } = require('electron-updater');
const mammoth = require('mammoth');
const { Document, Packer, Paragraph, HeadingLevel, AlignmentType, TextRun, Table, TableRow, TableCell, WidthType, ImageRun } = require('docx');
const path = require('path');
const fs = require('fs');

const STABLE_USER_DATA_DIRNAME = 'word-ai-assistant';
const LEGACY_USER_DATA_DIRNAMES = ['Word AI Assistant', 'WordFlow AI', 'wordflow-ai'];

function countDirectoryEntries(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true }).reduce((count, entry) => {
      const nextPath = path.join(dirPath, entry.name);
      return count + 1 + (entry.isDirectory() ? countDirectoryEntries(nextPath) : 0);
    }, 0);
  } catch {
    return 0;
  }
}

function copyMissingRecursive(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) return;
  const sourceStat = fs.statSync(sourcePath);

  if (sourceStat.isDirectory()) {
    if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true });
    fs.readdirSync(sourcePath, { withFileTypes: true }).forEach((entry) => {
      copyMissingRecursive(path.join(sourcePath, entry.name), path.join(targetPath, entry.name));
    });
    return;
  }

  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function ensureStableUserDataPath() {
  const appDataPath = app.getPath('appData');
  const stablePath = path.join(appDataPath, STABLE_USER_DATA_DIRNAME);

  try {
    app.setPath('userData', stablePath);
  } catch {}

  if (!fs.existsSync(stablePath)) fs.mkdirSync(stablePath, { recursive: true });

  LEGACY_USER_DATA_DIRNAMES
    .map((name) => path.join(appDataPath, name))
    .filter((legacyPath) => legacyPath !== stablePath && fs.existsSync(legacyPath))
    .forEach((legacyPath) => {
      ['ai-provider-config.json', 'app-settings.json', 'Preferences', 'Local State'].forEach((name) => {
        copyMissingRecursive(path.join(legacyPath, name), path.join(stablePath, name));
      });

      ['Local Storage', 'Session Storage', 'project-materials'].forEach((name) => {
        const sourceDir = path.join(legacyPath, name);
        const targetDir = path.join(stablePath, name);
        if (!fs.existsSync(sourceDir)) return;
        copyMissingRecursive(sourceDir, targetDir);
      });
    });
}

ensureStableUserDataPath();

if (!app.isPackaged) {
  app.commandLine.appendSwitch('ignore-certificate-errors');
}

const MANUAL_RELEASES_URL = 'https://github.com/rotems4500-gif/wordai-new/releases';

let mainWindow;
let pendingFilePayload = null;
let loadRendererInProgress = false;
const activeProxyRequests = new Map();
const abortedProxyRequests = new Set();
let latestUpdateState = {
  status: 'idle',
  message: 'מוכן לבדיקת עדכונים',
  currentVersion: app.getVersion(),
  availableVersion: '',
  percent: 0,
  checkedAt: '',
};

function sendUpdateStatus(nextPatch = {}) {
  latestUpdateState = {
    ...latestUpdateState,
    ...nextPatch,
    currentVersion: app.getVersion(),
    checkedAt: new Date().toISOString(),
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-update-status', latestUpdateState);
  }

  return latestUpdateState;
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeFileName(name = 'document') {
  return String(name || 'document').replace(/[\\/:*?"<>|]/g, '_').trim() || 'document';
}

function plainTextToHtml(text = '') {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '<p></p>';
  return normalized
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function decodeHtmlEntities(value = '') {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

const DOCX_DEFAULT_FONT = 'Arial';
const DOCX_DEFAULT_LANGUAGE = { value: 'he-IL', eastAsia: 'he-IL', bidirectional: 'he-IL' };
const DOCX_WORD_SAFE_FONTS = new Set(['Arial', 'Calibri', 'David', 'Georgia', 'Miriam Libre', 'Segoe UI', 'Tahoma', 'Times New Roman']);

function splitFontCandidates(fontValue = '') {
  return String(fontValue || '')
    .split(',')
    .map((part) => part.replace(/["']/g, '').trim())
    .filter((part) => part && !/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|inherit|initial|unset)$/i.test(part));
}

function pickWordSafeFontName(fontValue = '', fallbackFont = DOCX_DEFAULT_FONT) {
  const candidates = splitFontCandidates(fontValue);
  return candidates.find((candidate) => DOCX_WORD_SAFE_FONTS.has(candidate)) || fallbackFont || DOCX_DEFAULT_FONT;
}

function normalizeDocxFontSize(rawValue = '', fallbackSize = 24) {
  const raw = String(rawValue || '').trim().toLowerCase();
  if (!raw) return fallbackSize;

  const numeric = Number.parseFloat(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackSize;

  const points = raw.endsWith('px')
    ? numeric * 0.75
    : raw.endsWith('rem') || raw.endsWith('em')
      ? numeric * 12
      : numeric;

  return Math.max(16, Math.round(points * 2));
}

function normalizeDocxLanguage(language = '') {
  const resolved = String(language || '').trim() || DOCX_DEFAULT_LANGUAGE.value;
  return {
    value: resolved,
    eastAsia: resolved,
    bidirectional: resolved,
  };
}

function resolveDocxParagraphAlignment(documentStyle = '') {
  const normalizedStyle = String(documentStyle || '').trim().toLowerCase();
  if (normalizedStyle === 'legal') return AlignmentType.JUSTIFIED;
  if (normalizedStyle === 'presentation') return AlignmentType.CENTER;
  return AlignmentType.RIGHT;
}

function resolveDocxExportOptions({ html = '', exportOptions = {} } = {}) {
  const safeOptions = exportOptions && typeof exportOptions === 'object' ? exportOptions : {};
  const htmlFontMatch = String(html || '').match(/font-family\s*:\s*([^;]+)/i);
  const htmlFontStack = String(htmlFontMatch?.[1] || '').trim();
  const fallbackFont = pickWordSafeFontName(htmlFontStack, DOCX_DEFAULT_FONT);
  const fontName = pickWordSafeFontName(safeOptions.fontStack || safeOptions.fontFamily || '', fallbackFont);

  return {
    fontName,
    fontSpec: {
      ascii: fontName,
      hAnsi: fontName,
      cs: fontName,
      eastAsia: fontName,
    },
    fontSize: normalizeDocxFontSize(safeOptions.fontSize, 24),
    language: normalizeDocxLanguage(safeOptions.language),
    noProof: safeOptions.disableProofing === true,
    alignment: resolveDocxParagraphAlignment(safeOptions.documentStyle),
  };
}

function buildDocxRunStyle(typography = {}, overrides = {}) {
  const baseFontSpec = typography.fontSpec || {
    ascii: typography.fontName || DOCX_DEFAULT_FONT,
    hAnsi: typography.fontName || DOCX_DEFAULT_FONT,
    cs: typography.fontName || DOCX_DEFAULT_FONT,
    eastAsia: typography.fontName || DOCX_DEFAULT_FONT,
  };
  const merged = {
    font: baseFontSpec,
    size: typography.fontSize || 24,
    sizeComplexScript: typography.fontSize || 24,
    rightToLeft: true,
    language: typography.language || DOCX_DEFAULT_LANGUAGE,
    ...(typography.noProof === true ? { noProof: true } : {}),
    ...(overrides || {}),
  };

  if (Object.prototype.hasOwnProperty.call(overrides || {}, 'size') && !Object.prototype.hasOwnProperty.call(overrides || {}, 'sizeComplexScript')) {
    merged.sizeComplexScript = overrides.size;
  }
  if (merged.bold === true && !Object.prototype.hasOwnProperty.call(overrides || {}, 'boldComplexScript')) {
    merged.boldComplexScript = true;
  }
  if (merged.italics === true && !Object.prototype.hasOwnProperty.call(overrides || {}, 'italicsComplexScript')) {
    merged.italicsComplexScript = true;
  }

  return merged;
}

function createDocxTextRun(text = '', options = {}, typography = {}) {
  return new TextRun({
    text: String(text || ''),
    ...buildDocxRunStyle(typography, options),
  });
}

async function createDocxImageParagraph(block = '', typography = {}) {
  const srcMatch = String(block || '').match(/src=["']([^"']+)["']/i);
  const altMatch = String(block || '').match(/alt=["']([^"']*)["']/i);
  const src = decodeHtmlEntities(srcMatch?.[1] || '');
  const alt = decodeHtmlEntities(altMatch?.[1] || 'תמונה');

  if (!src) {
    return new Paragraph({
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      spacing: { after: 160 },
      children: [createDocxTextRun(`[${alt}]`, { italics: true, color: '475569' }, typography)],
    });
  }

  try {
    let data = null;

    if (/^data:image\//i.test(src)) {
      const base64 = src.split(',')[1] || '';
      if (base64) data = Buffer.from(base64, 'base64');
    } else if (/^file:\/\//i.test(src)) {
      data = fs.readFileSync(new URL(src));
    } else if (fs.existsSync(src)) {
      data = fs.readFileSync(src);
    } else if (/^https?:\/\//i.test(src) && typeof fetch === 'function') {
      const response = await fetch(src);
      if (response.ok) {
        data = Buffer.from(await response.arrayBuffer());
      }
    }

    if (!data) throw new Error('Image data unavailable');

    return new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 160 },
      children: [
        new ImageRun({
          data,
          transformation: { width: 420, height: 240 },
          altText: { name: alt },
        }),
      ],
    });
  } catch {
    return new Paragraph({
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      spacing: { after: 160 },
      children: [createDocxTextRun(`[תמונה] ${alt || src}`, { italics: true, color: '475569' }, typography)],
    });
  }
}

function buildDocxTable(block = '', typography = {}) {
  const rows = (String(block || '').match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []).map((rowHtml) => {
    const cells = rowHtml.match(/<(th|td)[^>]*>[\s\S]*?<\/\1>/gi) || [];
    return new TableRow({
      children: (cells.length ? cells : ['<td></td>']).map((cellHtml) => {
        const isHeader = /^<th/i.test(cellHtml);
        const text = decodeHtmlEntities(String(cellHtml).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) || ' ';
        return new TableCell({
          width: { size: 100, type: WidthType.AUTO },
          children: [
            new Paragraph({
              style: 'Normal',
              alignment: typography.alignment || AlignmentType.RIGHT,
              bidirectional: true,
              children: [createDocxTextRun(text, { bold: isHeader }, typography)],
            }),
          ],
        });
      }),
    });
  });

  return new Table({
    width: { size: '100%', type: WidthType.PERCENTAGE },
    visuallyRightToLeft: true,
    rows: rows.length ? rows : [new TableRow({
      children: [new TableCell({
        children: [new Paragraph({
          style: 'Normal',
          text: ' ',
          alignment: typography.alignment || AlignmentType.RIGHT,
          bidirectional: true,
        })],
      })],
    })],
  });
}

async function htmlToDocxParagraphs(html = '', fallbackText = '', typography = resolveDocxExportOptions({ html })) {
  const source = String(html || '')
    .replace(/\r\n/g, '\n')
    .replace(/<(div|p)[^>]*(?:data-type=["']page-break["']|data-page-break=["']true["']|class=["'][^"']*page-break(?:-node)?[^"']*["']|style=["'][^"']*(?:page-break-after\s*:\s*always|break-after\s*:\s*page)[^"']*["'])[^>]*>(?:\s|&nbsp;|&#160;|<br\s*\/?>)*<\/\1>/gi, '\n[[PAGE_BREAK]]\n');

  const blockRegex = /\[\[PAGE_BREAK\]\]|<table[^>]*>[\s\S]*?<\/table>|<img[^>]*>|<h1[^>]*>[\s\S]*?<\/h1>|<h2[^>]*>[\s\S]*?<\/h2>|<h3[^>]*>[\s\S]*?<\/h3>|<blockquote[^>]*>[\s\S]*?<\/blockquote>|<li[^>]*>[\s\S]*?<\/li>|<p[^>]*>[\s\S]*?<\/p>/gi;
  const children = [];
  const blocks = source.match(blockRegex) || [];

  const pushTextParagraph = (text, options = {}) => {
    const cleanText = decodeHtmlEntities(
      String(text || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim(),
    );
    if (!cleanText) return;
    const runOptions = {
      ...(options.bold ? { bold: true } : {}),
      ...(options.italics ? { italics: true } : {}),
      ...(options.color ? { color: options.color } : {}),
      ...(options.size ? { size: options.size } : {}),
    };
    const textRuns = cleanText.split('\n').flatMap((line, index) => (
      index === 0
        ? [createDocxTextRun(line, runOptions, typography)]
        : [createDocxTextRun(line, { ...runOptions, break: 1 }, typography)]
    ));
    children.push(new Paragraph({
      ...(options.heading ? {} : { style: 'Normal' }),
      alignment: options.alignment || typography.alignment || AlignmentType.RIGHT,
      bidirectional: true,
      spacing: { after: 160, line: 360 },
      children: textRuns,
      ...('bullet' in options ? { bullet: options.bullet } : {}),
      ...(options.heading ? { heading: options.heading } : {}),
    }));
  };

  if (!blocks.length) {
    String(fallbackText || decodeHtmlEntities(source).replace(/<[^>]+>/g, ' '))
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .forEach((chunk) => pushTextParagraph(chunk));
    return children.length ? children : [new Paragraph({ text: '' })];
  }

  for (const block of blocks) {
    if (block === '[[PAGE_BREAK]]') {
      children.push(new Paragraph({ style: 'Normal', text: '', pageBreakBefore: true, bidirectional: true }));
      continue;
    }
    if (/^<table/i.test(block)) {
      children.push(buildDocxTable(block, typography));
      continue;
    }
    if (/^<img/i.test(block)) {
      children.push(await createDocxImageParagraph(block, typography));
      continue;
    }
    if (/^<h1/i.test(block)) { pushTextParagraph(block, { heading: HeadingLevel.HEADING_1, bold: true, size: 34 }); continue; }
    if (/^<h2/i.test(block)) { pushTextParagraph(block, { heading: HeadingLevel.HEADING_2, bold: true, size: 28 }); continue; }
    if (/^<h3/i.test(block)) { pushTextParagraph(block, { heading: HeadingLevel.HEADING_3, bold: true, size: 24 }); continue; }
    if (/^<li/i.test(block)) { pushTextParagraph(block, { bullet: { level: 0 } }); continue; }
    if (/^<blockquote/i.test(block)) { pushTextParagraph(block, { italics: true, color: '475569' }); continue; }
    pushTextParagraph(block);
  }

  return children.length ? children : [new Paragraph({ text: '' })];
}

async function buildDocxBuffer({ html = '', text = '', title = 'WordFlow AI Document', exportOptions = {} } = {}) {
  const typography = resolveDocxExportOptions({ html, exportOptions });
  const headingOneSize = Math.max(typography.fontSize + 10, 34);
  const headingTwoSize = Math.max(typography.fontSize + 4, 28);
  const headingThreeSize = Math.max(typography.fontSize + 2, 24);
  const children = await htmlToDocxParagraphs(html, text, typography);
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            ...buildDocxRunStyle(typography),
          },
          paragraph: {
            alignment: typography.alignment,
            bidirectional: true,
            spacing: { after: 160, line: 360 },
          },
        },
        title: {
          run: {
            ...buildDocxRunStyle(typography, {
              size: headingOneSize,
              bold: true,
              color: '000000',
            }),
          },
          paragraph: {
            alignment: typography.alignment,
            bidirectional: true,
            spacing: { after: 220 },
          },
        },
        heading1: {
          run: {
            ...buildDocxRunStyle(typography, {
              size: headingOneSize,
              bold: true,
              color: '000000',
            }),
          },
          paragraph: {
            alignment: typography.alignment,
            bidirectional: true,
            spacing: { before: 240, after: 160 },
          },
        },
        heading2: {
          run: {
            ...buildDocxRunStyle(typography, {
              size: headingTwoSize,
              bold: true,
              color: '000000',
            }),
          },
          paragraph: {
            alignment: typography.alignment,
            bidirectional: true,
            spacing: { before: 220, after: 160 },
          },
        },
        heading3: {
          run: {
            ...buildDocxRunStyle(typography, {
              size: headingThreeSize,
              bold: true,
              color: '000000',
            }),
          },
          paragraph: {
            alignment: typography.alignment,
            bidirectional: true,
            spacing: { before: 200, after: 140 },
          },
        },
        listParagraph: {
          paragraph: {
            alignment: typography.alignment,
            bidirectional: true,
          },
        },
      },
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          next: 'Normal',
          quickFormat: true,
          paragraph: {
            alignment: typography.alignment,
            bidirectional: true,
            spacing: { after: 160, line: 360 },
          },
          run: {
            ...buildDocxRunStyle(typography),
          },
        },
      ],
    },
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

function wrapHtmlDocument(html = '', title = 'WordFlow AI Document', exportOptions = {}) {
  const typography = resolveDocxExportOptions({ html, exportOptions });
  const textAlign = typography.alignment === AlignmentType.CENTER
    ? 'center'
    : typography.alignment === AlignmentType.JUSTIFIED
      ? 'justify'
      : 'right';
  const fontSizePt = Math.max(8, (typography.fontSize || 24) / 2);
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><style>body{direction:rtl;text-align:${textAlign};font-family:"${escapeHtml(typography.fontName)}",Arial,sans-serif;font-size:${fontSizePt}pt;padding:40px;line-height:1.7}[data-type="page-break"],[data-page-break="true"]{display:block;height:0;page-break-after:always;break-after:page}</style></head><body>${html}</body></html>`;
}

async function readDocumentPayload(filePath) {
  const resolvedPath = path.resolve(filePath);
  const ext = path.extname(resolvedPath).toLowerCase();

  try {
    let rawText = '';
    let html = '';

    if (ext === '.docx') {
      const result = await mammoth.convertToHtml({ path: resolvedPath });
      html = result.value || '<p></p>';
      rawText = String(result.value || '').replace(/<[^>]+>/g, ' ');
    } else if (ext === '.doc') {
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      rawText = raw;
      if (/<(html|body|p|h1|h2|h3|div|span|br|ul|ol|li)\b/i.test(raw)) {
        html = raw;
      } else {
        html = `<h1>${escapeHtml(path.basename(resolvedPath))}</h1><p>קובץ DOC ישן לא נתמך ישירות. מומלץ לשמור אותו כ-DOCX או HTML ואז לפתוח כאן.</p>`;
      }
    } else {
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      rawText = raw;
      html = /<(html|body|p|h1|h2|h3|div|span|br|ul|ol|li)\b/i.test(raw)
        ? raw
        : plainTextToHtml(raw);
    }

    return {
      ok: true,
      canceled: false,
      filePath: resolvedPath,
      title: path.basename(resolvedPath, path.extname(resolvedPath)),
      html: html || '<p></p>',
      text: String(rawText || '').trim(),
    };
  } catch (error) {
    return {
      ok: false,
      canceled: false,
      filePath: resolvedPath,
      title: path.basename(resolvedPath, path.extname(resolvedPath)),
      error: error?.message || 'לא ניתן לקרוא את הקובץ הזה ישירות. מומלץ להשתמש בקבצי DOCX, TXT, MD או HTML.',
    };
  }
}

function getLaunchFilePath(argv = []) {
  return (argv || []).find((arg) => {
    try {
      return fs.existsSync(arg) && /\.(docx|txt|md|markdown|html|htm)$/i.test(arg);
    } catch {
      return false;
    }
  }) || null;
}

function getWritableMaterialsDir() {
  const dir = path.join(app.getPath('userData'), 'project-materials');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getPersistedProviderConfigPath() {
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'ai-provider-config.json');
}

function readPersistedProviderConfig() {
  try {
    const filePath = getPersistedProviderConfigPath();
    if (!fs.existsSync(filePath)) return {};
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8') || '{}');

    if (raw && typeof raw === 'object' && !raw.data) {
      return raw;
    }

    if (!raw?.data) return {};
    const payload = Buffer.from(String(raw.data || ''), 'base64');
    const text = raw.encrypted && safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(payload)
      : payload.toString('utf8');

    return JSON.parse(text || '{}');
  } catch (error) {
    console.error('Failed to read provider config from disk:', error?.message || error);
    return {};
  }
}

function writePersistedProviderConfig(config = {}) {
  const filePath = getPersistedProviderConfigPath();
  const jsonText = JSON.stringify(config || {}, null, 2);
  const encrypted = safeStorage.isEncryptionAvailable();
  const payload = encrypted
    ? safeStorage.encryptString(jsonText)
    : Buffer.from(jsonText, 'utf8');

  fs.writeFileSync(filePath, JSON.stringify({
    version: 1,
    encrypted,
    data: payload.toString('base64'),
    updatedAt: new Date().toISOString(),
  }, null, 2) + '\n', 'utf8');

  return { ok: true, filePath };
}

function normalizeProxyHost(value = '') {
  return String(value || '').replace(/^\[|\]$/g, '').toLowerCase();
}

function isLoopbackProxyHost(hostname = '') {
  return hostname === 'localhost' || hostname === '::1' || /^127(?:\.\d+){3}$/.test(hostname);
}

function getAllowedPersistedCustomTarget() {
  try {
    const { URL: NodeURL } = require('url');
    const providerConfig = readPersistedProviderConfig();
    const customBaseUrl = String(providerConfig?.custom?.baseUrl || '').trim();
    if (!customBaseUrl) return null;

    const parsed = new NodeURL(customBaseUrl);
    const normalizedHost = normalizeProxyHost(parsed.hostname || '');
    if (!normalizedHost) return null;
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (parsed.username || parsed.password) return null;

    const resolvedPort = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
    if (parsed.protocol === 'http:' && !isLoopbackProxyHost(normalizedHost)) return null;

    return {
      protocol: parsed.protocol,
      host: normalizedHost,
      port: resolvedPort,
    };
  } catch {
    return null;
  }
}

function getPersistedAppSettingsPath() {
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'app-settings.json');
}

function readPersistedAppSettings() {
  try {
    const filePath = getPersistedAppSettingsPath();
    if (!fs.existsSync(filePath)) return {};
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8') || '{}');

    if (raw && typeof raw === 'object' && !raw.data) {
      return raw;
    }

    if (!raw?.data) return {};
    const payload = Buffer.from(String(raw.data || ''), 'base64');
    const text = raw.encrypted && safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(payload)
      : payload.toString('utf8');

    return JSON.parse(text || '{}');
  } catch (error) {
    console.error('Failed to read app settings from disk:', error?.message || error);
    return {};
  }
}

function writePersistedAppSettings(settings = {}) {
  const filePath = getPersistedAppSettingsPath();
  const jsonText = JSON.stringify(settings || {}, null, 2);
  const encrypted = safeStorage.isEncryptionAvailable();
  const payload = encrypted
    ? safeStorage.encryptString(jsonText)
    : Buffer.from(jsonText, 'utf8');

  fs.writeFileSync(filePath, JSON.stringify({
    version: 1,
    encrypted,
    data: payload.toString('base64'),
    updatedAt: new Date().toISOString(),
  }, null, 2) + '\n', 'utf8');

  return { ok: true, filePath };
}

function sendDocumentToRenderer(payload) {
  if (!payload) return;
  pendingFilePayload = payload;
  if (!mainWindow) return;
  const send = () => {
    mainWindow?.webContents?.send('open-external-document', payload);
  };
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    sendUpdateStatus({ status: 'dev-mode', message: 'בדיקת עדכונים זמינה רק בגרסה מותקנת' });
    return;
  }

  let manualDownloadShown = false;
  const handleUpdaterFailure = async (err, fallbackMessage = 'שגיאה בבדיקת העדכונים') => {
    const rawMessage = String(err?.message || fallbackMessage);
    const isReleaseFeedIssue = /Cannot parse releases feed|Unable to find latest version on GitHub|HttpError:\s*(?:404|406)|404 Not Found|authentication token|access token|personal access token|GH_TOKEN|requires authentication|Bad credentials|private repo|private repository/i.test(rawMessage);

    if (isReleaseFeedIssue) {
      sendUpdateStatus({
        status: 'manual-download',
        message: 'העדכון האוטומטי לא זמין כרגע. אפשר להוריד ידנית מעמוד ההורדות.',
      });

      if (!manualDownloadShown && mainWindow && !mainWindow.isDestroyed()) {
        manualDownloadShown = true;
        const result = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          buttons: ['פתח הורדות', 'סגור'],
          defaultId: 0,
          cancelId: 1,
          title: 'עדכון אוטומטי לא זמין',
          message: 'GitHub לא החזיר מסלול עדכון תקין.',
          detail: 'אפשר להוריד את הגרסה העדכנית ידנית מעמוד ה-Releases.',
        });
        if (result.response === 0) shell.openExternal(MANUAL_RELEASES_URL);
      }

      console.error('Auto update error:', rawMessage);
      return;
    }

    sendUpdateStatus({ status: 'error', message: rawMessage });
    console.error('Auto update error:', rawMessage);
  };

  const updateConfigPath = path.join(process.resourcesPath || '', 'app-update.yml');
  if (!fs.existsSync(updateConfigPath)) {
    console.warn('Skipping auto update: app-update.yml not found');
    sendUpdateStatus({ status: 'unavailable', message: 'קובץ הגדרות העדכון חסר בגרסה הזו' });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus({ status: 'checking', message: 'בודק אם קיימים עדכונים…', percent: 0 });
  });

  autoUpdater.on('update-available', (info = {}) => {
    sendUpdateStatus({
      status: 'downloading',
      message: `נמצא עדכון לגרסה ${info.version || ''}. מתחיל להוריד…`,
      availableVersion: info.version || '',
      percent: 0,
    });

    dialog.showMessageBox({
      type: 'info',
      title: 'עדכון זמין',
      message: 'נמצאה גרסה חדשה של WordFlow AI.',
      detail: 'העדכון יורד כעת ברקע.',
    });
  });

  autoUpdater.on('download-progress', (progress = {}) => {
    sendUpdateStatus({
      status: 'downloading',
      message: `מוריד עדכון… ${Math.round(Number(progress.percent || 0))}%`,
      percent: Number(progress.percent || 0),
    });
  });

  autoUpdater.on('update-not-available', (info = {}) => {
    sendUpdateStatus({
      status: 'up-to-date',
      message: 'אין עדכון חדש כרגע. האפליקציה מעודכנת.',
      availableVersion: info.version || app.getVersion(),
      percent: 100,
    });
  });

  autoUpdater.on('update-downloaded', async (info = {}) => {
    sendUpdateStatus({
      status: 'downloaded',
      message: `העדכון לגרסה ${info.version || ''} ירד ומוכן להתקנה`,
      availableVersion: info.version || '',
      percent: 100,
    });

    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: ['התקן עכשיו', 'מאוחר יותר'],
      defaultId: 0,
      cancelId: 1,
      title: 'העדכון מוכן',
      message: 'העדכון ירד בהצלחה ומוכן להתקנה.',
      detail: 'לחיצה על "התקן עכשיו" תסגור את האפליקציה ותתקין את הגרסה החדשה.',
    });
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (err) => {
    handleUpdaterFailure(err, 'שגיאה בבדיקת העדכונים').catch((nestedError) => {
      console.error('Auto update error:', nestedError?.message || nestedError);
    });
  });

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    handleUpdaterFailure(err, 'שגיאת פתיחה במסלול העדכונים').catch((nestedError) => {
      console.error('Auto update startup error:', nestedError?.message || nestedError);
    });
  });
}

async function showLoadErrorPage(win, message = '') {
  const safeMessage = escapeHtml(message || 'טעינת הממשק נכשלה.');
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8" /><title>שגיאת טעינה</title><style>body{font-family:Arial,sans-serif;direction:rtl;padding:32px;background:#f3f2f1;color:#222} .card{max-width:720px;margin:40px auto;background:#fff;padding:24px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.08)} h1{margin-top:0}</style></head><body><div class="card"><h1>הממשק לא נטען</h1><p>בוצע מעבר למסך חירום במקום מסך ריק.</p><p>${safeMessage}</p></div></body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  if (!win.isDestroyed()) {
    win.show();
    win.focus();
  }
}

async function loadRenderer(win) {
  const distPath = path.join(__dirname, '..', 'dist', 'index.html');
  const envUrl = String(process.env.VITE_DEV_SERVER_URL || '').trim();

  // שרת פיתוח נטען רק אם הוגדר במפורש דרך environment variable.
  // כך הגרסה הארוזה וגם הרצה מקומית רגילה אינן תלויות ב-VS Code או ב-localhost.
  if (!app.isPackaged && envUrl) {
    try {
      loadRendererInProgress = true;
      await win.loadURL(envUrl);
      loadRendererInProgress = false;
      return true;
    } catch (error) {
      loadRendererInProgress = false;
      console.error('[Main] Failed to load Vite dev server, falling back to dist:', error?.message || error);
    }
  }

  try {
    await win.loadFile(distPath);
    return false;
  } catch (error) {
    await showLoadErrorPage(win, error?.message || 'קובץ הממשק המקומי לא נטען.');
    return false;
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: 'WordFlow AI',
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#f3f2f1',
    icon: process.platform === 'win32'
      ? path.join(__dirname, '..', 'assets', 'app-icon.ico')
      : path.join(__dirname, '..', app.isPackaged ? 'dist' : 'public', 'app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const revealWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  };

  mainWindow.once('ready-to-show', revealWindow);
  mainWindow.webContents.once('did-finish-load', revealWindow);
  mainWindow.on('unresponsive', revealWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch {
      // מתעלמים מכתובות לא תקינות
    }
    return { action: 'deny' };
  });

  // לכידת שגיאות ה-renderer לצורך אבחון ומניעת מסך ריק
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) { // 2=warning, 3=error
      console.error(`[Renderer ${level === 3 ? 'ERROR' : 'WARN'}] ${message} (${sourceId}:${line})`);
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Main] Renderer process gone:', details.reason, details.exitCode);
    if (!mainWindow.isDestroyed()) {
      showLoadErrorPage(mainWindow, `הרנדרר קרס: ${details.reason} (exit code ${details.exitCode})`);
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return; // התעלם מכשלון טעינת משאבים משניים (CDN, iframes)
    if (errorCode === -3) return; // ERR_ABORTED — טעינה בוטלה בכוונה, מתעלמים
    console.error(`[Main] did-fail-load: ${errorCode} ${errorDescription} (${validatedURL})`);
    // לא טוענים דף שגיאה בזמן ש-loadRenderer מנסה כתובות — מונע race condition
    if (loadRendererInProgress) return;
    if (!mainWindow.isDestroyed()) {
      showLoadErrorPage(mainWindow, `${errorDescription} (${errorCode})`);
    }
  });

  // DevTools רק בפיתוח
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.toggleDevTools();
      }
    });
  }

  loadRenderer(mainWindow).then(() => {
    if (pendingFilePayload) sendDocumentToRenderer(pendingFilePayload);
  });
}

ipcMain.handle('consume-pending-open-document', async () => {
  const payload = pendingFilePayload;
  pendingFilePayload = null;
  return payload || { canceled: true };
});

ipcMain.handle('open-document-dialog', async () => {
  if (!mainWindow) return { canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'פתח קובץ',
    properties: ['openFile'],
    filters: [
      { name: 'מסמכים נתמכים', extensions: ['docx', 'txt', 'md', 'markdown', 'html', 'htm'] },
      { name: 'כל הקבצים', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
  return readDocumentPayload(result.filePaths[0]);
});

ipcMain.handle('save-document-dialog', async (_event, payload = {}) => {
  if (!mainWindow) return { canceled: true };
  const baseName = sanitizeFileName(payload?.title || 'document');
  const preferredExtension = String(payload?.preferredExtension || 'docx').toLowerCase();
  let targetPath = payload?.filePath || '';
  const directWriteSupported = ['.txt', '.html', '.htm', '.docx'];

  if (targetPath && !directWriteSupported.includes(path.extname(targetPath).toLowerCase())) {
    targetPath = '';
  }

  if (!targetPath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'שמור בשם',
      defaultPath: `${baseName}.${preferredExtension === 'txt' ? 'txt' : preferredExtension === 'html' ? 'html' : 'docx'}`,
      filters: [
        { name: 'Word', extensions: ['docx'] },
        { name: 'HTML', extensions: ['html'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    });

    if (result.canceled || !result.filePath) return { canceled: true };
    targetPath = result.filePath;
  }

  let ext = path.extname(targetPath).toLowerCase();
  if (!['.txt', '.html', '.htm', '.docx'].includes(ext)) {
    targetPath = `${targetPath.replace(/\.[^.]+$/, '') || targetPath}.${preferredExtension === 'txt' ? 'txt' : preferredExtension === 'html' ? 'html' : 'docx'}`;
    ext = path.extname(targetPath).toLowerCase();
  }

  if (ext === '.txt') {
    fs.writeFileSync(targetPath, String(payload?.text || ''), 'utf8');
  } else if (ext === '.docx') {
    const buffer = await buildDocxBuffer({
      html: String(payload?.html || ''),
      text: String(payload?.text || ''),
      title: baseName,
      exportOptions: payload?.exportOptions,
    });
    fs.writeFileSync(targetPath, buffer);
  } else {
    fs.writeFileSync(targetPath, wrapHtmlDocument(String(payload?.html || ''), baseName, payload?.exportOptions), 'utf8');
  }

  return { ok: true, canceled: false, filePath: targetPath };
});

ipcMain.handle('save-local-material', async (_event, payload) => {
  let safeName = path.basename(String(payload?.name || 'material.bin')).replace(/[^\w\u0590-\u05FF .()\-]/g, '_');
  if (safeName.toLowerCase() === 'index.json') {
    safeName = `uploaded-${Date.now()}.json`;
  }
  const parsedName = path.parse(safeName);
  safeName = `${parsedName.name}-${Date.now()}${parsedName.ext || ''}`;
  const dataBase64 = String(payload?.dataBase64 || '');
  if (!safeName || !dataBase64) {
    throw new Error('Missing upload payload');
  }

  const materialsDir = getWritableMaterialsDir();
  const filePath = path.join(materialsDir, safeName);
  fs.writeFileSync(filePath, Buffer.from(dataBase64, 'base64'));

  const indexPath = path.join(materialsDir, 'index.json');
  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch {}
  const nextEntry = {
    id: safeName,
    title: String(payload?.title || safeName),
    file: safeName,
    type: path.extname(safeName).replace(/^\./, ''),
    source: 'materials-local',
    uploadKind: String(payload?.uploadKind || 'general'),
    label: String(payload?.label || 'קובץ עזר כללי'),
    category: String(payload?.category || 'general'),
    templateId: String(payload?.templateId || 'blank'),
    learningHint: String(payload?.learningHint || ''),
    uploadedAt: new Date().toISOString(),
  };
  const merged = [...(Array.isArray(existing) ? existing.filter((item) => item.file !== safeName) : []), nextEntry];
  fs.writeFileSync(indexPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');

  return { ok: true, file: safeName, entry: nextEntry };
});

ipcMain.handle('list-local-materials', async () => {
  try {
    const indexPath = path.join(getWritableMaterialsDir(), 'index.json');
    const items = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
});

ipcMain.handle('read-local-material', async (_event, fileName = '') => {
  const safeName = path.basename(String(fileName || '')).replace(/[^\w\u0590-\u05FF .()\-]/g, '_');
  if (!safeName) return { ok: false, error: 'Missing file name' };

  try {
    const filePath = path.join(getWritableMaterialsDir(), safeName);
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(safeName).toLowerCase();
    let extractedText = '';

    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = String(result?.value || '').trim();
    } else if (['.txt', '.md', '.markdown', '.html', '.htm', '.json'].includes(ext)) {
      extractedText = fs.readFileSync(filePath, 'utf8');
    }

    return {
      ok: true,
      file: safeName,
      dataBase64: buffer.toString('base64'),
      extractedText,
    };
  } catch (error) {
    return { ok: false, error: error?.message || 'Read failed' };
  }
});

ipcMain.handle('load-provider-config', async () => {
  try {
    return readPersistedProviderConfig();
  } catch (error) {
    return { ok: false, error: error?.message || 'Load failed' };
  }
});

ipcMain.handle('save-provider-config', async (_event, config = {}) => {
  try {
    return writePersistedProviderConfig(config);
  } catch (error) {
    return { ok: false, error: error?.message || 'Save failed' };
  }
});

ipcMain.handle('load-app-settings', async () => {
  try {
    return readPersistedAppSettings();
  } catch (error) {
    return { ok: false, error: error?.message || 'Load failed' };
  }
});

ipcMain.handle('save-app-settings', async (_event, settings = {}) => {
  try {
    return writePersistedAppSettings(settings);
  } catch (error) {
    return { ok: false, error: error?.message || 'Save failed' };
  }
});

ipcMain.handle('get-app-update-info', async () => ({
  ok: true,
  ...latestUpdateState,
  isPackaged: app.isPackaged,
  currentVersion: app.getVersion(),
}));

async function triggerUpdateCheck() {
  if (!app.isPackaged) {
    return {
      ok: false,
      ...sendUpdateStatus({ status: 'dev-mode', message: 'בדיקת עדכונים זמינה רק באפליקציה המותקנת' }),
    };
  }

  try {
    await autoUpdater.checkForUpdates();
    return { ok: true, ...latestUpdateState };
  } catch (error) {
    return {
      ok: false,
      ...sendUpdateStatus({ status: 'error', message: error?.message || 'בדיקת העדכונים נכשלה' }),
    };
  }
}

ipcMain.handle('check-for-app-updates', async () => triggerUpdateCheck());

// ─── Proxy HTTP: מאפשר ל-renderer לשלוח בקשות HTTP דרך main process (עוקף CORS) ───
ipcMain.handle('abort-proxy-http-request', async (_event, requestId = '') => {
  const normalizedRequestId = String(requestId || '').trim();
  if (!normalizedRequestId) return { ok: false, aborted: false };

  const req = activeProxyRequests.get(normalizedRequestId);
  if (!req) {
    abortedProxyRequests.add(normalizedRequestId);
    return { ok: true, aborted: true };
  }

  activeProxyRequests.delete(normalizedRequestId);
  abortedProxyRequests.add(normalizedRequestId);
  try {
    req.destroy(new Error('Request aborted'));
  } catch {}
  return { ok: true, aborted: true };
});

ipcMain.handle('proxy-http-request', async (_event, { url, method = 'POST', headers = {}, body, requestId = '', timeoutMs = 0 } = {}) => {
  try {
    const https = require('https');
    const http = require('http');
    const { URL: NodeURL } = require('url');

    const parsed = new NodeURL(url);
    const normalizedRequestId = String(requestId || '').trim();
    const normalizedHost = normalizeProxyHost(parsed.hostname || '');
    const normalizedMethod = String(method || 'POST').toUpperCase();
    const resolvedPort = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
    const numericTimeoutMs = Number(timeoutMs);
    const effectiveTimeoutMs = Number.isFinite(numericTimeoutMs) && numericTimeoutMs > 0
      ? Math.max(1000, Math.min(300000, Math.round(numericTimeoutMs)))
      : 120000;
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { ok: false, status: 0, body: 'פרוטוקול לא מורשה' };
    }
    if (parsed.username || parsed.password) {
      return { ok: false, status: 0, body: 'כתובת עם פרטי הזדהות אינה מורשית' };
    }

    // רק endpoints מוכרים או loopback מקומי מאושר של Ollama/LM Studio מורשים.
    const ALLOWED_HTTPS_HOSTS = new Set([
      'api.perplexity.ai',
      'api.openai.com',
      'api.anthropic.com',
      'api.groq.com',
      'generativelanguage.googleapis.com',
      'api.deepseek.com',
      'api.mistral.ai',
      'api.together.xyz',
      'openrouter.ai',
      'api.x.ai',
    ]);
    const ALLOWED_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
    const ALLOWED_LOCAL_PORTS = new Set([11434, 1234]);
    const isAllowedLocalDevTarget = ALLOWED_LOCAL_HOSTS.has(normalizedHost) && ALLOWED_LOCAL_PORTS.has(resolvedPort);
    const allowedPersistedCustomTarget = getAllowedPersistedCustomTarget();
    const isAllowedPersistedCustomTarget = Boolean(
      allowedPersistedCustomTarget
      && normalizedHost === allowedPersistedCustomTarget.host
      && resolvedPort === allowedPersistedCustomTarget.port
      && parsed.protocol === allowedPersistedCustomTarget.protocol
    );

    if (parsed.protocol === 'http:' && !isAllowedLocalDevTarget && !isAllowedPersistedCustomTarget) {
      return { ok: false, status: 0, body: 'HTTP מותר רק ל-loopback מקומי מאושר' };
    }
    if (!isAllowedLocalDevTarget && !isAllowedPersistedCustomTarget && !ALLOWED_HTTPS_HOSTS.has(normalizedHost)) {
      return { ok: false, status: 0, body: `Host לא מורשה: ${normalizedHost}` };
    }
    if (normalizedRequestId && abortedProxyRequests.has(normalizedRequestId)) {
      abortedProxyRequests.delete(normalizedRequestId);
      return { ok: false, status: 0, body: 'Request aborted' };
    }

    const result = await new Promise((resolve, reject) => {
      const lib = parsed.protocol === 'https:' ? https : http;
      const bodyBuffer = body ? Buffer.from(body, 'utf8') : null;
      const reqHeaders = {
        ...Object.fromEntries(
          Object.entries(headers || {}).filter(([headerName]) => !['host', 'content-length', 'connection'].includes(String(headerName || '').toLowerCase()))
        ),
        ...(bodyBuffer ? { 'Content-Length': String(bodyBuffer.length) } : {}),
      };
      let settled = false;
      let timeoutHandle = null;
      const finishResolve = (value) => {
        if (settled) return;
        settled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (normalizedRequestId) activeProxyRequests.delete(normalizedRequestId);
        if (normalizedRequestId) abortedProxyRequests.delete(normalizedRequestId);
        resolve(value);
      };
      const finishReject = (error) => {
        if (settled) return;
        settled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (normalizedRequestId) activeProxyRequests.delete(normalizedRequestId);
        if (normalizedRequestId) abortedProxyRequests.delete(normalizedRequestId);
        reject(error);
      };
      const req = lib.request(
        { hostname: parsed.hostname, port: resolvedPort, path: parsed.pathname + (parsed.search || ''), method: normalizedMethod, headers: reqHeaders },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('error', finishReject);
          res.on('aborted', () => finishReject(new Error('Response aborted')));
          res.on('close', () => {
            if (!settled && !res.complete) finishReject(new Error('Response closed before completion'));
          });
          res.on('end', () => finishResolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
        }
      );
      req.on('error', finishReject);
      req.on('close', () => {
        if (!settled && req.destroyed) finishReject(new Error('Request closed before completion'));
      });
      if (normalizedRequestId) activeProxyRequests.set(normalizedRequestId, req);
      if (normalizedRequestId && abortedProxyRequests.has(normalizedRequestId)) {
        abortedProxyRequests.delete(normalizedRequestId);
        finishReject(new Error('Request aborted'));
        req.destroy();
        return;
      }
      timeoutHandle = setTimeout(() => {
        const timeoutError = new Error('Proxy request timed out');
        timeoutError.code = 'PROXY_TIMEOUT';
        req.destroy(timeoutError);
      }, effectiveTimeoutMs);
      if (bodyBuffer) req.write(bodyBuffer);
      req.end();
    });
    return result;
  } catch (err) {
    return { ok: false, status: 0, body: err?.message || 'שגיאת רשת' };
  }
});

ipcMain.handle('install-app-update', async () => {
  if (latestUpdateState.status !== 'downloaded') {
    return { ok: false, ...latestUpdateState, message: 'עדיין אין עדכון מוכן להתקנה' };
  }

  setImmediate(() => autoUpdater.quitAndInstall());
  return { ok: true, ...latestUpdateState, message: 'ההתקנה מתחילה כעת' };
});

function createAppMenu() {
  const template = [
    {
      label: 'קובץ',
      submenu: [
        { label: 'טען מחדש', role: 'reload' },
        { label: 'כפה טעינה מחדש', role: 'forceReload' },
        { type: 'separator' },
        { label: 'יציאה', role: 'quit' },
      ],
    },
    {
      label: 'עריכה',
      submenu: [
        { label: 'בטל', role: 'undo' },
        { label: 'בצע שוב', role: 'redo' },
        { type: 'separator' },
        { label: 'גזור', role: 'cut' },
        { label: 'העתק', role: 'copy' },
        { label: 'הדבק', role: 'paste' },
        { label: 'בחר הכל', role: 'selectAll' },
      ],
    },
    {
      label: 'תצוגה',
      submenu: [
        { label: 'זום פנימה', role: 'zoomIn' },
        { label: 'זום החוצה', role: 'zoomOut' },
        { label: 'איפוס זום', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'מסך מלא', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'עזרה',
      submenu: [
        {
          label: 'בדוק עדכונים',
          click: async () => {
            const result = await triggerUpdateCheck();
            if (result?.ok === false) {
              await dialog.showMessageBox({
                type: result.status === 'error' ? 'error' : 'info',
                title: 'עדכונים',
                message: result.message || 'לא ניתן לבדוק עדכונים כרגע.',
              });
            }
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', async (_event, argv) => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const launchFilePath = getLaunchFilePath(argv);
    if (launchFilePath) {
      const payload = await readDocumentPayload(launchFilePath);
      sendDocumentToRenderer(payload);
    }
  });

  app.whenReady().then(async () => {
    app.setName('WordFlow AI');
    app.setAppUserModelId('com.wordai.assistant');
    createAppMenu();
    createMainWindow();
    setupAutoUpdater();

    const launchFilePath = getLaunchFilePath(process.argv.slice(1));
    if (launchFilePath) {
      const payload = await readDocumentPayload(launchFilePath);
      sendDocumentToRenderer(payload);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
