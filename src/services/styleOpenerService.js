// styleOpenerService.js — פיגומי ניסוח: איך *אתה* פותח פסקה מסוג מסוים.
//
// אפס AI. כורה מהקורפוס האישי (styleSampleStore) את הפתיחים האמיתיים של המשתמש,
// מסווג כל פסקה לכוונה רטורית באותם כללים של הפרסר, ומציע לסעיף פתיחים מאותה
// משפחה. ההצעה היא ניסוח שהמשתמש כבר כתב — לא ניסוח של מודל.
//
// למה זה עובד בלי מודל: הבעיה של "דף ריק" היא בעיקר בעיית *התחלה*. משפט פתיחה
// בקול שלך שובר את החסם, וההמשך כבר שלו.
//
// אמון: פתיח נשמר רק אם הביגרם הפותח שלו חוזר בקורפוס (MIN_PREFIX_DOCS) — ביטוי
// שהופיע פעם אחת אינו הרגל כתיבה. זה הלקח מ-v1 של styleAutocompleteService, שם
// דרישת חזרה מילה-במילה על *כל* הרצף פסלה כמעט כל שאילתה.
//
// תלויות: styleSampleStore (קריאה) + assignmentSpecService (detectIntent). browser-only.

import { getChunks, ensureSampleStoreReady, STYLE_SAMPLES_UPDATED_EVENT } from './styleSampleStore';
import { detectIntent } from './assignmentSpecService';
import { containsRareToken, isReady as lexiconReady } from './hebrewLexiconService';

// נמדד: הורדה ל-2 מכפילה את מספר הפתיחים (4→11) אבל כולם רעש — "על פי" חסר תוכן,
// ו"קמה ע" / "כץ נ" הם שורות ביבליוגרפיה שחוזרות בין עבודות ולכן נראות כהרגל.
const OPENER_MIN_WORDS = 3;
const OPENER_MAX_WORDS = 9;
// הביגרם הפותח חייב להופיע ב**שני מסמכים** לפחות — חזרה בתוך מסמך אחד היא
// תבנית של אותה עבודה ולא הרגל כתיבה.
const MIN_PREFIX_DOCS = 2;
const MAX_PER_INTENT = 5;
const MIN_PARAGRAPHS_TO_TRY = 4;  // מתחת לזה אין טעם אפילו לנסות
// שער האיכות הוא *מספר הפתיחים החוזרים שנמצאו*, לא נפח הקורפוס: ביגרם פותח שחוזר
// הוא כשלעצמו העדות להרגל. משתמש עם שלוש עבודות ודפוסים ברורים ראוי להצעות;
// משתמש עם עשרים עבודות בלי שום חזרה — לא.
const MIN_OPENERS_FOR_READY = 3;

