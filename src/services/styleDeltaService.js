// styleDeltaService.js — מנוע הסגנון האישי (Personal Style Engine), Phase 5: Delta Tracking.
//
// לוקח snapshot של טקסט שנוצר ע"י ה-AI, ואחרי שהמשתמש עורך אותו — עושה diff,
// מסווג "עריכת סגנון" מול "עריכת תוכן" מקומית (בלי LLM), צובר counters, ומדי פעם
// (נדיר) מסנתז את ה-counters לעדכוני פרופיל (metrics/patterns/blacklist).
//
// 100% מקומי; קריאת LLM יחידה אופציונלית רק ב-synthesizeProfileUpdate (דרך invokeModel שמוזרק).
// אחסון: localStorage בלבד ('wordai_style_deltas_v1'), לא מסונכרן לענן (mirror של projectService).
//
// תלויות (כולן לא-מעגליות): diff-match-patch; styleProfileService (leaf); styleSampleStore (leaf);
// aiService (app-layer — aiService אינו מייבא מודול זה, ולכן אין מעגל).
// תוכנית: docs/style-engine-plan.md §5c, §9, §12.

import { diff_match_patch, DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL } from 'diff-match-patch';
import { normalizeStyleEngine, STYLE_CONNECTORS, mergeQualitativePatterns } from './styleProfileService';
import { addGoldChunk } from './styleSampleStore';
import { getPersonalStyleProfile, savePersonalStyleProfile } from './aiService';

export const STYLE_DELTAS_STORAGE_KEY = 'wordai_style_deltas_v1';
export const STYLE_DELTAS_SCHEMA_VERSION = 1;

// כלל 20% (§9): מתחת → אות סגנון (counters); מעל → gold standard (chunk).
const STYLE_EDIT_RATIO_THRESHOLD = 0.20;
// סף Jaccard לחפיפה גבוהה (§9): החלפת מילה/סידור/פיסוק עם overlap≥0.6 → סגנון.
const HIGH_OVERLAP_THRESHOLD = 0.6;
// סף סינתזה אוטומטית (§9).
const AUTO_SYNTHESIS_THRESHOLD = 15;
// תקרת pending snapshots — מפילים את הישן ביותר.
const MAX_PENDING = 20;
// תקרת מפתחות ב-replacedWords (למניעת ניפוח).
const MAX_REPLACED_WORDS = 60;
// תקרת מפתחות ב-replacementPairs (מילה-שהוסרה → חלופות מועדפות).
const MAX_REPLACEMENT_PAIRS = 40;
// תקרת חלופות פנימיות למילה אחת ב-replacementPairs.
const MAX_REPLACEMENT_ALTS = 10;
// תווי מקף/מקף-עברי לספירת עריכות פיסוק.
const DASH_RE = /[־–—-]/g;

// ---------- עזרי בסיס ----------

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nowTs = () => Date.now();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

