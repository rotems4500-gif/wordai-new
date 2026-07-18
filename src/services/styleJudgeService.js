// styleJudgeService.js — מנוע הסגנון האישי (Personal Style Engine), Phase 4 (שופט + rewrite).
//
// שופט התאמת-סגנון היברידי: ציון 0-100 שבו 100 = חיקוי מושלם של הכותב, 0 = AI מוחלט.
// חצי מקומי (חינם, תמיד): היפוך פולריות של גלאי ה-AI + השוואת התפלגות המדדים מול
// הפרופיל, בדגש על **שונות** (sentenceLengthCV) — לב שאלת ה-burstiness (תוכנית §8/§10 פת.3).
// חצי LLM (מותנה): השוואה מול 2-3 דוגמאות גולמיות של הכותב, מגודר לטווח אפור / tier מעמיק.
// כשהציון ≤70 והמנוע פעיל — לולאת rewrite אוטומטית שמכוונת לסגנון (מיחזור מכניקת runHumanizerLoop).
//
// LEAF: מייבא אך ורק מ-./styleAuthenticityService, ./styleProfileService, ./styleRetrievalService.
// אין ייבוא מ-aiService — גישת ה-LLM מוזרקת דרך callback invokeModel (מונע מעגל + contamination).
// עובד בדפדפן. תוכנית מלאה: docs/style-engine-plan.md §8, §10.

import { scoreTextAuthenticity } from './styleAuthenticityService';
import { computeLocalMetrics, buildStyleEngineInjectionBlock } from './styleProfileService';
import { selectChunks, buildChunkInjectionText, selectExemplarSentences } from './styleRetrievalService';

// ---------- עזרי בסיס ----------

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const clamp01 = (value) => clamp(value, 0, 1);
const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

// אורך טקסט נקי (בלי תגיות) — להשוואת מועמד מול מקור בלולאת ה-rewrite.
const plainLen = (value = '') => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;

// חילוץ הביטוי המצוטט מתוך label של דפוס ("...\"ניתן לראות כי\"..." → "ניתן לראות כי").
const extractQuotedPhrase = (label = '') => {
  const m = String(label || '').match(/["“”״'׳]([^"“”״'׳]{2,60})["“”״'׳]/);
  return m ? m[1].trim() : '';
};

// ---------- scoreStyleMatchLocal ----------

// חילוץ "ביטוי-ליבה" מתוך label של דפוס לצורך חיפוש בטקסט: קודם המצוטט, אחרת
// הסרת קידומת תיאורית ("ביטוי אופייני:"/"נטייה:") ולקיחת מה שנשאר.
const extractCorePhrase = (label = '') => {
  const quoted = extractQuotedPhrase(label);
  if (quoted) return quoted;
  const s = String(label || '').replace(/^[^:：]{0,24}[:：]\s*/, '').trim();
  return s;
};

// מפרט מדדי-קצב שהשופט משווה: [key, floorStd]. ה-floorStd מגדיר סקאלת z כאשר
// אין פיזור-קורפוס (metricsSpread מכיל std רק ל-avgSentenceWords/sentenceLengthCV/
// avgParagraphWords — לשאר נשען על ה-floor).
const METRIC_SPECS = [
  ['avgSentenceWords', 3],
  ['sentenceLengthCV', 0.12],
  ['avgCommasPerSentence', 0.6],
  ['parenthesesDensity', 1.0],
  ['avgParagraphWords', 15],
  ['openerRepetitionRate', 0.1],
  ['typeTokenRatio', 0.08],
  ['pctShortSentences', 8],
  ['oneWordSentenceRate', 0.04],
];

// blacklist פעיל (auto+user פחות removed) שנמצא בפועל בטקסט.
function findBlacklistedInText(text, styleEngine) {
  const bl = isPlainObject(styleEngine?.blacklist) ? styleEngine.blacklist : {};
  const removed = new Set((Array.isArray(bl.removed) ? bl.removed : []).map((s) => String(s || '').trim()));
  const banned = [
    ...(Array.isArray(bl.auto) ? bl.auto : []),
    ...(Array.isArray(bl.user) ? bl.user : []),
  ].map((s) => String(s || '').trim()).filter((s) => s && !removed.has(s));
  const hay = String(text || '');
  const found = [];
  const seen = new Set();
  for (const phrase of banned) {
    if (seen.has(phrase)) continue;
    seen.add(phrase);
    if (hay.includes(phrase)) found.push(phrase);
  }
  return found.slice(0, 12);
}

/**
 * ניקוד התאמת-סגנון מקומי (חינם, ללא LLM) — variance-normalized ו**self-consistent**:
 * מסמך מהקורפוס שממנו נבנה הפרופיל אמור לקבל ציון גבוה מול הפרופיל של עצמו.
 * הבאג הישן: humanScore = 100 - scoreTextAuthenticity(text) — גלאי ה-AI מסמן עברית
 * אקדמית פורמלית כ-AI, כך שהמדד נלחם בעצמו. כאן ה-authenticity **הוסר לחלוטין**.
 *
 * הרכבה: 0.45*metricMatch (מרחק-z גאוסיאני מנורמל לפי פיזור-הקורפוס) +
 *        0.25*connectorSignature (חפיפת מילות-קישור + ביטויי-חתימה) +
 *        0.18*negSpaceCompliance (הימנעות מהפרות negative-space) +
 *        0.12*antiCliche (הימנעות מ-blacklist).
 * @param {string} text
 * @param {object} styleEngine
 * @returns {{score:number, breakdown:object, penalties:Array<{key:string,label:string,severity:number}>}}
 */
