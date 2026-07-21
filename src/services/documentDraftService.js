// ═══════════════════════════════════════════════════════════════
// documentDraftService.js — ייבוא מסמך Word קיים (.docx) כטיוטה, שכתוב
// הטקסט לסגנון הכתיבה של המשתמש, וייצוא חזרה — תוך שמירה byte-for-byte
// על העיצוב המקורי (פונטים, טבלאות, כותרות, תמונות, מספור).
//
// זהה ברעיון ל-pptxDraftService: לא מרנדרים מחדש את המסמך. טוענים את ה-zip
// המקורי, מפרסרים את word/document.xml ל-DOM, נוגעים אך ורק בטקסט שבתוך
// <w:t>, ואז מארזים את אותו zip בחזרה. כל מה שאינו טקסט נשאר זהה למקור.
// ═══════════════════════════════════════════════════════════════

import { chatWithActiveProvider, getFeatureProviderConfig } from './aiService';

// כמה פסקאות לשלוח ב-prompt אחד (איזון בין מספר קריאות לאורך פלט).
const PARA_BATCH = 12;
// תקרת תווים לפסקה בודדת שנשלחת למודל (הגנה מפני אאוטליירים).
const MAX_PARA_CHARS = 2000;
// אורך מינימלי (בתווים) כדי שפסקה תיחשב לשכתוב — מתעלמים מפסקאות זעירות.
const MIN_RESTYLE_CHARS = 2;

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

const buildRestylePrompt = (batch, instructions) => {
  const block = batch.map(({ index, para }) => ({
    i: index,
    t: para.text.length > MAX_PARA_CHARS ? para.text.slice(0, MAX_PARA_CHARS) : para.text,
  }));
  return `לפניך פסקאות טקסט גולמי ממסמך Word קיים. שכתב כל פסקה כך שתישמע בסגנון הכתיבה האישי של המשתמש (ראה פרופיל הסגנון שסופק לך), בלי לשנות את המשמעות, העובדות, המספרים או המונחים.

חוקים נוקשים:
- שמור בדיוק על אותו מספר פסקאות ועל אותו סדר. אל תוסיף, תמזג או תמחק פסקאות.
- פסקה קצרה (כותרת/פריט) נשארת קצרה. אל תנפח פסקה.
- אל תוסיף מספור, תבליטים, גרשיים או markdown — רק הטקסט עצמו.
- שמור על ציטוטים, שמות, ומראי מקום כמות שהם.
- עברית.${instructions ? `\n- הנחיה נוספת מהמשתמש: ${instructions}` : ''}

קלט (JSON):
${JSON.stringify({ paras: block }, null, 0)}

החזר JSON תקין בלבד באותו מבנה בדיוק, אותם מפתחות i, אותו מספר פסקאות:
{"paras":[{"i":<מספר>,"t":"..."}]}`;
};

/**
 * restyleDocumentDraft — משכתב את פסקאות המסמך לסגנון המשתמש (in-place).
 * מעדכן את ה-DOM ואת שדות ה-text של הפסקאות. מחזיר {changed} מספר פסקאות ששונו.
 * @param {object} draft
 * @param {object} opts - { instructions, paraIds?, onProgress, signal }
 */
export const restyleDocumentDraft = async (draft, opts = {}) => {
  const { instructions = '', paraIds = null, onProgress = () => {}, signal } = opts;
  const targets = draft.paras
    .map((para, index) => ({ para, index }))
    .filter(({ para }) => (paraIds ? paraIds.includes(para.id) : true))
    .filter(({ para }) => para.text.trim().length >= MIN_RESTYLE_CHARS);

  if (!targets.length) return { changed: 0 };

  const featureOverride = getFeatureProviderConfig('presentations')?.config || null;
  const runChat = (prompt) =>
    chatWithActiveProvider(prompt, '', 'אתה עורך לשוני שמשכתב טקסט לסגנון הכתיבה של המשתמש. החזר אך ורק JSON תקין.', {
      skipAutomation: true,
      skipMultiModel: true,
      directChat: true,
      skipSkillSelection: true,
      ...(featureOverride ? { providerConfigOverride: featureOverride } : {}),
      ...(signal ? { signal } : {}),
    });

  // חלוקה ל-batches של פסקאות.
  const batches = [];
  for (let i = 0; i < targets.length; i += PARA_BATCH) batches.push(targets.slice(i, i + PARA_BATCH));

  let changed = 0;
  let done = 0;
  for (const batch of batches) {
    const prompt = buildRestylePrompt(batch, instructions);
    let parsed;
    try { parsed = extractJson(await runChat(prompt)); }
    catch { done += batch.length; onProgress(done, targets.length); continue; }

    const byIndex = new Map((Array.isArray(parsed.paras) ? parsed.paras : []).map((p) => [Number(p.i), p.t]));
    for (const { para, index } of batch) {
      const next = byIndex.has(index) ? String(byIndex.get(index) == null ? '' : byIndex.get(index)).trim() : '';
      if (next && next !== para.text) { para.text = next; writePara(para); changed += 1; }
      done += 1;
    }
    onProgress(done, targets.length);
  }

  return { changed };
};

// מחיל עריכה ידנית של פסקה בודדת (מהממשק) על ה-DOM.
export const setParaText = (para, text) => {
  para.text = String(text == null ? '' : text);
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
