// styleAuthenticityService — זיהוי "נשמע גנרי / לא-כמוך" (לא גלאי AI בינארי).
// פלט רך 0-100 + רשימת סימנים מוסברים. משלב מרקרים גנריים של AI עם סטייה מהסגנון הנלמד.
// "אימון" = כיול ממוצעי-פיצ'ר מדוגמאות מתויגות (label: 'me' | 'ai'), בלי ML libs.
//
// הליבה (extractAuthenticityFeatures / scoreTextAuthenticity) טהורה ומקבלת profile כארגומנט.
// רק שכבת הכיול (add/train/get) נוגעת באחסון הפרופיל האישי.

import { getPersonalStyleProfile, savePersonalStyleProfile } from './aiService';

// מילות קישור פורמליות שמודלים נוטים להעדיף בצפיפות גבוהה.
const FORMAL_CONNECTORS = [
  'יתרה מכך', 'יתרה מזאת', 'זאת ועוד', 'כמו כן', 'בנוסף לכך', 'חשוב לציין', 'ראוי לציין',
  'יש לציין', 'לאור האמור', 'לאור זאת', 'בסופו של דבר', 'במילים אחרות', 'לסיכום', 'לסיום',
  'כפי שצוין', 'מחד גיסא', 'מאידך גיסא', 'מצד אחד', 'מצד שני', 'אשר על כן', 'לפיכך',
  'משכך', 'כתוצאה מכך', 'בהקשר זה', 'בעידן הנוכחי',
  // מחברים אקדמיים שזוהו בפלט Gemini אמיתי (training session, מדעי המדינה):
  'עם זאת', 'יחד עם זאת', 'על פי', 'כלומר', 'למשל', 'מאחר ש', 'מאחר ו', 'בהתאם לכך',
  'במסגרת זו', 'במציאות זו', 'לפי הגישה', 'באופן זה', 'כפי ש',
];

// קלישאות שחוקות אופייניות לטקסט מחולל.
const CLICHE_PHRASES = [
  'מגוון רחב', 'ממלא תפקיד מרכזי', 'ממלאת תפקיד מרכזי', 'אבן יסוד', 'אבן דרך',
  'בעולם של ימינו', 'בעידן הדיגיטלי', 'מאז ומתמיד', 'חשוב מאין כמוהו', 'לא ניתן להפריז',
  'חלק בלתי נפרד', 'עולם הולך ומשתנה', 'כלי רב עוצמה', 'פותח דלתות', 'קשת רחבה',
  'בעת ובעונה אחת', 'נדבך מרכזי', 'תפקיד חיוני',
];

const STOP_WORDS = new Set(['של', 'על', 'עם', 'זה', 'זאת', 'היא', 'הוא', 'הם', 'הן', 'אני', 'אתה', 'את', 'אנחנו', 'גם', 'אבל', 'או', 'אם', 'כי', 'כל', 'לא', 'כן', 'כך', 'מאוד', 'עוד', 'רק', 'כדי', 'היה', 'היו', 'יש', 'אין', 'אל', 'מן', 'אלו', 'אלה', 'אשר', 'כאשר', 'בין', 'לפי', 'תוך', 'אצל', 'מתוך', 'בו', 'בה', 'בהם']);

// תקרת תרומה לכל סיגנל בצירוף noisy-OR (לא ממוצע — כדי שסיגנל בודד חזק לא יידולל).
// כל ערך = כמה הסיגנל לבדו יכול לתרום לציון (0..1). הכיול מחליף ערכים אלה לפי כושר ההפרדה.
const DEFAULT_WEIGHTS = {
  uniformity: 0.55,
  formalConnector: 0.55,
  cliche: 0.60,
  structural: 0.55,
  lowRichness: 0.35,
  openerRepeat: 0.30,
  personalMismatch: 0.55,
};

