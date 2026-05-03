import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const DOCX_DEFAULT_FONT = 'Arial';
const DOCX_DEFAULT_LANGUAGE = { value: 'he-IL', eastAsia: 'he-IL', bidirectional: 'he-IL' };
const DOCX_WORD_SAFE_FONTS = new Set(['Arial', 'Calibri', 'David', 'Georgia', 'Miriam Libre', 'Segoe UI', 'Tahoma', 'Times New Roman']);

const decodeHtmlEntities = (value = '') => {
  const textarea = typeof document !== 'undefined' ? document.createElement('textarea') : null;
  if (!textarea) {
    return String(value || '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  textarea.innerHTML = String(value || '');
  return textarea.value;
};

const splitFontCandidates = (fontValue = '') => String(fontValue || '')
  .split(',')
  .map((part) => part.replace(/["']/g, '').trim())
  .filter((part) => part && !/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|inherit|initial|unset)$/i.test(part));

const pickWordSafeFontName = (fontValue = '', fallbackFont = DOCX_DEFAULT_FONT) => {
  const candidates = splitFontCandidates(fontValue);
  return candidates.find((candidate) => DOCX_WORD_SAFE_FONTS.has(candidate)) || fallbackFont || DOCX_DEFAULT_FONT;
};

const normalizeDocxFontSize = (rawValue = '', fallbackSize = 24) => {
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
};

const normalizeDocxLanguage = (language = '') => {
  const resolved = String(language || '').trim() || DOCX_DEFAULT_LANGUAGE.value;
  return {
    value: resolved,
    eastAsia: resolved,
    bidirectional: resolved,
  };
};

const resolveDocxParagraphAlignment = (documentStyle = '') => {
  const normalizedStyle = String(documentStyle || '').trim().toLowerCase();
  if (normalizedStyle === 'legal') return AlignmentType.JUSTIFIED;
  if (normalizedStyle === 'presentation') return AlignmentType.CENTER;
  return AlignmentType.RIGHT;
};

const resolveDocxExportOptions = ({ html = '', exportOptions = {} } = {}) => {
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
};

const readHtmlAttributeValue = (block = '', attrName = '') => {
  if (!attrName) return '';
  const match = String(block || '').match(new RegExp(`${attrName}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return String(match?.[1] || '').trim();
};

const readInlineCssValue = (block = '', propertyName = '') => {
  if (!propertyName) return '';
  const styleMatch = String(block || '').match(/style=["']([^"']+)["']/i);
  if (!styleMatch) return '';
  const valueMatch = String(styleMatch[1] || '').match(new RegExp(`${propertyName}\\s*:\\s*([^;]+)`, 'i'));
  return String(valueMatch?.[1] || '').trim();
};

const resolveDocxAlignmentValue = (value = '', fallback = AlignmentType.RIGHT, isRtl = true) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'center' || normalized === 'centre') return AlignmentType.CENTER;
  if (normalized === 'left') return AlignmentType.LEFT;
  if (normalized === 'right') return AlignmentType.RIGHT;
  if (normalized === 'start') return isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
  if (normalized === 'end') return isRtl ? AlignmentType.LEFT : AlignmentType.RIGHT;
  if (normalized.startsWith('justify')) return AlignmentType.JUSTIFIED;
  return fallback;
};

const resolveBlockDocxFormatting = (block = '', typography = {}) => {
  const explicitDirection = readHtmlAttributeValue(block, 'dir') || readInlineCssValue(block, 'direction');
  const bidirectional = explicitDirection ? !/^ltr$/i.test(explicitDirection) : true;
  const alignmentValue = readInlineCssValue(block, 'text-align') || readHtmlAttributeValue(block, 'align');
  return {
    alignment: resolveDocxAlignmentValue(alignmentValue, typography.alignment || AlignmentType.RIGHT, bidirectional),
    bidirectional,
  };
};

const buildDocxRunStyle = (typography = {}, overrides = {}) => {
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
};

const createDocxTextRun = (text = '', options = {}, typography = {}) => new TextRun({
  text: String(text || ''),
  ...buildDocxRunStyle(typography, options),
});

const base64ToUint8Array = (base64 = '') => {
  const binary = atob(String(base64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const readImageBytes = async (src = '') => {
  if (!src) return null;
  if (/^data:image\//i.test(src)) {
    const base64 = src.split(',')[1] || '';
    return base64 ? base64ToUint8Array(base64) : null;
  }
  const response = await fetch(src);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
};

const getImageDimensions = async (src = '') => new Promise((resolve) => {
  if (!src) {
    resolve({ width: 420, height: 240 });
    return;
  }

  const image = new Image();
  image.onload = () => {
    resolve({
      width: image.naturalWidth || 420,
      height: image.naturalHeight || 240,
    });
  };
  image.onerror = () => resolve({ width: 420, height: 240 });
  image.src = src;
});

const fitImageToBounds = ({ width = 420, height = 240 } = {}, maxWidth = 420, maxHeight = 240) => {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : maxWidth;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : maxHeight;
  const ratio = Math.min(maxWidth / safeWidth, maxHeight / safeHeight, 1);
  return {
    width: Math.max(1, Math.round(safeWidth * ratio)),
    height: Math.max(1, Math.round(safeHeight * ratio)),
  };
};

const createDocxImageParagraph = async (block = '', typography = {}) => {
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
    const [data, naturalSize] = await Promise.all([
      readImageBytes(src),
      getImageDimensions(src),
    ]);

    if (!data) throw new Error('Image data unavailable');

    return new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 160 },
      children: [
        new ImageRun({
          data,
          transformation: fitImageToBounds(naturalSize),
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
};

const buildDocxTable = (block = '', typography = {}) => {
  const tableFormatting = resolveBlockDocxFormatting(block, typography);
  const rows = (String(block || '').match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []).map((rowHtml) => {
    const cells = rowHtml.match(/<(th|td)[^>]*>[\s\S]*?<\/\1>/gi) || [];
    return new TableRow({
      children: (cells.length ? cells : ['<td></td>']).map((cellHtml) => {
        const isHeader = /^<th/i.test(cellHtml);
        const cellFormatting = resolveBlockDocxFormatting(cellHtml, typography);
        const text = decodeHtmlEntities(String(cellHtml).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) || ' ';
        return new TableCell({
          width: { size: 100, type: WidthType.AUTO },
          children: [
            new Paragraph({
              style: 'Normal',
              alignment: cellFormatting.alignment,
              bidirectional: cellFormatting.bidirectional,
              children: [createDocxTextRun(text, { bold: isHeader, rightToLeft: cellFormatting.bidirectional }, typography)],
            }),
          ],
        });
      }),
    });
  });

  return new Table({
    width: { size: '100%', type: WidthType.PERCENTAGE },
    visuallyRightToLeft: tableFormatting.bidirectional,
    rows: rows.length ? rows : [new TableRow({
      children: [new TableCell({
        children: [new Paragraph({
          style: 'Normal',
          text: ' ',
          alignment: tableFormatting.alignment,
          bidirectional: tableFormatting.bidirectional,
        })],
      })],
    })],
  });
};

const htmlToDocxParagraphs = async (html = '', fallbackText = '', typography = resolveDocxExportOptions({ html })) => {
  const source = String(html || '')
    .replace(/\r\n/g, '\n')
    .replace(/<(div|p)[^>]*(?:data-type=["']page-break["']|data-page-break=["']true["']|class=["'][^"']*page-break(?:-node)?[^"']*["']|style=["'][^"']*(?:page-break-after\s*:\s*always|break-after\s*:\s*page)[^"']*["'])[^>]*>(?:\s|&nbsp;|&#160;|<br\s*\/?>)*<\/\1>/gi, '\n[[PAGE_BREAK]]\n');

  const blockRegex = /\[\[PAGE_BREAK\]\]|<table[^>]*>[\s\S]*?<\/table>|<img[^>]*>|<h1[^>]*>[\s\S]*?<\/h1>|<h2[^>]*>[\s\S]*?<\/h2>|<h3[^>]*>[\s\S]*?<\/h3>|<blockquote[^>]*>[\s\S]*?<\/blockquote>|<li[^>]*>[\s\S]*?<\/li>|<p[^>]*>[\s\S]*?<\/p>|<div[^>]*>[\s\S]*?<\/div>/gi;
  const children = [];
  const blocks = source.match(blockRegex) || [];

  const pushTextParagraph = (text, options = {}, blockHtml = '') => {
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
      const blockFormatting = resolveBlockDocxFormatting(blockHtml, typography);
    const runOptions = {
      ...(options.bold ? { bold: true } : {}),
      ...(options.italics ? { italics: true } : {}),
      ...(options.color ? { color: options.color } : {}),
      ...(options.size ? { size: options.size } : {}),
        rightToLeft: typeof options.bidirectional === 'boolean' ? options.bidirectional : blockFormatting.bidirectional,
    };
    const textRuns = cleanText.split('\n').flatMap((line, index) => (
      index === 0
        ? [createDocxTextRun(line, runOptions, typography)]
        : [createDocxTextRun(line, { ...runOptions, break: 1 }, typography)]
    ));
    children.push(new Paragraph({
      ...(options.heading ? {} : { style: 'Normal' }),
      alignment: options.alignment || blockFormatting.alignment || typography.alignment || AlignmentType.RIGHT,
      bidirectional: typeof options.bidirectional === 'boolean' ? options.bidirectional : blockFormatting.bidirectional,
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
      .forEach((chunk) => pushTextParagraph(chunk, {}, chunk));
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
    if (/^<h1/i.test(block)) { pushTextParagraph(block, { heading: HeadingLevel.HEADING_1, bold: true, size: 34 }, block); continue; }
    if (/^<h2/i.test(block)) { pushTextParagraph(block, { heading: HeadingLevel.HEADING_2, bold: true, size: 28 }, block); continue; }
    if (/^<h3/i.test(block)) { pushTextParagraph(block, { heading: HeadingLevel.HEADING_3, bold: true, size: 24 }, block); continue; }
    if (/^<li/i.test(block)) { pushTextParagraph(block, { bullet: { level: 0 } }, block); continue; }
    if (/^<blockquote/i.test(block)) { pushTextParagraph(block, { italics: true, color: '475569' }, block); continue; }
    pushTextParagraph(block, {}, block);
  }

  return children.length ? children : [new Paragraph({ text: '' })];
};

const buildDocxBlob = async ({ html = '', text = '', exportOptions = {} } = {}) => {
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

  return Packer.toBlob(doc);
};

const sanitizeDocxFilename = (title = '') => {
  const sanitized = String(title || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim();
  return sanitized || 'document';
};

const getDocxPickerOptions = (fileName) => ({
  suggestedName: fileName,
  types: [
    {
      description: 'Word Document',
      accept: {
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      },
    },
  ],
  excludeAcceptAllOption: false,
});

const getBrowserUserAgent = () => {
  if (typeof navigator === 'undefined') return '';
  return String(navigator.userAgent || '');
};

const isVsCodeEmbeddedBrowser = () => {
  const userAgent = getBrowserUserAgent();
  return userAgent.includes('Code/') && userAgent.includes('Electron/');
};

const isPlatformRestrictedFileAccessError = (error) => {
  if (!['NotAllowedError', 'SecurityError'].includes(error?.name)) return false;

  const message = String(error?.message || '');
  return /user agent|platform in the current context|current context/i.test(message);
};

const triggerBrowserDownload = (blob, fileName, saveMode = 'download') => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 0);

  return { handled: true, canceled: false, fileName, saveMode };
};

const requestDocxSaveHandle = async (fileName) => {
  if (typeof window === 'undefined' || typeof window.showSaveFilePicker !== 'function' || isVsCodeEmbeddedBrowser()) {
    return { handled: false, canceled: false, handle: null, apiAvailable: false };
  }

  try {
    const handle = await window.showSaveFilePicker(getDocxPickerOptions(fileName));
    return {
      apiAvailable: true,
      handled: true,
      canceled: false,
      handle,
      fileName: handle.name || fileName,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { apiAvailable: true, handled: true, canceled: true, handle: null, fileName };
    }

    if (isPlatformRestrictedFileAccessError(error)) {
      return { handled: false, canceled: false, handle: null, apiAvailable: false, error };
    }

    throw error;
  }
};

const saveBlobToFileHandle = async (handle, blob) => {
  let writable = null;

  try {
    writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { handled: true, canceled: false };
  } catch (error) {
    if (writable && typeof writable.abort === 'function') {
      try {
        await writable.abort();
      } catch {
        // no-op
      }
    }

    if (error?.name === 'AbortError') {
      return { handled: true, canceled: true, error };
    }

    if (isPlatformRestrictedFileAccessError(error)) {
      return { handled: false, canceled: false, fallbackToDownload: true, error };
    }

    console.error('Browser DOCX write via File Picker failed:', error);
    return { handled: false, canceled: false, error };
  }
};

export const downloadBrowserDocx = async ({ title = '', html = '', text = '', exportOptions = {} } = {}) => {
  const fileName = `${sanitizeDocxFilename(title)}.docx`;
  const pickerResult = await requestDocxSaveHandle(fileName);

  if (pickerResult.handled && pickerResult.canceled) {
    return pickerResult;
  }

  const blob = await buildDocxBlob({ html, text, exportOptions });

  if (pickerResult.handled && pickerResult.handle) {
    const writeResult = await saveBlobToFileHandle(pickerResult.handle, blob);

    if (writeResult.handled) {
      return {
        handled: true,
        canceled: writeResult.canceled,
        fileName: pickerResult.fileName || fileName,
      };
    }

    if (writeResult.fallbackToDownload) {
      return triggerBrowserDownload(blob, pickerResult.fileName || fileName, 'download-fallback');
    }

    throw writeResult.error || new Error('Failed to save DOCX file.');
  }

  if (pickerResult.apiAvailable) {
    throw pickerResult.error || new Error('Failed to open save dialog.');
  }

  return triggerBrowserDownload(blob, fileName);
};
