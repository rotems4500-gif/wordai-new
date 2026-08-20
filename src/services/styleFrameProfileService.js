// styleFrameProfileService.js — האימון האישי של מסגרות המשפט (sentenceGrammar).
//
// אותו רעיון כמו openerProfileService, שכבה אחת למעלה: במקום לשאול את המשתמש
// "איך אתה כותב?", סורקים את הקורפוס שלו ומזהים אילו מסגרות רטוריות הוא באמת
// משתמש בהן ("עם זאת," הרבה? "כלומר," אף פעם?). דטרמיניסטי, אפס מודל, אפס שאלות.
//
// שני מקורות משקל:
//   1. כרייה — התאמת תחיליות משפטים מהקורפוס מול הליטרלים הפותחים של כל frame.
//      הרגל = הופעה ב-≥2 מסמכים שונים (אותו כלל כמו הפתיחים: חזרה בין מסמכים
//      היא הרגל ניסוח; הופעה בודדת היא מקרה).
//   2. משוב — accept/reject על טיוטות מקומיות (recordFrameFeedback).
//
// הצריכה: sentenceComposeService קורא profile.slots[move].frame = {frameId: משקל}
// עם אותה נוסחה: score = globalBase * (1 + λ·personalBoost), λ=min(0.8, docs/10).
//
// תלויות: styleSampleStore (קריאה), sentenceGrammar.data (ליטרלים), styleKvStore.

import { getChunks, ensureSampleStoreReady, STYLE_SAMPLES_UPDATED_EVENT } from './styleSampleStore';
import { idbGet, idbSet, isIdbAvailable } from './styleKvStore';

export const FRAME_PROFILE_CACHE_KEY = 'wordai_frame_profile_v1';
export const FRAME_PROFILE_SCHEMA_VERSION = 1;

const FEEDBACK_ACCEPT = 2;
const FEEDBACK_REJECT = -1;
const MIN_DOCS_FOR_HABIT = 2;

function djb2Hex(str = '') {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}
const corpusFingerprint = (chunks) => {
  const ids = chunks.map((c) => String(c?.id || '')).sort();
  return `${ids.length}_${djb2Hex(ids.join('|'))}`;
};

let profile = null;
let buildPromise = null;
let carriedFeedback = null;
let invalidationGen = 0; // עולה בכל אירוע שינוי-קורפוס; ר' ensureFrameProfile

/**
 * הליטרל הפותח של frame: רצף המחרוזות המילוליות עד ה-placeholder הראשון,
 * מנורמל (בלי פיסוק סופי, רווחים אחידים). frames שנפתחים ישר ב-placeholder
 * לא ניתנים לכרייה (אין חתימה טקסטואלית) — נשענים על משוב בלבד.
 */
function frameOpeningLiteral(frame) {
  const parts = [];
  for (const tok of frame.t) {
    if (typeof tok !== 'string') continue;    // connector אופציונלי — מדלגים
    if (tok.startsWith('@')) break;
    parts.push(tok);
  }
  const lit = parts.join(' ').replace(/\s+/g, ' ').trim();
  // ליטרל קצר מדי ("ו") יתאים לכל דבר — דורשים שתי מילים או ביטוי ייחודי בן 4+ תווים.
  const words = lit.split(/\s+/).filter(Boolean);
  if (!lit || (words.length < 2 && lit.length < 4)) return null;
  return lit;
}

function splitSentences(text) {
  return String(text || '').replace(/\s+/g, ' ').split(/(?<=[.!?׃])\s+/).map((s) => s.trim()).filter(Boolean);
}