const MAX_CALIBRATION_SAMPLES = 40;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const stripToText = (input = '') => String(input || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[\r\t]+/g, ' ')
  .replace(/ /g, ' ')
  .replace(/\s+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const countOccurrences = (haystack, needles) => {
  const found = [];
  let total = 0;
  needles.forEach((needle) => {
    // ספירת מופעים לא חופפים.
    let from = 0;
    let hits = 0;
    let idx = haystack.indexOf(needle, from);
    while (idx !== -1) {
      hits += 1;
      from = idx + needle.length;
      idx = haystack.indexOf(needle, from);
    }
    if (hits > 0) {
      total += hits;
      found.push({ phrase: needle, count: hits });
    }
  });
  found.sort((a, b) => b.count - a.count);
  return { total, found };
};

// חילוץ וקטור פיצ'רים מטקסט. דטרמיניסטי, בלי תלות בפרופיל.
export function extractAuthenticityFeatures(input = '') {
  const text = stripToText(input);
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const sentences = text.split(/[.!?…]+\s+/).map((s) => s.trim()).filter(Boolean);
  const words = text.match(/[֐-׿A-Za-z][֐-׿A-Za-z'"׳״-]*/g) || [];
  const wordCount = words.length;

  const contentWords = words
    .map((w) => w.replace(/^["'׳״-]+|["'׳״-]+$/g, '').toLowerCase())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  // אורכי משפט (במילים) לחישוב burstiness.
  const sentenceLengths = sentences.map((s) => (s.match(/[֐-׿A-Za-z][֐-׿A-Za-z'"׳״-]*/g) || []).length).filter((n) => n > 0);
  const paragraphLengths = paragraphs.map((p) => (p.match(/[֐-׿A-Za-z][֐-׿A-Za-z'"׳״-]*/g) || []).length).filter((n) => n > 0);

  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const cv = (arr) => {
    if (arr.length < 2) return null;
    const m = mean(arr);
    if (!m) return null;
    const variance = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
    return Math.sqrt(variance) / m;
  };

  const avgSentenceWords = round(mean(sentenceLengths));
  const sentenceLengthCV = cv(sentenceLengths);
  const avgParagraphWords = round(mean(paragraphLengths));

  const formalConnectors = countOccurrences(text, FORMAL_CONNECTORS);
  const cliches = countOccurrences(text, CLICHE_PHRASES);

  // צפיפות ל-100 מילים.
  const per100 = (n) => (wordCount ? round((n / wordCount) * 100, 2) : 0);

  // סימני מבנה אופייניים ל-AI (Gemini Hebrew): מקפי הסבר, סוגריים מבארים, מרכאות-מטבע, נקודה-פסיק.
  const emDashes = (text.match(/[–—]/g) || []).length;
  const parenGlosses = (text.match(/\([^)]{1,40}\)/g) || []).length;
  const quoteChars = (text.match(/["“”״]/g) || []).length;
  const scareQuotes = Math.floor(quoteChars / 2);
  const semicolons = (text.match(/;/g) || []).length;
  const structuralEvents = emDashes + parenGlosses + scareQuotes + semicolons;

  // עושר אוצר מילים (Type-Token Ratio על מילות תוכן).
  const uniqueContent = new Set(contentWords);
  const typeTokenRatio = contentWords.length ? round(uniqueContent.size / contentWords.length, 3) : 0;

  // חזרתיות פתיחים: הפתיח הנפוץ ביותר חלקי מספר המשפטים.
  const openerCounts = {};
  sentences.forEach((s) => {
    const sw = s.match(/[֐-׿A-Za-z][֐-׿A-Za-z'"׳״-]*/g) || [];
    if (sw.length) {
      const opener = sw.slice(0, Math.min(2, sw.length)).join(' ').toLowerCase();
      if (opener.length >= 3) openerCounts[opener] = (openerCounts[opener] || 0) + 1;
    }
  });
  const maxOpener = Object.values(openerCounts).reduce((a, b) => Math.max(a, b), 0);
  const openerRepetitionRate = sentences.length ? round(maxOpener / sentences.length, 3) : 0;

  return {
    wordCount,
    sentenceCount: sentences.length,
    paragraphCount: paragraphs.length,
    avgSentenceWords,
    sentenceLengthCV: sentenceLengthCV === null ? null : round(sentenceLengthCV, 3),
    avgParagraphWords,
    formalConnectorDensity: per100(formalConnectors.total),
    formalConnectorCount: formalConnectors.total,
    formalConnectorsFound: formalConnectors.found.slice(0, 6),
    clicheDensity: per100(cliches.total),
    clicheCount: cliches.total,
    clichesFound: cliches.found.slice(0, 6),
    structuralDensity: per100(structuralEvents),
    structuralCount: structuralEvents,
    structuralDetail: { emDashes, parenGlosses, scareQuotes, semicolons },
    typeTokenRatio,
    openerRepetitionRate,
    topContentWords: Array.from(uniqueContent).slice(0, 40),
  };
}

// המרת פיצ'רים לסיגנלים 0..1 (1 = יותר גנרי/מכונה). null = אין מספיק נתונים לסיגנל.
function computeSignals(features, profile) {
  const signals = {};

  // 1. אחידות אורך משפט (burstiness נמוך = מכונה). דורש לפחות 3 משפטים.
  signals.uniformity = (features.sentenceLengthCV === null || features.sentenceCount < 3)
    ? null
    : clamp01((0.50 - features.sentenceLengthCV) / 0.40);

  // ל-2/3/3b: max(צפיפות, ספירה מוחלטת) — כדי שמסמך ארוך עם הרבה מרקרים יידלק גם כשהצפיפות מדוללת (long-form).
  // 2. מחברים פורמליים. צפיפות 4/100 = רוויה; או ספירה מוחלטת 8 = רוויה.
  signals.formalConnector = Math.max(clamp01(features.formalConnectorDensity / 4), clamp01(features.formalConnectorCount / 8));

  // 3. קלישאות. צפיפות 1.5/100; או 4 מופעים מוחלטים.
  signals.cliche = Math.max(clamp01(features.clicheDensity / 1.5), clamp01(features.clicheCount / 4));

  // 3b. סימני מבנה (מקפים/סוגריים/מרכאות-מטבע/נקודה-פסיק). צפיפות 4.5/100; או 18 מופעים מוחלטים.
  signals.structural = Math.max(clamp01(features.structuralDensity / 4.5), clamp01(features.structuralCount / 18));

  // 4. עושר אוצר מילים נמוך. אמין רק על טקסט סביר. TTR 0.62→0, 0.32→1.
  signals.lowRichness = features.wordCount < 60
    ? null
    : clamp01((0.62 - features.typeTokenRatio) / 0.30);

  // 5. חזרתיות פתיחים.
  signals.openerRepeat = features.sentenceCount < 4
    ? null
    : clamp01((features.openerRepetitionRate - 0.12) / 0.25);

  // 6. סטייה מהסגנון האישי הנלמד (רק אם יש פרופיל עם נתונים).
  const learnedVocab = Array.isArray(profile?.learnedVocabulary) ? profile.learnedVocabulary.map((w) => String(w).toLowerCase()) : [];
  const profSent = Number(profile?.styleFingerprint?.avgSentenceWords) || 0;
  if (learnedVocab.length >= 8) {
    const vocabSet = new Set(learnedVocab);
    const top = features.topContentWords || [];
    const overlap = top.length ? top.filter((w) => vocabSet.has(w)).length / top.length : 0;
    const sentDev = profSent > 0 ? clamp01(Math.abs(features.avgSentenceWords - profSent) / Math.max(profSent, 6)) : 0;
    signals.personalMismatch = clamp01(0.6 * (1 - overlap) + 0.4 * sentDev);
  } else {
    signals.personalMismatch = null;
  }

  return signals;
}

const SIGNAL_LABELS = {
  uniformity: 'אורך משפטים אחיד מדי (חסר קצב אנושי)',
  formalConnector: 'צפיפות גבוהה של מחברים פורמליים',
  cliche: 'קלישאות שחוקות אופייניות ל-AI',
  structural: 'מבנה מלוטש-מדי (מקפים, סוגריים מבארים, מרכאות-מטבע, נקודה-פסיק)',
  lowRichness: 'אוצר מילים חוזר/דל',
  openerRepeat: 'פתיחי משפט חוזרים',
  personalMismatch: 'לא תואם את הסגנון הנלמד שלך',
};

// ניקוד טקסט: score 0-100 + label + markers מוסברים.
// opts: { profile?, calibration? } — אם לא נמסרו, נטענים מהפרופיל האישי.
export function scoreTextAuthenticity(input = '', opts = {}) {
  const features = extractAuthenticityFeatures(input);
  if (features.wordCount < 25) {
    return { ok: false, reason: 'too-short', message: 'הטקסט קצר מדי לניתוח אמין (פחות מ-25 מילים).', features };
  }

  const profile = opts.profile || getPersonalStyleProfile?.() || {};
  const calibration = opts.calibration || profile?.authenticityCalibration || null;
  const weights = (calibration && calibration.weights) ? calibration.weights : DEFAULT_WEIGHTS;

  const signals = computeSignals(features, profile);

  // צירוף noisy-OR: score = 1 - Π(1 - signal·cap). סיגנל בודד חזק לא מדולל; מספר סיגנלים מצטברים.
  let product = 1;
  const breakdown = {};
  Object.keys(signals).forEach((key) => {
    const signal = signals[key];
    if (signal === null || signal === undefined) return;
    const cap = Number(weights[key]) || 0;
    if (cap <= 0) return;
    product *= (1 - signal * cap);
    breakdown[key] = { signal: round(signal, 3), cap: round(cap, 3) };
  });

  const score = Math.round((1 - product) * 100);

  // סף החלטה: מהכיול אם קיים, אחרת 60.
  const threshold = (calibration && Number.isFinite(calibration.threshold)) ? calibration.threshold : 60;
  let label;
  if (score < Math.max(30, threshold - 20)) label = 'נשמע אנושי / בסגנונך';
  else if (score < threshold) label = 'מעורב';
  else label = 'נשמע גנרי / מכונה';

  // markers: סיגנלים מעל 0.5, או מחברים/קלישאות שנמצאו בפועל.
  const markers = [];
  Object.keys(signals).forEach((key) => {
    const signal = signals[key];
    if (signal === null) return;
    if (signal >= 0.5) {
      let detail = '';
      if (key === 'formalConnector' && features.formalConnectorsFound.length) {
        detail = features.formalConnectorsFound.map((f) => `"${f.phrase}"×${f.count}`).join(', ');
      } else if (key === 'cliche' && features.clichesFound.length) {
        detail = features.clichesFound.map((f) => `"${f.phrase}"×${f.count}`).join(', ');
      } else if (key === 'uniformity') {
        detail = `CV=${features.sentenceLengthCV} (נמוך=אחיד)`;
      } else if (key === 'structural') {
        const d = features.structuralDetail || {};
        detail = [d.emDashes && `מקפים×${d.emDashes}`, d.parenGlosses && `סוגריים×${d.parenGlosses}`, d.scareQuotes && `מרכאות×${d.scareQuotes}`, d.semicolons && `נק'-פסיק×${d.semicolons}`].filter(Boolean).join(', ');
      } else if (key === 'lowRichness') {
        detail = `TTR=${features.typeTokenRatio}`;
      } else if (key === 'openerRepeat') {
        detail = `פתיח חוזר ב-${Math.round(features.openerRepetitionRate * 100)}% מהמשפטים`;
      }
      markers.push({ key, label: SIGNAL_LABELS[key], severity: round(signal, 2), detail });
    }
  });
  markers.sort((a, b) => b.severity - a.severity);

  return {
    ok: true,
    score,
    label,
    threshold,
    calibrated: Boolean(calibration && calibration.weights),
    markers,
    breakdown,
    features,
  };
}

// פורמוט תוצאה לטקסט עברי (ל-MagicWand, AiSidebar, toast). מקבל את פלט scoreTextAuthenticity.
export function formatAuthenticityResultText(result) {
  if (!result || !result.ok) {
    return result?.message || 'לא ניתן לנתח את הטקסט.';
  }
  const humanCutoff = Math.max(30, result.threshold - 20);
  const emoji = result.score >= result.threshold ? '🤖' : (result.score < humanCutoff ? '✍️' : '⚖️');
  const lines = [`${emoji} ציון "נשמע גנרי/מכונה": ${result.score}/100 — ${result.label}`];
  if (result.calibrated) lines.push('(מכויל לפי הדוגמאות שתייגת)');
  if (Array.isArray(result.markers) && result.markers.length) {
    lines.push('', 'סימנים שזוהו:');
    result.markers.forEach((m) => lines.push(`• ${m.label}${m.detail ? ` — ${m.detail}` : ''}`));
  } else {
    lines.push('', 'לא זוהו סימנים בולטים של טקסט גנרי.');
  }
  lines.push('', 'ℹ️ אומדן רך, לא פסק-דין. טקסט אנושי מלוטש עלול להיתפס כגנרי ולהפך.');
  return lines.join('\n');
}

// תיוג קטע נבחר מהעורך → מאמן את הגלאי וגם מחנך את סוכני היצירה (דרך הפרופיל האישי).
// kind='desired': הסגנון הרצוי — נשמר כדוגמה לחיקוי (preferredTrainingExamples) + calibration 'me'.
// kind='ai': נשמע כמו AI — המרקרים הופכים לכללי 'הימנע' (dislikedStylePatterns) + calibration 'ai'.
// השדות preferredTrainingExamples/dislikedStylePatterns כבר מוזרקים לכל קריאת AI ב-buildPersonalStyleInstructions.
const MAX_CURATED_EXAMPLES = 5;
const CURATED_EXAMPLE_MAX_CHARS = 400;
const MAX_AVOID_NOTES = 8;

export function tagStyleSample(text = '', kind = 'desired') {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length < 25) {
    return { ok: false, reason: 'too-short', message: 'בחר קטע ארוך יותר (לפחות ~25 מילים) כדי לתייג סגנון.' };
  }
  const isDesired = kind === 'desired';

  // 1. הזנת הגלאי.
  const cal = addAuthenticitySample(clean, isDesired ? 'me' : 'ai');

  // 2. חינוך הסוכנים — קריאה מחדש של הפרופיל אחרי שהכיול שמר.
  const profile = getPersonalStyleProfile?.() || {};
  const next = { ...profile };

  if (isDesired) {
    const snippet = clean.slice(0, CURATED_EXAMPLE_MAX_CHARS);
    const prev = Array.isArray(profile.preferredTrainingExamples) ? profile.preferredTrainingExamples : [];
    next.preferredTrainingExamples = [...prev.filter((e) => String(e).trim() !== snippet), snippet].slice(-MAX_CURATED_EXAMPLES);
  } else {
    const res = scoreTextAuthenticity(clean, { profile });
    const markerNotes = (res.ok ? res.markers : []).map((m) => m.label).filter(Boolean);
    const prev = Array.isArray(profile.dislikedStylePatterns) ? profile.dislikedStylePatterns : [];
    next.dislikedStylePatterns = Array.from(new Set([...prev, ...markerNotes])).slice(-MAX_AVOID_NOTES);
  }
  savePersonalStyleProfile?.(next);

  return {
    ok: true,
    kind: isDesired ? 'desired' : 'ai',
    trained: cal?.trained || null,
    meCount: cal?.meCount,
    aiCount: cal?.aiCount,
    message: isDesired
      ? 'נשמר כסגנון רצוי ✓ — הסוכנים יחקו אותו, והגלאי לומד שזה אתה.'
      : 'סומן כ"נשמע כמו AI" ✓ — הגלאי מתאמן, והסוכנים ילמדו להימנע מהדפוסים האלה.',
  };
}

// ===== שכבת כיול =====

export function getAuthenticityCalibration() {
  const profile = getPersonalStyleProfile?.() || {};
  return profile?.authenticityCalibration || { samples: [], weights: null, threshold: null, trainedAt: null };
}

// הוספת דוגמה מתויגת. label: 'me' | 'ai'. מאמן מחדש אוטומטית כשיש מספיק מכל קלאס.
export function addAuthenticitySample(text = '', label = 'me') {
  const normalizedLabel = label === 'ai' ? 'ai' : 'me';
  const features = extractAuthenticityFeatures(text);
  if (features.wordCount < 25) {
    return { ok: false, reason: 'too-short', message: 'הדוגמה קצרה מדי (פחות מ-25 מילים).' };
  }

  const profile = getPersonalStyleProfile?.() || {};
  const calibration = profile.authenticityCalibration || { samples: [], weights: null, threshold: null, trainedAt: null };
  const samples = Array.isArray(calibration.samples) ? calibration.samples.slice() : [];
  samples.push({ label: normalizedLabel, features, addedAt: new Date().toISOString() });
  // שמירת חלון אחרון.
  const trimmed = samples.slice(-MAX_CALIBRATION_SAMPLES);

  const nextCalibration = { ...calibration, samples: trimmed };
  savePersonalStyleProfile?.({ ...profile, authenticityCalibration: nextCalibration });

  const meCount = trimmed.filter((s) => s.label === 'me').length;
  const aiCount = trimmed.filter((s) => s.label === 'ai').length;
  let trained = null;
  if (meCount >= 2 && aiCount >= 2) {
    trained = trainAuthenticityCalibration();
  }
  return { ok: true, meCount, aiCount, trained };
}

export function removeAuthenticitySample(index) {
  const profile = getPersonalStyleProfile?.() || {};
  const calibration = profile.authenticityCalibration;
  if (!calibration || !Array.isArray(calibration.samples)) return { ok: false, reason: 'no-samples' };
  const samples = calibration.samples.slice();
  if (index < 0 || index >= samples.length) return { ok: false, reason: 'out-of-range' };
  samples.splice(index, 1);
  savePersonalStyleProfile?.({ ...profile, authenticityCalibration: { ...calibration, samples } });
  return { ok: true, remaining: samples.length };
}

// אימון: ממוצע סיגנל לכל קלאס → משקל ∝ כושר ההפרדה |mean_ai - mean_me|.
// סף = נקודת האמצע בין ציוני שני הקלאסים תחת המשקלים החדשים.
export function trainAuthenticityCalibration() {
  const profile = getPersonalStyleProfile?.() || {};
  const calibration = profile.authenticityCalibration || { samples: [] };
  const samples = Array.isArray(calibration.samples) ? calibration.samples : [];
  const me = samples.filter((s) => s.label === 'me');
  const ai = samples.filter((s) => s.label === 'ai');
  if (me.length < 2 || ai.length < 2) {
    return { ok: false, reason: 'insufficient-samples', meCount: me.length, aiCount: ai.length };
  }

  const signalKeys = Object.keys(DEFAULT_WEIGHTS);

  // ממוצע סיגנל לכל קלאס (מתעלם מ-null).
  const classMean = (group) => {
    const sums = {};
    const counts = {};
    group.forEach((sample) => {
      const sig = computeSignals(sample.features, profile);
      signalKeys.forEach((key) => {
        if (sig[key] === null || sig[key] === undefined) return;
        sums[key] = (sums[key] || 0) + sig[key];
        counts[key] = (counts[key] || 0) + 1;
      });
    });
    const means = {};
    signalKeys.forEach((key) => { means[key] = counts[key] ? sums[key] / counts[key] : null; });
    return means;
  };

  const meMeans = classMean(me);
  const aiMeans = classMean(ai);

  // תקרה (cap) לכל סיגנל = פונקציה של כושר ההפרדה בין הקלאסים. הפרדה גבוהה → cap גבוה.
  // אם אין נתון לאחד הקלאסים → ברירת מחדל מוקטנת. תחום [0.2, 0.65] מתאים ל-noisy-OR.
  const weights = {};
  signalKeys.forEach((key) => {
    if (meMeans[key] === null || aiMeans[key] === null) {
      weights[key] = round(DEFAULT_WEIGHTS[key] * 0.6, 4);
    } else {
      const separation = Math.abs(aiMeans[key] - meMeans[key]);
      weights[key] = round(Math.max(0.2, Math.min(0.65, 0.2 + separation)), 4);
    }
  });

  // ציון קלאס תחת ה-caps החדשים ב-noisy-OR → סף באמצע.
  const classScore = (means) => {
    let product = 1;
    signalKeys.forEach((key) => {
      if (means[key] === null) return;
      product *= (1 - means[key] * weights[key]);
    });
    return (1 - product) * 100;
  };
  const meScore = classScore(meMeans);
  const aiScore = classScore(aiMeans);
  const threshold = Math.round((meScore + aiScore) / 2);

  const nextCalibration = {
    ...calibration,
    weights,
    threshold,
    trainedAt: new Date().toISOString(),
    meScore: round(meScore),
    aiScore: round(aiScore),
    meCount: me.length,
    aiCount: ai.length,
  };
  savePersonalStyleProfile?.({ ...profile, authenticityCalibration: nextCalibration });
  return { ok: true, weights, threshold, meScore: round(meScore), aiScore: round(aiScore) };
}
