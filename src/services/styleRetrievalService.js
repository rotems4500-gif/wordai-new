// styleRetrievalService.js — מנוע הסגנון האישי (Personal Style Engine), Phase 3 (RAG).
//
// שולף chunks אמיתיים של כתיבת המשתמש מ-styleSampleStore ומזריק אותם לפרומפט
// כך שהמודל יחקה את הטקסט האמיתי של המשתמש — המנוף האיכותי הגדול ביותר (תוכנית §7/§10).
//
// דירוג keyword/TF-IDF מקומי כברירת מחדל + re-rank לגיוון (MMR) שמעדיף chunks
// שונים סגנונית (משפט ארוך + קצר), כדי להראות את השונות של המשתמש ולא את הממוצע.
// mode='llm' אופציונלי בוחר דרך invokeModel; נופל בחזרה ל-MMR מקומי בכל כשל.
//
// LEAF טהור-יחסית: מייבא אך ורק מ-./styleSampleStore ו-./styleProfileService.
// אין ייבוא מ-aiService / workspaceLearningService (סיכון מעגל). עובד בדפדפן (localStorage).
// תוכנית: docs/style-engine-plan.md §7, §4.

import { getChunks } from './styleSampleStore';
// STYLE_CONNECTORS מיובא לתיעוד/עתיד; לא בשימוש ישיר כרגע — נשמר leaf-only import.
// eslint-disable-next-line no-unused-vars
import { STYLE_CONNECTORS } from './styleProfileService';

// ---------- tokenization + stopwords ----------

// stoplist עברי (~40) משוכפל מקומית מ-workspaceLearningService.HEBREW_STOP_WORDS
// (מיחזור לוגיקה, לא ייבוא — שמירה על leaf). ראה workspaceLearningService:1497-1520.
const RETRIEVAL_STOP_WORDS = new Set([
  'של', 'על', 'את', 'זה', 'גם', 'כי', 'אבל', 'או', 'עם', 'לא',
  'אני', 'הוא', 'היא', 'הם', 'הן', 'כך', 'כדי', 'אשר', 'יותר', 'הזה',
  'מה', 'אין', 'יש', 'היה', 'היתה', 'אלה', 'אותו', 'אותה', 'כל', 'רק',
  'עוד', 'כמו', 'אם', 'כאשר', 'לאחר', 'לפני', 'בין', 'תחת', 'מעל', 'אך',
  'אולם',
]);

const MIN_TERM_LENGTH = 3;
// עברית (בלוק U+0590–U+05FF) + latin/ספרות.
const TOKEN_RE = /[֐-׿a-zA-Z0-9]+/g;

/**
 * טוקניזציה לאחזור: מילים עברית/אנגלית ≥3 תווים, latin lowercase, מסונן stopwords.
 * מחזיר את *כל* הטוקנים (לא deduped) — התדירות חשובה ל-TF.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenizeForRetrieval(text) {
  const raw = String(text || '');
  const matches = raw.match(TOKEN_RE) || [];
  const out = [];
  for (const m of matches) {
    const lower = m.toLowerCase();
    if (lower.length < MIN_TERM_LENGTH) continue;
    if (RETRIEVAL_STOP_WORDS.has(lower)) continue;
    out.push(lower);
  }
  return out;
}

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// ---------- IDF + scoring ----------

// term frequency map של chunk (memoized על ה-chunk object דרך WeakMap).
const chunkTfCache = new WeakMap();
function chunkTermFreq(chunk) {
  if (isPlainObject(chunk) && chunkTfCache.has(chunk)) return chunkTfCache.get(chunk);
  const tokens = tokenizeForRetrieval(chunk?.text || '');
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  const entry = { tf, length: tokens.length };
  if (isPlainObject(chunk)) chunkTfCache.set(chunk, entry);
  return entry;
}

/**
 * בונה מפת IDF קלת-משקל מעל קורפוס ה-chunks: idf(term)=log(1 + N/(1+df)).
 * @param {Array<object>} chunks
 * @returns {Map<string,number>}
 */
