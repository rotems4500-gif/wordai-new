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
function pickCoreSentence(chunkText, { terms = [], used = new Set() } = {}) {
  const sentences = splitSentences(chunkText).map(cleanEvidenceSentence).filter(Boolean);
  const norm = (s) => String(s).replace(/[.!?׃…]+$/, '').trim();
  let best = null;
  let bestScore = -Infinity;
  for (const s of sentences) {
    if (used.has(norm(s))) continue;
    const words = countWords(s);
    if (words < MIN_CLAUSE_WORDS) continue;
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

/** "@author" מכותרת מקור: 4 מילים ראשונות, בלי סיומות קובץ. */
function authorFromSource(sourceTitle) {
  const words = String(sourceTitle || '')
    .replace(/\.(pdf|docx?|txt|pptx?)$/i, '')
    .split(/\s+/);
  // שם קובץ טיפוסי: "כהן ולוי 2019 מעורבות הורים" — המחבר הוא מה שלפני השנה.
  const out = [];
  for (const w of words) {
    if (/\d/.test(w)) { out.push(w); break; }  // השנה נשארת: "כהן ולוי 2019"
    out.push(w);
    if (out.length >= 3) break;
  }
  return out.join(' ').trim() || 'המקור';
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
  } = opts;
  const cmds = new Set(Array.isArray(commands) ? commands : commands instanceof Set ? [...commands] : []);

  // פקודות ראיות: "רק חזקות" מסנן לפי z; אם הסינון מרוקן — נשארים עם המקור
  // (עדיף טיוטה מראיות בינוניות מאשר סעיף ריק בהפתעה).
  let workList = list;
  if (cmds.has('ev_strong_only')) {
    const strong = list.filter((e) => (typeof e.z === 'number' ? e.z >= 4.5 : false));
    if (strong.length) workList = strong;
  }

  const intent = section?.intent || 'exposition';
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
  const terms = [
    ...(Array.isArray(section?.mustMention) ? section.mustMention : []),
    ...(Array.isArray(section?.keywords) ? section.keywords : []),
  ].map((t) => String(t || '').trim()).filter(Boolean);

  const lenFactor = cmds.has('len_brief') ? 0.5 : cmds.has('len_short') ? 0.7 : cmds.has('len_expand') ? 1.3 : 1;
  const targetWords = Math.round((quotaWords > 0 ? quotaWords : Math.min(220, workList.length * 45)) * lenFactor);
  const usedSentences = new Set();
  const avoidFrames = new Set();
  const sentences = [];
  const notes = [];
  const usedEvidenceIds = [];
  let evidenceIdx = 0;
  let wordCount = 0;
  let step = 0;

  const nextEvidence = () => (evidenceIdx < workList.length ? workList[evidenceIdx++] : null);

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
        const ev = workList[0];
        const clause = pickCoreSentence(ev.text, { terms, used: usedSentences });
        if (!clause) return false;
        usedSentences.add(clause);
        if (!usedEvidenceIds.includes(ev.id)) usedEvidenceIds.push(ev.id);
        return emit(composeMoveSentence('claim', { clause, topic: section?.title || '' },
          { seedKey: sk, profile, avoid: avoidFrames }), ev.id);
      }
      case 'wrapOpen':
      case 'wrap': {
        // משפט מטא — על הראיות שהוצגו, לא על העולם. נוצר רק אם הוצג משהו.
        if (!usedEvidenceIds.length) return false;
        const names = [...new Set(usedEvidenceIds
          .map((id) => workList.find((e) => e.id === id))
          .filter(Boolean)
          .map((e) => authorFromSource(e.sourceTitle)))].slice(0, 3);
        const clause = names.length > 1
          ? `המקורות שנסקרו (${names.join('; ')}) מצביעים יחד על תמונה עקבית בסוגיה זו`
          : `הדברים שהובאו מתוך ${names[0] || 'החומר'} מרכזים את עיקר הידוע בסוגיה זו`;
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
        usedSentences.add(clause);
        if (!usedEvidenceIds.includes(ev.id)) usedEvidenceIds.push(ev.id);
        const content = {
          clause,
          author: authorFromSource(ev.sourceTitle),
          cite: citeFromEvidence(ev),
          topic: section?.title || '',
        };
        // explain בלי ראיה משלו היה מדווח-כפול; כשיש ראיה — הוא פשוט מסגור
        // רך יותר לאותה ראיה ("הדבר מלמד כי..."), עדיין עם מראה מקום.
        const moveForFrame = move === 'explain' ? 'evidence' : move;
        const r = composeMoveSentence(moveForFrame, content, { seedKey: sk, profile, avoid: avoidFrames });
        // מסגרות contrast/concede לא נושאות @cite — מוסיפים את מראה המקום ידנית.
        if (r && (move === 'contrast' || move === 'concede') && !r.text.includes('(')) {
          r.text = r.text.replace(/\.$/, ` ${citeFromEvidence(ev)}.`);
        }
        return emit(r, ev.id);
      }
      case 'quote': {
        const ev = nextEvidence();
        if (!ev) return false;
        const quoteSentence = pickCoreSentence(ev.text, { terms, used: usedSentences });
        if (!quoteSentence || countWords(quoteSentence) > QUOTE_MAX_WORDS) {
          // ארוך מדי לציטוט ישיר — נדווח כראיה רגילה במקום.
          evidenceIdx -= 1;
          return doMove('evidence');
        }
        usedSentences.add(quoteSentence);
        if (!usedEvidenceIds.includes(ev.id)) usedEvidenceIds.push(ev.id);
        return emit(composeMoveSentence('quoteIntro', {
          quote: quoteSentence,
          author: authorFromSource(ev.sourceTitle),
          cite: citeFromEvidence(ev),
        }, { seedKey: sk, profile, avoid: avoidFrames }), ev.id);
      }
      case 'transition':
        return emit(composeMoveSentence('transition', { topic: section?.title || '' },
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
  const html = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')
    + notes.map((n) => `<p><em>${escapeHtml(n)}</em></p>`).join('');

  return { sentences, html, wordCount, notes, usedEvidenceIds };
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
  let best = null;
  let bestScore = Infinity;
  for (let v = 0; v < Math.max(1, variants); v += 1) {
    const r = composeSectionProse(section, evidence, { ...opts, seedKey: `${baseSeed}#${v}` });
    if (!r) continue;
    if (!scoreFn) return r;   // בלי מנקד — הווריאנט הראשון התקין
    let score = 50;
    try {
      const plain = r.sentences.map((s) => s.text).join(' ');
      const scored = scoreFn(plain);
      score = Number(scored?.score ?? scored ?? 50);
    } catch { /* ניקוד נכשל — ניקוד ניטרלי */ }
    if (score < bestScore) { bestScore = score; best = { ...r, authenticityScore: score }; }
  }
  return best;
}

export { ensureSentenceGrammarReady as ensureProseReady };
