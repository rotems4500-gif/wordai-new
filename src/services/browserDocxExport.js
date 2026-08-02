import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import JSZip from 'jszip';
import {
  cssColorToDocxHex,
  getLayoutMarginCm,
  normalizeDocumentLayout,
  PAGE_SIZES_CM,
} from './documentLayout';

const DOCX_DEFAULT_FONT = 'Arial';
const DOCX_DEFAULT_LANGUAGE = { value: 'he-IL', eastAsia: 'he-IL', bidirectional: 'he-IL' };
const DOCX_WORD_SAFE_FONTS = new Set(['Arial', 'Calibri', 'David', 'Georgia', 'Miriam Libre', 'Segoe UI', 'Tahoma', 'Times New Roman']);
const DOCX_RTL_LANGUAGE_PATTERN = /^(he|ar|fa|ur|yi)(-|_|$)/i;
const DOCX_RTL_CHARACTER_PATTERN = /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/gu;
const DOCX_LATIN_CHARACTER_PATTERN = /[A-Za-z]/g;

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
  // קודם כל מכבדים את הפונט שהמשתמש בחר (Heebo/Alef/Frank Ruhl Libre וכו') — Word
  // מתמודד יפה עם פונט שמותקן במערכת. רק אם אין בכלל מועמד נופלים לרשימה הבטוחה.
  return candidates[0]
    || candidates.find((candidate) => DOCX_WORD_SAFE_FONTS.has(candidate))
    || fallbackFont
    || DOCX_DEFAULT_FONT;
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

