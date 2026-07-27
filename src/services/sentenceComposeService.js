// sentenceComposeService.js — הרכבת משפט מלא ממסגרת רטורית + תוכן.
//
// ההכללה של composeOpeners לרמת משפט: styleOpenerService מרכיב *פתיחים*
// מ-slots; כאן מרכיבים משפטי גוף מ-frames של sentenceGrammar.data.js,
// כשהתוכן (פסוקית/נושא/ציטוט/מקור) מגיע מבחוץ — מהראיות, לעולם לא מומצא.
//
// אותם עקרונות בדיוק:
//   - דטרמיניזם: seedKey → אותן בחירות (djb2+mulberry32, בלי Math.random).
//   - משקל אישי: profile דוחף מסגרות שהמשתמש אישר (styleSlotProfile בהמשך).
//   - anti-repeat: הקורא מעביר avoid=Set של frame-ids/קישורים שכבר שימשו.
//   - קליטיקות: frame עם cliticJoin=true מדביק את המילית האחרונה לתוכן בלי רווח
//     ("...היא ש" + "הממצא" → "היא שהממצא").
//
// LEAF: תלוי רק בקובצי data (lazy). browser+node.

let grammar = null;
let grammarPromise = null;
let openerGrammarShared = null;

async function ensureLoaded() {
  if (grammar) return grammar;
  if (!grammarPromise) {
    grammarPromise = Promise.all([
      import('./sentenceGrammar.data.js'),
      import('./openerGrammar.data.js').catch(() => null),
    ]).then(([sg, og]) => {
      grammar = sg.SENTENCE_GRAMMAR;
      openerGrammarShared = og?.OPENER_GRAMMAR?.shared || null;
      return grammar;
    });
  }
  return grammarPromise;
}

export async function ensureSentenceGrammarReady() {
  await ensureLoaded();
  return Object.keys(grammar?.moves || {}).length;
}

// אותו RNG זרוע כמו styleOpenerService — יציבות בין רינדורים.
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

/** ניקוי פסוקית תוכן: בלי נקודה סופית, בלי "ש/כי" מובילות כפולות. */
function cleanClause(clause) {
  let c = String(clause || '').trim().replace(/[.׃]+$/, '').trim();
  // המסגרת מספקת את המשלים — "כי"/"כך ש" מובילות מוסרות כדי למנוע "כי כי".
  // ש' דבוקה ("שהממצא") *לא* מוסרת: אין דרך להבדיל בינה לבין "שני"/"שיטת",
  // ו"היא ששני..." ממילא תקין. באחריות הקורא לספק פסוקית בלי משלים.
  c = c.replace(/^(?:כי|כך ש|לכך ש)\s+/, '');
  return c;
}