export function scoreStyleMatchLocal(text, styleEngine, genre = null) {
  const se = isPlainObject(styleEngine) ? styleEngine : {};
  const penalties = [];

  const tMetrics = computeLocalMetrics(text);
  if (!tMetrics) return { score: 50, breakdown: { reason: 'too-short' }, penalties: [] };

  // מודעות ז'אנר: אם קיים פרופיל-משנה לז'אנר המבוקש — משווים מולו (metrics+spread),
  // אחרת נופלים לפרופיל הגלובלי. connectors/blacklist/negativeSpace נשארים גלובליים.
  const genreProfiles = isPlainObject(se.genreProfiles) ? se.genreProfiles : {};
  const gKey = genre ? String(genre).trim() : '';
  const gp = gKey && isPlainObject(genreProfiles[gKey]) ? genreProfiles[gKey] : null;
  const P = isPlainObject(gp?.metrics) ? gp.metrics : (isPlainObject(se.metrics) ? se.metrics : {});
  const S = isPlainObject(gp?.metricsSpread) ? gp.metricsSpread : (isPlainObject(se.metricsSpread) ? se.metricsSpread : {});

  // (1) metricMatch 0-1 — מרחק-z גאוסיאני מנורמל לפי פיזור-הקורפוס.
  const matches = [];
  for (const [key, floorStd] of METRIC_SPECS) {
    const mean = Number(P[key]);
    const tVal = Number(tMetrics[key]);
    if (!Number.isFinite(mean) || !Number.isFinite(tVal)) continue;
    const std = Math.max(Number(S[key]?.std) || 0, floorStd);
    const z = Math.min(Math.abs(tVal - mean) / std, 4);
    matches.push({ key, m: Math.exp(-0.5 * z * z), z: round(z, 3) });
  }
  const metricMatch = matches.length
    ? matches.reduce((s, x) => s + x.m, 0) / matches.length
    : 0.6; // ניטרלי אם אין מדדים משותפים

  // (2) connectorSignature 0-1 — חפיפת מילות-קישור + ביטויי-חתימה.
  const pConn = Object.keys(isPlainObject(P.connectorFrequency) ? P.connectorFrequency : {});
  const tConn = Object.keys(isPlainObject(tMetrics.connectorFrequency) ? tMetrics.connectorFrequency : {});
  let connectorScore;
  if (!pConn.length) {
    connectorScore = 0.6;
  } else {
    const tSet = new Set(tConn);
    const inter = pConn.filter((k) => tSet.has(k)).length;
    const hit = inter / Math.min(pConn.length, 6);
    connectorScore = clamp(0.3 + 0.7 * hit, 0, 1);
  }
  const sigPatterns = (Array.isArray(se.qualitativePatterns) ? se.qualitativePatterns : [])
    .filter((p) => isPlainObject(p) && (p.type === 'signature_phrase' || p.type === 'lexical_habit'));
  const sigPhrases = sigPatterns.map((p) => extractCorePhrase(p.label)).filter((s) => s && s.length >= 2);
  const hay = String(text || '');
  const sigHit = sigPhrases.length
    ? sigPhrases.filter((ph) => hay.includes(ph)).length / sigPhrases.length
    : null;
  const connectorSignature = sigHit === null
    ? connectorScore
    : 0.6 * connectorScore + 0.4 * clamp(0.3 + 0.7 * sigHit, 0, 1);

  // (3) negSpaceCompliance 0-1 — הפרות של אזורים שהכותב נמנע מהם.
  const neg = (Array.isArray(se.negativeSpace) ? se.negativeSpace : []).map((s) => String(s || '')).join(' ');
  const pRhet = Number(P.rhetoricalQuestionRate);
  const pExcl = Number(P.exclamationRate);
  const pOne = Number(P.oneWordSentenceRate);
  const negViolations = [];
  if ((/רטורי|שאל/.test(neg) || (Number.isFinite(pRhet) && pRhet < 0.02)) && toNum(tMetrics.rhetoricalQuestionRate) > 0.03) {
    negViolations.push({ key: 'neg_rhetorical', label: 'שאלות רטוריות — הכותב נמנע מהן' });
  }
  if ((/קריאה|סימן/.test(neg) || (Number.isFinite(pExcl) && pExcl < 0.01)) && toNum(tMetrics.exclamationRate) > 0.005) {
    negViolations.push({ key: 'neg_exclaim', label: 'סימני קריאה — הכותב נמנע מהם' });
  }
  if ((/מילה אחת|קצר/.test(neg) || (Number.isFinite(pOne) && pOne < 0.02)) && toNum(tMetrics.oneWordSentenceRate) > 0.06) {
    negViolations.push({ key: 'neg_oneword', label: 'משפטים בני מילה אחת — הכותב נמנע מהם' });
  }
  const negSpaceCompliance = 1 - Math.min(negViolations.length * 0.34, 1);

  // (4) antiCliche 0-1 — הימנעות מביטויי blacklist.
  const foundBanned = findBlacklistedInText(text, se);
  const antiCliche = 1 - Math.min(foundBanned.length * 0.2, 1);

  // הרכבה.
  const raw = 0.45 * metricMatch + 0.25 * connectorSignature + 0.18 * negSpaceCompliance + 0.12 * antiCliche;
  const score = Math.round(clamp(raw * 100, 0, 100));

  // ---------- penalties מהרכיבים החלשים ביותר ----------
  // הסטיות הגדולות ביותר (z גבוה) → קנס מדד.
  [...matches].sort((a, b) => b.z - a.z).slice(0, 2).forEach((mm) => {
    if (mm.z >= 1) {
      penalties.push({ key: `metric_${mm.key}`, label: `סטייה ב-${mm.key} מהקצב האופייני`, severity: clamp01(mm.z / 4) });
    }
  });
  // הפרות negative-space.
  negViolations.forEach((v) => penalties.push({ key: v.key, label: v.label, severity: 0.8 }));
  // ביטויי blacklist שנמצאו.
  foundBanned.forEach((phrase) => penalties.push({ key: 'blacklist', label: `ביטוי מ-blacklist: ${phrase}`, severity: 0.7, detail: phrase }));
  // חולשת מילות-קישור/ביטויי-חתימה.
  if (connectorSignature < 0.7) {
    penalties.push({ key: 'connectors', label: 'חסרות מילות הקישור/ביטויי-החתימה האופייניים', severity: clamp01(1 - connectorSignature) });
  }

  const breakdown = {
    metricMatch: round(metricMatch, 3),
    connectorSignature: round(connectorSignature, 3),
    negSpaceCompliance: round(negSpaceCompliance, 3),
    antiCliche: round(antiCliche, 3),
    metricZ: matches,
    foundBanned,
    genreUsed: gp ? gKey : null,
  };

  // מיון קנסות לפי severity יורד, dedupe לפי key (חוץ מ-blacklist שמצטבר).
  const seenKeys = new Set();
  const sortedPenalties = penalties
    .sort((a, b) => toNum(b.severity) - toNum(a.severity))
    .filter((p) => {
      if (p.key === 'blacklist') return true;
      if (seenKeys.has(p.key)) return false;
      seenKeys.add(p.key);
      return true;
    })
    .map((p) => ({ key: p.key, label: p.label, severity: round(toNum(p.severity, 0.5), 2), ...(p.detail ? { detail: p.detail } : {}) }));

  return { score, breakdown, penalties: sortedPenalties };
}