const resolveDocxXmlJustification = (alignment = AlignmentType.RIGHT) => {
  if (alignment === AlignmentType.CENTER) return 'center';
  if (alignment === AlignmentType.LEFT) return 'left';
  if (alignment === AlignmentType.JUSTIFIED) return 'both';
  return 'right';
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
    // רווח שורות של המסמך (documentStyle) — נשמר על מיכל העורך ולא ב-HTML, ולכן מגיע כאן.
    lineSpacing: resolveDocxLineSpacing(safeOptions.lineHeight, 360),
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

const extractDirectionalText = (block = '') => decodeHtmlEntities(
  String(block || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|blockquote|li|tr|td|th|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, ' '),
)
  .replace(/\s+/g, ' ')
  .trim();

const isRtlDocxLanguage = (language = DOCX_DEFAULT_LANGUAGE) => {
  const candidate = typeof language === 'string'
    ? language
    : language?.bidirectional || language?.value || language?.eastAsia || '';
  return DOCX_RTL_LANGUAGE_PATTERN.test(String(candidate || '').trim());
};

const hasSignificantRtlText = (block = '') => {
  const text = extractDirectionalText(block);
  const rtlCount = (text.match(DOCX_RTL_CHARACTER_PATTERN) || []).length;
  if (rtlCount < 2) return false;
  const latinCount = (text.match(DOCX_LATIN_CHARACTER_PATTERN) || []).length;
  if (!latinCount) return true;
  const words = text.split(/\s+/).filter(Boolean);
  const rtlWordCount = words.filter((word) => (word.match(DOCX_RTL_CHARACTER_PATTERN) || []).length > 0).length;
  const latinWordCount = words.filter((word) => (word.match(DOCX_LATIN_CHARACTER_PATTERN) || []).length > 0).length;
  return rtlCount >= 6 && rtlWordCount >= 2 && rtlWordCount > latinWordCount && rtlCount >= latinCount;
};

const shouldForceRtlBlockFormatting = (block = '') => hasSignificantRtlText(block);

const hasDominantLtrText = (block = '', typography = {}) => {
  const text = extractDirectionalText(block);
  const latinCount = (text.match(DOCX_LATIN_CHARACTER_PATTERN) || []).length;
  if (latinCount < 3) return false;
  const rtlCount = (text.match(DOCX_RTL_CHARACTER_PATTERN) || []).length;
  const words = text.split(/\s+/).filter(Boolean);
  const rtlWordCount = words.filter((word) => (word.match(DOCX_RTL_CHARACTER_PATTERN) || []).length > 0).length;
  const latinWordCount = words.filter((word) => (word.match(DOCX_LATIN_CHARACTER_PATTERN) || []).length > 0).length;
  if (!rtlCount) return latinWordCount >= 1 && latinCount >= 3;
  return latinCount >= 6 && latinWordCount >= 2 && latinWordCount > rtlWordCount && latinCount > rtlCount;
};

const hasDirectionalDocxText = (block = '') => {
  const text = extractDirectionalText(block);
  return Boolean((text.match(DOCX_RTL_CHARACTER_PATTERN) || []).length || (text.match(DOCX_LATIN_CHARACTER_PATTERN) || []).length);
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
  const alignmentValue = readInlineCssValue(block, 'text-align') || readHtmlAttributeValue(block, 'align');
  const explicitLtr = /^ltr$/i.test(String(explicitDirection || '').trim());
  const fallbackAlignment = !alignmentValue && explicitLtr
    ? AlignmentType.LEFT
    : (typography.alignment || AlignmentType.RIGHT);
  const documentIsRtl = isRtlDocxLanguage(typography.language);
  const bidirectional = explicitDirection
    ? !explicitLtr
    : documentIsRtl;
  const alignmentDirection = bidirectional;
  return {
    alignment: resolveDocxAlignmentValue(alignmentValue, fallbackAlignment, alignmentDirection),
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

const ensureDocxParagraphProperties = (propertiesXml = '', defaultJustification = 'right') => {
  let next = String(propertiesXml || '');
  if (!/<w:bidi\b/i.test(next)) {
    next = next.replace(/<\/w:pPr>/i, '<w:bidi/></w:pPr>');
  }
  if (!/<w:jc\b/i.test(next)) {
    next = next.replace(/<\/w:pPr>/i, `<w:jc w:val="${defaultJustification}"/></w:pPr>`);
  }
  return next;
};

const forceDocxRtlDocumentXml = (xml = '', defaultJustification = 'right') => String(xml || '')
  .replace(/<w:p>([\s\S]*?)<\/w:p>/gi, (paragraphXml) => {
    if (/<w:pPr>[\s\S]*?<\/w:pPr>/i.test(paragraphXml)) {
      return paragraphXml.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/i, (propertiesXml) => ensureDocxParagraphProperties(propertiesXml, defaultJustification));
    }
    return paragraphXml.replace(/<w:p>/i, `<w:p><w:pPr><w:bidi/><w:jc w:val="${defaultJustification}"/></w:pPr>`);
  })
  .replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/gi, (runPropertiesXml) => (
    /<w:rtl\b/i.test(runPropertiesXml)
      ? runPropertiesXml
      : runPropertiesXml.replace(/<\/w:rPr>/i, '<w:rtl/></w:rPr>')
  ))
  .replace(/<w:r>(?!<w:rPr>)/gi, '<w:r><w:rPr><w:rtl/></w:rPr>');

const forceDocxRtlStylesXml = (xml = '', defaultJustification = 'right') => {
  let next = String(xml || '');
  if (/<w:pPrDefault>\s*<w:pPr>[\s\S]*?<\/w:pPr>\s*<\/w:pPrDefault>/i.test(next)) {
    next = next.replace(/<w:pPrDefault>\s*(<w:pPr>[\s\S]*?<\/w:pPr>)\s*<\/w:pPrDefault>/i, (_match, propertiesXml) => (
      `<w:pPrDefault>${ensureDocxParagraphProperties(propertiesXml, defaultJustification)}</w:pPrDefault>`
    ));
  } else if (/<w:docDefaults>/i.test(next)) {
    next = next.replace(/<w:docDefaults>/i, `<w:docDefaults><w:pPrDefault><w:pPr><w:bidi/><w:jc w:val="${defaultJustification}"/></w:pPr></w:pPrDefault>`);
  }

  if (/<w:rPrDefault>\s*<w:rPr>[\s\S]*?<\/w:rPr>\s*<\/w:rPrDefault>/i.test(next)) {
    next = next.replace(/<w:rPrDefault>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)\s*<\/w:rPrDefault>/i, (_match, runPropertiesXml) => (
      `<w:rPrDefault>${/<w:rtl\b/i.test(runPropertiesXml) ? runPropertiesXml : runPropertiesXml.replace(/<\/w:rPr>/i, '<w:rtl/></w:rPr>')}</w:rPrDefault>`
    ));
  } else if (/<w:docDefaults>/i.test(next)) {
    next = next.replace(/<w:docDefaults>/i, '<w:docDefaults><w:rPrDefault><w:rPr><w:rtl/></w:rPr></w:rPrDefault>');
  }

  return next;
};

