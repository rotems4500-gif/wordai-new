// wordBridge — כל הגישה ל-Word JS API (Word.run) של התוסף עוברת דרך הקובץ הזה בלבד.
// שכבת ה-React נשארת ניתנת להרצה בדפדפן רגיל (isWordAvailable() === false).
// מקור הפורט: WordAIAssistant/src/taskpane.js (התוסף הישן), עם שני תיקונים:
//   1. שחזור changeTrackingMode עטוף תמיד ב-finally (בישן דלף אם insert זרק).
//   2. cap של 255 תווים על מחרוזת search (מגבלת body.search בחלק מהמארחים).

const WORDFLOW_DOCUMENT_TEXT_LIMIT = 32000;
const WORD_SEARCH_MAX_LENGTH = 255;

export const isWordAvailable = () =>
  typeof Word !== 'undefined' && typeof Word.run === 'function' &&
  typeof Office !== 'undefined' && Boolean(Office?.context?.document);

const requireWord = () => {
  if (!isWordAvailable()) throw new Error('אין חיבור למסמך Word — פתח את התוסף בתוך Word');
};

// ─── ניקוי markdown לפני הכנסה למסמך ─────────────────────────────────────
export const sanitizeMarkdownText = (text) => String(text || '')
  .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ''))
  .replace(/^\s{0,3}#{1,6}\s+/gm, '')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/__([^_]+)__/g, '$1')
  .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
  .replace(/(?<!_)_([^_]+)_(?!_)/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
  .replace(/\n{3,}/g, '\n\n');

// ─── זיהוי כותרות ומבנה (טקסט בלבד — רץ גם בלי Word) ─────────────────────
const normalizeForCompare = (text) => String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();

export const normalizeHeadingForCompare = (text) => normalizeForCompare(text)
  .replace(/[.:]+$/g, '')
  .replace(/^[-–—•\s]+/g, '');

export const normalizeLocator = (text) => normalizeForCompare(text)
  .replace(/["'“”׳״`]/g, '')
  .replace(/[.:;]+$/g, '')
  .trim();

export const isLikelySectionHeading = (text) => {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed.length > 120) return false;
  if (/^[\dIVXא-ת]+[.)\-]\s+/.test(trimmed)) return true;
  if (/^(פרק|סעיף|חלק|מבוא|דיון|מסקנות|סיכום|שאלה|טענה|רקע|שיטה|ממצאים|ניתוח|סקירת ספרות|מסגרת תיאורטית|שיטת המחקר|הקדמה|רשימת מקורות|ביבליוגרפיה|נספח|תקציר)\b/.test(trimmed)) return true;
  if (/[:：]$/.test(trimmed)) return true;
  if (/[.!?]$/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 10;
};

export const buildSectionsFromParagraphTexts = (paragraphTexts = []) => {
  const headings = [];
  for (let index = 0; index < paragraphTexts.length; index += 1) {
    const title = String(paragraphTexts[index] || '').trim();
    if (!title || !isLikelySectionHeading(title)) continue;
    headings.push({
      index: headings.length + 1,
      paragraphIndex: index,
      title,
      normalizedTitle: normalizeHeadingForCompare(title),
    });
  }
  return headings.map((heading, headingIndex) => {
    const nextHeading = headings[headingIndex + 1];
    const endParagraphIndex = nextHeading
      ? Math.max(heading.paragraphIndex, nextHeading.paragraphIndex - 1)
      : paragraphTexts.length - 1;
    const sectionText = paragraphTexts
      .slice(heading.paragraphIndex, endParagraphIndex + 1)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      ...heading,
      endParagraphIndex,
      content: sectionText.slice(0, 800),
      normalizedContent: normalizeLocator(sectionText),
    };
  });
};

const buildOutlineText = (sections = []) => {
  const limited = (sections || []).slice(0, 24);
  if (!limited.length) return '';
  return ['מפת מסמך:', ...limited.map((section) => `- ${section.title}`)].join('\n');
};

// ─── קריאה ────────────────────────────────────────────────────────────────
export const getSelectedText = async () => {
  requireWord();
  let text = '';
  await Word.run(async (ctx) => {
    const range = ctx.document.getSelection();
    range.load('text');
    await ctx.sync();
    text = String(range.text || '').trim();
  });
  return text;
};

export const buildDocumentSnapshot = async () => {
  requireWord();
  let snapshot = { text: '', excerptText: '', outlineText: '', paragraphs: [], sections: [], charCount: 0 };
  await Word.run(async (ctx) => {
    const body = ctx.document.body;
    body.load('text');
    const paragraphs = body.paragraphs;
    paragraphs.load('items/text');
    await ctx.sync();

    const paragraphTexts = paragraphs.items.map((paragraph, index) => ({
      index,
      text: String(paragraph.text || '').trim(),
    }));
    const sections = buildSectionsFromParagraphTexts(paragraphTexts.map((item) => item.text));
    const fullText = String(body.text || '');
    snapshot = {
      text: fullText.slice(0, WORDFLOW_DOCUMENT_TEXT_LIMIT),
      excerptText: fullText.slice(0, 12000),
      outlineText: buildOutlineText(sections),
      paragraphs: paragraphTexts.filter((item) => item.text),
      sections,
      charCount: fullText.length,
    };
  });
  return snapshot;
};

export const onSelectionChanged = (callback) => {
  if (!isWordAvailable()) return () => {};
  const handler = async () => {
    try {
      const text = await getSelectedText();
      callback(text);
    } catch { /* מסמך באמצע פעולה — מתעלמים */ }
  };
  Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, handler);
  handler();
  return () => {
    try {
      Office.context.document.removeHandlerAsync(Office.EventType.DocumentSelectionChanged, { handler });
    } catch { /* ignore */ }
  };
};

// ─── כתיבה ────────────────────────────────────────────────────────────────
// עיצוב RTL על כל הפסקאות שהוכנסו. alignment בלי readingOrder נותן פיסוק
// LTR שבור, לכן תמיד שניהם, ועל כל items — הכנסה עם \n\n יוצרת כמה פסקאות.
const applyRtlFormat = async (ctx, insertedRange) => {
  insertedRange.paragraphs.load('items');
  await ctx.sync();
  insertedRange.paragraphs.items.forEach((para) => {
    try {
      para.paragraphFormat.alignment = Word.Alignment.right;
      para.paragraphFormat.readingOrder = Word.ReadingOrder.rtl;
    } catch { /* פסקה ננעלה — ממשיכים */ }
  });
  await ctx.sync();
};

const runWithTrackingMode = async (targetModeOf, fn) => {
  requireWord();
  let result;
  await Word.run(async (ctx) => {
    ctx.document.load('changeTrackingMode');
    await ctx.sync();
    const originalMode = ctx.document.changeTrackingMode;
    const targetMode = targetModeOf(originalMode);
    try {
      if (originalMode !== targetMode) {
        ctx.document.changeTrackingMode = targetMode;
        await ctx.sync();
      }
      result = await fn(ctx);
    } finally {
      // בלי ה-finally הזה, שגיאה באמצע הכנסה משאירה את המסמך של המשתמש
      // ב-trackAll לתמיד (באג בתוסף הישן שתוקן כאן).
      if (originalMode !== targetMode) {
        ctx.document.changeTrackingMode = originalMode;
        await ctx.sync();
      }
    }
  });
  return result;
};

export const insertTextAsTracked = async (text) => {
  const cleanText = sanitizeMarkdownText(text);
  if (!cleanText.trim()) throw new Error('אין טקסט להכנסה');
  await runWithTrackingMode(() => Word.ChangeTrackingMode.trackAll, async (ctx) => {
    const range = ctx.document.getSelection();
    const insertedRange = range.insertText(cleanText, Word.InsertLocation.after);
    await ctx.sync();
    await applyRtlFormat(ctx, insertedRange);
  });
};

export const insertTextDirect = async (text) => {
  const cleanText = sanitizeMarkdownText(text);
  if (!cleanText.trim()) throw new Error('אין טקסט להכנסה');
  await runWithTrackingMode(() => Word.ChangeTrackingMode.off, async (ctx) => {
    const range = ctx.document.getSelection();
    const insertedRange = range.insertText(cleanText, Word.InsertLocation.after);
    await ctx.sync();
    await applyRtlFormat(ctx, insertedRange);
  });
};

export const replaceSelectionText = async (text, { trackChanges = true } = {}) => {
  const cleanText = sanitizeMarkdownText(text).trim();
  if (!cleanText) throw new Error('אין טקסט להחלפה');
  await runWithTrackingMode(
    () => (trackChanges ? Word.ChangeTrackingMode.trackAll : Word.ChangeTrackingMode.off),
    async (ctx) => {
      const range = ctx.document.getSelection();
      const replacedRange = range.insertText(cleanText, Word.InsertLocation.replace);
      await ctx.sync();
      await applyRtlFormat(ctx, replacedRange);
    },
  );
};

// ─── החלה חכמה: batch של routes על המסמך כ-track changes ─────────────────
const findUniqueParagraphIndex = (paragraphTexts, predicate) => {
  const matches = [];
  for (let index = 0; index < paragraphTexts.length; index += 1) {
    if (predicate(paragraphTexts[index], index)) matches.push(index);
  }
  return matches.length === 1 ? matches[0] : -1;
};

const findHeadingParagraphIndex = (route, paragraphTexts, sections) => {
  const heading = normalizeHeadingForCompare(route.targetHeading || route.locatorText || route.targetLocation);
  if (!heading) return -1;

  const exactSection = sections.find((section) => normalizeHeadingForCompare(section.title) === heading);
  if (exactSection) return exactSection.paragraphIndex;

  const partialSections = sections.filter((section) => {
    const normalized = normalizeHeadingForCompare(section.title);
    return normalized && (normalized.includes(heading) || heading.includes(normalized));
  });
  if (partialSections.length === 1) return partialSections[0].paragraphIndex;

  return findUniqueParagraphIndex(paragraphTexts, (text) => {
    if (!isLikelySectionHeading(text)) return false;
    const normalized = normalizeHeadingForCompare(text);
    return normalized === heading || normalized.includes(heading) || heading.includes(normalized);
  });
};

const resolveParagraphTargetIndex = (route, paragraphTexts, snapshot = {}) => {
  if (!route) return -1;
  const sections = buildSectionsFromParagraphTexts(paragraphTexts);
  const fallbackSections = Array.isArray(snapshot.sections) ? snapshot.sections : [];

  if (['heading', 'section'].includes(route.targetKind) || route.targetHeading) {
    const headingIndex = findHeadingParagraphIndex(route, paragraphTexts, sections);
    if (headingIndex >= 0) {
      if (route.targetKind === 'section') {
        const section = sections.find((item) => item.paragraphIndex === headingIndex);
        return Number.isInteger(section?.endParagraphIndex) ? section.endParagraphIndex : headingIndex;
      }
      return headingIndex;
    }
    if (!sections.length && fallbackSections.length) {
      return findHeadingParagraphIndex(route, paragraphTexts, fallbackSections);
    }
  }

  const locator = normalizeLocator(route.targetLocation || route.locatorText);
  if (!locator || locator.length < 8) return -1;

  return findUniqueParagraphIndex(paragraphTexts, (text) => normalizeLocator(text).includes(locator));
};

/**
 * מחיל batch של הצעות ממופות ({targetKind, targetLocation, targetHeading, locatorText,
 * suggestionText, operation, confidence}) על המסמך, הכול כ-track changes.
 * עיקרון: יעד לא חד-משמעי מדולג — אף פעם לא מנחשים.
 */
export const applyRoutingBatch = async (routes = [], { onStatus } = {}) => {
  requireWord();
  let insertedCount = 0;
  const skippedTargets = [];

  await runWithTrackingMode(() => Word.ChangeTrackingMode.trackAll, async (ctx) => {
    let paragraphs = ctx.document.body.paragraphs;
    paragraphs.load('items/text');
    await ctx.sync();

    for (const route of routes) {
      try {
        const cleanSuggestion = sanitizeMarkdownText(route.suggestionText).trim();
        if (!cleanSuggestion) continue;

        let targetRange = null;
        let insertLocation = route.operation === 'replace'
          ? Word.InsertLocation.replace
          : route.operation === 'insert_before'
            ? Word.InsertLocation.before
            : Word.InsertLocation.after;

        const exactTarget = String(route.targetLocation || '').trim().slice(0, WORD_SEARCH_MAX_LENGTH);
        if (exactTarget.length >= 8 && route.targetKind !== 'document_end') {
          const results = ctx.document.body.search(exactTarget, { matchCase: false });
          results.load('items');
          await ctx.sync();
          if (results.items?.length === 1) {
            targetRange = results.items[0];
          }
          // יותר מהתאמה אחת = דו-משמעי, נופל להמשך הסולם (ואולי לדילוג)
        }

        if (!targetRange && route.targetKind === 'document_end') {
          targetRange = ctx.document.body.getRange(Word.RangeLocation.end);
          insertLocation = Word.InsertLocation.before;
        }

        if (!targetRange) {
          const paragraphTexts = paragraphs.items.map((paragraph) => String(paragraph.text || '').trim());
          const targetIndex = resolveParagraphTargetIndex(route, paragraphTexts, route.snapshot || {});
          if (targetIndex >= 0 && paragraphs.items[targetIndex]) {
            targetRange = paragraphs.items[targetIndex];
            insertLocation = route.operation === 'insert_before' ? Word.InsertLocation.before : Word.InsertLocation.after;
            if (route.operation === 'replace' && !exactTarget) insertLocation = Word.InsertLocation.after;
          }
        }

        if (!targetRange) {
          skippedTargets.push(route.targetHeading || route.targetLocation || route.locatorText || 'יעד לא מזוהה');
          continue;
        }

        const prefix = insertLocation === Word.InsertLocation.replace ? '' : '\n\n';
        const insertedRange = targetRange.insertText(`${prefix}${cleanSuggestion}`, insertLocation);
        await ctx.sync();
        await applyRtlFormat(ctx, insertedRange);

        insertedCount += 1;
        onStatus?.(`הוחלו ${insertedCount} שינויים...`);

        // חובה: כל הכנסה מזיזה את המסמך ומבטלת את ה-Ranges של הפסקאות
        // שנטענו קודם. בלי הטעינה מחדש, היעד הבא נפתר מול מסמך ישן.
        paragraphs = ctx.document.body.paragraphs;
        paragraphs.load('items/text');
        await ctx.sync();
      } catch (itemErr) {
        skippedTargets.push(route.targetHeading || route.targetLocation || 'יעד שנכשל');
      }
    }
  });

  return { insertedCount, skippedTargets };
};