// ---------- כריית מסגרות חדשות מהכתיבה של המשתמש ----------
//
// ⚠️ הכרייה המקורית רק *התאימה* משפטים מהקורפוס אל הליטרלים של המסגרות הקבועות,
// כלומר יכלה לכל היותר לשקלל מחדש ניסוחים שאני כתבתי. נמדד: מתוך ~50 מסגרות,
// **5 בלבד** הופיעו ב-57 העבודות של המשתמש — כלומר הוא פשוט לא כותב כמו הדקדוק
// שלי, ולכן הפלט נשמע כמו המנוע ולא כמוהו (טביעת הסגנון הראתה «מן החומר»,
// «המקורות שנסקרו» כתכונות שהכי מרחיקות).
//
// כאן מחלצים פתיח **אמיתי** שלו: הרישא של המשפט עד למשעבד ("ש"/"כי") או עד
// הפסיק הראשון. זו בדיוק צורת המסגרת — ליטרל + @clause. פתיח נחשב הרגל רק אם
// הוא חוזר ב-≥2 מסמכים שונים, אותו כלל כמו שאר הפרופיל.
// אוצר-המילים המותר בליטרל של מסגרת: מילות תפקוד, מילות קישור, ופעלים/שמות
// שתפקידם מסגור בלבד ("עולה", "מלמד", "ניתן", "ראוי"). כל מילה אחרת היא תוכן,
// והליטרל אינו מסגרת. הרשימה מכוונת לחסר — עדיף לפספס מסגרת אמיתית מאשר
// להזריק תוכן זר לעבודה.
const FRAMING_WORDS = new Set([
  'של', 'את', 'על', 'עם', 'אל', 'מן', 'מ', 'ב', 'ל', 'כ', 'ו', 'ה', 'זה', 'זו', 'זאת', 'אלה', 'אלו',
  'הוא', 'היא', 'הם', 'הן', 'אני', 'אנו', 'אנחנו', 'כך', 'כן', 'לא', 'אין', 'יש', 'גם', 'אך', 'אבל',
  'או', 'אם', 'כי', 'ש', 'אשר', 'כאשר', 'לפי', 'תוך', 'בין', 'כל', 'כדי', 'רק', 'עוד', 'כמו', 'לכן',
  'מכאן', 'לפיכך', 'כלומר', 'למשל', 'אמנם', 'אולם', 'ואולם', 'מנגד', 'מאידך', 'לעומת', 'בנוסף',
  'יתרה', 'מכך', 'זאתי', 'לסיכום', 'לסיום', 'בסיכומו', 'בראייה', 'כוללת', 'לאור', 'האמור', 'לעיל',
  'ניתן', 'נראה', 'עולה', 'מלמד', 'מלמדת', 'מצוין', 'מצביע', 'מצביעים', 'ראוי', 'חשוב', 'יצוין',
  'לציין', 'להדגיש', 'לזכור', 'לסייג', 'לומר', 'לטעון', 'להצביע', 'לראות', 'להבין', 'נובע', 'נטען',
  'מתברר', 'התברר', 'הדבר', 'הדברים', 'הסוגיה', 'בהקשר', 'בהתאם', 'במסגרת', 'בעניין', 'לגבי',
  'נקודה', 'מרכזית', 'טענה', 'המסקנה', 'מסקנה', 'משמעות', 'במילים', 'אחרות', 'עם־זאת', 'אף',
  'פי', 'כפי', 'שכן', 'שם', 'כמובן', 'ואכן', 'אכן', 'ככלל', 'בפועל', 'למעשה', 'הרי',
]);

// טוקן קצר (עד 3 תווים) מתקבל תמיד — הוא מילת יחס/תחילית ולא נושא תוכן.
function isFramingLiteral(lit) {
  const words = String(lit || '').replace(/,$/, '').split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  for (const w of words) {
    const clean = w.replace(/[^֐-׿]/g, '');
    if (!clean) return false;
    if (clean.length <= 3) continue;
    if (FRAMING_WORDS.has(clean)) continue;
    // תחילית מודבקת ("שהמקרה") — בודקים גם בלעדיה.
    if (/^[ולבכמשה]/.test(clean) && FRAMING_WORDS.has(clean.slice(1))) continue;
    return false;   // מילת תוכן — לא מסגרת
  }
  return true;
}

const MINE_MAX_LITERAL_WORDS = 6;
const MINE_MIN_LITERAL_CHARS = 6;
const MINE_MAX_PER_MOVE = 8;

