// ═══════════════════════════════════════════════════════════════
// documentDraftService.js — ייבוא מסמך Word קיים (.docx) כטיוטה, שכתוב
// הטקסט לסגנון הכתיבה של המשתמש, וייצוא חזרה — תוך שמירה byte-for-byte
// על העיצוב המקורי (פונטים, טבלאות, כותרות, תמונות, מספור).
//
// זהה ברעיון ל-pptxDraftService: לא מרנדרים מחדש את המסמך. טוענים את ה-zip
// המקורי, מפרסרים את word/document.xml ל-DOM, נוגעים אך ורק בטקסט שבתוך
// <w:t>, ואז מארזים את אותו zip בחזרה. כל מה שאינו טקסט נשאר זהה למקור.
// ═══════════════════════════════════════════════════════════════

import { chatWithActiveProvider, getPersonalStyleProfile, hashStyleSeed } from './aiService';
import { scoreStyleMatchLocal } from './styleJudgeService';
import { normalizeStyleEngine } from './styleProfileService';
import { scoreTextAuthenticity } from './styleAuthenticityService';

// כמה פסקאות לשלוח ב-prompt אחד (איזון בין מספר קריאות לאורך פלט).
const PARA_BATCH = 12;
// תקרת תווים לפסקה בודדת שנשלחת למודל. פסקה ארוכה מזה מדולגת לגמרי —
// חיתוך-קלט עם החלפת-פלט-מלאה איבד בעבר את זנב הפסקה בשקט.
const MAX_PARA_CHARS = 2000;
// אורך מינימלי (בתווים) כדי שפסקה תיחשב לשכתוב — פסקאות זעירות (כותרות
// קצרות, פריטי רשימה בני מילה-שתיים) נושאות מבנה ולא קול, ושכתובן רק מזיק.
const MIN_RESTYLE_CHARS = 40;
// מאיזה אורך מפעילים את שער הניקוד המקומי (מתחת לזה הציון לא אמין).
const SCORE_GATE_MIN_CHARS = 120;

let paraIdCounter = 0;
const nextParaId = () => { paraIdCounter += 1; return `d${paraIdCounter}`; };

// שולף את הצהרת ה-XML המקורית (Word רגיש לה) כדי לשחזר בסריאליזציה.
const extractDecl = (xml = '') => {
  const m = String(xml).match(/^\s*<\?xml[^>]*\?>/i);
  return m ? m[0] : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
};

// שם ה-style של הפסקה (Heading1/Title/...) מתוך <w:pStyle w:val="...">.
const paraStyleOf = (paraEl) => {
  const pPr = paraEl.getElementsByTagName('w:pPr')[0];
  if (!pPr) return '';
  const pStyle = pPr.getElementsByTagName('w:pStyle')[0];
  return pStyle ? (pStyle.getAttribute('w:val') || '') : '';
};

// האם הפסקה נראית ככותרת (לפי ה-style שלה).
const isHeadingStyle = (style = '') => /heading|title|כותרת/i.test(String(style));

// בונה רשומת פסקה אחת מתוך אלמנט <w:p>. מחזיר null אם אין טקסט לעריכה.
const buildPara = (paraEl) => {
  const runs = Array.from(paraEl.getElementsByTagName('w:t'));
  if (!runs.length) return null;
  const text = runs.map((r) => r.textContent || '').join('');
  if (!text.trim()) return null;
  const style = paraStyleOf(paraEl);
  // הפסקה נכתבת חזרה לתוך run אחד, ולכן העיצוב של אותו run חל על כל הפסקה.
  // בוחרים את ה-run הארוך ביותר ולא את הראשון: פסקה שמתחילה ב-lead-in מודגש /
  // הפניית הערת-שוליים קטנה הייתה הופכת כולה למודגשת/זעירה.
  let dominantRun = 0;
  let dominantLen = -1;
  runs.forEach((run, index) => {
    const len = String(run.textContent || '').length;
    if (len > dominantLen) { dominantLen = len; dominantRun = index; }
  });
  return {
    id: nextParaId(),
    text,
    original: text,
    runs,                                   // צמתי <w:t> חיים — לכתיבה חזרה
    dominantRun,
    style,
    titleish: isHeadingStyle(style),
  };
};

// כותב טקסט חדש בחזרה לפסקה: ריצה ראשונה מקבלת את כל הטקסט, השאר מתרוקנות
// (שומר על אלמנטי ה-runs ועיצובם, רק הטקסט משתנה). מוסיף xml:space="preserve"
// כדי ש-Word לא ייבלע רווחים מובילים/סוגרים.
const writePara = (para) => {
  if (!para.runs.length) return;
  const targetIndex = Number.isInteger(para.dominantRun) && para.runs[para.dominantRun]
    ? para.dominantRun
    : 0;
  const target = para.runs[targetIndex];
  target.textContent = para.text;
  try { target.setAttribute('xml:space', 'preserve'); } catch { /* לא קריטי */ }
  para.runs.forEach((run, index) => { if (index !== targetIndex) run.textContent = ''; });
};

