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
  return {
    schemaVersion: FRAME_PROFILE_SCHEMA_VERSION,
    fingerprint: corpusFingerprint(chunks),
    distinctDocs,
    slots,
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
    buildPromise = loadOrBuild().then((p) => { profile = p; buildPromise = null; return p; });
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
  const minedFrames = Object.values(profile.slots || {}).reduce((a, s) => a + Object.keys(s.frame || {}).length, 0);
  const feedbackEntries = Object.values(profile.feedback || {}).reduce((a, f) => a + Object.keys(f).length, 0);
  return { ready: true, minedFrames, feedbackEntries, distinctDocs: profile.distinctDocs };
}

// קורפוס השתנה (העלאת מסמך, תיוג gold) → הפרופיל ייבנה מחדש בקריאה הבאה.
if (typeof window !== 'undefined' && window.addEventListener) {
  try {
    window.addEventListener(STYLE_SAMPLES_UPDATED_EVENT, () => { profile = null; });
  } catch {}
}