// שיוך פתיח למהלך רטורי לפי סמנים מפורשים. ברירת המחדל היא evidence — המהלך
// הנייטרלי ביותר, ולכן שיוך שגוי שם עולה הכי מעט.
const MOVE_CUES = [
  { move: 'contrast', re: /^(?:עם זאת|לעומת זאת|מנגד|אולם|ואולם|מאידך|אף על פי כן|ברם)/ },
  { move: 'concede', re: /(?:יש לסייג|ראוי לציין|יש לציין|אמנם|יש להדגיש|ראוי להדגיש)/ },
  { move: 'wrap', re: /^(?:לסיכום|לסיום|בסיכומו|לפיכך|מכאן ש|אשר על כן|בראייה כוללת|לאור האמור)/ },
  { move: 'explain', re: /^(?:כלומר|במילים אחרות|משמעות|הדבר מלמד|מכאן נובע)/ },
  { move: 'claim', re: /^(?:ניתן|נראה|יש לטעון|טענה|נקודה מרכזית|המסקנה)/ },
];

function moveForLiteral(lit) {
  for (const { move, re } of MOVE_CUES) if (re.test(lit)) return move;
  return 'evidence';
}

/**
 * מחלץ פתיחי-משפט חוזרים מהקורפוס האישי והופך אותם למסגרות.
 * @param {Array<{id:string, docId?:string, text:string}>} chunks
 * @returns {{minedFrames:Object<string,Array>, count:number}}
 */