const WORD_RE = /[֐-׿A-Za-z0-9'"׳״-]+/g;

// פתיחים גנריים שאינם מלמדים כלום על הקול האישי.
const BANNED_OPENERS = /^(?:זה|זאת|הוא|היא|הם|הן|יש|אין|כמו כן|בנוסף|לכן|אבל|אז)\b/;

// ביטויים שאינם ניסוח אלא הצהרה תפעולית של מסמך — אסור להציע אותם כפתיחה.
const PROCEDURAL_OPENER = /(?:הצהרת\s*AI|אני\s*מצהיר|נעזרתי\s*ב|בסיוע\s*מודל|בינה\s*מלאכות|שם\s*הקורס|מספר\s*הקורס|תעודת\s*זהות|מגיש[יה]?\s*העבודה|רשימה\s*ביבליוגרפית|הוגש\s*ל)/i;

/**
 * האם הפתיח נושא **תוכן** ולא רק ניסוח.
 *
 * זה השומר החשוב ביותר כאן. פתיח אמור להיות פיגום ריק שאפשר להמשיך ממנו בכל
 * נושא; ברגע שהוא כולל מספר, שם כלי מחקר או ראשי תיבות לועזיים, הוא גורר איתו
 * עובדות מעבודה אחרת. נמדד על הקורפוס האמיתי: "הגדרה אופרציונלית המשתנה יימדד
 * באמצעות שאלה 111 בשאלון INES" הוצע כפתיחה לסעיף ניתוח בכל מטלה שהיא —
 * כלומר שתילת נתון שמעולם לא היה במטלה הנוכחית.
 */
function isContentBearing(opener, paragraph = '') {
  const s = String(opener || '');
  // הבדיקה התפעולית רצה על **הפסקה המלאה**: הפתיח נחתך ל-9 מילים, וחיתוך
  // באמצע ביטוי ("נעזרתי בבינה | מלאכותית") ניצח את הפילטר בהרצה הקודמת.
  if (PROCEDURAL_OPENER.test(s) || PROCEDURAL_OPENER.test(String(paragraph || ''))) return true;
  if (/\d/.test(s)) return true;                    // מספרים = נתון ספציפי
  if (/[A-Za-z]{3,}/.test(s)) return true;          // שם כלי/מוסד לועזי
  if (/["'״׳]/.test(s)) return true;                // ציטוט או שם בגרשיים
  // אות עברית בודדת כמילה = ראשי תיבות של שם פרטי בשורת ביבליוגרפיה ("קמה ע",
  // "כץ נ"). אלה חוזרות בין עבודות ולכן נראות כהרגל ניסוח, אבל הן רשימת מקורות.
  if (/(?:^|\s)[֐-׿](?:\s|$)/.test(s)) return true;
  // שם פרטי בעברית ("הייג והרופ", "הדסה") — אין אות גדולה שתסגיר אותו, ולכן
  // ההכרעה היא סטטיסטית: מילה שמופיעה בקומץ מסמכים בלבד היא שם/מונח ייחודי.
  // fail-open — בקורפוס קטן מדי הבדיקה מושבתת ולא פוסלת כלום.
  if (lexiconReady() && containsRareToken(s)) return true;
  return false;
}

// סיווג לפי *הפתיח עצמו*. סיווג לפי הפסקה כולה שביר: מילה אחת באמצע ("...בתחילת
// הדיון") מטה פסקת סיכום ל'ניתוח'. המשפט הפותח הוא שקובע את התפקיד הרטורי של
// הפתיחה, וזה מה שאנחנו מציעים. נבדק ראשון; detectIntent הוא הנפילה.
const OPENER_CUES = [
  { intent: 'conclusion', re: /^(?:לסיכום|לסיום|בסיכומו של|המסקנה|מכל האמור)/ },
  { intent: 'review',     re: /^(?:מן הספרות|הספרות המחקרית|סקירת הספרות|מחקרים קודמים|בספרות המחקרית|מרבית המחקרים)/ },
  { intent: 'intro',      re: /^(?:עבודה זו|מאמר זה|פרק זה|מסמך זה|חיבור זה)/ },
  { intent: 'method',     re: /^(?:שיטת המחקר|כלי המחקר|המדגם|המשתתפים|ההליך|לצורך המחקר|הנתונים נאספו)/ },
  { intent: 'comparison', re: /^(?:בהשוואה|לעומת|בניגוד|בעוד ש)/ },
  { intent: 'findings',   re: /^(?:הממצאים|התוצאות|מן הנתונים|הנתונים מראים)/ },
  { intent: 'analysis',   re: /^(?:ניתוח|בחינה של|בחינת|עיון ב)/ },
  // שני האינטנטים שהיו חסרים מול 9 ה-INTENT_LABELS הקנוניים של הפרסר.
  { intent: 'argument',   re: /^(?:ניתן לטעון|אני סבור|אני סבורה|לטענתי|לעמדתי|טענה מרכזית|הטיעון המרכזי|יש הגורסים)/ },
  { intent: 'exposition', re: /^(?:המושג|המונח|ההגדרה|תופעת|הסוגיה של|מדובר ב)/ },
];

function classifyOpener(opener, paragraph) {
  for (const cue of OPENER_CUES) {
    if (cue.re.test(opener)) return cue.intent;
  }
  return detectIntent(paragraph);
}

let cache = null;        // {byIntent, paragraphs, builtAt}
let corpusToken = null;  // מספר ה-chunks בזמן הבנייה — משתנה → בונים מחדש

if (typeof window !== 'undefined') {
  try {
    window.addEventListener(STYLE_SAMPLES_UPDATED_EVENT, () => { cache = null; corpusToken = null; });
  } catch {}
}

const countWords = (s = '') => (String(s || '').match(WORD_RE) || []).length;

// מילות המשפט הראשון בפסקה, עד תקרת אורך. החיתוך עצמו נעשה בהמשך (trimToPhrasing),
// כי הוא זקוק לאינדקס תדירות-המסמכים שנבנה על כל הקורפוס.
function openerCandidate(paragraph) {
  const firstSentence = String(paragraph || '')
    .split(/(?<=[.!?…])\s+/)[0]
    .trim();
  if (!firstSentence) return null;
  const words = firstSentence.match(WORD_RE) || [];
  if (words.length < OPENER_MIN_WORDS) return null;
  return words.slice(0, OPENER_MAX_WORDS);
}

/**
 * גוזר את הרצף לחלק הבר-שימוש: הרצף הארוך ביותר שעדיין חוזר בכמה מסמכים.
 *
 * הבעיה שזה פותר: חיתוך לפי מספר מילים קבוע תופס את הניסוח **ועוד** את התוכן
 * שאחריו. נמדד על 24 עבודות אמיתיות — "לסיכום ניתן לראות כי לרשתות החברתיות יש
 * השפעה עצומה" הוצע כפתיחה, כשהחלק הבר-שימוש הוא ארבע המילים הראשונות בלבד.
 *
 * העיקרון: ניסוח חוזר בין מסמכים, תוכן מופיע פעם אחת. מאריכים את הרצף מילה-מילה
 * כל עוד הוא מופיע ב-MIN_PREFIX_DOCS מסמכים, ועוצרים ברגע שהוא צונח לאחד — שם
 * בדיוק עובר הגבול בין "איך אני כותב" ל"על מה כתבתי הפעם".
 *
 * @param {string[]} words מילות המועמד
 * @param {(prefix:string)=>number} docFreq בכמה מסמכים מופיע הרצף
 * @returns {{text:string, docs:number}|null}
 */
function trimToPhrasing(words, docFreq) {
  const prefix = (n) => words.slice(0, n).join(' ');
  const baseDocs = docFreq(prefix(OPENER_MIN_WORDS).toLowerCase());
  // אפילו הרצף המינימלי אינו חוזר ⇒ אין כאן הרגל, רק משפט מעבודה אחת.
  if (baseDocs < MIN_PREFIX_DOCS) return null;

  let best = OPENER_MIN_WORDS;
  let bestDocs = baseDocs;
  for (let n = OPENER_MIN_WORDS + 1; n <= words.length; n += 1) {
    const docs = docFreq(prefix(n).toLowerCase());
    if (docs < MIN_PREFIX_DOCS) break;
    best = n;
    bestDocs = docs;
  }
  return { text: prefix(best), docs: bestDocs };
}

// שני ספים בכוונה. ספירת ההרגל צריכה לראות *כל* פסקה שיש לה פתיחה — פסקה קצרה
// שפותחת ב"לסיכום הפרק" היא ראיה מלאה להרגל. ההצעה עצמה נלקחת רק מפסקאות
// מהותיות. איחוד שני הספים הוא באג: הוא הוריד ביגרמים אמיתיים מתחת ל-MIN_PREFIX_DOCS
// ומחק כוונות שלמות (conclusion/method) מהאינדקס.
const PARA_MIN_FOR_COUNT = 8;
const PARA_MIN_FOR_OFFER = 18;

/**
 * ההכרעה על פסקה בודדת, במקום אחד.
 *
 * מוצא מ-buildIndex כדי שכלי התיוג (collectOpenerCandidates) יעבור באותו מסלול
 * בדיוק. הרנס שמשחזר את הלוגיקה בנפרד מודד את עצמו, לא את המוצר — קרה כאן כבר.
 *
 * @returns {{opener:string|null, docs:number, intent:string|null, reject:string|null}}
 */
function decideOpener(paragraph, docFreq) {
  const no = (reject) => ({ opener: null, docs: 0, intent: null, reject });

  // בלוק בלי סימן פיסוק סוגר אינו פסקה אלא כותרת/עמוד שער. נמדד: "המכללה
  // האקדמית הדסה החוג לפוליטיקה ותקשורת במסגרת הקורס" הוצע כפתיחה לסעיף.
  if (!/[.!?…]/.test(paragraph)) return no('ללא-פיסוק');
  const candidate = openerCandidate(paragraph);
  if (!candidate) return no('קצר-מדי');
  // השער והסכין הם אותה מדידה: trimToPhrasing מחזיר null כשאפילו הרצף המינימלי
  // אינו חוזר, ואחרת מחזיר את החלק שכן.
  const trimmed = trimToPhrasing(candidate, docFreq);
  if (!trimmed) return no('לא-חוזר');
  const opener = trimmed.text;
  if (BANNED_OPENERS.test(opener)) return no('גנרי');
  if (isContentBearing(opener, paragraph)) return no('נושא-תוכן');
  return {
    opener,
    docs: trimmed.docs,
    intent: classifyOpener(opener, paragraph),
    reject: null,
  };
}

function prepareCorpus() {
  const chunks = getChunks();
  const allParagraphs = [];
  chunks.forEach((chunk) => {
    // מזהה המסמך נשמר לכל פסקה: "הרגל" נמדד בכמה עבודות הביטוי מופיע, לא בכמה
    // פעמים. נמדד על הקורפוס האמיתי — "הגדרה נומינלית" חזר 8 פעמים בעבודה אחת
    // בשיטות מחקר וטיפס לראש כל הכוונות, כולל מבוא וסקירת ספרות. זו תבנית של
    // מסמך בודד, לא קול אישי.
    const docId = chunk?.documentId || chunk?.docId || chunk?.sourceTitle || 'unknown';
    String(chunk?.text || '')
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => countWords(p) >= PARA_MIN_FOR_COUNT)
      .forEach((p) => allParagraphs.push({ text: p, docId }));
  });
  const paragraphs = allParagraphs.filter((p) => countWords(p.text) >= PARA_MIN_FOR_OFFER);

  // מדד ה"הרגל" = בכמה **מסמכים נפרדים** מופיע הרצף הפותח. נספר לכל אורך רצף
  // ולא רק לביגרם, כי אותה ספירה משמשת גם כשער (האם זה הרגל בכלל) וגם כסכין
  // (איפה הניסוח נגמר) — ראה trimToPhrasing.
  const prefixDocs = new Map();
  allParagraphs.forEach(({ text, docId }) => {
    const words = text.match(WORD_RE) || [];
    for (let n = OPENER_MIN_WORDS; n <= Math.min(words.length, OPENER_MAX_WORDS); n += 1) {
      const key = words.slice(0, n).join(' ').toLowerCase();
      if (!prefixDocs.has(key)) prefixDocs.set(key, new Set());
      prefixDocs.get(key).add(docId);
    }
  });
  const docFreq = (key) => (prefixDocs.get(key)?.size || 0);
  return { allParagraphs, paragraphs, docFreq };
}

function buildIndex() {
  const { paragraphs, docFreq } = prepareCorpus();

  const byIntent = {};
  if (paragraphs.length < MIN_PARAGRAPHS_TO_TRY) {
    return { byIntent, paragraphs: paragraphs.length, total: 0, sparse: true };
  }

  const seen = new Set();
  paragraphs.forEach(({ text: p }) => {
    const { opener, docs, intent, reject } = decideOpener(p, docFreq);
    if (reject) return;

    const key = opener.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    if (!byIntent[intent]) byIntent[intent] = [];
    byIntent[intent].push({ text: opener, weight: docs });
  });

  let total = 0;
  Object.keys(byIntent).forEach((intent) => {
    byIntent[intent] = byIntent[intent]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_PER_INTENT);
    total += byIntent[intent].length;
  });

  return { byIntent, paragraphs: paragraphs.length, total, sparse: total < MIN_OPENERS_FOR_READY };
}

/**
 * כל המועמדים לפתיח, כולל אלה שנפסלו וסיבת הפסילה. לתיוג ולמדידה בלבד.
 *
 * מחזיר גם את הנפסלים בכוונה: בלעדיהם אפשר למדוד רק כמה מהנשמרים טובים (דיוק),
 * ולא כמה טובים נזרקו (החזר). רוב הכיוונון כאן היה על הנשמרים בלבד, וזה בדיוק
 * מה שהסתיר את העובדה שהמנוע מפספס פתיחים אמיתיים.
 *
 * `rawCandidate` הוא הרצף לפני הגזירה — כך אפשר לשפוט את החיתוך עצמו, לא רק
 * את התוצאה.
 *
 * @returns {Array<{docId:string, rawCandidate:string, opener:string|null,
 *   reject:string|null, docs:number, intent:string|null, paragraph:string}>}
 */
export function collectOpenerCandidates() {
  const { paragraphs, docFreq } = prepareCorpus();
  const rows = [];
  paragraphs.forEach(({ text: p, docId }) => {
    const words = openerCandidate(p);
    if (!words) return;   // אפילו לא מועמד — אין מה לתייג
    const { opener, docs, intent, reject } = decideOpener(p, docFreq);
    rows.push({
      docId,
      rawCandidate: words.join(' '),
      opener,
      reject,
      docs,
      // גם לנפסלים יש כוונה — הפרופיל האישי (openerProfileService) כורה מהם
      // מילות סלוט, ו"לא-חוזר" בלי intent היה מוחק את רוב חומר הגלם.
      intent: intent || classifyOpener(words.join(' '), p),
      paragraph: p.slice(0, 300),
    });
  });
  return rows;
}

// ── הרכבה מדקדוק גלובלי ────────────────────────────────────────────────────
// openerGrammar.data.js הוא מודול סטטי מיוצר (tools/opener-grammar-build). נטען
// lazy כמו synonymsLexicon — משתמש שלא נזקק לפתיחים לא משלם את ה-KB.
let grammarData = null;
let grammarPromise = null;

/** טוען את הדקדוק הגלובלי. חד-פעמי, אפס רשת. @returns {Promise<object|null>} */
export async function ensureGrammarReady() {
  if (grammarData) return grammarData;
  if (!grammarPromise) {
    grammarPromise = import('./openerGrammar.data.js')
      .then((m) => { grammarData = m.OPENER_GRAMMAR; return grammarData; })
      .catch(() => { grammarPromise = null; return null; });
  }
  return grammarPromise;
}

// RNG זרוע: אותו sectionId → אותם פתיחים (יציבות בין רינדורים); refresh מחליף
// seed → וריאציה חדשה. djb2 + mulberry32 — בלי Math.random כדי שה-LAB יהיה דטרמיניסטי.
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const featureMatch = (a = 'x', b = 'x') => a === 'x' || b === 'x' || a === b;

/**
 * בחירת מילה לסלוט: משקל גלובלי (register) × דחיפה אישית.
 * הנוסחה מהתוכנית: score = globalBase * (1 + λ·personalBoost);
 * λ עולה עם גודל הקורפוס האישי — משתמש חדש מקבל גלובלי טהור, ותיק מקבל את
 * המילים שלו, אבל הגלובלי לעולם לא נכבה (מגוון).
 */
function pickSlotWord(rng, list, { profile, intent, slot } = {}) {
  if (!list || !list.length) return null;
  const personal = profile?.slots?.[intent]?.[slot] || null;
  const lambda = profile ? Math.min(0.8, (profile.distinctDocs || 0) / 10) : 0;
  const weights = list.map((e) => {
    const base = (e.reg ?? 1) >= 2 ? 2 : 1;
    const count = personal ? (personal[e.w] || 0) : 0;
    const boost = Math.min(2, count / 2);
    return base * (1 + lambda * boost);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < list.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

/**
 * מרכיב פתיחים מילה-מילה מהדקדוק הגלובלי, בהתאם דקדוקי מובטח.
 *
 * שתי משפחות תבניות בלבד — זה כל הטריק שמאפשר עברית תקינה בלי מודל:
 *   1. אימפרסונלית: stance + שם-פועל — אף מילה לא מוטה לפי נושא.
 *   2. נושא: פעלי fin שמורים מוטים מראש עם {g,n}, והמנוע רק *מסנן* לצורה
 *      התואמת את הנושא שנבחר. אין ייצור מורפולוגי — רק בחירה מתוך צורות נכונות.
 * ה-reference מוצלב עם `tails` של הפועל — "תעסוק" תקבל רק "ב", "תבחן" רק "את".
 *
 * @param {string} intent אחד מ-9 האינטנטים הקנוניים
 * @param {{count?:number, seedKey?:string, profile?:object}} opts
 * @returns {Array<{text:string, source:'composed', intent:string, pattern:string, slots:object}>}
 */
export function composeOpeners(intent, { count = 3, seedKey = '', profile = null } = {}) {
  const g = grammarData;
  const def = g?.intents?.[intent];
  if (!def) return [];
  const rng = mulberry32(djb2(`${seedKey}|${intent}`));
  const out = [];
  const sigs = [];

  for (let attempt = 0; attempt < count * 6 && out.length < count; attempt += 1) {
    const pattern = def.patterns[Math.floor(rng() * def.patterns.length)];
    const chosen = {};
    const parts = [];
    let ok = true;
    let verb = null;

    for (const token of pattern) {
      if (token === 'connector?') {
        if (rng() < 0.45) continue;   // קישור הוא תיבול, לא חובה
        const pool = (g.shared.connector || []).filter((c) => !c.intents || c.intents.includes(intent));
        const e = pickSlotWord(rng, pool, { profile, intent, slot: 'connector' });
        if (e) { chosen.connector = e.w; parts.push(e.w); }
      } else if (token === 'stance') {
        const e = pickSlotWord(rng, g.shared.stance, { profile, intent, slot: 'stance' });
        if (!e) { ok = false; break; }
        chosen.stance = e.w; parts.push(e.w);
      } else if (token === 'subjectNP') {
        const e = pickSlotWord(rng, def.slots.subjectNP, { profile, intent, slot: 'subjectNP' });
        if (!e) { ok = false; break; }
        chosen.subjectNP = e.w; chosen._g = e.g; chosen._n = e.n; parts.push(e.w);
      } else if (token === 'framingVerb.inf') {
        const e = pickSlotWord(rng, def.slots.framingVerb?.inf, { profile, intent, slot: 'framingVerb' });
        if (!e) { ok = false; break; }
        verb = e; chosen.framingVerb = e.w; parts.push(e.w);
      } else if (token === 'framingVerb.fin') {
        const pool = (def.slots.framingVerb?.fin || []).filter((e) => (
          featureMatch(e.g, chosen._g) && featureMatch(e.n, chosen._n)
        ));
        const e = pickSlotWord(rng, pool, { profile, intent, slot: 'framingVerb' });
        if (!e) { ok = false; break; }
        verb = e; chosen.framingVerb = e.w; parts.push(e.w);
      } else if (token === 'reference') {
        // ההצלבה עם tails היא מה ששומר על משלימים תקינים. פועל בלי tails
        // מקבל את כל המאגר של האינטנט.
        let pool = def.slots.reference || [];
        if (verb?.tails) {
          const allowed = new Set(verb.tails);
          pool = pool.filter((e) => allowed.has(e.w));
        }
        const e = pickSlotWord(rng, pool, { profile, intent, slot: 'reference' });
        if (!e) { ok = false; break; }
        chosen.reference = e.w;
        if (e.w) parts.push(e.w);
        chosen._clitic = Boolean(e.clitic);
      }
    }
    if (!ok || !parts.length) continue;

    // שומר הכפילות: נושא ופועל מאותו שורש מייצרים "נקודת הדמיון הבולטת בולטת"
    // או "ניתוח הדברים מנתח". זיהוי שורש אמיתי דורש מורפולוגיה; היוריסטיקה
    // מספיקה — רצף 3 אותיות משותף בין הפועל לנושא פוסל את הווריאנט.
    if (chosen.subjectNP && chosen.framingVerb) {
      const stem = chosen.framingVerb.replace(/^[מלהנתי]/, '');
      const overlap = stem.length >= 3 && [...Array(stem.length - 2)].some((_, k) => (
        chosen.subjectNP.includes(stem.slice(k, k + 3))
      ));
      if (overlap) continue;
    }

    let text = parts.join(' ');
    // הקליטיקה ("ב", "כ", "ל", "ש") נדבקת למילה הבאה — שהמשתמש יכתוב. לכן
    // שלוש הנקודות נצמדות אליה בלי רווח; אחרי מילה עצמאית יש רווח.
    text += chosen._clitic ? '…' : ' …';

    if (BANNED_OPENERS.test(text)) continue;
    // ייחודיות: שני וריאנטים שחולקים יותר משתי מילות סלוט הם אותו פתיח בתחפושת.
    const sig = ['connector', 'stance', 'subjectNP', 'framingVerb', 'reference']
      .map((k) => chosen[k] || '').filter(Boolean);
    const dup = sigs.some((prev) => sig.filter((w) => prev.includes(w)).length > 2);
    if (dup) continue;
    sigs.push(sig);

    const { _g, _n, _clitic, ...slots } = chosen;
    out.push({ text, source: 'composed', intent, pattern: pattern.join('+'), slots });
  }
  return out;
}

function getIndex() {
  const chunks = getChunks();
  const token = `${chunks.length}`;
  if (cache && corpusToken === token) return cache;
  cache = buildIndex();
  corpusToken = token;
  return cache;
}

/** מוודא שחנות הדגימות נטענה לפני בנייה. @returns {Promise<object>} */
export async function ensureOpenersReady() {
  try { await ensureSampleStoreReady(); } catch {}
  // הדקדוק הגלובלי נטען כאן כדי ש-getOpenersForIntent (סינכרונית) תוכל להשלים
  // בפתיחים מורכבים בלי להפוך לאסינכרונית אצל כל הקוראים הקיימים.
  try { await ensureGrammarReady(); } catch {}
  return getIndex();
}

/**
 * פתיחים בקול של המשתמש לכוונה נתונה.
 * נופל לכוונות קרובות כשאין מספיק דוגמאות ישירות — עדיף פתיח מ"ניתוח" מאשר כלום.
 *
 * @param {string} intent
 * @param {{limit?:number}} opts
 * @returns {Array<{text:string, weight:number, fromIntent:string}>}
 */
export function getOpenersForIntent(intent, { limit = 3, seedKey = '', profile = null } = {}) {
  const index = getIndex();

  // קורפוס דל: פעם זה היה `return []` — משתמש חדש קיבל מסך ריק. עכשיו הדקדוק
  // הגלובלי ממלא, מסומן `general` כדי שה-UI יאמר "כללי" ולא יתחזה לקול אישי.
  if (index.sparse) {
    return composeOpeners(intent, { count: limit, seedKey, profile })
      .map((o) => ({ ...o, composed: true, general: true, weight: 0, fromIntent: intent }));
  }

  const FALLBACK = {
    analysis: ['argument', 'findings', 'exposition'],
    comparison: ['analysis', 'exposition'],
    argument: ['analysis', 'conclusion'],
    review: ['exposition', 'intro'],
    findings: ['analysis', 'exposition'],
    method: ['exposition'],
    conclusion: ['argument', 'analysis'],
    intro: ['exposition', 'review'],
    exposition: ['analysis', 'review'],
  };

  const out = [];
  const push = (list, fromIntent, cap) => {
    (list || []).forEach((item) => {
      if (out.length >= cap) return;
      if (out.some((o) => o.text === item.text)) return;
      out.push({ ...item, fromIntent });
    });
  };

  push(index.byIntent[intent], intent, limit);

  // נפילה לכוונה שכנה מוגבלת לפריט אחד: פתיח ממשפחה אחרת הוא עדיף על רשימה ריקה,
  // אבל רשימה שרובה "מ-הצגה" רק מרעישה ומאבדת אמון.
  //
  // ⚠️ הנפילה חייבת להיות **מסומנת**. נמדד: פתיח מתודולוגי מ'הצגה' הוצע כפתיחה
  // ל'מבוא' ול'סקירת ספרות' בלי שום סימן שהוא לא משם — והמשתמש מקבל משפט
  // שנשמע כמוהו אבל שייך לסוג פסקה אחר לגמרי. `borrowed` מאפשר ל-UI לומר זאת.
  const fallbackCap = Math.min(limit, out.length + 1);
  for (const alt of (FALLBACK[intent] || [])) {
    if (out.length >= fallbackCap) break;
    push(index.byIntent[alt], alt, fallbackCap);
  }
  const marked = out.map((o) => (o.fromIntent === intent ? o : { ...o, borrowed: true }));

  // השלמה בהרכבה: הממוקשים (הקול האמיתי) תמיד קודמים, המורכבים ממלאים עד
  // ה-limit. `composed` מסומן — ה-UI מציג "מנוסח עבורך", לא ציטוט מהקורפוס.
  if (marked.length < limit) {
    const composed = composeOpeners(intent, { count: limit - marked.length, seedKey, profile })
      .filter((c) => !marked.some((o) => o.text === c.text))
      .map((o) => ({ ...o, composed: true, weight: 0, fromIntent: intent }));
    marked.push(...composed);
  }
  return marked;
}

/** מצב האינדקס לתצוגה ב-UI. */
export function getOpenerStatus() {
  const index = getIndex();
  return {
    ready: !index.sparse,
    sparse: index.sparse,
    paragraphs: index.paragraphs,
    openers: index.total || 0,
    intents: Object.keys(index.byIntent),
  };
}

// ---------- פתיח סעיף מלא (משפט–שניים, מעוגן בנושא) ----------
//
// המשוב שהוליד את זה: גדם של שלוש מילים ("מן הראוי לנתח את") לא שווה הרבה, אבל
// השלמה עיוורת של גדם בכותרת שברה עברית ("מגבה את קבוצת המיעוט דורשת...").
// לכן קודם מסווגים את הנושא, ולכל סוג תבנית שבטוחה דקדוקית:
//   np       — צירוף שמני ("המהפכה התעשייתית ועקרונות המרקסיזם") → גדם "…את" מהדקדוק.
//   question — "מהם החידושים..." → מסגרת שאלה, בלי הטיה תלוית-מין.
//   clause   — כותרת-משפט של תיאור מקרה → מסגרת מקרה+מסגרת-העל, בלי שיבוץ הנושא.

const ROADMAP_BY_INTENT = {
  argument: [
    'תחילה יוצגו העקרונות הרלוונטיים, ולאחר מכן ייבחן יישומם על המקרה הנדון.',
    'הדיון ייפתח בהצגת המסגרת העיונית, וממנה תיגזר ההכרעה המנומקת.',
    'המסקנה תיגזר מהחלת העקרונות על נסיבותיו הקונקרטיות של המקרה.',
    'הניתוח יבחין בין השאלה העקרונית לבין הנסיבות הפרטיקולריות של המקרה.',
  ],
  analysis: [
    'הדיון יתקדם מן הרקע הרעיוני אל בחינת הטענה לגופה.',
    'תחילה יובהר ההקשר, ולאחריו ינותחו הגורמים המרכזיים.',
  ],
  compare: ['ההשוואה תיערך לאורך צירים משותפים, ותסתיים בהערכת ההבדלים המהותיים.'],
  description: ['התיאור יתקדם מן הכלל אל הפרט, תוך הפניה לחומרי הקורס.'],
};

// מסגרות למקרה (clause): לא משבצות את הכותרת — רק את מסגרת-העל, שהיא צירוף שמני.
const CASE_FRAMES = [
  (fw) => `המקרה הנדון בסעיף זה ייבחן לאור ${fw}.`,
  (fw) => `ניתוח המקרה שלפנינו ייערך על פי ${fw}.`,
  (fw) => `ההכרעה בסעיף זה תנומק מתוך ${fw}.`,
  (fw) => `הדיון במקרה זה יתבסס על ${fw}.`,
];

const QUESTION_WORDS = /^(?:מה|מהם|מהן|מהי|מהו|מדוע|כיצד|האם|מי|איך|למה|באיזו|באילו)\s/;
// שם-פעולה שפותח כותרת ("הסבר מהם...", "ניתוח של...") — נחתך כדי לחשוף שאלה/נושא.
const VERBAL_NOUN_PREFIX = /^(?:הסבר|ניתוח|תיאור|הצגת|בחינת|דיון ב|השוואת|פירוט|נימוק|סיכום)\s+/;

function classifyTopic(topic) {
  let t = String(topic || '').replace(/\s+/g, ' ').trim();
  if (!t) return { kind: 'none', text: '' };
  const stripped = t.replace(VERBAL_NOUN_PREFIX, '');
  if (QUESTION_WORDS.test(stripped)) return { kind: 'question', text: stripped.replace(/[?？]\s*$/, '') };
  if (QUESTION_WORDS.test(t)) return { kind: 'question', text: t.replace(/[?？]\s*$/, '') };
  // כותרת-משפט: ארוכה, או מכילה פועל עבר/הווה טיפוסי אחרי הנושא. היוריסטיקה:
  // מעל 6 מילים או מכילה "דורשת/ביקשה/ביצעה/מונעת/עתרה" וכד' — clause.
  const words = t.split(' ');
  const CLAUSE_VERB = /(?:דורשת|דורשים|ביקשה|ביצעה|מונעת|עתרה|מסרבת|טוענת|דורש|ביקש|ביצע|מונע|עתר|מסרב|טוען)/;
  // תואר-פועל פותח ("בינתיים קבוצה אחרת...") מסגיר משפט-מקרה גם בלי פועל גלוי —
  // הפועל נחתך יחד עם סוף הכותרת.
  const ADVERB_OPEN = /^(?:בינתיים|כאשר|לאחר|בעוד|במקביל|בנוסף|כמו כן|מנגד)\s/;
  if (words.length > 6 || CLAUSE_VERB.test(t) || ADVERB_OPEN.test(t)) return { kind: 'clause', text: t };
  return { kind: 'np', text: t };
}

const stripTrailingEllipsis = (s) => String(s || '').replace(/\s*…\s*$/, '');

/**
 * פתיח מלא לסעיף: משפט פותח מעוגן בנושא + משפט מתווה-דרך (מהמושגים שהמרצה דרש,
 * אם ישנם). בטוח דקדוקית לכל סוג כותרת. אפס API.
 *
 * @param {{intent?:string, seedKey?:string, profile?:object|null, topic?:string,
 *          framework?:string, mustMention?:string[], usedTexts?:Set<string>}} args
 *        framework — מסגרת-העל לניסוח פתיחי מקרה (כותרת סעיף-האב), צירוף שמני.
 * @returns {string} '' כשאין מה להרכיב
 */
export function composeSectionOpener({
  intent = 'analysis',
  seedKey = '',
  profile = null,
  topic = '',
  framework = '',
  mustMention = [],
  usedTexts = null,
  // A3 (round-3): גוף הראיות של הסעיף. הפתיח הבטיח "ישולבו בדיון המושגים X ו-Y"
  // גם כשאין ל-X/Y זכר בחומר — הבטחת-שווא שהמרצה פוסל. כשמסופק (מחרוזת, כולל ''),
  // המונחים מסוננים לאלה שמופיעים בפועל (includes + הסרת תחילית ה/ו/ב/ל/כ/מ/ש);
  // גוף ריק ⇒ אפס הבטחות (סעיף חסום). null (לא סופק) ⇒ התנהגות ישנה, בלי סינון.
  evidenceText = null,
} = {}) {
  const cls = classifyTopic(topic);
  if (cls.kind === 'none') return '';

  let first = '';
  if (cls.kind === 'np') {
    // גדם מהדקדוק (בקול המשתמש כשיש פרופיל) — רק גדמים שנגמרים ב"את …", שבטוחים
    // מול צירוף שמני. אחרת תבנית ניטרלית בלי הטיה תלוית-מין.
    const candidates = composeOpeners(intent, { count: 6, seedKey, profile })
      .filter((c) => /את\s*…$/.test(c.text));
    let stem = null;
    for (const c of candidates) {
      if (usedTexts && usedTexts.has(c.text)) continue;
      stem = c; break;
    }
    if (stem) {
      if (usedTexts) usedTexts.add(stem.text);
      first = `${stripTrailingEllipsis(stem.text)} ${cls.text}.`;
    } else {
      first = `הדיון בחלק זה יעסוק ב${cls.text}.`;
    }
  } else if (cls.kind === 'question') {
    first = `חלק זה נדרש לשאלה ${cls.text}.`;
  } else {
    // clause — תיאור מקרה. הנושא לא משובץ; המסגרת כן.
    const fw = String(framework || '').replace(/\s+/g, ' ').trim() || 'העקרונות שנלמדו בקורס';
    const idx = Math.abs(djb2(`${seedKey}|case`)) % CASE_FRAMES.length;
    let frame = CASE_FRAMES[idx](fw);
    if (usedTexts && usedTexts.has(frame)) {
      frame = CASE_FRAMES[(idx + 1) % CASE_FRAMES.length](fw);
    }
    if (usedTexts) usedTexts.add(frame);
    first = frame;
  }

  let must = (Array.isArray(mustMention) ? mustMention : []).filter(Boolean);
  // סינון-כנות: מבטיחים רק מונחי-חובה שקיימים בגוף הראיות. null ⇒ לא סופק ⇒
  // דילוג (התנהגות ישנה). '' ⇒ סעיף חסום ⇒ כל המונחים מסוננים החוצה.
  if (must.length && evidenceText != null) {
    const bodyLc = String(evidenceText).toLowerCase();
    const present = (term) => {
      const words = String(term).toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
      if (!words.length) return false;
      return words.every((w) => {
        const bare = w.replace(/^[הובלכמש](?=[א-ת]{3,})/, '');
        return bodyLc.includes(w) || bodyLc.includes(bare);
      });
    };
    must = must.filter(present);
  }
  let second;
  if (must.length) {
    second = `בהתאם לדרישת המטלה, ישולבו בדיון המושגים ${must.map((m) => `"${m}"`).join(' ו-')}.`;
  } else {
    // בחירה מודעת-שימוש: ארבעה תתי-סעיפים לא יקבלו אותו משפט מתווה.
    const pool = ROADMAP_BY_INTENT[intent] || ROADMAP_BY_INTENT.analysis;
    const start = Math.abs(djb2(`${seedKey}|roadmap`)) % pool.length;
    second = pool[start];
    if (usedTexts) {
      for (let i = 0; i < pool.length; i += 1) {
        const cand = pool[(start + i) % pool.length];
        if (!usedTexts.has(cand)) { second = cand; break; }
      }
      usedTexts.add(second);
    }
  }
  return `${first} ${second}`;
}