function buildIdf(chunks) {
  const N = chunks.length;
  const df = new Map();
  for (const chunk of chunks) {
    const { tf } = chunkTermFreq(chunk);
    for (const term of tf.keys()) df.set(term, (df.get(term) || 0) + 1);
  }
  const idf = new Map();
  for (const [term, d] of df) idf.set(term, Math.log(1 + N / (1 + d)));
  return idf;
}

/**
 * ניקוד רלוונטיות TF-IDF-ish של chunk מול קבוצת מונחי השאילתה.
 * boost קטן ל-chunks שחולקים chunk.terms (מונחי תוכן מחושבים מראש) עם השאילתה.
 * מנורמל ב-sqrt(אורך ה-chunk) כדי להימנע מהטיה לטובת chunks ארוכים.
 * @param {object} chunk
 * @param {Set<string>} queryTermsSet
 * @param {Map<string,number>} [idf]
 * @returns {number}
 */
export function scoreChunkRelevance(chunk, queryTermsSet, idf = null) {
  if (!isPlainObject(chunk) || !(queryTermsSet instanceof Set) || !queryTermsSet.size) return 0;
  const { tf, length } = chunkTermFreq(chunk);
  if (!length) return 0;
  let score = 0;
  for (const term of queryTermsSet) {
    const f = tf.get(term);
    if (!f) continue;
    const weight = idf && idf.has(term) ? idf.get(term) : 1;
    score += f * weight;
  }
  // boost על מונחי תוכן מחושבים מראש (chunk.terms).
  if (Array.isArray(chunk.terms) && chunk.terms.length) {
    let termHits = 0;
    for (const t of chunk.terms) {
      if (queryTermsSet.has(String(t || '').toLowerCase())) termHits += 1;
    }
    if (termHits) score += termHits * 0.5;
  }
  // נרמול נגד הטיית אורך.
  return score / Math.sqrt(length);
}

// ---------- MMR similarity ----------

const jaccard = (aArr, bArr) => {
  const a = new Set((aArr || []).map((t) => String(t || '').toLowerCase()).filter(Boolean));
  const b = new Set((bArr || []).map((t) => String(t || '').toLowerCase()).filter(Boolean));
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
};

// דמיון סגנוני בין שני chunks: קרבת avgSentenceWords (מנורמל /20) + Jaccard על terms.
function chunkSimilarity(a, b) {
  const la = Number(a?.metricsLite?.avgSentenceWords) || 0;
  const lb = Number(b?.metricsLite?.avgSentenceWords) || 0;
  const lenDiff = Math.min(1, Math.abs(la - lb) / 20);
  const lenSim = 1 - lenDiff;
  const termSim = jaccard(a?.terms, b?.terms);
  // שקלול: אורך משפט הוא הציר הסגנוני העיקרי; terms משלים.
  return (lenSim * 0.6) + (termSim * 0.4);
}

// ---------- MMR selection ----------

const MMR_LAMBDA = 0.7;

function mmrSelect(scored, k) {
  // scored: [{chunk, relevance}] ממויין יורד לפי relevance.
  const selected = [];
  const pool = [...scored];
  while (selected.length < k && pool.length) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < pool.length; i += 1) {
      const cand = pool[i];
      let maxSim = 0;
      for (const pick of selected) {
        const sim = chunkSimilarity(cand.chunk, pick.chunk);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = (MMR_LAMBDA * cand.relevance) - ((1 - MMR_LAMBDA) * maxSim);
      if (mmr > bestVal) { bestVal = mmr; bestIdx = i; }
    }
    selected.push(pool.splice(bestIdx, 1)[0]);
  }
  return selected;
}

// מבטיח לפחות chunk gold אחד: אם קיים gold בקורפוס ואף אחד לא נבחר,
// מחליף את הנבחר בעל הרלוונטיות הנמוכה ב-gold בעל הרלוונטיות הגבוהה.
function ensureGold(selected, scored) {
  if (selected.some((s) => s.chunk?.isGold)) return selected;
  const goldCandidates = scored.filter((s) => s.chunk?.isGold);
  if (!goldCandidates.length) return selected;
  const topGold = goldCandidates[0]; // scored כבר ממויין יורד
  if (!selected.length) return [topGold];
  let lowestIdx = 0;
  for (let i = 1; i < selected.length; i += 1) {
    if (selected[i].relevance < selected[lowestIdx].relevance) lowestIdx = i;
  }
  const next = [...selected];
  next[lowestIdx] = topGold;
  return next;
}