// ---------- scoreStyleMatchLLM (פנימי) ----------

const stripJsonFences = (raw) => String(raw || '')
  .replace(/```(?:json)?\s*/gi, '')
  .replace(/```/g, '')
  .trim();

// פענוח סובלני של רובריקה פר-ממד {"rhythm","connectors","register","structure","overall","reason"}.
// overall מועדף; אם חסר — ממוצע ארבעת הממדים. תאימות לאחור: גם {"score":..}.
function parseLlmScore(raw) {
  const stripped = stripJsonFences(raw);
  if (!stripped) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = null; } }
  }
  if (isPlainObject(parsed)) {
    const dims = ['rhythm', 'connectors', 'register', 'structure']
      .map((k) => Number(parsed[k]))
      .filter((n) => Number.isFinite(n));
    let val = null;
    if (Number.isFinite(Number(parsed.overall))) val = Number(parsed.overall);
    else if (Number.isFinite(Number(parsed.score))) val = Number(parsed.score);
    else if (dims.length) val = dims.reduce((s, n) => s + n, 0) / dims.length;
    if (val !== null && Number.isFinite(val)) {
      return {
        score: clamp(Math.round(val), 0, 100),
        reason: String(parsed.reason || '').trim(),
        dims: { rhythm: parsed.rhythm, connectors: parsed.connectors, register: parsed.register, structure: parsed.structure },
      };
    }
  }
  // fallback: המספר הראשון 0-100 בטקסט.
  const num = stripped.match(/\b(100|\d{1,2})\b/);
  if (num) return { score: clamp(Math.round(Number(num[1])), 0, 100), reason: '' };
  return null;
}

