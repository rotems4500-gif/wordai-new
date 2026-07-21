// openerProfileService.js — האימון האישי של מנוע הפתיחים.
//
// מה זה: פרופיל משקלים intent → slot → {מילה: משקל}, שנבנה משני מקורות:
//   1. כרייה — פירוק הפתיחים האמיתיים של המשתמש (collectOpenerCandidates)
//      למילות סלוט מול הדקדוק הגלובלי. דטרמיניסטי, בלי regex \b (שבור בעברית) —
//      התאמת מערכי טוקנים, span ארוך תחילה.
//   2. משוב — כל הוספה/דחייה של פתיח מורכב ב-UI מעדכנת משקלים. זו "לולאת
//      האימון" המתמשכת: אין מודל, רק ספירה.
//
// styleOpenerService.pickSlotWord ממזג את הפרופיל מעל הדקדוק הגלובלי:
// score = globalBase * (1 + λ·personalBoost), λ עולה עם גודל הקורפוס.
//
// תבנית התשתית זהה ל-styleAutocompleteService: schema version + corpus
// fingerprint + IndexedDB, בנייה מחדש על STYLE_SAMPLES_UPDATED_EVENT.
// תלויות: styleSampleStore (קריאה), styleOpenerService (כרייה+דקדוק), styleKvStore.

import { getChunks, ensureSampleStoreReady, STYLE_SAMPLES_UPDATED_EVENT } from './styleSampleStore';
import { idbGet, idbSet, isIdbAvailable } from './styleKvStore';
import { collectOpenerCandidates, ensureGrammarReady } from './styleOpenerService';
import { containsRareToken, isReady as lexiconReady } from './hebrewLexiconService';

export const OPENER_PROFILE_CACHE_KEY = 'wordai_opener_profile_v1';
export const OPENER_PROFILE_SCHEMA_VERSION = 1;

const WORD_RE = /[֐-׿A-Za-z0-9'"׳״-]+/g;
const FEEDBACK_ACCEPT = 2;   // הוספה לעורך = אימוץ מפורש
const FEEDBACK_REJECT = -1;  // רענון = "לא זה"; רצפה 0 — אין משקל שלילי

function djb2Hex(str = '') {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}
function corpusFingerprint(chunks) {
  const ids = chunks.map((c) => String(c?.id || '')).sort();
  return `${ids.length}_${djb2Hex(ids.join('|'))}`;
}

let profile = null;      // {schemaVersion, fingerprint, distinctDocs, slots, patterns, feedback}
let buildPromise = null;
let carriedFeedback = null;   // משוב ששרד invalidation — נמזג בבנייה הבאה

/**
 * פירוק פתיח למילות סלוט מול הדקדוק — דטרמיניסטי, ללא regex.
 * לכל עמדה בטוקנים מנסים את ה-span הארוך ביותר שמופיע באחת מרשימות הסלוט
 * ("מן הראוי" לפני "מן"). מילים שלא הותאמו לשום סלוט נזרקות — הן תוכן.
 *
 * @param {string} text הפתיח הממוקש
 * @param {object} grammar OPENER_GRAMMAR
 * @param {string} intent האינטנט של הפתיח
 * @returns {Array<{slot:string, w:string}>}
 */
export function decomposeOpener(text, grammar, intent) {
  const def = grammar?.intents?.[intent];
  if (!def) return [];

  // slotIndex: "מילה מנורמלת" → {slot, w מקורי}. spans ממופתחים לפי מספר מילים.
  const spans = new Map();   // wordCount → Map<normText, {slot,w}>
  const put = (slot, e) => {
    const words = String(e.w || '').replace(/,$/, '').match(WORD_RE) || [];
    if (!words.length) return;
    const key = words.join(' ').toLowerCase();
    if (!spans.has(words.length)) spans.set(words.length, new Map());
    const m = spans.get(words.length);
    if (!m.has(key)) m.set(key, { slot, w: e.w });
  };
  (grammar.shared?.connector || []).forEach((e) => put('connector', e));
  (grammar.shared?.stance || []).forEach((e) => put('stance', e));
  (grammar.shared?.hedge || []).forEach((e) => put('hedge', e));
  (def.slots?.subjectNP || []).forEach((e) => put('subjectNP', e));
  (def.slots?.reference || []).forEach((e) => put('reference', e));
  (def.slots?.framingVerb?.inf || []).forEach((e) => put('framingVerb', e));
  (def.slots?.framingVerb?.fin || []).forEach((e) => put('framingVerb', e));

  const lens = [...spans.keys()].sort((a, b) => b - a);   // ארוך תחילה
  const tokens = String(text || '').match(WORD_RE) || [];
  const norm = tokens.map((t) => t.toLowerCase());
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    for (const len of lens) {
      if (i + len > tokens.length) continue;
      const hit = spans.get(len).get(norm.slice(i, i + len).join(' '));
      if (hit) { out.push(hit); i += len; matched = true; break; }
    }
    if (!matched) i += 1;
  }
  return out;
}