export function mineFramesFromCorpus(chunks) {
  const byLiteral = new Map();   // ליטרל → Set(docId)
  for (const c of Array.isArray(chunks) ? chunks : []) {
    const docId = String(c?.docId || c?.id || '');
    for (const sent of splitSentences(c?.text)) {
      // הרישא עד המשעבד או עד הפסיק — זו צורת המסגרת (ליטרל + פסוקית).
      const m = sent.match(/^(.{4,60}?)(\s+(?:כי|ש)(?=[א-ת])|,\s)/);
      if (!m) continue;
      const lit = `${m[1]}${m[2].trimEnd()}`.replace(/\s+/g, ' ').trim();
      if (lit.length < MINE_MIN_LITERAL_CHARS) continue;
      if (lit.split(/\s+/).length > MINE_MAX_LITERAL_WORDS) continue;
      // ⚠️ מסגרת היא **פיגום של מילות תפקוד בלבד**. סינון ספרות/מרכאות/סוגריים
      // לבדו אינו מספיק, ונמדד בפלט אמיתי: הכותרת של עבודה קודמת של המשתמש —
      // "ישראל הסמויה מעיני התקשורת: הקיבוצים," — נכרתה כמסגרת (היא נגמרת בפסיק
      // וחוזרת בטיוטה ובגרסה הסופית) והוזרקה כפתיח משפט לעבודה בדיני תקשורת.
      // זיהום תוכן, לא רק ניסוח גרוע.
      //
      // לכן: כל טוקן בליטרל חייב להיות מילת תפקוד או פועל-מסגרת מוכר. מילת תוכן
      // אחת פוסלת את כל הליטרל.
      if (/[0-9"'׳״():–—]/.test(lit)) continue;
      if (!isFramingLiteral(lit)) continue;
      if (!byLiteral.has(lit)) byLiteral.set(lit, new Set());
      byLiteral.get(lit).add(docId);
    }
  }

  const ranked = [...byLiteral.entries()]
    .map(([lit, docs]) => ({ lit, docs: docs.size }))
    .filter((e) => e.docs >= MIN_DOCS_FOR_HABIT)
    .sort((a, b) => b.docs - a.docs);

  const minedFrames = {};
  let count = 0;
  for (const { lit, docs } of ranked) {
    const move = moveForLiteral(lit);
    if (!minedFrames[move]) minedFrames[move] = [];
    if (minedFrames[move].length >= MINE_MAX_PER_MOVE) continue;
    // ליטרל שנגמר במשעבד מתחבר לפסוקית בלי רווח ("מכאן ש" + "הדבר...").
    const clitic = /(?:\s(?:ש))$/.test(lit) || /ש$/.test(lit);
    minedFrames[move].push({
      id: `mined_${move}_${djb2Hex(lit)}`,
      t: [lit, '@clause', '.'],
      reg: 2,
      cliticJoin: clitic,
      mined: true,
      docs,
    });
    count += 1;
  }
  return { minedFrames, count };
}

async function buildProfile() {
  const { SENTENCE_GRAMMAR } = await import('./sentenceGrammar.data.js');
  try { await ensureSampleStoreReady(); } catch {}
  const chunks = (() => { try { return getChunks(); } catch { return []; } })();

  // ליטרל → {move, frameId}. ליטרל ארוך נבדק לפני קצר (span-first).
  const literals = [];
  for (const [move, def] of Object.entries(SENTENCE_GRAMMAR.moves || {})) {
    for (const frame of def.frames || []) {
      const lit = frameOpeningLiteral(frame);
      if (lit) literals.push({ lit, move, frameId: frame.id });
    }
  }
  literals.sort((a, b) => b.lit.length - a.lit.length);

  // ספירה לפי מסמכים (docId ייחודי), לא לפי מופעים — הרגל ולא תדירות.
  const docsByFrame = new Map();   // frameId → Set<docId>
  const frameMove = new Map();
  for (const chunk of chunks) {
    const docId = String(chunk?.docId || chunk?.documentId || chunk?.sourceTitle || chunk?.id || '');
    for (const sentence of splitSentences(chunk?.text)) {
      const s = sentence.replace(/^["'״׳(]+/, '');
      const hit = literals.find((l) => s.startsWith(l.lit));
      if (!hit) continue;
      if (!docsByFrame.has(hit.frameId)) docsByFrame.set(hit.frameId, new Set());
      docsByFrame.get(hit.frameId).add(docId);
      frameMove.set(hit.frameId, hit.move);
    }
  }

  const slots = {};
  const allDocs = new Set();
  docsByFrame.forEach((docs, frameId) => {
    docs.forEach((d) => allDocs.add(d));
    if (docs.size < MIN_DOCS_FOR_HABIT) return;
    const move = frameMove.get(frameId);
    if (!slots[move]) slots[move] = { frame: {} };
    slots[move].frame[frameId] = docs.size;
  });

  const distinctDocs = new Set(chunks.map((c) => String(c?.docId || c?.documentId || c?.sourceTitle || c?.id || ''))).size;
  // ⚠️ כריית מסגרות חדשות מהקורפוס **נוסתה ונפסלה במדידה** (יולי 2026).
  // ההשערה: אם המנוע ידבר בפתיחי המשפט של המשתמש במקום בשלי, טביעת הסגנון
  // תתקרב. התוצאה על המטלה האמיתית, בציון ההתאמה לסגנון (AUC 0.945):
  //     בלי כרייה            24/100
  //     עם כרייה             16/100
  //     + סינון אוצר-מילים   12/100
  // ובנוסף התגלה כשל חמור: הכותרת של עבודה קודמת של המשתמש נכרתה כמסגרת
  // (נגמרת בפסיק, חוזרת בטיוטה ובגרסה הסופית) והוזרקה כפתיח משפט לעבודה בנושא
  // אחר — זיהום תוכן ולא רק ניסוח.
  //
  // ההסבר הסביר: פתיח שנכרה ממסמך שלם מנותק מהמהלך הרטורי שבו הוא מושתל, ולכן
  // הוא דוחק מסגרת שכן מתאימה למהלך. mineFramesFromCorpus נשמרת לאבחון ולניסוי
  // עתידי, אבל **אינה מוזרמת** לפרופיל. אין לחבר אותה מחדש בלי מדידה שמראה
  // שיפור מול 24/100.
  const minedCount = 0;
  return {
    schemaVersion: FRAME_PROFILE_SCHEMA_VERSION,
    fingerprint: corpusFingerprint(chunks),
    distinctDocs,
    slots,
    minedFrameCount: minedCount,
    feedback: carriedFeedback || {},   // move → frameId → צבירת משוב
  };
}

function applyFeedbackToSlots(p) {
  // המשוב נמזג לתוך המשקלים בזמן קריאה — כרייה ומשוב חיים בנפרד כדי שבנייה
  // מחדש (קורפוס השתנה) לא תמחק את מה שהמשתמש לימד בידיים.
  const merged = { slots: {}, distinctDocs: p.distinctDocs };
  for (const [move, data] of Object.entries(p.slots || {})) {
    merged.slots[move] = { frame: { ...data.frame } };
  }
  for (const [move, frames] of Object.entries(p.feedback || {})) {
    if (!merged.slots[move]) merged.slots[move] = { frame: {} };
    for (const [frameId, w] of Object.entries(frames)) {
      const next = (merged.slots[move].frame[frameId] || 0) + w;
      merged.slots[move].frame[frameId] = Math.max(0, next);
    }
  }
  return merged;
}

async function loadOrBuild() {
  // חובה לפני השוואת fingerprint: getChunks לפני hydrate מחזיר קורפוס ריק, שה-fingerprint
  // שלו תואם בדיוק cache שנבנה מקורפוס ריק — והפרופיל הריק היה "ננעל" (opener :160 עושה זהה).
  try { await ensureSampleStoreReady(); } catch {}
  if (isIdbAvailable()) {
    try {
      const cached = await idbGet(FRAME_PROFILE_CACHE_KEY);
      if (cached && cached.schemaVersion === FRAME_PROFILE_SCHEMA_VERSION) {
        const chunks = (() => { try { return getChunks(); } catch { return []; } })();
        if (cached.fingerprint === corpusFingerprint(chunks)) return cached;
        carriedFeedback = cached.feedback || null;   // הקורפוס השתנה — המשוב שורד
      }
    } catch {}
  }
  const built = await buildProfile();
  carriedFeedback = null;
  if (isIdbAvailable()) { try { await idbSet(FRAME_PROFILE_CACHE_KEY, built); } catch {} }
  return built;
}

/** מבטיח שהפרופיל קיים (בונה מהקורפוס אם צריך). */
export async function ensureFrameProfile() {
  if (profile) return profile;
  if (!buildPromise) {
    // דור אינבלידציה: אם הקורפוס השתנה בזמן שהבנייה באוויר, התוצאה (שנבנתה מהמצב הישן)
    // נזרקת ונבנה מחדש — בלי זה ההצבה כאן הייתה דורסת את ה-`profile = null` של האירוע
    // והפרופיל הישן היה נתקע עד שינוי הקורפוס הבא.
    const genAtStart = invalidationGen;
    buildPromise = loadOrBuild().then((p) => {
      buildPromise = null;
      if (genAtStart !== invalidationGen) return ensureFrameProfile();
      profile = p;
      return p;
    });
  }
  return buildPromise;
}

/**
 * הפרופיל בצורה ש-sentenceComposeService צורך: {slots, distinctDocs}.
 * sync — null עד שנטען (הקוראים קוראים ensureFrameProfile קודם).
 */
export function getFrameProfile() {
  return profile ? applyFeedbackToSlots(profile) : null;
}

/**
 * לולאת המשוב: המשתמש אישר (השאיר בטיוטה) או דחה (ביקש ניסוח מחדש) משפט.
 * @param {string} move
 * @param {string} frameId
 * @param {'accept'|'reject'} verdict
 */
export async function recordFrameFeedback(move, frameId, verdict) {
  const p = await ensureFrameProfile();
  if (!p.feedback) p.feedback = {};
  if (!p.feedback[move]) p.feedback[move] = {};
  const delta = verdict === 'accept' ? FEEDBACK_ACCEPT : FEEDBACK_REJECT;
  p.feedback[move][frameId] = (p.feedback[move][frameId] || 0) + delta;
  if (isIdbAvailable()) { try { await idbSet(FRAME_PROFILE_CACHE_KEY, p); } catch {} }
  return p.feedback[move][frameId];
}

export function getFrameProfileStatus() {
  if (!profile) return { ready: false, minedFrames: 0, feedbackEntries: 0, distinctDocs: 0 };
  const minedFrames = Object.values(profile.slots || {}).reduce((a, s) => a + Object.keys(s.frame || {}).length, 0)
    + (Number(profile.minedFrameCount) || 0);
  const feedbackEntries = Object.values(profile.feedback || {}).reduce((a, f) => a + Object.keys(f).length, 0);
  return { ready: true, minedFrames, feedbackEntries, distinctDocs: profile.distinctDocs };
}

// קורפוס השתנה (העלאת מסמך, תיוג gold) → הפרופיל ייבנה מחדש בקריאה הבאה.
if (typeof window !== 'undefined' && window.addEventListener) {
  try {
    window.addEventListener(STYLE_SAMPLES_UPDATED_EVENT, () => { profile = null; invalidationGen += 1; });
  } catch {}
}