const truncateWords = (text, maxWords) => {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}…`;
};

// שים לב: **לא** בולע חריגות מ-invokeModel. הקורא (scoreStyleMatch) עוטף ומבחין בין
// "invokeModel זרק" (llm-threw) לבין "החזיר טקסט לא-פענוֹח" (llm-unparseable) — כדי
// שהדגרדציה השקטה ל-usedLlm:false תהיה גלויה דרך llmSkipReason.
async function scoreStyleMatchLLM({ text, sampleTexts, invokeModel }) {
  const samples = (Array.isArray(sampleTexts) ? sampleTexts : [])
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .slice(0, 3);
  if (!samples.length || typeof invokeModel !== 'function') return null;

  const prompt = [
    'לפניך "דוגמאות עוגן" — קטעים אמיתיים שכתב אדם מסוים, ו"טקסט לבדיקה".',
    'דרג 0-100 עד כמה הטקסט לבדיקה תואם את טביעת האצבע הסגנונית של הדוגמאות — לא איכות, לא שטף עברית, אלא: קצב ואורך משפטים, בחירת מילות קישור, רמת רגיסטר, אופן ציטוט, מבנה פסקה. טקסט תקין וקולח אך בסגנון שונה מהדוגמאות חייב לקבל ציון נמוך.',
    'החזר JSON בלבד: {"rhythm":0-100,"connectors":0-100,"register":0-100,"structure":0-100,"overall":0-100,"reason":"..."}',
    '--- דוגמאות עוגן ---',
    ...samples.map((s, i) => `[${i + 1}] "${truncateWords(s, 90)}"`),
    '--- טקסט לבדיקה ---',
    truncateWords(text, 220),
  ].join('\n');

  const raw = await invokeModel(prompt); // עשוי לזרוק — במכוון לא נבלע כאן.
  return parseLlmScore(raw);
}

// ---------- scoreStyleMatch (היברידי) ----------

/**
 * ציון התאמת-סגנון היברידי. מחשב תמיד מקומי; חצי LLM רץ רק כאשר mode='deep'
 * או (mode='auto' והציון המקומי בטווח האפור 55-80), invokeModel קיים ודוגמאות זמינות.
 * @param {string} text
 * @param {{styleEngine?:object, invokeModel?:(function|null), mode?:('auto'|'deep'|'local'), samples?:(Array|null)}} opts
 * @returns {Promise<{score:number, local:number, llm:(number|null), usedLlm:boolean, penalties:Array}>}
 */
export async function scoreStyleMatch(text, { styleEngine = null, invokeModel = null, mode = 'auto', samples = null, genre = null } = {}) {
  const se = isPlainObject(styleEngine) ? styleEngine : {};
  const localResult = scoreStyleMatchLocal(text, se, genre);
  const localScore = localResult.score;

  const inGrayBand = localScore >= 55 && localScore <= 80;
  const wantLlm = mode !== 'local'
    && typeof invokeModel === 'function'
    && (mode === 'deep' || (mode === 'auto' && inGrayBand));

  let llmScore = null;
  let usedLlm = false;
  // סיבת הדילוג על שופט ה-LLM — הופך את הדגרדציה השקטה (usedLlm:false) לגלויה.
  let llmSkipReason = '';
  if (mode === 'local') llmSkipReason = 'mode-local';
  else if (typeof invokeModel !== 'function') llmSkipReason = 'no-invokeModel';
  else if (!wantLlm) llmSkipReason = 'local-outside-gray-band';

  if (wantLlm) {
    // דוגמאות: מהפרמטר, אחרת מ-selectChunks (שנופל ל-getChunks המלא כשאין חפיפת מונחים).
    let sampleTexts = null;
    if (Array.isArray(samples) && samples.length) {
      sampleTexts = samples.map((s) => (isPlainObject(s) ? String(s.text || '') : String(s || ''))).filter(Boolean);
      if (!sampleTexts.length) llmSkipReason = 'empty-passed-samples';
    } else {
      try {
        const chunks = await selectChunks(text, { k: 3 });
        sampleTexts = (Array.isArray(chunks) ? chunks : []).map((c) => String(c?.text || '')).filter(Boolean);
        if (!sampleTexts.length) llmSkipReason = 'no-chunks-in-store';
      } catch {
        sampleTexts = [];
        llmSkipReason = 'samples-fetch-threw';
      }
    }
    if (sampleTexts && sampleTexts.length) {
      try {
        const llmRes = await scoreStyleMatchLLM({ text, sampleTexts, invokeModel });
        if (llmRes && Number.isFinite(llmRes.score)) {
          llmScore = llmRes.score;
          usedLlm = true;
          llmSkipReason = '';
        } else {
          llmSkipReason = 'llm-unparseable';
        }
      } catch {
        // invokeModel זרק (rate-limit / abort / provider) — עכשיו גלוי במקום להיבלע.
        llmSkipReason = 'llm-threw';
      }
    }
  }

  const finalScore = usedLlm
    ? Math.round(clamp(0.5 * localScore + 0.5 * llmScore, 0, 100))
    : localScore;

  return {
    score: finalScore,
    local: localScore,
    llm: llmScore,
    usedLlm,
    llmSkipReason,
    breakdown: localResult.breakdown,
    penalties: localResult.penalties,
  };
}

// ---------- buildStyleRepairPrompt ----------

// הוראת תיקון עברית ממוקדת לכל key של קנס.
function repairDirective(penalty, ctx) {
  const key = penalty?.key || '';
  const detail = penalty?.detail || '';
  const metrics = isPlainObject(ctx?.metrics) ? ctx.metrics : {};
  // קנסות מדד חדשים (variance-normalized): metric_<key>.
  if (key.startsWith('metric_')) {
    const metric = key.slice('metric_'.length);
    if (metric === 'sentenceLengthCV') {
      return 'שונות אורכי המשפט חורגת מהאופייני — כוונן: שלב משפטים קצרים לצד ארוכים כמו הכותב.';
    }
    if (metric === 'avgSentenceWords') {
      return 'אורך המשפט הממוצע חורג מהאופייני לכותב — קרב אותו לקצב האישי.';
    }
    if (metric === 'avgParagraphWords') {
      const avgParagraphWords = Number(metrics.avgParagraphWords);
      return Number.isFinite(avgParagraphWords)
        ? `אורך פסקאות לא תואם — כוונן פסקאות לכ-${Math.round(avgParagraphWords)} מילים בממוצע.`
        : 'אורך הפסקאות חורג מהאופייני לכותב — התאם את גודל הפסקה.';
    }
    if (metric === 'avgCommasPerSentence' || metric === 'parenthesesDensity') {
      const avgCommasPerSentence = Number(metrics.avgCommasPerSentence);
      return (metric === 'avgCommasPerSentence' && Number.isFinite(avgCommasPerSentence))
        ? `צפיפות פסיקים לא תואמת — כוונן לכ-${round(avgCommasPerSentence, 1)} פסיקים למשפט בממוצע.`
        : 'צפיפות הפיסוק (פסיקים/סוגריים) חורגת מהאופייני לכותב — כוונן אותה.';
    }
    return 'קצב הכתיבה חורג מהאופייני לכותב — קרב אותו לפרופיל האישי.';
  }
  switch (key) {
    case 'connectors':
      return ctx.connectors.length
        ? `השתמש במילות הקישור האופייניות לכותב: ${ctx.connectors.join(', ')}.`
        : 'התאם את מילות הקישור וביטויי-החתימה לסגנון הכותב.';
    case 'uniform_sentences':
    case 'avg_sentence_len':
    case 'uniformity':
      return 'אורכי המשפטים אחידים מדי — צור שונות: שלב משפט קצר מאוד ליד משפט ארוך, אל תאחיד.';
    case 'missing_signature':
      return ctx.topPatterns.length
        ? `שלב ביטויים אופייניים לכותב: ${ctx.topPatterns.join('; ')}.`
        : 'שלב ביטויי-חתימה אופייניים לכותב.';
    case 'blacklist':
    case 'cliche':
      return detail
        ? `הסר לחלוטין את הביטויים: ${detail}.`
        : 'הסר קלישאות וביטויים גנריים.';
    case 'neg_rhetorical':
      return 'הסר שאלות רטוריות — הכותב לעולם לא משתמש בהן.';
    case 'neg_exclaim':
      return 'הסר סימני קריאה (!) — הכותב לעולם לא משתמש בהם.';
    case 'neg_oneword':
      return 'הסר משפטים בני מילה אחת — הכותב לא משתמש בהם.';
    case 'connector_divergence':
    case 'formalConnector':
      return ctx.connectors.length
        ? `השתמש במילות הקישור האופייניות לכותב: ${ctx.connectors.join(', ')}.`
        : 'התאם את מילות הקישור לסגנון הכותב.';
    case 'opener_repetition':
    case 'openerRepeat':
      return 'גוון את פתיחי המשפטים — אל תפתח שני משפטים סמוכים באותה מילה/מבנה.';
    case 'lowRichness':
      return 'גוון את אוצר המילים — אל תחזור על אותם ביטויים.';
    case 'structural':
      return 'הפחת מבנה מלוטש-מדי (מקפים, סוגריים מבארות, מרכאות-הדגשה).';
    case 'personalMismatch':
      return 'קרב את הטקסט לקול, לאוצר המילים ולקצב האישי של הכותב.';
    default:
      return penalty?.label ? String(penalty.label) : '';
  }
}

/**
 * בונה פרומפט rewrite עברי מהקנסות הספציפיים שנכשלו + בלוק ההזרקה המלא של הפרופיל.
 * @param {string} text
 * @param {Array<{key:string,label:string,severity:number,detail?:string}>} penalties
 * @param {object} styleEngine
 * @returns {string}
 */
export function buildStyleRepairPrompt(text, penalties, styleEngine, { chunkBlock = '' } = {}) {
  const se = isPlainObject(styleEngine) ? styleEngine : {};

  const topPatterns = (Array.isArray(se.qualitativePatterns) ? se.qualitativePatterns : [])
    .filter((p) => isPlainObject(p) && p.label)
    .slice(0, 5)
    .map((p) => extractQuotedPhrase(p.label) || String(p.label).trim())
    .filter(Boolean);
  const connectors = isPlainObject(se.metrics?.connectorFrequency)
    ? Object.keys(se.metrics.connectorFrequency).slice(0, 6)
    : [];
  const metrics = isPlainObject(se.metrics) ? se.metrics : {};
  const ctx = { topPatterns, connectors, metrics };

  const directives = [];
  const seen = new Set();
  (Array.isArray(penalties) ? penalties : []).forEach((p) => {
    const line = repairDirective(p, ctx);
    if (line && !seen.has(line)) { seen.add(line); directives.push(`• ${line}`); }
  });

  const injectionBlock = buildStyleEngineInjectionBlock(se, { seed: 0, chunkBlock });

  return [
    'שכתב את הטקסט כך שיישמע כמו הכותב עצמו, בלי לשנות את התוכן/העובדות.',
    directives.length
      ? `תקן בדיוק את הנקודות הבאות:\n${directives.join('\n')}`
      : 'התאם את הקצב, אורכי המשפטים ובחירת המילים לסגנון האישי של הכותב.',
    injectionBlock || '',
    'הטקסט לשכתוב:',
    `"""\n${String(text || '')}\n"""`,
    'החזר רק את הטקסט המשוכתב, באותה שפה, אותו אורך בקירוב.',
  ].filter(Boolean).join('\n\n');
}

// ---------- runStyleRewriteLoop ----------

/**
 * לולאת rewrite לסגנון: מנקד את הטקסט הנוכחי (scoreStyleMatchLocal); אם ≥target — עוצר;
 * אחרת בונה פרומפט תיקון, קורא ל-invokeModel, מנקד מחדש, ושומר את המועמד רק אם הציון עלה.
 * מועמד קצר מ-40% מהמקור נדחה. לעולם לא זורק — כשל invokeModel מחזיר את המקור.
 * @param {{text:string, styleEngine:object, invokeModel:function, target?:number, maxPasses?:number, onProgress?:(function|null)}} args
 * @returns {Promise<{text:string, score:number, passes:number, improved:boolean}>}
 */
export async function runStyleRewriteLoop({ text, styleEngine, invokeModel, target = 71, maxPasses = 2, onProgress = null, genre = null } = {}) {
  const start = String(text || '').trim();
  const se = isPlainObject(styleEngine) ? styleEngine : {};
  const goal = clamp(target, 0, 100);
  const limit = Math.max(0, Math.min(6, Math.round(toNum(maxPasses, 2))));
  const startLen = plainLen(start);

  const progress = (payload) => { if (typeof onProgress === 'function') { try { onProgress(payload); } catch { /* ignore */ } } };

  if (typeof invokeModel !== 'function' || !start) {
    const initial = scoreStyleMatchLocal(start, se, genre);
    return { text: start, score: initial.score, passes: 0, improved: false };
  }

  let best = start;
  let bestResult = scoreStyleMatchLocal(best, se, genre);
  let bestScore = bestResult.score;
  const startScore = bestScore;
  let passes = 0;

  for (let pass = 1; pass <= limit; pass += 1) {
    if (bestScore >= goal) break;

    progress({ pass, maxPasses: limit, score: bestScore, target: goal, message: `שכתוב סגנון — סבב ${pass}/${limit} (ציון ${bestScore}, יעד ≥${goal})` });

    let chunkBlock = '';
    try {
      const chunks = await selectChunks(best, { k: 3, mode: 'local' });
      chunkBlock = buildChunkInjectionText(chunks);
    } catch { chunkBlock = ''; }

    let candidate = '';
    try {
      candidate = String(await invokeModel(buildStyleRepairPrompt(best, bestResult.penalties, se, { chunkBlock })) || '').trim();
    } catch {
      break; // כשל מודל — נשארים עם הטוב ביותר.
    }
    passes = pass;

    // דחיית מועמד ריק/קצר חשוד (פחות מ-40% מהמקור).
    if (!candidate || plainLen(candidate) < startLen * 0.4) continue;

    const candResult = scoreStyleMatchLocal(candidate, se, genre);
    if (candResult.score > bestScore) {
      best = candidate;
      bestResult = candResult;
      bestScore = candResult.score;
    }
  }

  return { text: best, score: bestScore, passes, improved: best !== start && bestScore > startScore };
}

// ---------- rewriteDocumentHtmlTowardStyle (Stage A) ----------

// חילוץ בלוקים node-safe (regex בלבד — אין DOMParser ב-shim). מדוגמן על
// TRAILING_REPAIR_TOKEN_PATTERN. תופס <p>/<li>/<blockquote> עם inner לא-חמדני.
const HTML_BLOCK_PATTERN = /<(p|li|blockquote)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

// טקסט נקי מ-inner של בלוק: הסרת תגיות מקוננות → כיווץ רווחים.
const blockInnerPlain = (inner = '') => String(inner || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// ניקוי מועמד מהמודל: הסרת תגיות שהמודל פלט, שמירת שבירות פסקה (\n\n).
const stripTagsKeepBreaks = (value = '') => String(value || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[ \t\f\v]+/g, ' ')
  .replace(/[ \t]*\n[ \t]*/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const wordCount = (value = '') => String(value || '').trim().split(/\s+/).filter(Boolean).length;

// חילוץ כל הבלוקים הכשירים מה-HTML: {fullMatch, openTag, tag, inner, plain, words, index}.
function extractStyleBlocks(html) {
  const src = String(html || '');
  const blocks = [];
  HTML_BLOCK_PATTERN.lastIndex = 0;
  let m;
  while ((m = HTML_BLOCK_PATTERN.exec(src)) !== null) {
    const [fullMatch, tagRaw, attrs, inner] = m;
    const tag = String(tagRaw || '').toLowerCase();
    const plain = blockInnerPlain(inner);
    blocks.push({
      fullMatch,
      openTag: `<${tag}${attrs || ''}>`,
      tag,
      inner,
      plain,
      words: wordCount(plain),
      index: m.index,
    });
  }
  return blocks;
}

// טקסט נקי של המסמך: איחוד ה-plain של כל הבלוקים ב-\n\n; נפילה לחשיפת ה-HTML כולו.
function computeDocPlain(html, blocks) {
  const bl = Array.isArray(blocks) ? blocks : extractStyleBlocks(html);
  const joined = bl.map((b) => b.plain).filter(Boolean).join('\n\n').trim();
  if (joined) return joined;
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// פענוח סובלני של מפת {"1":"...","2":"..."} מהמודל (מיחזור מכניקת parseLlmScore).
function parseRewriteMap(raw) {
  const stripped = stripJsonFences(raw);
  if (!stripped) return {};
  let parsed = null;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    const mm = stripped.match(/\{[\s\S]*\}/);
    if (mm) { try { parsed = JSON.parse(mm[0]); } catch { parsed = null; } }
  }
  return isPlainObject(parsed) ? parsed : {};
}

/**
 * שכתוב פסקאות של מסמך HTML לכיוון סגנון הכותב. אי-הרסני-מבנית: משכתב רק את הטקסט
 * הפנימי של הבלוקים הגרועים ביותר (p/li/blockquote ≥25 מילים), משאיר את שאר ה-HTML
 * byte-identical. שומר את התוצאה רק אם ציון-הסגנון הכולל עלה. לעולם לא זורק.
 * @param {string} html
 * @param {{styleEngine?:object, invokeModel?:function, target?:number, maxPasses?:number, onProgress?:(function|null)}} opts
 * @returns {Promise<{html:string, score:number, passes:number, improved:boolean, blocksRewritten:number}>}
 */
export async function rewriteDocumentHtmlTowardStyle(html, { styleEngine = null, invokeModel = null, target = 75, maxPasses = 1, onProgress = null, genre = null } = {}) {
  const startHtml = String(html || '');
  const se = isPlainObject(styleEngine) ? styleEngine : {};
  const goal = clamp(target, 0, 100);
  const limit = Math.max(1, Math.min(4, Math.round(toNum(maxPasses, 1))));
  const progress = (payload) => { if (typeof onProgress === 'function') { try { onProgress(payload); } catch { /* ignore */ } } };

  try {
    // (a+b) חילוץ בלוקים + שער ברמת-המסמך.
    let bestHtml = startHtml;
    let bestBlocks = extractStyleBlocks(bestHtml);
    let bestDocPlain = computeDocPlain(bestHtml, bestBlocks);
    let bestScore = scoreStyleMatchLocal(bestDocPlain, se, genre).score;
    const startScore = bestScore;

    if (typeof invokeModel !== 'function' || bestScore >= goal) {
      return { html: startHtml, score: bestScore, passes: 0, improved: false, blocksRewritten: 0 };
    }

    // ctx להפקת directive-ים ברמת-המסמך (זהה ל-buildStyleRepairPrompt).
    const topPatterns = (Array.isArray(se.qualitativePatterns) ? se.qualitativePatterns : [])
      .filter((p) => isPlainObject(p) && p.label)
      .slice(0, 5)
      .map((p) => extractQuotedPhrase(p.label) || String(p.label).trim())
      .filter(Boolean);
    const connectors = isPlainObject(se.metrics?.connectorFrequency)
      ? Object.keys(se.metrics.connectorFrequency).slice(0, 6)
      : [];
    const ctx = { topPatterns, connectors, metrics: isPlainObject(se.metrics) ? se.metrics : {} };

    let totalPasses = 0;
    let totalRewritten = 0;
    let improvedBlocksTotal = 0; // בלוקים שהתקבלו דרך השער הפר-בלוקי (לאורך כל הסבבים).
    let escalate = false; // הסבב הקודם לא שיפר → הסבב הבא נועז יותר (יותר בלוקים + הוראה תקיפה).

    for (let pass = 1; pass <= limit; pass += 1) {
      if (bestScore >= goal) break;

      // (c) בחירת הבלוקים על ה-HTML הטוב הנוכחי. במצב אסקלציה — כל הבלוקים הכשירים (תקרה 8),
      // אחרת רק ה-40% הגרועים (תקרה 6).
      const eligible = bestBlocks.filter((b) => b.words >= 25);
      if (!eligible.length) break;
      const scored = eligible.map((b) => ({ block: b, s: scoreStyleMatchLocal(b.plain, se, genre).score }));
      scored.sort((a, b) => a.s - b.s);
      const targets = escalate
        ? scored.slice(0, 8).map((x) => x.block)
        : scored.slice(0, Math.max(1, Math.min(6, Math.ceil(scored.length * 0.4)))).map((x) => x.block);

      totalPasses = pass;
      progress({ pass, maxPasses: limit, score: bestScore, target: goal, blocks: targets.length, message: `שכתוב סגנון למסמך — סבב ${pass}/${limit} (ציון ${bestScore}, יעד ≥${goal})` });

      // (d) בניית פרומפט — קריאת LLM אחת לכל סבב.
      let chunkBlock = '';
      let exemplarLine = '';
      try {
        const chunks = await selectChunks(bestDocPlain, { k: 3, mode: 'local' });
        chunkBlock = buildChunkInjectionText(chunks);
        const avgSent = Number(se.metrics?.avgSentenceWords);
        if (Number.isFinite(avgSent)) {
          const exemplars = selectExemplarSentences(chunks, {
            mean: avgSent,
            std: se.metricsSpread?.avgSentenceWords?.std,
            count: 3,
          });
          if (exemplars.length) {
            exemplarLine = `משפטים לדוגמה מהכותב (חקה אורך וקצב): ${exemplars.map((s) => `"${s}"`).join(' | ')}`;
          }
        }
      } catch { chunkBlock = ''; }

      const docPenalties = scoreStyleMatchLocal(bestDocPlain, se, genre).penalties;
      const directives = [];
      const seenDir = new Set();
      (Array.isArray(docPenalties) ? docPenalties : []).forEach((p) => {
        const line = repairDirective(p, ctx);
        if (line && !seenDir.has(line)) { seenDir.add(line); directives.push(`• ${line}`); }
      });
      const injectionBlock = buildStyleEngineInjectionBlock(se, { seed: 1, chunkBlock });

      const avgPara = Number(se.metrics?.avgParagraphWords);
      const numbered = targets.map((b, i) => {
        const tooLong = Number.isFinite(avgPara) && avgPara > 0 && b.words > avgPara * 1.8;
        const header = tooLong
          ? `--- פסקה ${i + 1} (ארוכה מדי — פצל לשתי פסקאות עם שורה ריקה) ---`
          : `--- פסקה ${i + 1} ---`;
        return `${header}\n${b.plain}`;
      }).join('\n');
      const leadLine = escalate
        ? 'השכתוב הקודם לא שיפר את ההתאמה. הפעם שכתב באופן נועז יותר: פרק משפטים ארוכים, קצר פסקאות ארוכות (החזר שתי פסקאות מופרדות בשורה ריקה במקום אחת ארוכה), והשתמש במילות הקישור האופייניות.'
        : '';
      const prompt = [
        leadLine,
        'לפניך פסקאות מתוך מסמך. שכתב כל אחת כך שתישמע כמו הכותב עצמו — אל תשנה תוכן, עובדות, שמות או ציטוטים. שמור אורך דומה (±30%).',
        directives.length ? `כוונן במיוחד:\n${directives.join('\n')}` : '',
        exemplarLine,
        injectionBlock || '',
        numbered,
        'החזר JSON בלבד: {"1":"הפסקה המשוכתבת","2":"..."} — מפתח לכל פסקה שמספרה הופיע. אם פסקה טובה כפי שהיא החזר אותה ללא שינוי.',
      ].filter(Boolean).join('\n\n');

      let raw = '';
      try {
        raw = String(await invokeModel(prompt) || '');
      } catch {
        break; // כשל מודל — נשארים עם הטוב ביותר.
      }

      // (e) פענוח + ולידציה + **שער פר-בלוק**: מקבלים מועמד רק אם ציון-הבלוק שלו עלה
      //     בנפרד (scoreStyleMatchLocal על הטקסט הנקי של הבלוק), ללא תלות בתנועת ציון-המסמך.
      //     מודל משפר לרוב חלק מהבלוקים אך לא מספיק כדי להזיז את ציון-המסמך — כך כל בלוק
      //     משופר נשמר, גם אם המסמך כולו לא זז.
      const map = parseRewriteMap(raw);
      const accepted = []; // {block, candidate}
      let blocksImproved = 0;
      targets.forEach((b, i) => {
        const val = map[String(i + 1)];
        if (val === undefined || val === null) return;
        const candidate = stripTagsKeepBreaks(val);
        if (!candidate) return;
        const cw = wordCount(candidate);
        if (cw < b.words * 0.5 || cw > b.words * 2) return; // fail closed (length band)
        if (candidate === b.plain) return; // ללא שינוי
        // שער פר-בלוק (בלוקים ≥25 מילים — כבר מסונן ב-eligible): קבל אם ציון-הבלוק עלה.
        const beforeBlock = scoreStyleMatchLocal(b.plain, se, genre).score;
        const afterBlock = scoreStyleMatchLocal(candidate, se, genre).score;
        if (afterBlock > beforeBlock) { accepted.push({ block: b, candidate }); blocksImproved += 1; }
      });
      if (!accepted.length) { escalate = true; continue; }

      // (f) שחבור: החלפה בסדר אינדקס יורד כדי לא להזיז offsets.
      accepted.sort((a, b) => b.block.index - a.block.index);
      let newHtml = bestHtml;
      accepted.forEach(({ block, candidate }) => {
        const segs = candidate.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
        const close = `</${block.tag}>`;
        let replacement = `${block.openTag}${segs[0] || ''}${close}`;
        for (let k = 1; k < segs.length; k += 1) replacement += `<${block.tag}>${segs[k]}${close}`;
        newHtml = newHtml.slice(0, block.index) + replacement + newHtml.slice(block.index + block.fullMatch.length);
      });

      // (g) ניקוד-מסמך מחדש. שער קבלה: **רצפה** — לעולם לא לקבל מסמך גרוע-נטו
      //     (docAfter >= docBefore-1). בתוך הרצפה מקבלים אם ציון-המסמך עלה, או ש-≥2
      //     בלוקים השתפרו בנפרד (בלוקים משופרים שאינם מזיזים את ציון-המסמך עדיין נשמרים).
      const newBlocks = extractStyleBlocks(newHtml);
      const newDocPlain = computeDocPlain(newHtml, newBlocks);
      const newScore = scoreStyleMatchLocal(newDocPlain, se, genre).score;
      const docImproved = newScore > bestScore;
      const withinFloor = newScore >= bestScore - 1; // אף פעם לא מסמך גרוע-נטו
      if (docImproved || (blocksImproved >= 2 && withinFloor)) {
        bestHtml = newHtml;
        bestBlocks = newBlocks;
        bestDocPlain = newDocPlain;
        bestScore = newScore;
        totalRewritten += accepted.length;
        improvedBlocksTotal += blocksImproved;
        escalate = !docImproved; // התקבל רק בזכות בלוקים → עדיין הסלמה בסבב הבא.
      } else {
        escalate = true; // הסבב לא שיפר → אסקלציה בסבב הבא.
      }
    }

    return {
      html: bestHtml,
      score: bestScore,
      passes: totalPasses,
      // improved: המסמך זז לטובה, או שלפחות 2 בלוקים שופרו בנפרד (ושוחברו) — גם אם
      // ציון-המסמך לא עלה. אף פעם לא true בלי שינוי בפועל ב-HTML.
      improved: bestHtml !== startHtml && (bestScore > startScore || improvedBlocksTotal >= 2),
      blocksRewritten: totalRewritten,
    };
  } catch {
    // כל כשל — best-so-far הוא ה-HTML המקורי (אין השחתה).
    return { html: startHtml, score: 0, passes: 0, improved: false, blocksRewritten: 0 };
  }
}