/**
 * importDocumentDraft — מפרסר .docx לטיוטה הניתנת לעריכת טקסט.
 * @param {Uint8Array} uint8 - בייטים של קובץ ה-docx.
 * @param {string} fileName
 * @returns {Promise<object>} draft (כולל את ה-zip ואת ה-DOM לכתיבה חזרה).
 */
export const importDocumentDraft = async (uint8, fileName = 'document.docx') => {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(uint8);
  const docFile = zip.files['word/document.xml'];
  if (!docFile) throw new Error('הקובץ לא נראה כמסמך Word תקין (.docx).');

  const xml = await docFile.async('string');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  if (!doc || doc.getElementsByTagName('parsererror').length) {
    throw new Error('לא הצלחתי לפרסר את מבנה המסמך.');
  }

  // גוף המסמך בלבד (מתעלמים מכותרות עליונות/תחתונות בקבצים נפרדים).
  const body = doc.getElementsByTagName('w:body')[0] || doc.documentElement;
  const paraEls = Array.from(body.getElementsByTagName('w:p'));
  const paras = paraEls.map((el) => buildPara(el)).filter(Boolean);

  if (!paras.length) throw new Error('לא נמצא טקסט לעריכה במסמך.');

  const titlePara = paras.find((p) => p.titleish) || paras[0];
  const title = (titlePara?.text || '').trim().slice(0, 120)
    || String(fileName).replace(/\.docx$/i, '');

  return { fileName, zip, doc, decl: extractDecl(xml), paras, title };
};

// מחזיר את כל הפסקאות הניתנות לעריכה (סדר יציב).
export const draftParas = (draft) => draft.paras;

