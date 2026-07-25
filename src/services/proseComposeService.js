// proseComposeService.js — מחולל הפרוזה המקומי: גוף פרק מראיות, בלי מודל.
//
// זה השלב שהופך את השלד לטיוטה: assignmentPrepService מסמן היום PROSE=NEEDS_AI
// תמיד; המחולל הזה מספק את המסלול המקומי — LOCAL_DRAFT — כשיש ראיות.
//
// עקרון הכנות (הקשיח ביותר במערכת): כל משפט תוכן מעוגן ב-chunk ראיה ספציפי
// ונושא את מזההו. מה שהמנוע מוסיף מעצמו הוא אך ורק *מסגור* — מסגרות רטוריות
// מ-sentenceGrammar שאינן טוענות עובדות ("על פי X, ...", "מן החומר עולה כי...").
// משפטי מטא (סיכום-ביניים) מנוסחים על *הראיות שהוצגו*, לא על העולם.
// ראיה דלה מדי למכסה → הערת [דרוש מקור נוסף] — לא ממציאים.
//
// צנרת: תכנון מהלכים לפי intent + מכסה → בחירת משפט-ליבה מכל ראיה →
// עטיפה במסגרת (composeMoveSentence) → הרכבת פסקאות + ציטוט ממוקם.
//
// תלויות: sentenceComposeService (מסגרות), evidenceMatchService (formatProvenance
// לא נחוץ — provenance כבר על הראיה). LEAF ביחס ל-aiService. browser+node.

import { composeMoveSentence, ensureSentenceGrammarReady } from './sentenceComposeService.js';

const AVG_WORDS_PER_SENTENCE = 16;   // ברירת מחדל; styleTargets דורס
const MAX_CLAUSE_WORDS = 32;
const MIN_CLAUSE_WORDS = 6;
const QUOTE_MAX_WORDS = 30;

// ── עזרי טקסט ─────────────────────────────────────────────────────────────
function splitSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?׃])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

const countWords = (s) => String(s || '').split(/\s+/).filter(Boolean).length;

function hebrewRatio(s) {
  const letters = (String(s || '').match(/[א-תa-zA-Z]/g) || []).length;
  const hebrew = (String(s || '').match(/[א-ת]/g) || []).length;
  return letters ? hebrew / letters : 0;
}

/** ניקוי משפט ראיה לשימוש כפסוקית: הפניות-פנים, מספור, רעש OCR קל. */
function cleanEvidenceSentence(s) {
  return String(s || '')
    .replace(/\[[0-9,\s]+\]/g, '')          // הפניות מספריות [12]
    .replace(/\((?:ראו?|see)[^)]*\)/gi, '') // (ראו שם)
    .replace(/^[\d.()\s׳״-]+/, '')  // מספור פותח
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * בחירת משפט-הליבה מ-chunk ראיה: המשפט שהכי שווה לדווח.
 * ניקוד: אורך בטווח + נוכחות מונחי חובה/מילות מפתח + עברית נקייה (רעש OCR נפסל).
 */
// מילות תפקוד — פרוזה אמיתית מכילה אותן; רצף כותרות-שקפים לא. לפי שפת המשפט:
// חומרי קורס הם לא פעם באנגלית (השאילתה עברית, הראיה אנגלית — מסלול נתמך).
const HE_FUNCTION_WORDS_RE = /(?:^|\s)(?:של|את|כי|על|אשר|היא|הוא|הם|בין|כאשר|לפי|וגם|אבל|כדי|בשל|לכן|כלומר|וכן)(?:\s|$)/;
const EN_FUNCTION_WORDS_RE = /(?:^|\s)(?:the|of|and|in|to|that|is|are|was|as|for|with|by|from)(?:\s|$)/i;