// מילים לספירה/טוקניזציה (עברית + אנגלית + ספרות) — עקבי עם styleProfileService.
const WORD_RE = /[֐-׿A-Za-z0-9'"׳״-]+/g;
const matchWords = (str = '') => String(str || '').match(WORD_RE) || [];

// מפצל למשפטים לפי גבולות פיסוק סוף-משפט.
const splitSentences = (str = '') => String(str || '')
  .split(/[.!?…]+/)
  .map((s) => s.trim())
  .filter(Boolean);

// מנרמל מילה בודדת (מסיר גרשיים/מקפים בקצוות, lowercase).
const normWord = (w = '') => String(w || '').replace(/^["'׳״-]+|["'׳״-]+$/g, '').toLowerCase();

// מונה מופעים של מחרוזת בתוך טקסט (לא חופף).
const countOccurrences = (haystack, needle) => {
  if (!needle) return 0;
  let hits = 0;
  let from = 0;
  let idx = haystack.indexOf(needle, from);
  while (idx !== -1) {
    hits += 1;
    from = idx + needle.length;
    idx = haystack.indexOf(needle, from);
  }
  return hits;
};

// כל הספרות/המספרים בטקסט (לזיהוי שינוי תוכן מספרי).
const extractNumbers = (str = '') => String(str || '').match(/\d[\d.,]*/g) || [];

// Jaccard overlap ברמת מילים בין שני טקסטים.
const wordJaccard = (a, b) => {
  const setA = new Set(matchWords(a).map(normWord).filter(Boolean));
  const setB = new Set(matchWords(b).map(normWord).filter(Boolean));
  if (!setA.size && !setB.size) return 1;
  let inter = 0;
  setA.forEach((w) => { if (setB.has(w)) inter += 1; });
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 1;
};

// ---------- readBlob / writeBlob (סובלני, mirror projectService) ----------

function defaultBlob() {
  return {
    schemaVersion: STYLE_DELTAS_SCHEMA_VERSION,
    pending: [],
    aggregate: { styleEdits: 0, contentEdits: 0 },
  };
}

function normalizePendingEntry(raw) {
  if (!isPlainObject(raw)) return null;
  const docId = String(raw.docId || '').trim();
  const generatedText = String(raw.generatedText || '');
  if (!docId || !generatedText) return null;
  return {
    id: String(raw.id || '').trim() || `delta_${Math.random().toString(36).slice(2, 10)}`,
    docId,
    generatedText,
    generatedAt: Number.isFinite(Number(raw.generatedAt)) ? Number(raw.generatedAt) : 0,
    editedText: raw.editedText === undefined || raw.editedText === null ? null : String(raw.editedText),
    diffedAt: Number.isFinite(Number(raw.diffedAt)) ? Number(raw.diffedAt) : 0,
    changeRatio: Number.isFinite(Number(raw.changeRatio)) ? Number(raw.changeRatio) : null,
    classification: typeof raw.classification === 'string' ? raw.classification : null,
  };
}

export function readDeltaStore() {
  if (typeof window === 'undefined') return defaultBlob();
  let parsed = null;
  try {
    parsed = JSON.parse(localStorage.getItem(STYLE_DELTAS_STORAGE_KEY) || '');
  } catch {}
  if (!isPlainObject(parsed)) return defaultBlob();
  const pending = (Array.isArray(parsed.pending) ? parsed.pending : [])
    .map(normalizePendingEntry)
    .filter(Boolean)
    .slice(-MAX_PENDING);
  const aggSrc = isPlainObject(parsed.aggregate) ? parsed.aggregate : {};
  return {
    schemaVersion: STYLE_DELTAS_SCHEMA_VERSION,
    pending,
    aggregate: {
      styleEdits: Math.max(0, Math.round(Number(aggSrc.styleEdits) || 0)),
      contentEdits: Math.max(0, Math.round(Number(aggSrc.contentEdits) || 0)),
    },
  };
}

function writeDeltaStore(blob) {
  if (typeof window === 'undefined') return;
  const next = {
    schemaVersion: STYLE_DELTAS_SCHEMA_VERSION,
    pending: (Array.isArray(blob?.pending) ? blob.pending : [])
      .map(normalizePendingEntry)
      .filter(Boolean)
      .slice(-MAX_PENDING),
    aggregate: {
      styleEdits: Math.max(0, Math.round(Number(blob?.aggregate?.styleEdits) || 0)),
      contentEdits: Math.max(0, Math.round(Number(blob?.aggregate?.contentEdits) || 0)),
    },
  };
  try {
    localStorage.setItem(STYLE_DELTAS_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

// dispatch ידני של אירוע עדכון הפרופיל (savePersonalStyleProfile *לא* מפעיל אותו).
function dispatchProfileUpdated(source = 'style-delta') {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('wordai-personal-style-updated', { detail: { source } }));
  } catch {}
}

// ---------- snapshotGeneration ----------

/**
 * שומר snapshot ממתין (טקסט רגיל) של פלט שנוצר. dedupe: אם כבר קיים snapshot ממתין
 * (un-diffed) לאותו docId — מחליף אותו במקום לצבור כפילות.
 * @param {{docId:string, generatedText:string}} args
 * @returns {{id:string}|null}
 */
export function snapshotGeneration({ docId, generatedText } = {}) {
  if (typeof window === 'undefined') return null;
  const id = String(docId || '').trim();
  const text = String(generatedText || '');
  if (!id || !text.trim()) return null;

  try {
    const blob = readDeltaStore();
    const entry = {
      id: `delta_${Math.random().toString(36).slice(2, 10)}`,
      docId: id,
      generatedText: text,
      generatedAt: nowTs(),
      editedText: null,
      diffedAt: 0,
      changeRatio: null,
      classification: null,
    };
    // מחליף snapshot ממתין קיים לאותו מסמך (un-diffed) — רק אחד פעיל בכל רגע.
    const existingIdx = blob.pending.findIndex((p) => p.docId === id && !p.diffedAt);
    if (existingIdx !== -1) {
      blob.pending.splice(existingIdx, 1, entry);
    } else {
      blob.pending.push(entry);
      // cap — מפילים את הישן ביותר.
      while (blob.pending.length > MAX_PENDING) blob.pending.shift();
    }
    writeDeltaStore(blob);
    return { id: entry.id };
  } catch {
    return null;
  }
}

// ---------- classifyEdits ----------

/**
 * מסווג עריכה סגנון-מול-תוכן מקומית (בלי LLM). §9.
 * @param {string} originalText
 * @param {string} editedText
 * @returns {{changeRatio:number, styleEditScore:number, contentEditScore:number,
 *   signals:{shortenedSentence:number, removedConnector:number, replacedWords:Object, addedParenthetical:number},
 *   classification:('style'|'content'|'mixed')}}
 */
export function classifyEdits(originalText, editedText) {
  const original = String(originalText || '');
  const edited = String(editedText || '');

  const signals = {
    shortenedSentence: 0,
    removedConnector: 0,
    replacedWords: {},
    replacementPairs: {},
    addedParenthetical: 0,
    commaAdded: 0,
    commaRemoved: 0,
    dashAdded: 0,
    dashRemoved: 0,
  };

  const originalLength = original.length;

  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(original, edited);
  dmp.diff_cleanupSemantic(diffs);

  // changeRatio = סכום אורכי insert+delete / max(originalLength,1), clamp 0-1.
  let changedChars = 0;
  let deletedText = '';
  let insertedText = '';
  diffs.forEach(([op, data]) => {
    if (op === DIFF_INSERT) { changedChars += data.length; insertedText += data + ' '; }
    else if (op === DIFF_DELETE) { changedChars += data.length; deletedText += data + ' '; }
  });
  const changeRatio = clamp(round(changedChars / Math.max(originalLength, 1), 4), 0, 1);

  const overlap = wordJaccard(original, edited);

  // -- signal: החלפת מילה בודדת (delete צמוד ל-insert, שניהם מילה בודדת).
  for (let i = 0; i < diffs.length; i += 1) {
    const [op, data] = diffs[i];
    if (op !== DIFF_DELETE) continue;
    // ה-insert הצמוד (מדלגים על equal ריק/רווח).
    let j = i + 1;
    if (j < diffs.length && diffs[j][0] === DIFF_EQUAL && !diffs[j][1].trim()) j += 1;
    if (j >= diffs.length || diffs[j][0] !== DIFF_INSERT) continue;
    const delWord = data.trim();
    const insWord = diffs[j][1].trim();
    if (!delWord || !insWord) continue;
    // מילה בודדת בלבד בשני הצדדים.
    if (matchWords(delWord).length === 1 && matchWords(insWord).length === 1) {
      const key = normWord(delWord);
      const repKey = normWord(insWord);
      if (key && Object.keys(signals.replacedWords).length < MAX_REPLACED_WORDS) {
        signals.replacedWords[key] = (signals.replacedWords[key] || 0) + 1;
      }
      // -- signal: זוג החלפה (מילה שהוסרה → מילה שהוכנסה במקומה), ללמידה חיובית.
      if (key && repKey && key !== repKey) {
        const hasKey = Object.prototype.hasOwnProperty.call(signals.replacementPairs, key);
        if (hasKey || Object.keys(signals.replacementPairs).length < MAX_REPLACEMENT_PAIRS) {
          const bucket = signals.replacementPairs[key] || (signals.replacementPairs[key] = { reps: {} });
          const repsCount = Object.keys(bucket.reps).length;
          if (bucket.reps[repKey] !== undefined || repsCount < MAX_REPLACEMENT_ALTS) {
            bucket.reps[repKey] = (bucket.reps[repKey] || 0) + 1;
          }
        }
      }
    }
  }

  // -- signal: הסרת מילת קישור מוכרת (קיימת ב-deleted אך פחות ב-inserted).
  STYLE_CONNECTORS.forEach((connector) => {
    const removed = countOccurrences(deletedText, connector) - countOccurrences(insertedText, connector);
    if (removed > 0) signals.removedConnector += 1;
  });

  // -- signal: הוספת סוגריים / השמטה (parenthetical) בטקסט שנוסף.
  const parenInserted = (insertedText.match(/[()]|\.\.\.|…/g) || []).length;
  const parenDeleted = (deletedText.match(/[()]|\.\.\.|…/g) || []).length;
  if (parenInserted > parenDeleted) signals.addedParenthetical += 1;

  // -- signal: דלתא פסיקים/מקפים (עריכת פיסוק) בין המחוק להוכנס.
  const commaInserted = (insertedText.match(/,/g) || []).length;
  const commaDeleted = (deletedText.match(/,/g) || []).length;
  signals.commaAdded = Math.max(0, commaInserted - commaDeleted);
  signals.commaRemoved = Math.max(0, commaDeleted - commaInserted);

  const dashInserted = (insertedText.match(DASH_RE) || []).length;
  const dashDeleted = (deletedText.match(DASH_RE) || []).length;
  signals.dashAdded = Math.max(0, dashInserted - dashDeleted);
  signals.dashRemoved = Math.max(0, dashDeleted - dashInserted);

  // -- signal: פיצול משפט (יותר סימני סוף) עם חפיפה גבוהה.
  const origSentences = splitSentences(original).length;
  const editedSentences = splitSentences(edited).length;
  const sentenceDelta = editedSentences - origSentences;
  if (sentenceDelta > 0 && overlap >= HIGH_OVERLAP_THRESHOLD) {
    signals.shortenedSentence += sentenceDelta;
  }

  // -- שינוי תוכן מספרי (מספרים שנמחקו/נוספו ושונים).
  const origNums = extractNumbers(deletedText);
  const newNums = extractNumbers(insertedText);
  const numbersChanged = origNums.some((n) => !newNums.includes(n)) || newNums.some((n) => !origNums.includes(n));

  // ניקוד: אותות סגנון מול אותות תוכן.
  const styleSignalCount = signals.shortenedSentence
    + signals.removedConnector
    + Object.values(signals.replacedWords).reduce((a, b) => a + b, 0)
    + signals.addedParenthetical;

  let styleEditScore = 0;
  if (overlap >= HIGH_OVERLAP_THRESHOLD) styleEditScore += 1;
  styleEditScore += styleSignalCount * 0.5;

  let contentEditScore = 0;
  if (overlap < HIGH_OVERLAP_THRESHOLD) contentEditScore += 1;
  if (numbersChanged) contentEditScore += 1.5;
  // churn תוכן: הרבה מילים הוחלפו בלי חפיפה — מילות תוכן נכנסות/יוצאות.
  const churnWords = matchWords(deletedText).length + matchWords(insertedText).length;
  if (churnWords >= 12 && overlap < HIGH_OVERLAP_THRESHOLD) contentEditScore += 1;

  let classification;
  if (changeRatio < STYLE_EDIT_RATIO_THRESHOLD && styleEditScore >= contentEditScore) {
    classification = 'style';
  } else if (changeRatio >= STYLE_EDIT_RATIO_THRESHOLD || contentEditScore > styleEditScore) {
    classification = 'content';
  } else {
    classification = 'mixed';
  }

  return {
    changeRatio,
    styleEditScore: round(styleEditScore, 3),
    contentEditScore: round(contentEditScore, 3),
    signals,
    classification,
  };
}

// ---------- diffAfterEdit ----------

// ממזג signals.replacedWords לתוך editCounters.replacedWord (count += count), cap.
function mergeReplacedWords(target, incoming) {
  const out = { ...(isPlainObject(target) ? target : {}) };
  Object.entries(isPlainObject(incoming) ? incoming : {}).forEach(([k, v]) => {
    const key = String(k || '').trim();
    if (!key) return;
    const add = Math.max(0, Math.round(Number(v) || 0));
    if (!add) return;
    if (out[key] === undefined && Object.keys(out).length >= MAX_REPLACED_WORDS) return;
    out[key] = (Number(out[key]) || 0) + add;
  });
  return out;
}

// ממזג signals.replacementPairs לתוך editCounters.replacementPairs (מונים מקוננים per חלופה), cap.
function mergeReplacementPairs(target, incoming) {
  const out = { ...(isPlainObject(target) ? target : {}) };
  Object.entries(isPlainObject(incoming) ? incoming : {}).forEach(([removed, bucket]) => {
    const key = String(removed || '').trim();
    if (!key || !isPlainObject(bucket) || !isPlainObject(bucket.reps)) return;
    if (out[key] === undefined && Object.keys(out).length >= MAX_REPLACEMENT_PAIRS) return;
    const existingReps = isPlainObject(out[key]?.reps) ? { ...out[key].reps } : {};
    Object.entries(bucket.reps).forEach(([rep, count]) => {
      const repKey = String(rep || '').trim();
      const add = Math.max(0, Math.round(Number(count) || 0));
      if (!repKey || !add) return;
      if (existingReps[repKey] === undefined && Object.keys(existingReps).length >= MAX_REPLACEMENT_ALTS) return;
      existingReps[repKey] = (Number(existingReps[repKey]) || 0) + add;
    });
    out[key] = { reps: existingReps };
  });
  return out;
}

// מחזיר את החלופה הנפוצה ביותר עבור מילה שהוסרה, מתוך bucket {reps:{...}}.
function topReplacement(bucket) {
  if (!isPlainObject(bucket) || !isPlainObject(bucket.reps)) return null;
  let bestWord = null;
  let bestCount = 0;
  Object.entries(bucket.reps).forEach(([word, count]) => {
    const n = Number(count) || 0;
    if (n > bestCount) { bestCount = n; bestWord = word; }
  });
  return bestWord ? { replacement: bestWord, count: bestCount } : null;
}

/**
 * מוצא snapshot ממתין למסמך, עושה diff מול הטקסט הנוכחי, מסווג, מעדכן counters,
 * ומחיל את כלל ה-20%. לעולם לא זורק.
 * @param {{docId:string, currentText:string}} args
 * @returns {{changeRatio:number, classification:string, counters:object}|null}
 */
export function diffAfterEdit({ docId, currentText } = {}) {
  if (typeof window === 'undefined') return null;
  const id = String(docId || '').trim();
  const current = String(currentText || '');
  if (!id) return null;

  try {
    const blob = readDeltaStore();
    const idx = blob.pending.findIndex((p) => p.docId === id && !p.diffedAt);
    if (idx === -1) return null;

    const snapshot = blob.pending[idx];
    // אין שינוי (הטקסט שנוצר === הנוכחי) — לא צורכים את ה-snapshot.
    if (current === snapshot.generatedText) return null;

    const result = classifyEdits(snapshot.generatedText, current);
    const { changeRatio, classification, signals } = result;

    // עדכון editCounters בפרופיל.
    const profile = getPersonalStyleProfile();
    const styleEngine = normalizeStyleEngine(profile?.styleEngine);
    const ec = styleEngine.editCounters;

    ec.totalEditsObserved += 1;

    if (changeRatio < STYLE_EDIT_RATIO_THRESHOLD) {
      // אות סגנון — צבירת counters ספציפיים.
      ec.shortenedSentence += signals.shortenedSentence;
      ec.removedConnector += signals.removedConnector;
      ec.replacedWord = mergeReplacedWords(ec.replacedWord, signals.replacedWords);
      ec.replacementPairs = mergeReplacementPairs(ec.replacementPairs, signals.replacementPairs);
      ec.addedParenthetical += signals.addedParenthetical;
      ec.commaAdded = (Number(ec.commaAdded) || 0) + signals.commaAdded;
      ec.commaRemoved = (Number(ec.commaRemoved) || 0) + signals.commaRemoved;
      ec.dashAdded = (Number(ec.dashAdded) || 0) + signals.dashAdded;
      ec.dashRemoved = (Number(ec.dashRemoved) || 0) + signals.dashRemoved;
      ec.editsSinceSynthesis += 1;
      blob.aggregate.styleEdits += 1;
    } else {
      // עריכה משמעותית — gold standard: שמירת הטקסט הערוך כ-chunk זהב.
      try {
        addGoldChunk({ text: current, docId: id, title: 'gold-edit' });
      } catch {}
      blob.aggregate.contentEdits += 1;
    }

    styleEngine.editCounters = ec;
    try {
      savePersonalStyleProfile({ ...profile, styleEngine });
      dispatchProfileUpdated('style-delta-diff');
    } catch {}

    // סימון ה-snapshot כ-diffed.
    blob.pending[idx] = {
      ...snapshot,
      editedText: current,
      diffedAt: nowTs(),
      changeRatio,
      classification,
    };
    writeDeltaStore(blob);

    return { changeRatio, classification, counters: { ...ec } };
  } catch {
    return null;
  }
}

// ---------- getDeltaAggregate ----------

/**
 * @returns {{styleEdits:number, contentEdits:number, editsSinceSynthesis:number, pendingCount:number}}
 */
export function getDeltaAggregate() {
  const blob = readDeltaStore();
  let editsSinceSynthesis = 0;
  try {
    const styleEngine = normalizeStyleEngine(getPersonalStyleProfile()?.styleEngine);
    editsSinceSynthesis = styleEngine.editCounters.editsSinceSynthesis;
  } catch {}
  return {
    styleEdits: blob.aggregate.styleEdits,
    contentEdits: blob.aggregate.contentEdits,
    editsSinceSynthesis,
    pendingCount: blob.pending.filter((p) => !p.diffedAt).length,
  };
}

// ---------- shouldAutoSynthesize ----------

/** @returns {boolean} true כאשר editsSinceSynthesis>=15. */
export function shouldAutoSynthesize() {
  try {
    const styleEngine = normalizeStyleEngine(getPersonalStyleProfile()?.styleEngine);
    return styleEngine.editCounters.editsSinceSynthesis >= AUTO_SYNTHESIS_THRESHOLD;
  } catch {
    return false;
  }
}

// ---------- synthesizeProfileUpdate ----------

function buildCounterSummaryPrompt(ec) {
  const replaced = Object.entries(ec.replacedWord || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w, c]) => `"${w}" (${c})`)
    .join(', ') || 'אין';
  return [
    'אתה מנתח סגנון כתיבה. לפניך ספירת עריכות שהמשתמש ביצע ידנית על טקסט שה-AI כתב עבורו.',
    'העריכות מלמדות על ההעדפות הסגנוניות האמיתיות שלו. נסח 1-3 חוקי סגנון קצרים בעברית',
    'שינחו כתיבה עתידית כך שתתאים לו יותר (למשל "העדף משפטים קצרים", "הימנע מהמילה X").',
    '',
    `פיצולי משפט (קיצור): ${ec.shortenedSentence}`,
    `הסרות מילות קישור: ${ec.removedConnector}`,
    `הוספות סוגריים: ${ec.addedParenthetical}`,
    `מילים שהוחלפו לרוב: ${replaced}`,
    '',
    'החזר JSON בלבד: { "rules": ["...", "..."] }',
  ].join('\n');
}

function parseSynthesisRules(raw) {
  const stripped = String(raw || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  if (!stripped) return [];
  let parsed = null;
  try { parsed = JSON.parse(stripped); } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
  }
  if (!isPlainObject(parsed) || !Array.isArray(parsed.rules)) return [];
  return parsed.rules.map((r) => String(r || '').trim()).filter(Boolean).slice(0, 3);
}

/**
 * ממיר את ה-counters הצבורים לעדכוני פרופיל דטרמיניסטיים (metrics/patterns/blacklist),
 * עם קריאת LLM יחידה אופציונלית לניסוח 1-3 חוקים. שמרני בכוונה (§12 סיכון 2).
 * מאפס editsSinceSynthesis ומעדכן lastSynthesisAt. שומר + dispatch.
 * @param {{invokeModel?:((prompt:string)=>Promise<string>)|null}} opts
 * @returns {Promise<{applied:boolean, deltas:object}>}
 */
export async function synthesizeProfileUpdate({ invokeModel = null } = {}) {
  const profile = getPersonalStyleProfile();
  const styleEngine = normalizeStyleEngine(profile?.styleEngine);
  const ec = styleEngine.editCounters;

  const deltas = { metricsNudged: false, patternsAdded: [], blacklistAdded: [], llmRules: [] };

  // 1. פיצול משפטים חוצה סף → נודג' avgSentenceWords למטה ~10% + דפוס מבנה.
  if (ec.shortenedSentence >= 10) {
    if (isPlainObject(styleEngine.metrics) && Number.isFinite(Number(styleEngine.metrics.avgSentenceWords))
        && Number(styleEngine.metrics.avgSentenceWords) > 0) {
      styleEngine.metrics = {
        ...styleEngine.metrics,
        avgSentenceWords: round(Number(styleEngine.metrics.avgSentenceWords) * 0.9, 2),
      };
      deltas.metricsNudged = true;
    }
    deltas.patternsAdded.push({
      id: 'delta_shorten_sentences',
      label: 'נטייה לקצר משפטים',
      type: 'structure',
      weight: 0.6,
    });
  }

  // 2. הסרות תכופות של מילות קישור → דפוס מבנה בעל weight נמוך (בלי שמות ספציפיים).
  if (ec.removedConnector >= 8) {
    deltas.patternsAdded.push({
      id: 'delta_fewer_connectors',
      label: 'נטייה לצמצם מילות קישור מפורשות',
      type: 'lexical_habit',
      weight: 0.5,
    });
  }

  // 3. מילים שהוחלפו ≥3 פעמים → מועמדות ל-blacklist.user (המילה שהוסרה).
  Object.entries(ec.replacedWord || {}).forEach(([word, count]) => {
    if (Number(count) >= 3 && String(word || '').trim()) deltas.blacklistAdded.push(String(word).trim());
  });

  // 3b. זוגות החלפה — כשחלופה חוזרת ≥3 פעמים למילה מסוימת: למידה חיובית (דפוס),
  // והחלופה מוגנת מ-blacklist (גם אם הצטרפה משם אחר).
  const preferredReplacements = new Set();
  Object.entries(ec.replacementPairs || {}).forEach(([removed, bucket]) => {
    const removedWord = String(removed || '').trim();
    const top = topReplacement(bucket);
    if (!removedWord || !top || top.count < 3) return;
    preferredReplacements.add(top.replacement);
    deltas.patternsAdded.push({
      id: `delta_replace_${removedWord}`,
      label: `מעדיף '${top.replacement}' על '${removedWord}'`,
      type: 'lexical_habit',
      weight: 0.55,
    });
  });
  if (preferredReplacements.size) {
    deltas.blacklistAdded = deltas.blacklistAdded.filter((w) => !preferredReplacements.has(w));
    deltas.preferredReplacements = [...preferredReplacements];
  }

  // 3c. פסיקים/מקפים: נטייה עקבית → נודג' מדד + דפוס איכותני.
  const commaNet = (ec.commaRemoved || 0) - (ec.commaAdded || 0);
  if ((ec.commaRemoved || 0) >= 10 && commaNet > 0) {
    if (isPlainObject(styleEngine.metrics) && Number.isFinite(Number(styleEngine.metrics.avgCommasPerSentence))
        && Number(styleEngine.metrics.avgCommasPerSentence) > 0) {
      styleEngine.metrics = {
        ...styleEngine.metrics,
        avgCommasPerSentence: round(Number(styleEngine.metrics.avgCommasPerSentence) * 0.9, 2),
      };
      deltas.metricsNudged = true;
    }
    deltas.patternsAdded.push({
      id: 'delta_fewer_commas',
      label: 'נטייה להפחית פסיקים',
      type: 'punctuation',
      weight: 0.5,
    });
  } else if ((ec.commaAdded || 0) >= 10 && commaNet < 0) {
    if (isPlainObject(styleEngine.metrics) && Number.isFinite(Number(styleEngine.metrics.avgCommasPerSentence))
        && Number(styleEngine.metrics.avgCommasPerSentence) > 0) {
      styleEngine.metrics = {
        ...styleEngine.metrics,
        avgCommasPerSentence: round(Number(styleEngine.metrics.avgCommasPerSentence) * 1.1, 2),
      };
      deltas.metricsNudged = true;
    }
    deltas.patternsAdded.push({
      id: 'delta_more_commas',
      label: 'נטייה להוסיף פסיקים',
      type: 'punctuation',
      weight: 0.5,
    });
  }

  const dashNet = (ec.dashRemoved || 0) - (ec.dashAdded || 0);
  if ((ec.dashRemoved || 0) >= 10 && dashNet > 0) {
    deltas.patternsAdded.push({
      id: 'delta_fewer_dashes',
      label: 'נטייה להפחית מקפים',
      type: 'punctuation',
      weight: 0.5,
    });
  } else if ((ec.dashAdded || 0) >= 10 && dashNet < 0) {
    deltas.patternsAdded.push({
      id: 'delta_more_dashes',
      label: 'נטייה להוסיף מקפים',
      type: 'punctuation',
      weight: 0.5,
    });
  }

  // 4. קריאת LLM יחידה אופציונלית — 1-3 חוקי סגנון → דפוסים בעלי weight נמוך.
  if (typeof invokeModel === 'function') {
    try {
      const raw = await invokeModel(buildCounterSummaryPrompt(ec));
      const rules = parseSynthesisRules(raw);
      deltas.llmRules = rules;
      rules.forEach((rule, i) => {
        deltas.patternsAdded.push({
          id: `delta_llm_rule_${i + 1}`,
          label: rule,
          type: 'register',
          weight: 0.4,
        });
      });
    } catch {}
  }

  // החלת ה-deltas.
  if (deltas.patternsAdded.length) {
    styleEngine.qualitativePatterns = mergeQualitativePatterns(styleEngine.qualitativePatterns, deltas.patternsAdded);
  }
  if (deltas.blacklistAdded.length || (deltas.preferredReplacements && deltas.preferredReplacements.length)) {
    const removedSet = new Set((styleEngine.blacklist.removed || []).map((s) => String(s).trim()));
    let nextUser = [...(styleEngine.blacklist.user || [])];
    deltas.blacklistAdded.forEach((w) => {
      if (!removedSet.has(w) && !nextUser.includes(w)) nextUser.push(w);
    });
    // מילים שהתבררו כחלופה מועדפת לא נשארות ברשימה השחורה (גם אם הצטרפו ממקור אחר).
    if (deltas.preferredReplacements && deltas.preferredReplacements.length) {
      const preferredSet = new Set(deltas.preferredReplacements);
      nextUser = nextUser.filter((w) => !preferredSet.has(w));
    }
    styleEngine.blacklist = { ...styleEngine.blacklist, user: nextUser };
  }

  // reset מונה הסינתזה + חותמת.
  styleEngine.editCounters = { ...ec, editsSinceSynthesis: 0 };
  styleEngine.lastSynthesisAt = nowTs();

  const nextStyleEngine = normalizeStyleEngine(styleEngine);
  try {
    savePersonalStyleProfile({ ...profile, styleEngine: nextStyleEngine });
    dispatchProfileUpdated('style-delta-synthesis');
  } catch {}

  return { applied: true, deltas };
}

// ---------- clearDeltas ----------

/** מאפס את store ה-deltas (לא נוגע ב-editCounters בפרופיל). */
export function clearDeltas() {
  writeDeltaStore(defaultBlob());
}
