// feedbackDiffService.js — משוב מרצה מתוך diff: השוואת הגרסה שהוגשה מול הגרסה
// שחזרה. כל שינוי של המרצה (החלפה/מחיקה/הוספה ברמת משפט) הופך לאירוע משוב.
//
// דטרמיניסטי לחלוטין: פיצול משפטים בטוח-עברית → LCS ברמת משפט → זיווג
// מחיקה+הוספה סמוכות לפי דמיון ביגרמות. אפס קריאות מודל.
//
// שער אמינות: אם רוב המסמך "השתנה" — כנראה הושוו שני מסמכים שונים (או גרסאות
// רחוקות), והאירועים היו רעש. מוחזר needsConfirmation והמשתמש מכריע ב-wizard.
//
// ⚠️ בלי \b — לא עובד סביב אותיות עבריות.

import { ANCHOR_EXCERPT_MAX, FEEDBACK_TEXT_MAX } from './lecturerProfileStore';

export const DIFF_CHANGE_RATIO_WARN = 0.4;
const REPLACEMENT_SIMILARITY_MIN = 0.4;
const MIN_SENTENCE_LEN = 8;

const collapse = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const clip = (s, max) => {
  const c = collapse(s);
  return c.length > max ? `${c.slice(0, max - 1)}…` : c;
};

// sentinel לנקודה שאסור לפצל עליה — תו private-use שלא מופיע בטקסט אמיתי.
const DOT_SENTINEL = '\uE000';

/**
 * פיצול משפטים בטוח-עברית. שומרים מפני פיצול על: קיצורים נפוצים (עמ', ד"ר,
 * פס' וכו'), נקודה עשרונית, ומספור סעיפים ("1. הקדמה").
 */
export function splitSentences(text) {
  const src = String(text || '').replace(/\r/g, '');
  const protectedText = src
    // נקודה עשרונית: 3.5
    .replace(/([0-9])\.([0-9])/g, `$1${DOT_SENTINEL}$2`)
    // קיצורים שהנקודה אחריהם אינה סוף משפט
    .replace(/(עמ|פרופ|ד"ר|וכו|וכד|ה"ש|סע|פס|ע"א|בג"צ|בג"ץ)('?)\./g, `$1$2${DOT_SENTINEL}`);

  const rough = protectedText.split(/(?<=[.!?؟:])\s+|\n+/);
  const restore = (s) => s.split(DOT_SENTINEL).join('.');

  const out = [];
  for (const piece of rough) {
    const restored = collapse(restore(piece));
    if (!restored) continue;
    // שורת מספור לבדה ("3." / "ב)") נדבקת למשפט הבא
    if (out.length && /^[0-9א-ת]{1,3}[.)]?$/.test(out[out.length - 1])) {
      out[out.length - 1] = `${out[out.length - 1]} ${restored}`;
    } else {
      out.push(restored);
    }
  }
  return out.filter((s) => s.length >= MIN_SENTENCE_LEN);
}

const normalizeForCompare = (s) => collapse(s).replace(/["'״׳,;:]/g, '').toLowerCase();

function bigrams(s) {
  const norm = normalizeForCompare(s);
  const grams = new Set();
  for (let i = 0; i < norm.length - 1; i += 1) grams.add(norm.slice(i, i + 2));
  return grams;
}

/** דמיון Dice על ביגרמות של תווים — עמיד לשינויי ניסוח קטנים. */
export function bigramSimilarity(a, b) {
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (!ga.size || !gb.size) return 0;
  let common = 0;
  for (const g of ga) if (gb.has(g)) common += 1;
  return (2 * common) / (ga.size + gb.size);
}

/**
 * LCS ברמת משפט (השוואה על צורה מנורמלת). מחזיר ריצות:
 * {type:'same'|'del'|'ins', aIdx?, bIdx?}
 */
function diffSentences(aList, bList) {
  const a = aList.map(normalizeForCompare);
  const b = bList.map(normalizeForCompare);
  const n = a.length;
  const m = b.length;
  // טבלת LCS קלאסית. מסמכים אקדמיים הם מאות משפטים — O(n·m) זול כאן.
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ type: 'same', aIdx: i, bIdx: j }); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: 'del', aIdx: i }); i += 1; }
    else { ops.push({ type: 'ins', bIdx: j }); j += 1; }
  }
  while (i < n) { ops.push({ type: 'del', aIdx: i }); i += 1; }
  while (j < m) { ops.push({ type: 'ins', bIdx: j }); j += 1; }
  return ops;
}

/**
 * השוואת הגשה מול גרסה מוחזרת.
 * @param {string} submittedText הטקסט שהוגש
 * @param {string} returnedText הטקסט שחזר מהמרצה
 * @returns {{ok:boolean, events:[], stats:{total,changed,ratio}, needsConfirmation:boolean, error?:string}}
 */
export function diffSubmissionVsReturned(submittedText, returnedText) {
  const aList = splitSentences(submittedText);
  const bList = splitSentences(returnedText);
  if (!aList.length || !bList.length) {
    return { ok: false, events: [], stats: { total: 0, changed: 0, ratio: 0 }, needsConfirmation: false, error: 'אחד המסמכים ריק או קצר מדי להשוואה.' };
  }

  const ops = diffSentences(aList, bList);

  // איסוף ריצות שינוי רצופות: [del...][ins...] → ניסיון זיווג replacement.
  const events = [];
  let run = { dels: [], inss: [] };
  const flushRun = () => {
    const usedIns = new Set();
    for (const delIdx of run.dels) {
      let best = -1;
      let bestScore = 0;
      run.inss.forEach((insIdx, k) => {
        if (usedIns.has(k)) return;
        const score = bigramSimilarity(aList[delIdx], bList[insIdx]);
        if (score > bestScore) { bestScore = score; best = k; }
      });
      if (best >= 0 && bestScore >= REPLACEMENT_SIMILARITY_MIN) {
        const insIdx = run.inss[best];
        usedIns.add(best);
        events.push({
          kind: 'replacement',
          anchorExcerpt: clip(aList[delIdx], ANCHOR_EXCERPT_MAX),
          feedbackText: clip(bList[insIdx], FEEDBACK_TEXT_MAX),
        });
      } else {
        events.push({ kind: 'deletion', anchorExcerpt: clip(aList[delIdx], ANCHOR_EXCERPT_MAX), feedbackText: '' });
      }
    }
    run.inss.forEach((insIdx, k) => {
      if (usedIns.has(k)) return;
      events.push({ kind: 'insertion', anchorExcerpt: '', feedbackText: clip(bList[insIdx], FEEDBACK_TEXT_MAX) });
    });
    run = { dels: [], inss: [] };
  };

  for (const op of ops) {
    if (op.type === 'same') flushRun();
    else if (op.type === 'del') run.dels.push(op.aIdx);
    else run.inss.push(op.bIdx);
  }
  flushRun();

  const total = Math.max(aList.length, bList.length);
  const changed = events.length;
  const ratio = total ? changed / total : 0;
  return {
    ok: true,
    events,
    stats: { total, changed, ratio },
    needsConfirmation: ratio > DIFF_CHANGE_RATIO_WARN,
  };
}