const extractJson = (raw = '') => {
  let text = String(raw || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('המודל לא החזיר JSON תקין.');
  const candidate = text.slice(start, end + 1);
  try { return JSON.parse(candidate); }
  catch { return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1')); }
};

// טקסט המקור לשכתוב: אם הפסקה כבר שוכתבה ע"י ה-AI — חוזרים לטקסט המקורי
// מהייבוא (ריצה חוזרת לא מצטברת על פלט קודם); עריכה ידנית של המשתמש נשמרת.
const restyleSourceOf = (para) => (para.restyledByAi ? para.original : para.text);

// דירוג "נשמע כמו AI" פר-פסקה: ההחלטה מה חייב שכתוב היא של הגלאי, לא של המודל.
// בלי הסימון, ה-escape hatch ("אם כבר טוב — אל תיגע") גרם למודל להשאיר גם פסקאות
// גנריות לחלוטין ללא שינוי. null = הפסקה קצרה מדי לניקוד אמין.
const scoreParaAiness = (text) => {
  try {
    const res = scoreTextAuthenticity(String(text || ''));
    return res?.ok ? { score: res.score, threshold: res.threshold } : null;
  } catch { return null; }
};

const buildRestylePrompt = (batch, instructions) => {
  const block = batch.map(({ index, para, aiFlagged }) => ({
    i: index,
    t: restyleSourceOf(para),
    ...(aiFlagged ? { ai: 1 } : {}),
  }));
  return `לפניך פסקאות טקסט גולמי ממסמך Word קיים. שכתב כל פסקה כך שתישמע בסגנון הכתיבה האישי של המשתמש (ראה פרופיל הסגנון שסופק לך), בלי לשנות את המשמעות, העובדות, המספרים או המונחים.

חוקים נוקשים:
- פסקה עם "ai":1 זוהתה על-ידי גלאי אוטומטי כגנרית/מכונתית — חובה לשכתב אותה מקצה לקצה בקול המשתמש: גוון אורכי משפטים, הסר מחברים פורמליים שחוקים וקלישאות, פתח כל משפט אחרת. אסור להחזיר אותה ללא שינוי או עם תיקון קוסמטי בלבד.
- פסקה בלי "ai":1 שכבר נשמעת טבעית ובסגנון המשתמש — החזר אותה ללא שינוי, אות באות.
- שמור בדיוק על אותו מספר פסקאות ועל אותו סדר. אל תוסיף, תמזג או תמחק פסקאות.
- פסקה קצרה (כותרת/פריט) נשארת קצרה. אל תנפח פסקה.
- אל תוסיף מספור, תבליטים, גרשיים או markdown — רק הטקסט עצמו.
- שמור על ציטוטים, שמות, ומראי מקום כמות שהם.
- עברית.${instructions ? `\n- הנחיה נוספת מהמשתמש: ${instructions}` : ''}

קלט (JSON):
${JSON.stringify({ paras: block }, null, 0)}

החזר JSON תקין בלבד באותו מבנה: לכל פסקה אותו מפתח i ושדה t עם הטקסט (בלי שדה ai בפלט), אותו מספר פסקאות:
{"paras":[{"i":<מספר>,"t":"..."}]}`;
};

// שער קבלה פר-פסקה (במודל של styleJudgeService.rewriteDocumentHtmlTowardStyle):
// (1) רצועת אורך ~0.6×–1.6× מהמקור — פרפרזה שקיצצה/ניפחה נדחית.
// (2) פסקה שסומנה כגנרית (aiFlagged) — המדד הרלוונטי הוא הגלאי: מקבלים אם ציון
//     ה-AI לא עלה. רצפת הסגנון המבני *לא* חלה עליה — היא דחתה שכתובים לגיטימיים
//     של פסקאות גנריות (המדד המבני מעדיף לפעמים את הניסוח המכונתי החלק).
// (3) פסקה לא-מסומנת ארוכה מספיק — never-net-worse על ציון הסגנון המקומי.
// כשל ניקוד בכל מקום ⇒ קבלה לפי רצועת האורך בלבד.
const acceptRestyledPara = (source, current, next, styleEngine, aiFlagged = false) => {
  const srcLen = String(source || '').length;
  const nextLen = String(next || '').length;
  if (!nextLen) return false;
  if (srcLen >= MIN_RESTYLE_CHARS && (nextLen < srcLen * 0.6 || nextLen > srcLen * 1.6)) return false;
  if (aiFlagged) {
    const before = scoreParaAiness(current);
    const after = scoreParaAiness(next);
    if (before && after && after.score > before.score + 5) return false;
    return true;
  }
  if (styleEngine?.enabled && srcLen >= SCORE_GATE_MIN_CHARS) {
    try {
      const oldScore = scoreStyleMatchLocal(current, styleEngine)?.score;
      const newScore = scoreStyleMatchLocal(next, styleEngine)?.score;
      if (Number.isFinite(oldScore) && Number.isFinite(newScore) && newScore < oldScore - 1) return false;
    } catch { /* ניקוד נכשל — שער האורך הספיק */ }
  }
  return true;
};

/**
 * restyleDocumentDraft — משכתב את פסקאות המסמך לסגנון המשתמש (in-place).
 * מעדכן את ה-DOM ואת שדות ה-text של הפסקאות. מחזיר {changed} מספר פסקאות ששונו.
 * @param {object} draft
 * @param {object} opts - { instructions, paraIds?, onProgress, signal }
 */
export const restyleDocumentDraft = async (draft, opts = {}) => {
  const { instructions = '', paraIds = null, onProgress = () => {}, signal } = opts;
  // בחירה מפורשת של פסקאות (כפתור "שכתב פסקה") עוקפת את פילטרי הכותרת/מינימום —
  // המשתמש ביקש במפורש. תקרת MAX נשארת תמיד (באג חיתוך-ואובדן-זנב).
  const explicitSelection = Array.isArray(paraIds) && paraIds.length > 0;
  const targets = draft.paras
    .map((para, index) => ({ para, index }))
    .filter(({ para }) => (paraIds ? paraIds.includes(para.id) : true))
    // כותרות נושאות מבנה ולא קול — לא נוגעים בהן בשכתוב-הכול.
    .filter(({ para }) => explicitSelection || !para.titleish)
    .filter(({ para }) => {
      const len = restyleSourceOf(para).trim().length;
      return (explicitSelection || len >= MIN_RESTYLE_CHARS) && len <= MAX_PARA_CHARS;
    });

  if (!targets.length) return { changed: 0 };

  // סימון פר-פסקה: הגלאי מחליט מה גנרי וחייב שכתוב — לא שיקול-הדעת של המודל.
  targets.forEach((target) => {
    const scored = scoreParaAiness(restyleSourceOf(target.para));
    target.aiFlagged = Boolean(scored && scored.score >= scored.threshold);
  });

  // פרופיל המנוע לשער הקבלה (never-net-worse). כשל טעינה ⇒ שער אורך בלבד.
  let styleEngine = null;
  try { styleEngine = normalizeStyleEngine(getPersonalStyleProfile()?.styleEngine); } catch { /* לא קריטי */ }

  // seed סגנון אחד לכל המסמך — כל ה-batches חולקים את אותה רוטציית תבניות.
  const docSeed = hashStyleSeed(String(draft?.fileName || '') + String(draft?.title || ''));
  const runChat = (prompt) =>
    chatWithActiveProvider(prompt, '', 'אתה עורך לשוני שמשכתב טקסט לסגנון הכתיבה של המשתמש. החזר אך ורק JSON תקין.', {
      skipAutomation: true,
      skipMultiModel: true,
      directChat: true,
      skipSkillSelection: true,
      styleEngineSeed: docSeed,
      // שכתוב הוא משימת עריכה — טמפרטורת ברירת-מחדל (~1.0) היא מקור שונות מיותר.
      temperature: 0.4,
      // שכתוב ברמת פסקה לא צריך העדפות מבנה/עמוד-שער מהפרופיל.
      omitPersonalStyleStructureHints: true,
      ...(signal ? { signal } : {}),
    });

  // חלוקה ל-batches של פסקאות.
  const batches = [];
  for (let i = 0; i < targets.length; i += PARA_BATCH) batches.push(targets.slice(i, i + PARA_BATCH));

  let changed = 0;
  let done = 0;
  const changedIndexes = new Set();
  const runBatch = async (batch, extraInstructions, countProgress) => {
    const prompt = buildRestylePrompt(batch, extraInstructions);
    let parsed;
    try { parsed = extractJson(await runChat(prompt)); }
    catch {
      if (countProgress) { done += batch.length; onProgress(done, targets.length); }
      return;
    }
    const byIndex = new Map((Array.isArray(parsed.paras) ? parsed.paras : []).map((p) => [Number(p.i), p.t]));
    for (const { para, index, aiFlagged } of batch) {
      const next = byIndex.has(index) ? String(byIndex.get(index) == null ? '' : byIndex.get(index)).trim() : '';
      const source = restyleSourceOf(para);
      if (next && next !== para.text && acceptRestyledPara(source, para.text, next, styleEngine, aiFlagged)) {
        para.text = next;
        para.restyledByAi = true;
        writePara(para);
        changedIndexes.add(index);
        changed += 1;
      }
      if (countProgress) { done += 1; }
    }
    if (countProgress) onProgress(done, targets.length);
  };

  for (const batch of batches) {
    await runBatch(batch, instructions, true);
  }

  // סבב-חוזר יחיד: פסקאות שהגלאי סימן כגנריות אבל המודל בכל זאת החזיר ללא שינוי.
  // בלי זה "חובה לשכתב" נשארת בקשה — מודל שמתעלם ממנה משאיר פסקאות-AI במסמך בשקט.
  const stubborn = targets.filter((t) => t.aiFlagged && !changedIndexes.has(t.index));
  if (stubborn.length) {
    const retryNote = [String(instructions || '').trim(),
      'הפסקאות בקלט סומנו כולן כגנריות/מכונתיות וחזרו ללא שינוי בסבב הקודם. הפעם שכתוב מלא הוא חובה: החזר לכל פסקה ניסוח שונה מהותית מהקלט, באותה משמעות ובקול המשתמש.']
      .filter(Boolean).join('\n');
    for (let i = 0; i < stubborn.length; i += PARA_BATCH) {
      await runBatch(stubborn.slice(i, i + PARA_BATCH), retryNote, false);
    }
  }

  return { changed };
};

// מחיל עריכה ידנית של פסקה בודדת (מהממשק) על ה-DOM.
// עריכה ידנית מאפסת את סימון השכתוב — שכתוב הבא יוצא מהטקסט שהמשתמש קבע.
export const setParaText = (para, text) => {
  para.text = String(text == null ? '' : text);
  para.restyledByAi = false;
  writePara(para);
};

// בונה HTML פשוט מהפסקאות — לטעינה לעורך TipTap (כותרות → <h2>, שאר → <p>).
export const draftToHtml = (draft) => {
  const esc = (s) => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return draft.paras
    .map((p) => (p.titleish ? `<h2>${esc(p.text)}</h2>` : `<p>${esc(p.text)}</p>`))
    .join('\n');
};

// מסיר הצהרת <?xml?> מובילה מתוצאת הסריאליזציה (Chromium פולט הצהרה משלו
// כשמסריאליזים Document שלם; הצהרה כפולה → XML לא תקין ו-Word מסרב לפתוח).
const stripXmlDecl = (s = '') => String(s).replace(/^\s*<\?xml[^>]*\?>\s*/i, '');

// מסריאליז את ה-DOM בחזרה ל-zip (in-place).
const serializeDraftIntoZip = (draft) => {
  const serializer = new XMLSerializer();
  const bodyXml = `${draft.decl}\n${stripXmlDecl(serializer.serializeToString(draft.doc.documentElement))}`;
  draft.zip.file('word/document.xml', bodyXml);
};

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * exportDocxBase64 — מחזיר base64 של ה-docx (לדיאלוג שמירה native בדסקטופ).
 */
export const exportDocxBase64 = async (draft) => {
  serializeDraftIntoZip(draft);
  return draft.zip.generateAsync({ type: 'base64' });
};

/**
 * exportDocxBlob — מחזיר Blob של ה-docx (להורדה בדפדפן).
 */
export const exportDocxBlob = async (draft) => {
  serializeDraftIntoZip(draft);
  return draft.zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
};