// הסגר-ג'יבריש ברמת המשפט (round-3): קטע מהמניפסט שאינו garbled ברמת ה-chunk
// עדיין נושא משפטים משובשי-OCR בודדים — גרשיים/מרכאה באמצע מילה ('בית"המלאכה'),
// כוכבית באמצע מילה ('יום*יום'), וספרות דבוקות לאותיות. הבוסט הלקסיקלי מכשיר
// בדיוק את אלה (garbage-in), ולכן הסינון חייב לרוץ *לפני* הבחירה. round-2 העביר
// 2/3 ממשפטי sec_3 המשובשים ל-prose. תלוי-עברית — טקסט אנגלי/עברי נקי לא נפגע.
function ocrCorruptScore(s) {
  const tokens = String(s || '').split(/\s+/).filter(Boolean);
  let hard = 0; // סמן-שיבוש מובהק — פסילה כבר על אחד
  let soft = 0; // סמן חלש יותר — נשקל ביחס/במצטבר
  for (const t of tokens) {
    // מרכאה/גרשיים בין שתי אותיות עבריות בתוך טוקן ארוך: כמעט-ודאי שני מילים
    // שנדבקו ב-OCR ('בית"המלאכה'=9). ר"ת לגיטימי קצר (צה"ל=4, ארה"ב=5) מתחת ל-6
    // ולא נפסל. סמן מובהק — אחד מספיק (round-2 העביר משפט עם בדיוק אחד).
    // אבל: תחילית בת אות אחת + פתיחת ציטוט ('ו"מאזני', 'ל"בעיה', 'ש"גם') היא עברית
    // תקינה לחלוטין — נדרשות ≥2 אותיות לפני הגרשיים כדי שזה יהיה הידבקות-OCR.
    const q = t.search(/["״׳“”]/);
    if (q >= 2 && /[א-ת]["״׳“”][א-ת]/.test(t) && t.replace(/["'״׳“”]/g, '').length >= 6) { hard += 1; continue; }
    if (/[א-ת][*][א-ת]/.test(t)) { hard += 1; continue; }   // יום*יום, גילדות*נגרים
    if (/\d[א-ת]|[א-ת]\d/.test(t)) { hard += 1; continue; }  // ספרה דבוקה לאות עברית
    if (/[A-Za-z]\d|\d[A-Za-z]/.test(t)) { soft += 1; }      // ספרה-לטינית: רך (COVID19)
  }
  return { hard, soft, total: tokens.length };
}

/** "זה בכלל משפט?" — מסנן רצפי כותרות/תוכן-עניינים ממצגות ו-PDF שבורים. */
function looksLikeProse(s) {
  const words = countWords(s);
  // רצף ארוך בלי פיסוק סופי = ריצת כותרות ("תחנות יסוד... חבר פרלמנט (1865-68)...")
  if (words > 15 && !/[.!?׃]$/.test(s)) return false;
  if (s.includes('…')) return false;                       // נחתך כבר במקור
  // שיבושי-OCR: סמן מובהק אחד (hard) מספיק לפסילה; אחרת ≥2 מצטבר או >12%.
  const oc = ocrCorruptScore(s);
  if (oc.hard >= 1) return false;
  if (oc.soft >= 2 || (oc.total > 0 && oc.soft / oc.total > 0.12)) return false;
  const fnRe = hebrewRatio(s) >= 0.5 ? HE_FUNCTION_WORDS_RE : EN_FUNCTION_WORDS_RE;
  if (!fnRe.test(s)) return false;                         // אין מילות תפקוד — רשימת שמות
  // צפיפות סוגריים/מספרים גבוהה = שורת ביבליוגרפיה או ציר-זמן, לא טענה
  const numParen = (s.match(/[()0-9]/g) || []).length;
  if (numParen / Math.max(s.length, 1) > 0.12) return false;
  return true;
}

function pickCoreSentence(chunkText, { terms = [], used = new Set() } = {}) {
  const sentences = splitSentences(chunkText).map(cleanEvidenceSentence).filter(Boolean);
  const norm = (s) => String(s).replace(/[.!?׃…]+$/, '').trim();
  let best = null;
  let bestScore = -Infinity;
  for (const s of sentences) {
    if (used.has(norm(s))) continue;
    const words = countWords(s);
    if (words < MIN_CLAUSE_WORDS) continue;
    if (!looksLikeProse(s)) continue;
    let score = 0;
    if (words <= MAX_CLAUSE_WORDS) score += 2; else score -= (words - MAX_CLAUSE_WORDS) / 10;
    score += hebrewRatio(s) * 2;
    const lower = s;
    for (const t of terms) {
      if (t && lower.includes(t)) score += 3;
    }
    // משפט שנקטע באמצע (בלי פיסוק סופי) פחות אמין לציטוט עקיף.
    if (!/[.!?׃]$/.test(s)) score -= 1;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  if (!best) return null;
  // חיתוך למגבלה תוך שמירה על שלמות מילים.
  const w = best.split(/\s+/);
  const clause = w.length > MAX_CLAUSE_WORDS ? `${w.slice(0, MAX_CLAUSE_WORDS).join(' ')}…` : best;
  return clause.replace(/[.!?׃]+$/, '');
}

// round-4: תבליט-מצגת (sourceKind='slides') הוא לרוב צירוף-נושא בלי פועל מוטה —
// looksLikeProse פוסל אותו בצדק *כפסוקית מדווחת* (הוא לא), אבל כציטוט ישיר קצר
// הוא ראיה לגיטימית ושמישה. לכן ציטוט ממקור-שקפים עובר מסלול נפרד: בלי
// looksLikeProse, אבל עדיין עם סינון-הג'יבריש (ocrCorruptScore) ואורך מינימלי
// לציטוט משמעותי (ברירת מחדל 6 מילים) — לא כל שבר-תבליט ראוי לציטוט.
function pickQuoteFragment(chunkText, { terms = [], used = new Set(), minWords = 6 } = {}) {
  const sentences = splitSentences(chunkText).map(cleanEvidenceSentence).filter(Boolean);
  const norm = (s) => String(s).replace(/[.!?׃…]+$/, '').trim();
  let best = null;
  let bestScore = -Infinity;
  for (const s of sentences) {
    if (used.has(norm(s))) continue;
    const words = countWords(s);
    if (words < minWords) continue;
    const oc = ocrCorruptScore(s);
    if (oc.hard >= 1) continue;
    if (oc.soft >= 2 || (oc.total > 0 && oc.soft / oc.total > 0.12)) continue;
    let score = hebrewRatio(s) * 2;
    for (const t of terms) if (t && s.includes(t)) score += 3;
    if (words <= QUOTE_MAX_WORDS) score += 2; else score -= (words - QUOTE_MAX_WORDS) / 10;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  if (!best) return null;
  const w = best.split(/\s+/);
  const clause = w.length > QUOTE_MAX_WORDS ? `${w.slice(0, QUOTE_MAX_WORDS).join(' ')}…` : best;
  return clause.replace(/[.!?׃]+$/, '');
}

/** "@author" מכותרת מקור: 4 מילים ראשונות, בלי סיומות קובץ. */
function authorFromSource(sourceTitle) {
  const words = String(sourceTitle || '')
    .replace(/\.(pdf|docx?|txt|pptx?)$/i, '')
    .split(/\s+/);
  // שם קובץ טיפוסי: "כהן ולוי 2019 מעורבות הורים" — המחבר הוא מה שלפני השנה.
  const out = [];
  for (const w of words) {
    if (/\d/.test(w)) { out.push(w); break; }  // השנה נשארת: "כהן ולוי 2019"
    // מפריד בכותרת ("מארקס ואנגלס – המניפסט") — עוצר לפניו כדי לא לגרור מקף תלוי
    // לתוך הציטוט ("(מארקס ואנגלס –)"). round-2 flag.
    if (/^[–—-]+$/.test(w)) break;
    out.push(w);
    if (out.length >= 3) break;
  }
  // ניקוי פיסוק-מפריד תלוי בקצה, ליתר ביטחון.
  return out.join(' ').replace(/[\s–—:,;.\-]+$/, '').trim() || 'המקור';
}

function citeFromEvidence(item) {
  const name = authorFromSource(item?.sourceTitle);
  const page = item?.pageHint ? `, עמ' ${item.pageHint}` : '';
  return `(${name}${page})`;
}

// ── תכנון מהלכים לפי intent ────────────────────────────────────────────────
// לכל intent: רצף הפתיחה, ואיזה "מחזור" חוזר עד שמגיעים למכסה.
// evidence = משפט מדווח מ-chunk; quote = ציטוט ישיר; contrast/concede = מסגור
// ראיה נוספת כזווית שונה (עדיין מהחומר!); wrap = משפט מטא סוגר.
// ── רשימת הפקודות (Phase "בקשות" — בלי שפה חופשית) ─────────────────────────
// כל פקודה = חוק דטרמיניסטי על תוכנית המהלכים / המכסה / הראיות. ה-UI מציג
// אותן לפי קטגוריה; single מציין קטגוריות בהן בוחרים אחת לכל היותר.
export const PROSE_COMMANDS = [
  { id: 'len_brief', cat: 'אורך', label: 'תמציתי מאוד', desc: 'כמחצית מהמכסה', single: 'len' },
  { id: 'len_short', cat: 'אורך', label: 'קצר יותר', desc: 'כ-70% מהמכסה', single: 'len' },
  { id: 'len_expand', cat: 'אורך', label: 'מפורט יותר', desc: 'כ-130% מהמכסה — אם יש מספיק ראיות', single: 'len' },
  { id: 'ev_more_quotes', cat: 'ראיות וציטוטים', label: 'יותר ציטוטים ישירים', desc: 'מהלך ציטוט נוסף בכל מחזור' },
  { id: 'ev_no_quotes', cat: 'ראיות וציטוטים', label: 'בלי ציטוטים ישירים', desc: 'הכול בדיווח עקיף עם מראה מקום' },
  { id: 'ev_strong_only', cat: 'ראיות וציטוטים', label: 'רק ראיות חזקות', desc: 'משתמש רק בהתאמות הבטוחות ביותר (z גבוה)' },
  { id: 'tone_concede', cat: 'טון ומבנה', label: 'הוסף הסתייגויות', desc: 'מהלך סיוג בכל מחזור — כתיבה זהירה יותר' },
  { id: 'tone_contrast', cat: 'טון ומבנה', label: 'הדגש ניגודים', desc: 'מהלך ניגוד בכל מחזור' },
  { id: 'tone_no_wrap', cat: 'טון ומבנה', label: 'בלי משפטי סיכום', desc: 'משאיר את הסגירה לך' },
  { id: 'st_short_paras', cat: 'ניסוח', label: 'פסקאות קצרות', desc: '2 משפטים לפסקה במקום 3' },
  { id: 'st_reshuffle', cat: 'ניסוח', label: 'נסח מחדש', desc: 'אותן ראיות, מסגרות וסדר אחרים' },
  { id: 'st_pick5', cat: 'ניסוח', label: 'בחירה קפדנית', desc: '5 וריאנטים במקום 3 — הדטקטור בוחר' },
];

const MOVE_PLANS = {
  intro:      { lead: ['claim'], cycle: ['evidence', 'explain'], close: ['transition'] },
  review:     { lead: ['claim'], cycle: ['evidence', 'evidence', 'quote'], close: ['wrap'] },
  analysis:   { lead: ['claim'], cycle: ['evidence', 'explain', 'contrast'], close: ['wrap'] },
  comparison: { lead: ['claim'], cycle: ['evidence', 'contrast'], close: ['wrap'] },
  argument:   { lead: ['claim'], cycle: ['evidence', 'explain', 'concede'], close: ['wrap'] },
  method:     { lead: [], cycle: ['evidence', 'evidence'], close: [] },
  findings:   { lead: ['claim'], cycle: ['evidence', 'quote', 'explain'], close: ['wrap'] },
  conclusion: { lead: ['wrapOpen'], cycle: ['evidence', 'explain'], close: ['wrap'] },
  exposition: { lead: ['claim'], cycle: ['evidence', 'explain', 'quote'], close: ['wrap'] },
};

// ── המחולל ────────────────────────────────────────────────────────────────
/**
 * כתיבת גוף פרק מקומית מראיות.
 *
 * @param {object} section  יחידת spec: {id, title, intent, mustMention, keywords, quota?}
 * @param {Array<object>} evidence  רשימת chunks מ-findEvidenceForSection (ranked)
 * @param {{quotaWords?:number, seedKey?:string, profile?:object,
 *          avgSentenceWords?:number}} opts
 * @returns {{sentences:Array<{text:string,move:string,evidenceId:string|null}>,
 *            html:string, wordCount:number, notes:string[], usedEvidenceIds:string[]}|null}
 */
export function composeSectionProse(section, evidence, opts = {}) {
  const list = Array.isArray(evidence) ? evidence.filter((e) => e && e.text) : [];
  if (!list.length) return null;   // BLOCKED נשאר BLOCKED — לא ממציאים

  const {
    quotaWords = 0,
    seedKey = section?.id || 'section',
    profile = null,
    avgSentenceWords = AVG_WORDS_PER_SENTENCE,
    commands = null,   // מזהי PROSE_COMMANDS — חוקים דטרמיניסטיים, לא שפה חופשית
    // Set משותף בין כל סעיפי העבודה: בלי זה אותו משפט ראיה חוזר בסעיפים א-ד
    // (נמדד בעבודה אמיתית). הקורא (Studio) מעביר Set אחד לכל הריצה.
    sharedUsedSentences = null,
  } = opts;
  const cmds = new Set(Array.isArray(commands) ? commands : commands instanceof Set ? [...commands] : []);

  // מזהה ראיה: findEvidenceForSection מחזיר chunk תחת `chunkId` (לא `id`), ולכן
  // בלי הנפילה הזו כל evidenceId היה null — עיגון-המשפט-לראיה (עקרון הכנות) לא
  // נרשם, ו-wrap תמיד ייחס למקור הראשון בלבד. נמדד ב-nlg-loop-round.
  const evId = (e) => (e && (e.chunkId ?? e.id)) || null;

  // סינון ראיות חלשות — ברירת מחדל, לא רק בפקודה. ראיה "(אולי)" טובה כהפניה
  // בשלד, אבל **לא** כבסיס למשפט תוכן: נמדד בעבודה אמיתית — כתבה על סרט בוליוודי
  // (שנקלטה כי מונח-חובה הופיע בה) נכתבה לתוך ניתוח של מיל בכל הסעיפים.
  //
  // הסף תלוי-שפה: שאילתה עברית מול מקור אנגלי מדכאת קוסינוס באופן טבעי (נמדד
  // בהרנס: ראיות אנגליות לגיטימיות ב-z 3.7-4.1), ולכן מקור לטיני מקבל סף מקל.
  // מקור עברי ב-z 4.0 הוא בדיוק פרופיל הזבל הבוליוודי — נשאר על 4.5.
  // ראיה בלי z (fallback לקסיקלי / mock) עוברת — אין לנו במה לשפוט אותה.
  //
  // round-4: 4.5 כויל נגד קורפוס OCR-מזוהם, אבל אותו הדין מוחל גם על מקור עברי
  // דיגיטלי-נקי (pptx/docx שלא עבר OCR) — נמדד: מצגת מיל on-topic ב-z3.15-3.53
  // נפסלה למרות שאין בה סיכון garbage-in. מקור שסומן cleanDigital (ר' addMaterialDocument)
  // מקבל רצפה מקלה יותר: 3.8 — עדיין מעל Z_KEEP=3.4 של evidenceMatchService,
  // כלומר לא מרפים את הסינון הסמנטי עצמו, רק את הענישה הייעודית-ל-OCR.
  const zFloor = (e) => {
    if (hebrewRatio(e.text) < 0.5) return 3.6;
    return e.cleanDigital ? 3.8 : 4.5;
  };
  let workList = list.filter((e) => (typeof e.z === 'number' ? e.z >= zFloor(e) : true));
  if (!workList.length) return null;   // רק ראיות חלשות — עדיף שלד כן מטיוטה מזויפת
  if (cmds.has('ev_strong_only')) {
    const strong = workList.filter((e) => (typeof e.z === 'number' ? e.z >= 6 : false));
    if (strong.length) workList = strong;
  }

  const intent = section?.intent || 'exposition';
  // נושא ארוך הוא בעצם פסוקית ("קבוצת המיעוט ביקשה להפגין בבירת המדינה") —
  // שתילתו במסגרת NP ("בכל הנוגע ל<נושא>") מייצרת עברית שבורה. נמדד בעבודה
  // אמיתית. מסגרות @topic מקבלות רק צירוף שמני קצר; אחרת הן לא ישימות והמנוע
  // בוחר מסגרת פסוקית במקומן.
  const topicForFrames = countWords(section?.title) <= 6 ? String(section?.title || '').trim() : '';
  const basePlan = MOVE_PLANS[intent] || MOVE_PLANS.exposition;
  // תוכנית מהלכים בת-שינוי לפי פקודות.
  const plan = {
    lead: [...basePlan.lead],
    cycle: [...basePlan.cycle],
    close: [...basePlan.close],
  };
  if (cmds.has('ev_no_quotes')) {
    plan.cycle = plan.cycle.map((m) => (m === 'quote' ? 'evidence' : m));
    plan.lead = plan.lead.map((m) => (m === 'quote' ? 'evidence' : m));
  }
  if (cmds.has('ev_more_quotes') && !cmds.has('ev_no_quotes')) plan.cycle.push('quote');
  if (cmds.has('tone_concede') && !plan.cycle.includes('concede')) plan.cycle.push('concede');
  if (cmds.has('tone_contrast') && !plan.cycle.includes('contrast')) plan.cycle.push('contrast');
  if (cmds.has('tone_no_wrap')) plan.close = plan.close.filter((m) => m !== 'wrap');
  // round-4: ראיית-שקפים משתתפת רק במהלך quote (ר' nextEvidence/nextQuoteEvidence
  // למעלה) — אבל MOVE_PLANS של רוב האינטנטים (analysis/argument) לא כוללים quote
  // כברירת מחדל, ולכן בלי זה הראיה פשוט לא הייתה נגישה אף פעם. מוסיפים quote
  // למחזור רק כשיש בפועל ראיית-שקפים בסעיף — לא משנה התנהגות בסעיפים בלעדיה.
  if (workList.some((e) => e.sourceKind === 'slides') && !plan.cycle.includes('quote')) {
    plan.cycle.push('quote');
  }
  // A3 (round-3): claim ממחזר את משפט הראיה הראשון — עם ראיה בודדת זה כפילות
  // ריקה של אותו משפט. פותחים ישר ב-evidence כשאין ≥2 ראיות. wrap מטופל בעת
  // המהלך (דורש ≥2 מקורות שונים) כדי לא לסגור פסקה חד-מקורית ב"תמונה עקבית".
  if (workList.length < 2) plan.lead = plan.lead.map((m) => (m === 'claim' ? 'evidence' : m));
  const terms = [
    ...(Array.isArray(section?.mustMention) ? section.mustMention : []),
    ...(Array.isArray(section?.keywords) ? section.keywords : []),
  ].map((t) => String(t || '').trim()).filter(Boolean);

  const lenFactor = cmds.has('len_brief') ? 0.5 : cmds.has('len_short') ? 0.7 : cmds.has('len_expand') ? 1.3 : 1;
  const targetWords = Math.round((quotaWords > 0 ? quotaWords : Math.min(220, workList.length * 45)) * lenFactor);
  const usedSentences = sharedUsedSentences instanceof Set ? sharedUsedSentences : new Set();
  // מה שנוסף בריצה הזו בלבד — מאפשר ל-composeSectionProseBest להריץ וריאנטים על
  // עותקים ולמזג ל-Set המשותף רק את משפטי הווריאנט הזוכה.
  const addedSentences = [];
  const markUsed = (s) => { usedSentences.add(s); addedSentences.push(s); };
  const avoidFrames = new Set();
  const sentences = [];
  const notes = [];
  const usedEvidenceIds = [];
  let evidenceIdx = 0;
  let wordCount = 0;
  let step = 0;

  // round-4: ראיית-שקפים (sourceKind='slides') מותרת רק במהלך quote — תבליט
  // אינו פסוקית מדווחת. nextEvidence (המשמש claim/evidence/explain/contrast/
  // concede) מדלג עליה ושומר אותה בתור נפרד לציטוט, בלי לאבד אותה ובלי לספור
  // אותה פעמיים. quote מרוקן קודם את התור הזה, ורק אז פונה לתור הרגיל.
  const slideQueue = [];
  const nextEvidence = () => {
    while (evidenceIdx < workList.length) {
      const ev = workList[evidenceIdx];
      evidenceIdx += 1;
      if (ev.sourceKind === 'slides') { slideQueue.push(ev); continue; }
      return ev;
    }
    return null;
  };
  const nextQuoteEvidence = () => (slideQueue.length ? slideQueue.shift() : nextEvidence());

  const emit = (result, evidenceId) => {
    if (!result) return false;
    sentences.push({ text: result.text, move: result.move, evidenceId: evidenceId || null });
    avoidFrames.add(result.frameId);
    wordCount += countWords(result.text);
    return true;
  };

  const doMove = (move) => {
    step += 1;
    const sk = `${seedKey}|${step}`;
    switch (move) {
      case 'claim': {
        // פסוקית פתיחה מעוגנת: הליבה של הראיה החזקה ביותר, מדווחת כטענת הפרק.
        // round-4: לא ראיית-שקפים — תבליט אינו פסוקית-דיווח (וגם היה נכשל
        // ב-looksLikeProse בשקט). הטענה הפותחת חייבת פרוזה אמיתית.
        const ev = workList.find((e) => e.sourceKind !== 'slides');
        if (!ev) return false;
        const clause = pickCoreSentence(ev.text, { terms, used: usedSentences });
        if (!clause) return false;
        markUsed(clause);
        const eid = evId(ev); if (eid && !usedEvidenceIds.includes(eid)) usedEvidenceIds.push(eid);
        return emit(composeMoveSentence('claim', { clause, topic: topicForFrames },
          { seedKey: sk, profile, avoid: avoidFrames }), evId(ev));
      }
      case 'wrapOpen':
      case 'wrap': {
        // משפט מטא — על הראיות שהוצגו, לא על העולם. נוצר רק אם הוצג משהו.
        if (!usedEvidenceIds.length) return false;
        const names = [...new Set(usedEvidenceIds
          .map((id) => workList.find((e) => evId(e) === id))
          .filter(Boolean)
          .map((e) => authorFromSource(e.sourceTitle)))].slice(0, 3);
        // A3 (round-3): סוגר רק כשיש ≥2 מקורות שונים לסכם ("מצביעים יחד"). מקור
        // בודד ⇒ אין מה לסכם, ו"מרכזים את עיקר הידוע" היה ריפוד חלול — מדלגים.
        if (names.length < 2) return false;
        const clause = `המקורות שנסקרו (${names.join('; ')}) מצביעים יחד על תמונה עקבית בסוגיה זו`;
        return emit(composeMoveSentence('wrap', { clause },
          { seedKey: sk, profile, avoid: avoidFrames }), null);
      }
      case 'evidence':
      case 'contrast':
      case 'concede':
      case 'explain': {
        const ev = nextEvidence();
        if (!ev) return false;
        const clause = pickCoreSentence(ev.text, { terms, used: usedSentences });
        if (!clause) return false;
        markUsed(clause);
        const eid = evId(ev); if (eid && !usedEvidenceIds.includes(eid)) usedEvidenceIds.push(eid);
        const content = {
          clause,
          author: authorFromSource(ev.sourceTitle),
          cite: citeFromEvidence(ev),
          topic: topicForFrames,
        };
        // explain בלי ראיה משלו היה מדווח-כפול; כשיש ראיה — הוא פשוט מסגור
        // רך יותר לאותה ראיה ("הדבר מלמד כי..."), עדיין עם מראה מקום.
        const moveForFrame = move === 'explain' ? 'evidence' : move;
        const r = composeMoveSentence(moveForFrame, content, { seedKey: sk, profile, avoid: avoidFrames });
        // מסגרות contrast/concede לא נושאות @cite — מוסיפים את מראה המקום ידנית.
        if (r && (move === 'contrast' || move === 'concede') && !r.text.includes('(')) {
          r.text = r.text.replace(/\.$/, ` ${citeFromEvidence(ev)}.`);
        }
        return emit(r, evId(ev));
      }
      case 'quote': {
        // round-4: תור-השקפים קודם (evidence שאסור לה להשתתף כפרוזה מדווחת,
        // אבל כן כציטוט ישיר) — ורק אחריו התור הרגיל.
        const ev = nextQuoteEvidence();
        if (!ev) return false;
        const isSlide = ev.sourceKind === 'slides';
        const quoteSentence = isSlide
          ? pickQuoteFragment(ev.text, { terms, used: usedSentences })
          : pickCoreSentence(ev.text, { terms, used: usedSentences });
        if (!quoteSentence || countWords(quoteSentence) > QUOTE_MAX_WORDS) {
          if (isSlide) return false; // תבליט לא-ציר — אין מסלול-נפילה כפרוזה, פשוט מדולג
          // ארוך מדי לציטוט ישיר — נדווח כראיה רגילה במקום.
          evidenceIdx -= 1;
          return doMove('evidence');
        }
        markUsed(quoteSentence);
        const eid = evId(ev); if (eid && !usedEvidenceIds.includes(eid)) usedEvidenceIds.push(eid);
        return emit(composeMoveSentence('quoteIntro', {
          quote: quoteSentence,
          author: authorFromSource(ev.sourceTitle),
          cite: citeFromEvidence(ev),
        }, { seedKey: sk, profile, avoid: avoidFrames }), evId(ev));
      }
      case 'transition':
        return emit(composeMoveSentence('transition', { topic: topicForFrames },
          { seedKey: sk, profile, avoid: avoidFrames }), null);
      default:
        return false;
    }
  };

  for (const m of plan.lead) doMove(m);

  // מחזור עד מכסה או עד גמר הראיות. שומר-עצירה כפול — בלי לולאה אינסופית.
  let guard = 0;
  while (wordCount < targetWords && evidenceIdx < workList.length && guard < 40) {
    for (const m of plan.cycle) {
      guard += 1;
      if (wordCount >= targetWords) break;
      doMove(m);
    }
  }

  for (const m of plan.close) doMove(m);

  if (!sentences.length) return null;
  if (quotaWords > 0 && wordCount < quotaWords * 0.6) {
    notes.push(`[דרוש מקור נוסף — החומר הקיים מספיק לכ-${wordCount} מילים מתוך ${quotaWords}]`);
  }

  // פסקאות: 2-4 משפטים, מעבר פסקה אחרי wrap/transition או כל 3 משפטים.
  const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paraSize = cmds.has('st_short_paras') ? 2 : 3;
  const paragraphs = [];
  let current = [];
  for (const s of sentences) {
    current.push(s.text);
    if (current.length >= paraSize || s.move === 'wrap' || s.move === 'transition') {
      paragraphs.push(current.join(' '));
      current = [];
    }
  }
  if (current.length) paragraphs.push(current.join(' '));

  // A4 (round-3): ציטוט כהערת-שוליים ולא בסוגריים inline. המטלה דורשת הערות
  // שוליים. ה-HTML בלבד — draft.txt שומר את הציטוט הקריא בתוך sentence.text.
  // התאמה על מחרוזת-הציטוט המדויקת שאנחנו הפקנו (citeFromEvidence), לא regex
  // גנרי של סוגריים — כדי לא לגעת בסוגריים לגיטימיים בטקסט. סימון <sup>[N]</sup>
  // מתדרדר בחן ל-"[N]" אם TipTap מסנן sup. עמוד חסר ⇒ "עמ' [חסר]".
  let bodyHtml = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  const footnotes = [];
  const citeToNum = new Map();
  for (const id of usedEvidenceIds) {
    const ev = workList.find((e) => evId(e) === id);
    if (!ev) continue;
    const citeStr = escapeHtml(citeFromEvidence(ev));
    if (!bodyHtml.includes(citeStr)) continue;
    let num = citeToNum.get(citeStr);
    if (!num) {
      const page = ev.pageHint ? `, עמ' ${ev.pageHint}` : `, עמ' [חסר]`;
      footnotes.push(`${authorFromSource(ev.sourceTitle)}${page} — ${ev.sourceTitle}`);
      num = footnotes.length;
      citeToNum.set(citeStr, num);
    }
    bodyHtml = bodyHtml.split(citeStr).join(`<sup>[${num}]</sup>`);
  }
  const notesHtml = footnotes.length
    ? `<hr /><p><strong>הערות שוליים</strong></p>${footnotes.map((n, i) => `<p><em>[${i + 1}] ${escapeHtml(n)}</em></p>`).join('')}`
    : '';
  const html = bodyHtml
    + notesHtml
    + notes.map((n) => `<p><em>${escapeHtml(n)}</em></p>`).join('');

  return { sentences, html, wordCount, notes, usedEvidenceIds, usedSentenceKeys: addedSentences };
}

/**
 * לולאת האיכות (Phase 5): מרכיב כמה וריאנטים (seedKey שונה ⇒ מסגרות/סדר שונים)
 * ובוחר את זה שנשמע הכי פחות גנרי לפי פונקציית ניקוד מוזרקת.
 *
 * scoreFn מוזרק ולא מיובא כדי שהמודול יישאר LEAF; בפועל מעבירים את
 * styleAuthenticityService.scoreTextAuthenticity — ציון 0-100, נמוך=אנושי יותר.
 *
 * @param {object} section
 * @param {Array<object>} evidence
 * @param {object} opts  כמו composeSectionProse
 * @param {{scoreFn?:function, variants?:number}} quality
 */
export function composeSectionProseBest(section, evidence, opts = {}, { scoreFn = null, variants = 3 } = {}) {
  const baseSeed = opts.seedKey || section?.id || 'section';
  // הדה-דופ החוצה-סעיפים (sharedUsedSentences) לא מוזן ישירות לווריאנטים: וריאנט
  // ראשון היה "צורך" את המשפטים והשאר היו נבנים מהשאריות. כל וריאנט רץ על עותק,
  // ורק משפטי הזוכה נרשמים ל-Set המשותף.
  const shared = opts.sharedUsedSentences instanceof Set ? opts.sharedUsedSentences : null;
  let best = null;
  let bestScore = Infinity;
  for (let v = 0; v < Math.max(1, variants); v += 1) {
    const variantOpts = {
      ...opts,
      seedKey: `${baseSeed}#${v}`,
      sharedUsedSentences: shared ? new Set(shared) : null,
    };
    const r = composeSectionProse(section, evidence, variantOpts);
    if (!r) continue;
    if (!scoreFn) { best = r; break; }   // בלי מנקד — הווריאנט הראשון התקין
    let score = 50;
    try {
      const plain = r.sentences.map((s) => s.text).join(' ');
      const scored = scoreFn(plain);
      score = Number(scored?.score ?? scored ?? 50);
    } catch { /* ניקוד נכשל — ניקוד ניטרלי */ }
    if (score < bestScore) { bestScore = score; best = { ...r, authenticityScore: score }; }
  }
  if (best && shared && Array.isArray(best.usedSentenceKeys)) {
    best.usedSentenceKeys.forEach((s) => shared.add(s));
  }
  return best;
}

export { ensureSentenceGrammarReady as ensureProseReady };
