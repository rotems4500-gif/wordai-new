// wordEditBridge — מימוש חוזה העריכה של AiSidebar מעל Word JS API.
// AiSidebar מדבר ב-targets ({kind, text, targetId}) ומצפה ל-{ok, message, partial,
// unresolved}. כאן זה מתורגם ל-Ranges של Word: בחירה נוכחית → החלפה ישירה,
// אחרת body.search עם דרישת התאמה יחידה (יעד דו-משמעי לא מוחל — אף פעם לא מנחשים).
import { normalizeLocator, sanitizeMarkdownText, isWordAvailable } from './wordBridge';

const WORD_SEARCH_MAX = 255;

const createTargetId = (kind, text) => `word:${kind}:${normalizeLocator(text).slice(0, 40)}:${String(text || '').length}`;

/** בונה targetState במבנה ש-AiSidebar מצפה לו: {selection, block, active} */
export const buildEditTargetState = (selectedText = '', blockText = '') => {
  const selection = String(selectedText || '').trim()
    ? { kind: 'selection', text: String(selectedText).trim(), targetId: createTargetId('selection', selectedText) }
    : null;
  const block = String(blockText || '').trim()
    ? { kind: 'block', text: String(blockText).trim(), targetId: createTargetId('block', blockText) }
    : null;
  return { selection, block, active: selection || block || null };
};

const applyRtl = async (ctx, insertedRange) => {
  insertedRange.paragraphs.load('items');
  await ctx.sync();
  insertedRange.paragraphs.items.forEach((para) => {
    try {
      para.paragraphFormat.alignment = Word.Alignment.right;
      para.paragraphFormat.readingOrder = Word.ReadingOrder.rtl;
    } catch { /* ignore */ }
  });
  await ctx.sync();
};

/**
 * פותר Range עבור target בתוך Word.run פעיל. סולם:
 * 1. הטקסט המסומן כרגע תואם ל-target → הבחירה עצמה.
 * 2. טקסט ≤255 → search ייחודי.
 * 3. טקסט ארוך → search ייחודי על prefix + על suffix, ומתיחת Range ביניהם עם
 *    אימות שהטקסט המתקבל תואם ליעד (בלי אימות זו החלפה עיוורת).
 * החזרה: Range או null (דו-משמעי/לא נמצא).
 */
const resolveTargetRange = async (ctx, targetText) => {
  const clean = String(targetText || '').trim();
  if (!clean) return null;

  const selection = ctx.document.getSelection();
  selection.load('text');
  await ctx.sync();
  if (normalizeLocator(selection.text) === normalizeLocator(clean)) {
    return selection;
  }

  const uniqueSearch = async (needle) => {
    const results = ctx.document.body.search(needle, { matchCase: false });
    results.load('items');
    await ctx.sync();
    return results.items?.length === 1 ? results.items[0] : null;
  };

  if (clean.length <= WORD_SEARCH_MAX) {
    return uniqueSearch(clean);
  }

  const prefix = clean.slice(0, 180);
  const suffix = clean.slice(-180);
  const startRange = await uniqueSearch(prefix);
  const endRange = await uniqueSearch(suffix);
  if (!startRange || !endRange) return null;

  const combined = startRange.expandTo(endRange);
  combined.load('text');
  await ctx.sync();
  if (normalizeLocator(combined.text) !== normalizeLocator(clean)) return null;
  return combined;
};

const replaceRangeTracked = async (ctx, range, replacementText) => {
  const inserted = range.insertText(sanitizeMarkdownText(replacementText).trim(), Word.InsertLocation.replace);
  await ctx.sync();
  await applyRtl(ctx, inserted);
};

const runTracked = async (fn) => {
  let result;
  await Word.run(async (ctx) => {
    ctx.document.load('changeTrackingMode');
    await ctx.sync();
    const originalMode = ctx.document.changeTrackingMode;
    try {
      if (originalMode !== Word.ChangeTrackingMode.trackAll) {
        ctx.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
        await ctx.sync();
      }
      result = await fn(ctx);
    } finally {
      if (originalMode !== Word.ChangeTrackingMode.trackAll) {
        ctx.document.changeTrackingMode = originalMode;
        await ctx.sync();
      }
    }
  });
  return result;
};

/** onApplyEdit של AiSidebar: {replacementText, target, agentType} → {ok, message} */
export const applyAssistantEditToWord = async ({ replacementText, target } = {}) => {
  if (!isWordAvailable()) return { ok: false, message: 'אין חיבור למסמך Word.' };
  const clean = sanitizeMarkdownText(replacementText).trim();
  if (!clean) return { ok: false, message: 'המודל לא החזיר טקסט חלופי.' };
  if (!target?.text) return { ok: false, message: 'לא זוהה יעד עריכה במסמך.' };

  try {
    const applied = await runTracked(async (ctx) => {
      const range = await resolveTargetRange(ctx, target.text);
      if (!range) return false;
      await replaceRangeTracked(ctx, range, clean);
      return true;
    });
    if (!applied) {
      return { ok: false, message: 'הטקסט המקורי לא נמצא במסמך באופן חד-משמעי (אולי השתנה או מופיע כמה פעמים). סמן אותו ונסה שוב.' };
    }
    return { ok: true, message: 'העריכה הוחלה במסמך כשינוי למעקב — אשר או דחה בלשונית "סקירה".' };
  } catch (err) {
    return { ok: false, message: err?.message || 'החלת העריכה נכשלה.' };
  }
};

/** onApplyEditBatch של AiSidebar: {edits:[{target, replacement...}]} → {ok, partial, unresolved} */
export const applyAssistantEditBatchToWord = async ({ edits = [] } = {}) => {
  if (!isWordAvailable()) return { ok: false, message: 'אין חיבור למסמך Word.' };
  const safeEdits = (Array.isArray(edits) ? edits : [])
    .map((edit) => ({
      targetText: String(edit?.target?.text || edit?.originalText || '').trim(),
      replacement: sanitizeMarkdownText(edit?.replacement ?? edit?.replacementText ?? edit?.text ?? '').trim(),
      label: String(edit?.target?.headingText || edit?.targetId || '').trim(),
    }))
    .filter((edit) => edit.targetText && edit.replacement);
  if (!safeEdits.length) return { ok: false, message: 'לא התקבלו עריכות תקינות להחלה.' };

  const unresolved = [];
  let appliedCount = 0;

  try {
    await runTracked(async (ctx) => {
      for (const edit of safeEdits) {
        try {
          // רזולוציה מחדש לכל עריכה — כל החלפה מזיזה את המסמך ומבטלת Ranges קודמים
          const range = await resolveTargetRange(ctx, edit.targetText);
          if (!range) {
            unresolved.push(edit.label || edit.targetText.slice(0, 60));
            continue;
          }
          await replaceRangeTracked(ctx, range, edit.replacement);
          appliedCount += 1;
        } catch {
          unresolved.push(edit.label || edit.targetText.slice(0, 60));
        }
      }
    });
  } catch (err) {
    return { ok: false, message: err?.message || 'החלת הבאץ׳ נכשלה.' };
  }

  if (!appliedCount) {
    return { ok: false, unresolved, message: 'אף יעד לא נמצא במסמך באופן חד-משמעי.' };
  }
  if (unresolved.length) {
    return {
      ok: true,
      partial: true,
      unresolved,
      message: `הוחלו ${appliedCount} עריכות כשינויים למעקב; ${unresolved.length} יעדים דולגו (לא חד-משמעיים).`,
    };
  }
  return { ok: true, message: `הוחלו ${appliedCount} עריכות במסמך כשינויים למעקב.` };
};