function weightedPick(rng, items, weightOf) {
  if (!items.length) return null;
  const weights = items.map(weightOf);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[0];
  let r = rng() * total;
  for (let i = 0; i < items.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * מרכיב משפט אחד ממהלך רטורי.
 *
 * @param {string} move  claim|evidence|quoteIntro|explain|contrast|concede|transition|wrap
 * @param {{clause?:string, topic?:string, author?:string, cite?:string, quote?:string}} content
 * @param {{seedKey?:string, profile?:object, avoid?:Set<string>, useConnector?:boolean}} opts
 * @returns {{text:string, frameId:string, move:string}|null}
 */
export function composeMoveSentence(move, content = {}, opts = {}) {
  if (!grammar) return null;
  const def = grammar.moves?.[move];
  if (!def?.frames?.length) return null;
  const {
    seedKey = '', profile = null, avoid = null, useConnector = false,
    preferSlot = null, avoidSlot = null,
  } = opts;
  // מסגרות שנכרו מהכתיבה של המשתמש עצמו (profile.minedFrames[move]) מצטרפות
  // למאגר. ⚠️ בלי זה הפרופיל יכול רק **לשקלל מחדש** את המסגרות הקבועות — כלומר
  // המנוע לעולם לא ידבר בניסוח של המשתמש אלא רק יעדיף ניסוחים שלי שבמקרה
  // דומים לו. נמדד: מתוך 50 מסגרות, 5 בלבד הופיעו ב-57 העבודות של המשתמש.
  const mined = Array.isArray(profile?.minedFrames?.[move]) ? profile.minedFrames[move] : [];
  const allFrames = mined.length ? [...def.frames, ...mined] : def.frames;
  const rng = mulberry32(djb2(`${seedKey}|${move}`));

  // מסגרות ישימות: יש בתוכן את כל ה-placeholders שהמסגרת דורשת.
  // avoidSlot: פסילת כל מסגרת שמשתמשת בחריץ נתון. ⚠️ נדרש כי `preferSlot=null`
  // רק **מפסיק להעדיף** — המסגרת נשארת בבריכה ועדיין נבחרת. נמדד: פסוקית
  // אנפורית קיבלה מסגרת צד («במקרה של יקיר, זאת עמדה ש…») גם כשההעדפה כובתה,
  // כי הכיבוי אינו פסילה.
  const avoidTok = avoidSlot ? `@${avoidSlot}` : null;
  const usable = allFrames.filter((f) => {
    if (avoid && avoid.has(f.id)) return false;
    if (avoidTok && f.t.includes(avoidTok)) return false;
    if (f.needsAgreement && (!content.g || !content.n)) return false;
    return f.t.every((tok) => {
      if (typeof tok !== 'string' || !tok.startsWith('@')) return true;
      const key = tok.slice(1);
      return Boolean(content[key]);
    });
  });
  const pool = usable.length ? usable : allFrames.filter((f) => !avoid || !avoid.has(f.id));
  if (!pool.length) return null;

  const personal = profile?.slots?.[move]?.frame || null;
  const lambda = profile ? Math.min(0.8, (profile.distinctDocs || 0) / 10) : 0;
  // preferSlot: מטה את הבחירה למסגרות שבאמת משתמשות בחריץ נתון. נדרש כשהחריץ
  // נושא **מידע שחייב להיאמר** ולא רק קישוט — למשל שם הצד שבשאלה: לספק אותו
  // בלי להעדיף אותו שקול לא לספק אותו, כי רוב המסגרות מתעלמות ממנו.
  // ×5 ולא בחירה קשיחה — כדי שהגיוון בין סעיפים יישמר.
  const slotTok = preferSlot ? `@${preferSlot}` : null;
  const frame = weightedPick(rng, pool, (f) => {
    const base = (f.reg ?? 2) >= 2 ? 2 : 1;
    const count = personal ? (personal[f.id] || 0) : 0;
    const slotBoost = slotTok && f.t.includes(slotTok) ? 5 : 1;
    return base * slotBoost * (1 + lambda * Math.min(2, count / 2));
  });
  if (!frame) return null;

  const parts = [];
  let pendingCliticJoin = false;
  for (let ti = 0; ti < frame.t.length; ti += 1) {
    const tok = frame.t[ti];
    if (tok && typeof tok === 'object' && tok.slot === 'connector') {
      if (!useConnector || !openerGrammarShared?.connector?.length) continue;
      const conn = weightedPick(rng, openerGrammarShared.connector, () => 1);
      if (conn && (!avoid || !avoid.has(`conn:${conn.w}`))) parts.push(conn.w);
      continue;
    }
    if (typeof tok !== 'string') continue;
    if (tok.startsWith('@')) {
      const key = tok.slice(1);
      let value = key === 'clause' ? cleanClause(content.clause) : String(content[key] || '').trim();
      if (!value) return null;
      if (key === 'quote' && !/^["״]/.test(value)) value = `"${value}"`;
      if (pendingCliticJoin && parts.length) {
        // ל/ב/כ + ה' הידיעה: ה-ה' נבלעת ("ל"+"המהפכה" → "למהפכה", לא "להמהפכה").
        const clitic = parts[parts.length - 1];
        if (/[לבכ]$/.test(clitic) && value.startsWith('ה') && value.length > 2) {
          value = value.slice(1);
        }
        parts[parts.length - 1] = clitic + value;
      } else {
        parts.push(value);
      }
      pendingCliticJoin = false;
      continue;
    }
    // מילולי. cliticJoin: מסגרת שמסתיימת במילית ("...היא ש", "נוגע ל") מדביקה
    // אותה ל-placeholder הבא בלי רווח — "היא ש"+"הממצא" → "היא שהממצא".
    const nextTok = frame.t[ti + 1];
    if (frame.cliticJoin && typeof nextTok === 'string' && nextTok.startsWith('@')
      && /[שלבכמ]$/.test(tok.trimEnd())) {
      parts.push(tok.trimEnd());
      pendingCliticJoin = true;
      continue;
    }
    parts.push(tok);
  }

  // איחוי: פיסוק נדבק למילה הקודמת; שאר החלקים ברווח.
  let text = '';
  for (const p of parts) {
    if (!p) continue;
    if (/^[,.:;)]/.test(p)) text = text.replace(/\s+$/, '') + p + ' ';
    else text += p + ' ';
  }
  text = text.replace(/\s+([,.:;])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  // נקודה בסוף אם המסגרת לא סיפקה פיסוק סוגר.
  if (!/[.!?:]$/.test(text)) text += '.';

  return { text, frameId: frame.id, move };
}

/** רשימת המהלכים הזמינים (לתכנון ב-proseComposeService). */
export function availableMoves() {
  return grammar ? Object.keys(grammar.moves) : [];
}