const forceDocxRtlBlob = async (blob, typography = {}) => {
  const defaultJustification = resolveDocxXmlJustification(typography.alignment);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const documentFile = zip.file('word/document.xml');
  if (documentFile) {
    zip.file('word/document.xml', forceDocxRtlDocumentXml(await documentFile.async('string'), defaultJustification));
  }
  const stylesFile = zip.file('word/styles.xml');
  if (stylesFile) {
    zip.file('word/styles.xml', forceDocxRtlStylesXml(await stylesFile.async('string'), defaultJustification));
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
};

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
        const explicitCellDirection = readHtmlAttributeValue(cellHtml, 'dir') || readInlineCssValue(cellHtml, 'direction');
        const explicitCellAlignment = readInlineCssValue(cellHtml, 'text-align') || readHtmlAttributeValue(cellHtml, 'align');
        const detectedCellFormatting = resolveBlockDocxFormatting(cellHtml, {
          ...typography,
          alignment: tableFormatting.alignment,
        });
        const cellBidirectional = explicitCellDirection
          ? !/^ltr$/i.test(explicitCellDirection)
          : (detectedCellFormatting.bidirectional ?? tableFormatting.bidirectional);
        const cellFormatting = {
          alignment: explicitCellAlignment
            ? resolveDocxAlignmentValue(explicitCellAlignment, detectedCellFormatting.alignment, cellBidirectional)
            : detectedCellFormatting.alignment,
          bidirectional: cellBidirectional,
        };
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

const htmlToDocxParagraphsLegacy = async (html = '', fallbackText = '', typography = resolveDocxExportOptions({ html })) => {
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

// ── ממיר HTML→DOCX מבוסס DOM ────────────────────────────────────────────────
// המסלול הישן (htmlToDocxParagraphsLegacy) עבד ב-regex ומחק כל תג inline לפני
// שקרא עיצוב, ולכן bold/underline/צבע/פונט/גודל/קישורים/מספור רשימות אבדו בייצוא,
// ועמוד שער (div עוטף) נמעך לפסקה אחת. כאן עוברים על ה-DOM אמיתי ובונים run לכל
// קטע inline עם המאפיינים שלו.
export const DOCX_ORDERED_NUMBERING_REF = 'wf-ordered-list';

const DOCX_HEADING_LEVELS = {
  H1: HeadingLevel.HEADING_1,
  H2: HeadingLevel.HEADING_2,
  H3: HeadingLevel.HEADING_3,
  H4: HeadingLevel.HEADING_4,
  H5: HeadingLevel.HEADING_5,
  H6: HeadingLevel.HEADING_6,
};

const parseExportHtmlRoot = (html = '') => {
  if (typeof DOMParser === 'undefined') return null;
  try {
    const parsed = new DOMParser().parseFromString(`<body><div data-wf-export-root="true">${String(html || '')}</div></body>`, 'text/html');
    return parsed?.querySelector('[data-wf-export-root="true"]') || null;
  } catch {
    return null;
  }
};

const isExportPageBreakElement = (el) => {
  if (!el?.getAttribute) return false;
  if (el.getAttribute('data-type') === 'page-break') return true;
  if (el.getAttribute('data-page-break') === 'true') return true;
  if (/page-break/i.test(el.getAttribute('class') || '')) return true;
  const style = el.getAttribute('style') || '';
  return /(page-break-after\s*:\s*always|break-after\s*:\s*page)/i.test(style);
};

const toDocxFontSpec = (fontName = '') => ({
  ascii: fontName,
  hAnsi: fontName,
  cs: fontName,
  eastAsia: fontName,
});

// צובר את מאפייני ה-inline מאלמנט אחד אל תוך הסגנון היורש.
const extendInlineStyle = (inherited = {}, el, typography = {}) => {
  const tag = String(el.tagName || '').toUpperCase();
  const next = { ...inherited };
  if (tag === 'STRONG' || tag === 'B') next.bold = true;
  if (tag === 'EM' || tag === 'I') next.italics = true;
  if (tag === 'U' || tag === 'INS') next.underline = {};
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') next.strike = true;
  if (tag === 'SUB') next.subScript = true;
  if (tag === 'SUP') next.superScript = true;
  if (tag === 'MARK') next.shading = { fill: 'FFF3A3' };
  if (tag === 'A') { next.underline = {}; next.color = next.color || '1155CC'; }
  if (tag === 'CODE' || tag === 'PRE' || tag === 'KBD') next.fontName = 'Consolas';

  const style = el.style || {};
  const weight = String(style.fontWeight || '').trim();
  if (weight && (/^bold(er)?$/i.test(weight) || Number.parseInt(weight, 10) >= 600)) next.bold = true;
  if (/^(normal|[1-5]00)$/i.test(weight)) next.bold = false;
  if (/italic|oblique/i.test(String(style.fontStyle || ''))) next.italics = true;
  const decoration = `${style.textDecoration || ''} ${style.textDecorationLine || ''}`;
  if (/underline/i.test(decoration)) next.underline = {};
  if (/line-through/i.test(decoration)) next.strike = true;
  if (style.color) {
    const hex = cssColorToDocxHex(style.color);
    if (hex) next.color = hex;
  }
  if (style.backgroundColor) {
    const hex = cssColorToDocxHex(style.backgroundColor);
    if (hex && hex.toUpperCase() !== 'FFFFFF') next.shading = { fill: hex };
  }
  if (style.fontFamily) {
    const picked = pickWordSafeFontName(style.fontFamily, '');
    if (picked) next.fontName = picked;
  }
  if (style.fontSize) {
    const size = normalizeDocxFontSize(style.fontSize, 0);
    if (size) next.size = size;
  }
  return next;
};

// עובר רקורסיבית על תוכן inline ומחזיר תיאורי run ({text|break, style}).
const collectInlineRunDescriptors = (node, inheritedStyle, typography, out = []) => {
  const kids = node?.childNodes ? Array.from(node.childNodes) : [];
  for (const child of kids) {
    if (child.nodeType === 3) {
      const text = String(child.nodeValue || '').replace(/ /g, ' ').replace(/\s+/g, ' ');
      if (text) out.push({ text, style: inheritedStyle });
      continue;
    }
    if (child.nodeType !== 1) continue;
    const tag = String(child.tagName || '').toUpperCase();
    if (tag === 'BR') { out.push({ break: true, style: inheritedStyle }); continue; }
    // הערת שוליים: הטקסט יושב ב-attr ולא בגוף הפסקה — יוצא כהערת שוליים אמיתית של Word
    if (tag === 'SUP' && child.getAttribute?.('data-type') === 'footnote') {
      const noteText = decodeHtmlEntities(child.getAttribute('data-footnote-text') || '').trim();
      if (noteText) out.push({ footnote: noteText, style: inheritedStyle });
      continue;
    }
    if (tag === 'IMG' || tag === 'SCRIPT' || tag === 'STYLE') continue;
    collectInlineRunDescriptors(child, extendInlineStyle(inheritedStyle, child, typography), typography, out);
  }
  return out;
};

const buildRunsFromDescriptors = (descriptors = [], typography = {}, baseOptions = {}, footnoteTexts = null) => {
  const trimmed = [...descriptors];
  while (trimmed.length && trimmed[0].text && !trimmed[0].text.trim()) trimmed.shift();
  while (trimmed.length && trimmed[trimmed.length - 1].text && !trimmed[trimmed.length - 1].text.trim()) trimmed.pop();
  if (trimmed.length && trimmed[0].text) trimmed[0] = { ...trimmed[0], text: trimmed[0].text.replace(/^\s+/, '') };
  const last = trimmed.length - 1;
  if (last >= 0 && trimmed[last].text) trimmed[last] = { ...trimmed[last], text: trimmed[last].text.replace(/\s+$/, '') };

  const runs = [];
  let pendingBreaks = 0;
  for (const descriptor of trimmed) {
    if (descriptor.break) { pendingBreaks += 1; continue; }
    if (descriptor.footnote) {
      if (!Array.isArray(footnoteTexts)) continue;
      footnoteTexts.push(descriptor.footnote);
      runs.push(new FootnoteReferenceRun(footnoteTexts.length));
      continue;
    }
    const text = String(descriptor.text || '');
    if (!text) continue;
    const style = descriptor.style || {};
    const options = { ...baseOptions };
    if (style.bold) options.bold = true;
    if (style.bold === false && baseOptions.bold !== true) delete options.bold;
    if (style.italics) options.italics = true;
    if (style.underline) options.underline = style.underline;
    if (style.strike) options.strike = true;
    if (style.subScript) options.subScript = true;
    if (style.superScript) options.superScript = true;
    if (style.shading) options.shading = style.shading;
    if (style.color) options.color = style.color;
    if (style.fontName) options.font = toDocxFontSpec(style.fontName);
    if (style.size) { options.size = style.size; options.sizeComplexScript = style.size; }
    if (pendingBreaks) { options.break = pendingBreaks; pendingBreaks = 0; }
    runs.push(createDocxTextRun(text, options, typography));
  }
  return runs;
};

// יישור/כיווניות של בלוק — גרסת DOM של resolveBlockDocxFormatting.
const resolveElementDocxFormatting = (el, typography = {}, inheritedBlock = {}) => {
  const explicitDirection = el?.getAttribute?.('dir') || el?.style?.direction || '';
  const alignmentValue = el?.style?.textAlign || el?.getAttribute?.('align') || '';
  const explicitLtr = /^ltr$/i.test(String(explicitDirection || '').trim());
  const documentIsRtl = isRtlDocxLanguage(typography.language);
  const bidirectional = explicitDirection
    ? !explicitLtr
    : (typeof inheritedBlock.bidirectional === 'boolean' ? inheritedBlock.bidirectional : documentIsRtl);
  const fallbackAlignment = alignmentValue
    ? (typography.alignment || AlignmentType.RIGHT)
    : (inheritedBlock.alignment || typography.alignment || AlignmentType.RIGHT);
  return {
    alignment: resolveDocxAlignmentValue(alignmentValue, fallbackAlignment, bidirectional),
    bidirectional,
  };
};

// line-height של CSS → spacing.line של Word (240 = שורה בודדת).
const resolveDocxLineSpacing = (value = '', fallback = 360) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'normal') return fallback;
  const numeric = Number.parseFloat(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  if (/(px|pt|rem|em|%)$/.test(raw)) {
    if (raw.endsWith('%')) return Math.round((numeric / 100) * 240);
    if (raw.endsWith('px')) return Math.round((numeric / 16) * 240);
    return Math.round(numeric * 240);
  }
  return Math.round(numeric * 240);
};

const htmlToDocxParagraphs = async (html = '', fallbackText = '', typography = resolveDocxExportOptions({ html }), footnoteTexts = null) => {
  const root = parseExportHtmlRoot(html);
  if (!root) return htmlToDocxParagraphsLegacy(html, fallbackText, typography);

  const children = [];
  const headingSizes = {
    H1: Math.max(typography.fontSize + 10, 34),
    H2: Math.max(typography.fontSize + 4, 28),
    H3: Math.max(typography.fontSize + 2, 24),
    H4: typography.fontSize + 2,
    H5: typography.fontSize,
    H6: typography.fontSize,
  };
  let orderedInstance = 0;

  const pushParagraph = (el, {
    inlineStyle = {},
    blockFormat = {},
    heading = null,
    runOptions = {},
    bullet = null,
    numbering = null,
    lineSpacing = null,
    extra = {},
  } = {}) => {
    const descriptors = collectInlineRunDescriptors(el, inlineStyle, typography);
    const runs = buildRunsFromDescriptors(descriptors, typography, {
      ...runOptions,
      rightToLeft: blockFormat.bidirectional !== false,
    }, footnoteTexts);
    if (!runs.length && !bullet && !numbering) return;
    children.push(new Paragraph({
      ...(heading ? { heading } : { style: 'Normal' }),
      alignment: blockFormat.alignment || typography.alignment || AlignmentType.RIGHT,
      bidirectional: blockFormat.bidirectional !== false,
      spacing: { after: 160, line: lineSpacing || typography.lineSpacing || 360 },
      children: runs.length ? runs : [createDocxTextRun('', {}, typography)],
      ...(bullet ? { bullet } : {}),
      ...(numbering ? { numbering } : {}),
      ...extra,
    }));
  };

  const walk = async (parent, context) => {
    const nodes = parent?.childNodes ? Array.from(parent.childNodes) : [];
    for (const node of nodes) {
      if (node.nodeType === 3) {
        const text = String(node.nodeValue || '').replace(/\s+/g, ' ');
        if (!text.trim()) continue;
        children.push(new Paragraph({
          style: 'Normal',
          alignment: context.blockFormat.alignment || typography.alignment,
          bidirectional: context.blockFormat.bidirectional !== false,
          spacing: { after: 160, line: context.lineSpacing || 360 },
          children: [createDocxTextRun(text.trim(), { rightToLeft: context.blockFormat.bidirectional !== false }, typography)],
        }));
        continue;
      }
      if (node.nodeType !== 1) continue;

      const tag = String(node.tagName || '').toUpperCase();
      if (tag === 'SCRIPT' || tag === 'STYLE') continue;

      if (isExportPageBreakElement(node)) {
        children.push(new Paragraph({ style: 'Normal', text: '', pageBreakBefore: true, bidirectional: true }));
        continue;
      }

      const blockFormat = resolveElementDocxFormatting(node, typography, context.blockFormat);
      const inlineStyle = extendInlineStyle(context.inlineStyle, node, typography);
      const lineSpacing = node.style?.lineHeight
        ? resolveDocxLineSpacing(node.style.lineHeight, context.lineSpacing)
        : context.lineSpacing;
      const childContext = { ...context, blockFormat, inlineStyle, lineSpacing };

      if (tag === 'TABLE') { children.push(buildDocxTable(node.outerHTML, typography)); continue; }
      if (tag === 'IMG') { children.push(await createDocxImageParagraph(node.outerHTML, typography)); continue; }
      if (tag === 'HR') {
        children.push(new Paragraph({
          style: 'Normal',
          bidirectional: true,
          spacing: { after: 160 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C8C6C4', space: 1 } },
          children: [createDocxTextRun('', {}, typography)],
        }));
        continue;
      }
      if (tag === 'BR') { continue; }

      if (tag === 'UL' || tag === 'OL') {
        const isOrdered = tag === 'OL';
        if (isOrdered) orderedInstance += 1;
        const instance = orderedInstance;
        const level = Math.min(context.listLevel ?? 0, 4);
        for (const li of Array.from(node.children || [])) {
          if (String(li.tagName || '').toUpperCase() !== 'LI') continue;
          const nestedLists = Array.from(li.children || []).filter((c) => /^(UL|OL)$/i.test(c.tagName || ''));
          const liFormat = resolveElementDocxFormatting(li, typography, blockFormat);
          const liInline = extendInlineStyle(inlineStyle, li, typography);
          // התוכן הישיר של הפריט (בלי תת-הרשימות) הופך לפסקה אחת עם bullet/מספור.
          const holder = li.cloneNode(true);
          Array.from(holder.children || []).forEach((c) => {
            if (/^(UL|OL)$/i.test(c.tagName || '')) c.remove();
          });
          pushParagraph(holder, {
            inlineStyle: liInline,
            blockFormat: liFormat,
            lineSpacing,
            ...(isOrdered
              ? { numbering: { reference: DOCX_ORDERED_NUMBERING_REF, level, instance } }
              : { bullet: { level } }),
          });
          for (const nested of nestedLists) {
            await walk({ childNodes: [nested] }, { ...childContext, listLevel: level + 1 });
          }
        }
        continue;
      }

      if (DOCX_HEADING_LEVELS[tag]) {
        pushParagraph(node, {
          inlineStyle,
          blockFormat,
          lineSpacing,
          heading: DOCX_HEADING_LEVELS[tag],
          runOptions: { bold: true, size: headingSizes[tag], sizeComplexScript: headingSizes[tag] },
        });
        continue;
      }

      if (tag === 'BLOCKQUOTE') {
        // ציטוט יכול להכיל פסקאות — נכנסים פנימה עם סגנון נטוי מורש.
        await walk(node, { ...childContext, inlineStyle: { ...inlineStyle, italics: true, color: inlineStyle.color || '475569' } });
        continue;
      }

      if (tag === 'P' || tag === 'PRE') {
        pushParagraph(node, { inlineStyle, blockFormat, lineSpacing });
        continue;
      }

      // DIV / SECTION / ARTICLE / עמוד שער / כל עוטף אחר — נכנסים פנימה במקום למעוך
      // לפסקה אחת. אם אין בפנים בלוקים כלל, מתייחסים לתוכן כפסקה.
      const hasBlockChild = Array.from(node.children || []).some((c) => (
        /^(P|DIV|SECTION|ARTICLE|H[1-6]|UL|OL|TABLE|BLOCKQUOTE|HR|IMG|PRE)$/i.test(c.tagName || '')
      ));
      if (hasBlockChild) {
        await walk(node, childContext);
      } else {
        pushParagraph(node, { inlineStyle, blockFormat, lineSpacing });
      }
    }
  };

  await walk(root, {
    blockFormat: { alignment: typography.alignment, bidirectional: isRtlDocxLanguage(typography.language) },
    inlineStyle: {},
    lineSpacing: typography.lineSpacing || 360,
    listLevel: 0,
  });

  if (!children.length) {
    return htmlToDocxParagraphsLegacy(html, fallbackText, typography);
  }
  return children;
};

// בונה header/footer/properties של section מתוך documentLayout (ראה services/documentLayout.js)
const buildHeaderFooterParagraph = (content = {}, typography = {}, { isFooter = false } = {}) => {
  const children = [];
  const text = String(content?.text || '').trim();
  if (text) {
    children.push(createDocxTextRun(text, { size: 20, color: '555555' }, typography));
  }
  if (content?.pageNumber) {
    if (children.length) children.push(createDocxTextRun(' · ', { size: 20, color: '555555' }, typography));
    children.push(new TextRun({
      ...buildDocxRunStyle(typography, { size: 20, color: '555555' }),
      children: ['עמוד ', PageNumber.CURRENT, ' מתוך ', PageNumber.TOTAL_PAGES],
    }));
  }
  if (!children.length) {
    children.push(createDocxTextRun(' ', {}, typography));
  }
  return new Paragraph({
    alignment: content?.pageNumber && !text ? AlignmentType.CENTER : AlignmentType.RIGHT,
    bidirectional: true,
    spacing: isFooter ? { before: 120 } : { after: 120 },
    children,
  });
};

const buildDocxSectionFromLayout = (rawLayout, typography = {}) => {
  const layout = normalizeDocumentLayout(rawLayout);
  const marginCm = getLayoutMarginCm(layout);
  // מעבירים מידות portrait גולמיות — חבילת docx מחליפה רוחב/גובה בעצמה כש-orientation=landscape
  const [width, height] = PAGE_SIZES_CM[layout.pageSize] || PAGE_SIZES_CM.a4;
  const margin = `${marginCm}cm`;

  const properties = {
    page: {
      size: {
        width: `${width}cm`,
        height: `${height}cm`,
        orientation: layout.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
      },
      margin: { top: margin, right: margin, bottom: margin, left: margin },
      ...(layout.pageBorder ? {
        borders: {
          pageBorderTop: {
            style: BorderStyle.SINGLE,
            size: Math.max(2, Math.round((layout.pageBorder.sizePt || 1) * 8)),
            color: cssColorToDocxHex(layout.pageBorder.color) || '2B579A',
          },
          pageBorderBottom: {
            style: BorderStyle.SINGLE,
            size: Math.max(2, Math.round((layout.pageBorder.sizePt || 1) * 8)),
            color: cssColorToDocxHex(layout.pageBorder.color) || '2B579A',
          },
          pageBorderLeft: {
            style: BorderStyle.SINGLE,
            size: Math.max(2, Math.round((layout.pageBorder.sizePt || 1) * 8)),
            color: cssColorToDocxHex(layout.pageBorder.color) || '2B579A',
          },
          pageBorderRight: {
            style: BorderStyle.SINGLE,
            size: Math.max(2, Math.round((layout.pageBorder.sizePt || 1) * 8)),
            color: cssColorToDocxHex(layout.pageBorder.color) || '2B579A',
          },
        },
      } : {}),
    },
  };

  const headerParagraphs = [];
  if (layout.watermark?.text) {
    headerParagraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      children: [createDocxTextRun(layout.watermark.text, { size: 72, color: cssColorToDocxHex(layout.watermark.color) || 'C8C8C8' }, typography)],
    }));
  }
  if (layout.header) {
    headerParagraphs.push(buildHeaderFooterParagraph(layout.header, typography));
  }

  const footerContent = layout.footer || (layout.pageNumbers ? { pageNumber: true } : null);
  const normalizedFooter = footerContent
    ? { ...footerContent, pageNumber: footerContent.pageNumber || layout.pageNumbers }
    : null;

  return {
    properties,
    ...(headerParagraphs.length ? { headers: { default: new Header({ children: headerParagraphs }) } } : {}),
    ...(normalizedFooter ? { footers: { default: new Footer({ children: [buildHeaderFooterParagraph(normalizedFooter, typography, { isFooter: true })] }) } } : {}),
    background: layout.pageColor ? { color: cssColorToDocxHex(layout.pageColor) || undefined } : undefined,
  };
};