// ---------- LLM mode ----------

const truncateWords = (text, maxWords) => {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}…`;
};

const LLM_CANDIDATE_POOL = 12;

function parseIndicesTolerant(raw, max) {
  const pick = (arr) => Array.from(new Set(
    (Array.isArray(arr) ? arr : [])
      .map((n) => Math.round(Number(n)))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < max),
  ));
  const text = String(raw || '');
  // ניסיון 1: JSON תקין {indices:[...]} או מערך גולמי.
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) return pick(parsed);
      if (isPlainObject(parsed) && Array.isArray(parsed.indices)) return pick(parsed.indices);
    }
  } catch {}
  // ניסיון 2: כל המספרים בטקסט.
  const nums = text.match(/\d+/g);
  return pick(nums);
}

async function selectChunksLlm({ requestText, candidates, k, invokeModel }) {
  const pool = candidates.slice(0, LLM_CANDIDATE_POOL);
  const listing = pool
    .map((s, i) => `[${i}] (${Math.round(Number(s.chunk?.metricsLite?.avgSentenceWords) || 0)} מ׳/משפט) "${truncateWords(s.chunk?.text, 45)}"`)
    .join('\n');
  const prompt = [
    'בחר את הקטעים שמייצגים בצורה הטובה ביותר מגוון סגנוני של אותו כותב, עבור הבקשה הבאה.',
    `הבקשה: "${truncateWords(requestText, 40)}"`,
    '',
    'קטעים מועמדים (מספור באינדקס):',
    listing,
    '',
    `החזר JSON בלבד בפורמט {"indices":[...]} עם ${k} האינדקסים הטובים ביותר לגיוון סגנוני (אורכי משפט שונים, קצב שונה). ללא הסבר.`,
  ].join('\n');

  const raw = await invokeModel(prompt);
  const indices = parseIndicesTolerant(raw, pool.length);
  if (!indices.length) throw new Error('llm returned no usable indices');
  return indices.slice(0, k).map((i) => pool[i]);
}

// ---------- selectChunks ----------

/**
 * בוחר עד k chunks אמיתיים של המשתמש, מגוונים סגנונית, הרלוונטיים לבקשה.
 * @param {string} requestText
 * @param {{k?:number, mode?:('local'|'llm'), chunks?:(Array<object>|null), invokeModel?:(function|null)}} opts
 * @returns {Promise<Array<object>>}
 */
export async function selectChunks(requestText, { k = 4, mode = 'local', chunks = null, invokeModel = null, genre = null } = {}) {
  const corpus = Array.isArray(chunks) ? chunks.filter(isPlainObject) : getChunks();
  if (!corpus.length) return [];

  const kClamped = Math.max(1, Math.min(Number(k) || 4, corpus.length));
  const queryTermsSet = new Set(tokenizeForRetrieval(requestText));
  // E3 — כשיש ז'אנר תואם: boost רלוונטיות ל-chunks מאותו ז'אנר (×1.4) ול-gold (×1.15).
  const targetGenre = genre ? String(genre).trim() : '';

  const idf = buildIdf(corpus);
  const scored = corpus
    .map((chunk) => {
      let relevance = scoreChunkRelevance(chunk, queryTermsSet, idf);
      if (targetGenre) {
        if (String(chunk?.genre || '').trim() === targetGenre) relevance *= 1.4;
        if (chunk?.isGold) relevance *= 1.15;
      }
      return { chunk, relevance };
    })
    .sort((a, b) => b.relevance - a.relevance);

  // אם אין חפיפת מונחים בכלל, relevance=0 לכולם — עדיין נבחר לפי גיוון (MMR על סדר יציב).

  let selected;
  if (mode === 'llm' && typeof invokeModel === 'function') {
    try {
      selected = await selectChunksLlm({ requestText, candidates: scored, k: kClamped, invokeModel });
    } catch {
      selected = mmrSelect(scored, kClamped);
    }
  } else {
    selected = mmrSelect(scored, kClamped);
  }

  selected = ensureGold(selected, scored);
  return selected.map((s) => s.chunk).filter(Boolean);
}

// ---------- buildChunkInjectionText ----------

const INJECTION_CHUNK_WORDS = 120;   // חיתוך לכל chunk
const INJECTION_TOTAL_WORDS = 700;   // תקרה כוללת

/**
 * בונה בלוק הזרקה עברי שמסמן את ה-chunks כדוגמאות כתיבה אמיתיות.
 * '' אם ריק. תקרה ~700 מילים בסך הכל, ~120 לכל chunk.
 * @param {Array<object>} chunks
 * @returns {string}
 */
export function buildChunkInjectionText(chunks) {
  const list = Array.isArray(chunks) ? chunks.filter(isPlainObject) : [];
  if (!list.length) return '';

  const header = 'דוגמאות אמיתיות לכתיבה שלך (חקה מהן קצב, אורך משפטים, מעברים ובחירת מילים — אל תעתיק תוכן, כתוב על הנושא שהתבקש):';
  const lines = [header];
  let budget = INJECTION_TOTAL_WORDS;
  for (const chunk of list) {
    if (budget <= 0) break;
    const perChunk = Math.min(INJECTION_CHUNK_WORDS, budget);
    const snippet = truncateWords(chunk.text, perChunk);
    if (!snippet) continue;
    lines.push(`▸ "${snippet}"`);
    budget -= (String(snippet).split(/\s+/).filter(Boolean).length);
  }
  if (lines.length === 1) return '';
  return lines.join('\n');
}

// ---------- selectExemplarSentences ----------

const SENTENCE_SPLIT_RE = /(?<=[.!?׃])\s+/;

/**
 * בוחר עד `count` משפטים "טיפוסיים" מתוך chunks, בטווח אורך [mean-std, mean+std]
 * (5-40 מילים), עם עדיפות לגיוון אורכים (לא כולם קרובים לממוצע).
 * '' / [] בכל כשל/קלט חסר — לעולם לא זורק.
 * @param {Array<object>} chunks
 * @param {{mean?:number, std?:number, count?:number}} opts
 * @returns {string[]}
 */
export function selectExemplarSentences(chunks, { mean, std, count = 3 } = {}) {
  const list = Array.isArray(chunks) ? chunks.filter(isPlainObject) : [];
  if (!list.length || !Number.isFinite(mean)) return [];

  const stdVal = Number.isFinite(std) && std > 0 ? std : mean * 0.4;
  const low = Math.max(5, mean - stdVal);
  const high = Math.min(40, mean + stdVal);

  const seen = new Set();
  const candidates = [];
  for (const chunk of list) {
    const text = String(chunk?.text || '').trim();
    if (!text) continue;
    const sentences = text.split(SENTENCE_SPLIT_RE);
    for (const raw of sentences) {
      const sentence = raw.trim().replace(/^["'״]+|["'״]+$/g, '');
      if (!sentence) continue;
      const wordCount = sentence.split(/\s+/).filter(Boolean).length;
      if (wordCount < 5 || wordCount > 40) continue;
      if (wordCount < low || wordCount > high) continue;
      const key = sentence.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ sentence, wordCount, dist: Math.abs(wordCount - mean) });
    }
  }
  if (!candidates.length) return [];

  candidates.sort((a, b) => a.dist - b.dist);

  // גיוון: לא לבחור כולם צמודים לממוצע — לפזר על פני הטווח.
  const selected = [];
  const pool = [...candidates];
  while (selected.length < count && pool.length) {
    if (!selected.length) {
      selected.push(pool.shift());
      continue;
    }
    let bestIdx = 0;
    let bestSpread = -Infinity;
    for (let i = 0; i < pool.length; i += 1) {
      let minDiff = Infinity;
      for (const pick of selected) {
        const diff = Math.abs(pool[i].wordCount - pick.wordCount);
        if (diff < minDiff) minDiff = diff;
      }
      if (minDiff > bestSpread) { bestSpread = minDiff; bestIdx = i; }
    }
    selected.push(pool.splice(bestIdx, 1)[0]);
  }

  return selected.map((s) => s.sentence);
}