async function buildProfile() {
  await ensureSampleStoreReady();
  const grammar = await ensureGrammarReady();
  const chunks = getChunks();
  const fingerprint = corpusFingerprint(chunks);

  const fresh = {
    schemaVersion: OPENER_PROFILE_SCHEMA_VERSION,
    fingerprint,
    distinctDocs: 0,
    slots: {},      // intent → slot → {word: weight}
    patterns: {},   // intent → {patternKey: weight}
    feedback: carriedFeedback || profile?.feedback || {},   // המשוב שורד בנייה מחדש
  };
  carriedFeedback = null;
  if (!grammar) { profile = fresh; return profile; }

  // כרייה: פתיחים שנשמרו + אלה שנפסלו *רק* על אי-חזרה. פתיח שהופיע פעם אחת
  // הוא עדיין הקול של המשתמש — הוא רק לא ראיה מספיקה להצעה מילולית. לפירוק
  // למילות סלוט הוא כן תורם.
  const rows = collectOpenerCandidates().filter((r) => !r.reject || r.reject === 'לא-חוזר');
  const docs = new Set();
  rows.forEach((r) => {
    docs.add(r.docId);
    const intent = r.intent;
    if (!intent) return;
    const parts = decomposeOpener(r.opener || r.rawCandidate, grammar, intent);
    parts.forEach(({ slot, w }) => {
      // מילה אישית שאינה בדקדוק לא מגיעה לכאן (הפירוק מתאים רק מול הדקדוק),
      // אבל ליתר ביטחון: מילת תוכן נדירה לא נכנסת לפרופיל.
      if (lexiconReady() && containsRareToken(w)) return;
      const byIntent = fresh.slots[intent] || (fresh.slots[intent] = {});
      const bySlot = byIntent[slot] || (byIntent[slot] = {});
      bySlot[w] = (bySlot[w] || 0) + 1;
    });
  });
  fresh.distinctDocs = docs.size;

  // מיזוג המשוב המצטבר מעל הכרייה.
  Object.entries(fresh.feedback).forEach(([intent, slots]) => {
    Object.entries(slots).forEach(([slot, words]) => {
      Object.entries(words).forEach(([w, delta]) => {
        const byIntent = fresh.slots[intent] || (fresh.slots[intent] = {});
        const bySlot = byIntent[slot] || (byIntent[slot] = {});
        bySlot[w] = Math.max(0, (bySlot[w] || 0) + delta);
      });
    });
  });

  profile = fresh;
  if (isIdbAvailable()) {
    try { await idbSet(OPENER_PROFILE_CACHE_KEY, profile); } catch {}
  }
  return profile;
}

/**
 * מוודא שהפרופיל בנוי. cache ב-IndexedDB לפי fingerprint — קורפוס השתנה →
 * בנייה מחדש (המשוב נשמר).
 * @returns {Promise<object|null>}
 */
export function ensureOpenerProfile() {
  if (profile) return Promise.resolve(profile);
  if (buildPromise) return buildPromise;
  buildPromise = (async () => {
    try {
      if (isIdbAvailable()) {
        try {
          await ensureSampleStoreReady();
          const cached = await idbGet(OPENER_PROFILE_CACHE_KEY);
          if (cached
            && cached.schemaVersion === OPENER_PROFILE_SCHEMA_VERSION
            && cached.fingerprint === corpusFingerprint(getChunks())) {
            profile = cached;
            return profile;
          }
          // fingerprint לא תואם — שומרים את המשוב לפני שבונים מחדש
          if (cached?.feedback && !carriedFeedback) carriedFeedback = cached.feedback;
        } catch {}
      }
      return await buildProfile();
    } catch {
      return null;
    } finally {
      buildPromise = null;
    }
  })();
  return buildPromise;
}

/** הפרופיל הנוכחי (או null אם עוד לא נבנה). סינכרוני — לקריאה מ-getOpenersForIntent. */
export function getOpenerProfile() {
  return profile;
}

/**
 * לולאת המשוב: המשתמש הוסיף (accepted) או רענן (דחה) פתיח מורכב.
 * מתועד גם ב-feedback (שורד בנייה מחדש) וגם מוחל מיידית על הפרופיל החי.
 *
 * @param {{intent:string, slots:object, accepted:boolean}} p
 *   slots — כפי שהוחזר מ-composeOpeners ({connector, stance, subjectNP, framingVerb, reference})
 */
export async function recordOpenerFeedback({ intent, slots, accepted }) {
  if (!intent || !slots) return;
  await ensureOpenerProfile();
  if (!profile) profile = { schemaVersion: OPENER_PROFILE_SCHEMA_VERSION, fingerprint: '', distinctDocs: 0, slots: {}, patterns: {}, feedback: {} };
  const delta = accepted ? FEEDBACK_ACCEPT : FEEDBACK_REJECT;

  Object.entries(slots).forEach(([slot, w]) => {
    if (!w || slot.startsWith('_')) return;
    const fbIntent = profile.feedback[intent] || (profile.feedback[intent] = {});
    const fbSlot = fbIntent[slot] || (fbIntent[slot] = {});
    fbSlot[w] = (fbSlot[w] || 0) + delta;

    const byIntent = profile.slots[intent] || (profile.slots[intent] = {});
    const bySlot = byIntent[slot] || (byIntent[slot] = {});
    bySlot[w] = Math.max(0, (bySlot[w] || 0) + delta);
  });

  if (isIdbAvailable()) {
    try { await idbSet(OPENER_PROFILE_CACHE_KEY, profile); } catch {}
  }
}

/** מצב הפרופיל ל-UI. */
export function getOpenerProfileStatus() {
  const intents = profile ? Object.keys(profile.slots) : [];
  let words = 0;
  intents.forEach((it) => Object.values(profile.slots[it]).forEach((s) => { words += Object.keys(s).length; }));
  return {
    ready: Boolean(profile),
    distinctDocs: profile?.distinctDocs || 0,
    intents,
    personalWords: words,
    blendLambda: profile ? Math.min(0.8, (profile.distinctDocs || 0) / 10) : 0,
  };
}

/** הקורפוס השתנה → הפרופיל מיושן. המשוב מצטרף לבנייה הבאה. */
export function invalidateOpenerProfile() {
  if (profile?.feedback) carriedFeedback = profile.feedback;
  profile = null;
  buildPromise = null;
}

if (typeof window !== 'undefined') {
  try {
    window.addEventListener(STYLE_SAMPLES_UPDATED_EVENT, invalidateOpenerProfile);
  } catch {}
}