// מסיר בלוקים ויזואליים של כותרת עליונה/תחתונה שהוזרקו לגוף (data-doc-header/footer) —
// בייצוא הם מוחלפים ב-Header/Footer אמיתיים של DOCX.
const stripInBodyHeaderFooterBlocks = (html = '') => String(html || '')
  .replace(/<div[^>]*data-doc-(?:header|footer)=["']true["'][^>]*>[\s\S]*?<\/div>/gi, '');

// node תוכן-עניינים חי מרונדר כטקסט בלבד ב-getHTML — בייצוא מרחיבים אותו לרשימת הכותרות בפועל
const expandLiveTocForExport = (html = '') => {
  const source = String(html || '');
  if (!/data-type=["']toc-live["']/i.test(source)) return source;
  const headings = [];
  const headingRegex = /<h([123])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = headingRegex.exec(source)) !== null) {
    const text = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, '')).trim();
    if (text) headings.push({ level: Number(match[1]), text });
  }
  const items = headings.map((h) => `<li style="padding-right:${(h.level - 1) * 16}px">${h.text}</li>`).join('');
  const tocHtml = `<p><strong>תוכן עניינים</strong></p><ul>${items}</ul><hr/>`;
  return source.replace(/<div[^>]*data-type=["']toc-live["'][^>]*>[\s\S]*?<\/div>/gi, tocHtml);
};

export const buildDocxBlob = async ({ html = '', text = '', exportOptions = {} } = {}) => {
  const typography = resolveDocxExportOptions({ html, exportOptions });
  const layoutSection = buildDocxSectionFromLayout(exportOptions?.layout, typography);
  if (exportOptions?.layout) {
    html = stripInBodyHeaderFooterBlocks(html);
  }
  html = expandLiveTocForExport(html);
  const headingOneSize = Math.max(typography.fontSize + 10, 34);
  const headingTwoSize = Math.max(typography.fontSize + 4, 28);
  const headingThreeSize = Math.max(typography.fontSize + 2, 24);
  // הערות שוליים אמיתיות: הצומת בעורך תורם FootnoteReferenceRun, והטקסט נאסף לכאן
  const footnoteTexts = [];
  const children = await htmlToDocxParagraphs(html, text, typography, footnoteTexts);
  const footnotes = footnoteTexts.reduce((acc, noteText, index) => {
    acc[index + 1] = {
      children: [new Paragraph({
        alignment: typography.alignment || AlignmentType.RIGHT,
        bidirectional: true,
        children: [createDocxTextRun(noteText, { size: Math.max(typography.fontSize - 4, 16) }, typography)],
      })],
    };
    return acc;
  }, {});
  const doc = new Document({
    ...(footnoteTexts.length ? { footnotes } : {}),
    // מספור אמיתי לרשימות ממוספרות (<ol>) — בלי זה כל פריט היה יוצא כתבליט.
    numbering: {
      config: [{
        reference: DOCX_ORDERED_NUMBERING_REF,
        levels: [0, 1, 2, 3, 4].map((level) => ({
          level,
          format: 'decimal',
          text: `%${level + 1}.`,
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { start: 720 * (level + 1), hanging: 360 } } },
        })),
      }],
    },
    styles: {
      default: {
        document: {
          run: {
            ...buildDocxRunStyle(typography),
          },
          paragraph: {
            alignment: typography.alignment,
            bidirectional: true,
            spacing: { after: 160, line: typography.lineSpacing || 360 },
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
            spacing: { after: 160, line: typography.lineSpacing || 360 },
          },
          run: {
            ...buildDocxRunStyle(typography),
          },
        },
      ],
    },
    ...(layoutSection.background?.color ? { background: { color: layoutSection.background.color } } : {}),
    sections: [
      {
        properties: layoutSection.properties,
        ...(layoutSection.headers ? { headers: layoutSection.headers } : {}),
        ...(layoutSection.footers ? { footers: layoutSection.footers } : {}),
        children,
      },
    ],
  });

  return forceDocxRtlBlob(await Packer.toBlob(doc), typography);
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

const isMobileBrowser = () => /Android|iPhone|iPad|iPod|Mobile/i.test(getBrowserUserAgent());

const isVsCodeEmbeddedBrowser = () => {
  const userAgent = getBrowserUserAgent();
  return userAgent.includes('Code/') && userAgent.includes('Electron/');
};

const isPlatformRestrictedFileAccessError = (error) => {
  if (!['NotAllowedError', 'SecurityError'].includes(error?.name)) return false;

  const message = String(error?.message || '');
  return /user agent|platform in the current context|current context/i.test(message);
};

const shareBlobIfSupported = async (blob, fileName) => {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof File === 'undefined') {
    return { handled: false, canceled: false };
  }

  try {
    const file = new File([blob], fileName, {
      type: blob?.type || 'application/octet-stream',
      lastModified: Date.now(),
    });
    const sharePayload = { files: [file], title: fileName };

    if (typeof navigator.canShare === 'function' && !navigator.canShare(sharePayload)) {
      return { handled: false, canceled: false };
    }

    await navigator.share(sharePayload);
    return { handled: true, canceled: false, fileName, saveMode: 'share' };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { handled: true, canceled: true, fileName, saveMode: 'share' };
    }
    return { handled: false, canceled: false, error };
  }
};

export const saveBlobInBrowser = async (blob, fileName, saveMode = 'download') => {
  if (isMobileBrowser()) {
    const shared = await shareBlobIfSupported(blob, fileName);
    if (shared.handled) return shared;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';

  if (isMobileBrowser()) {
    link.target = '_blank';
  }

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
      return saveBlobInBrowser(blob, pickerResult.fileName || fileName, 'download-fallback');
    }

    throw writeResult.error || new Error('Failed to save DOCX file.');
  }

  if (pickerResult.apiAvailable) {
    throw pickerResult.error || new Error('Failed to open save dialog.');
  }

  return saveBlobInBrowser(blob, fileName);
};
