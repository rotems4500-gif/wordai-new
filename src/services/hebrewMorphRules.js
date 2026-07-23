// hebrewMorphRules.js — חוקי נטייה גנרטיביים: שורש+בניין → צורות פועל.
//
// זה "מאגר האותיות" האמיתי של עברית: במקום לאחסן כל צורה, מרכיבים אותה
// מאותיות השורש + תבנית הבניין + מוספיות גוף/זמן. כתיב מלא (בלי ניקוד),
// כמו כל הטקסט שהאפליקציה מפיקה.
//
// עקרון בטיחות: המודול הזה *מציע* צורות; הוא לעולם לא מודפס למסמך ישירות.
// tools/morph-build מריץ אותו על כל (שורש,בניין) מהלקסיקון, שופט-Flash מאשר,
// ורק זוגות מאושרים (+טבלת חריגים) נכנסים ל-morphRules.data.js שהשירות
// hebrewMorphService קורא. צורה לא-מאושרת → fallback לצורות מוטות-מראש.
//
// כיסוי (מדרגות מהתוכנית):
//   Tier 1: שלמים (וגם ל"א — זהה בכתיב מלא).
//   Tier 2: ל"ה, פ"נ (בהפעיל), ע"ו/ע"י, פ"י (בהפעיל), חילופי שורקות בהתפעל.
//   Tier 3 (כפולים, פ"א, מרובעים, יוצאי-דופן): לא מיוצרים — מוחזר null,
//           והכלי ממלא טבלת חריגים מפורשת.
//
// LEAF טהור: אפס תלויות, browser+node, אפס I/O.

const FINAL_MAP = { כ: 'ך', מ: 'ם', נ: 'ן', פ: 'ף', צ: 'ץ' };

/** אות אחרונה → צורה סופית (מדבר → מדבר; אבל C3=פ: יחשוף). */
function finalize(word) {
  const w = String(word || '');
  if (!w) return w;
  const last = w[w.length - 1];
  return FINAL_MAP[last] ? w.slice(0, -1) + FINAL_MAP[last] : w;
}

/** אות סופית → רגילה (לשימוש באמצע מילה). */
const UNFINAL_MAP = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
function definalizeLast(word) {
  const w = String(word || '');
  if (!w) return w;
  const last = w[w.length - 1];
  return UNFINAL_MAP[last] ? w.slice(0, -1) + UNFINAL_MAP[last] : w;
}

/** ניתוח גזרה בסיסי משורש (2-4 אותיות, רגילות). */
export function classifyRoot(rootRaw) {
  const root = String(rootRaw || '').split('').map((c) => UNFINAL_MAP[c] || c).join('');
  const L = root.length;
  if (L < 2 || L > 4 || !/^[א-ת]+$/.test(root)) return { root, ok: false, tags: ['invalid'] };
  if (L === 4) return { root, ok: false, tags: ['quadriliteral'] }; // Tier 3
  const tags = [];
  let [c1, c2, c3] = L === 3 ? root : [root[0], null, root[1]];
  if (L === 2) {
    // שורש דו-אותי בלקסיקון = לרוב ע"ו/ע"י שנכתב בלי האם-קריאה (קם→קמ).
    tags.push('hollow2');
    c2 = 'ו';
  }
  if (c1 === 'נ') tags.push('pn');
  if (c1 === 'י') tags.push('py');
  if (c1 === 'א') tags.push('pa');
  if (c2 === 'ו' || c2 === 'י') tags.push('hollow');
  if (c3 === 'ה') tags.push('lh');
  if (c3 === 'א') tags.push('la');
  if (c2 === c3 && L === 3) tags.push('geminate');
  return { root, ok: true, tags, c1, c2, c3 };
}

// מוספיות עבר (משותפות לכל הבניינים) — key: `${person}.${g}.${n}`
const PAST_SUFFIX = {
  '1.b.s': 'תי', '2.m.s': 'ת', '2.f.s': 'ת', '3.m.s': '', '3.f.s': 'ה',
  '1.b.p': 'נו', '2.m.p': 'תם', '2.f.p': 'תן', '3.m.p': 'ו', '3.f.p': 'ו',
};
// תחיליות עתיד + סיומות
const FUT_PREFIX = { '1.b.s': 'א', '2.m.s': 'ת', '2.f.s': 'ת', '3.m.s': 'י', '3.f.s': 'ת', '1.b.p': 'נ', '2.m.p': 'ת', '2.f.p': 'ת', '3.m.p': 'י', '3.f.p': 'י' };
const FUT_SUFFIX = { '2.f.s': 'י', '2.m.p': 'ו', '2.f.p': 'ו', '3.m.p': 'ו', '3.f.p': 'ו' };

const personKey = (person, g, n) => `${person}.${person === 1 ? 'b' : (g || 'm')}.${n || 's'}`;

/**
 * הרכבת צורת עבר מגזע-עבר "בסיסי" (צורת נסתר) + גזע חלופי לסיומות עיצוריות.
 * stemV = גזע לסיומות תנועה (ה/ו), stemC = גזע לסיומות עיצור (תי/ת/נו/תם).
 */
function buildPast(stemV, stemC, person, g, n) {
  const suf = PAST_SUFFIX[personKey(person, g, n)];
  if (suf === undefined) return null;
  if (suf === '') return finalize(stemV);
  const vowelSuffix = suf === 'ה' || suf === 'ו';
  const stem = vowelSuffix ? stemV : stemC;
  return finalize(definalizeLast(stem) + suf);
}

function buildFuture(stemBase, person, g, n, { onePrefixDropsYod = false } = {}) {
  const key = personKey(person, g, n);
  const pre = FUT_PREFIX[key];
  if (pre === undefined) return null;
  const suf = FUT_SUFFIX[key] || '';
  let stem = stemBase;
  // תחילית א' בגוף ראשון: איכתב→אכתב? בכתיב מלא נשארת י' בנפעל בלבד — מטופל אצל הקורא.
  if (pre === 'א' && onePrefixDropsYod && stem.startsWith('י')) stem = stem.slice(1);
  let form = pre + stem;
  if (suf) {
    // סיומת תנועה מוחקת את אם-הקריאה ו' של פעל: יכתוב→יכתבו (כתיב תקני).
    form = definalizeLast(form.replace(/ו(?=[א-ת]$)/, '')) + suf;
    return finalize(form);
  }
  return finalize(form);
}

function buildPresent(ms, { fsSuffix = 'ת', lhPresent = false } = {}, g, n) {
  const base = definalizeLast(ms);
  if (lhPresent) {
    // ל"ה: בונה/בונה/בונים/בונות — הזכר והנקבה זהים בכתיב, הריבוי מקצר את הגזע.
    const stem = base.slice(0, -1); // בונ
    if (n === 'p') return finalize(stem + (g === 'f' ? 'ות' : 'ים'));
    return finalize(base);
  }
  if (n === 'p') return finalize(base + (g === 'f' ? 'ות' : 'ים'));
  if (g === 'f') return finalize(base + fsSuffix);
  return finalize(ms);
}

// ── תבניות לכל בניין ───────────────────────────────────────────────────────
// כל תבנית מחזירה {pastV, pastC, presMs, presOpts, futStem, inf} או null (Tier 3).
function templateFor(binyan, cls) {
  const { c1, c2, c3, tags } = cls;
  const has = (t) => tags.includes(t);
  const strong = !has('lh') && !has('hollow') && !has('hollow2') && !has('geminate') && !has('pa') && !has('quadriliteral');

  switch (binyan) {
    case 1: { // פעל
      if (has('hollow') || has('hollow2')) {
        // קם: עבר קם/קמה/קמתי, הווה קם, עתיד יקום/ישיר, שם-פועל לקום
        const midVowel = c2 === 'י' ? 'י' : 'ו';
        const two = c1 + c3;
        return {
          pastV: two, pastC: two, presMs: two, presOpts: { fsSuffix: 'ה' },
          futStem: c1 + midVowel + c3, inf: 'ל' + c1 + midVowel + c3,
        };
      }
      if (has('lh')) {
        // בנה: עבר בנה/בנתה/בניתי, הווה בונה, עתיד יבנה, שם-פועל לבנות
        const st = c1 + c2;
        return {
          pastV: st + 'ה', pastC: st + 'י', pastFsOverride: st + 'תה', pastPlOverride: st + 'ו',
          presMs: c1 + 'ו' + c2 + 'ה', presOpts: { lhPresent: true },
          futStem: st + 'ה', futNoVavDrop: true, inf: 'ל' + st + 'ות',
        };
      }
      if (!strong) return null;
      return {
        pastV: c1 + c2 + c3, pastC: c1 + c2 + c3,
        presMs: c1 + 'ו' + c2 + c3, presOpts: {},
        futStem: c1 + c2 + 'ו' + c3, inf: 'ל' + c1 + c2 + 'ו' + c3,
      };
    }
    case 2: { // נפעל
      if (!strong) return null;
      return {
        pastV: 'נ' + c1 + c2 + c3, pastC: 'נ' + c1 + c2 + c3,
        presMs: 'נ' + c1 + c2 + c3, presOpts: { fsSuffix: 'ת' },
        futStem: 'י' + c1 + c2 + c3, futKeepsYodAfterAleph: true,
        inf: 'להי' + c1 + c2 + c3,
      };
    }
    case 3: { // פיעל
      if (has('lh')) {
        // כיסה: עבר כיסה/כיסתה/כיסיתי, הווה מכסה, עתיד יכסה, שם-פועל לכסות
        const st = c1 + 'י' + c2;
        return {
          pastV: st + 'ה', pastC: st + 'י', pastFsOverride: st + 'תה', pastPlOverride: st + 'ו',
          presMs: 'מ' + c1 + c2 + 'ה', presOpts: { lhPresent: true },
          futStem: c1 + c2 + 'ה', futNoVavDrop: true, inf: 'ל' + c1 + c2 + 'ות',
        };
      }
      if (!strong) return null;
      return {
        pastV: c1 + 'י' + c2 + c3, pastC: c1 + 'י' + c2 + c3,
        presMs: 'מ' + c1 + c2 + c3, presOpts: {},
        futStem: c1 + c2 + c3, inf: 'ל' + c1 + c2 + c3,
      };
    }
    case 4: { // פועל
      if (!strong) return null;
      return {
        pastV: c1 + 'ו' + c2 + c3, pastC: c1 + 'ו' + c2 + c3,
        presMs: 'מ' + c1 + 'ו' + c2 + c3, presOpts: {},
        futStem: c1 + 'ו' + c2 + c3, futNoVavDrop: true, inf: null,
      };
    }
    case 5: { // הפעיל
      let stem3 = null; // גזע תלת-עיצורי אפקטיבי אחרי גזרות
      if (has('pn')) stem3 = [c2, c3];        // הפיל: נ נבלעת
      else if (has('py')) stem3 = ['ו' + c2, c3]; // הושיב: י→ו  (c1=י)
      else if (has('hollow') || has('hollow2')) {
        // הקים: עבר הקים/הקימה/הקמתי, הווה מקים, עתיד יקים, שם-פועל להקים
        return {
          pastV: 'ה' + c1 + 'י' + c3, pastC: 'ה' + c1, presMs: 'מ' + c1 + 'י' + c3, presOpts: { fsSuffix: 'ה' },
          futStem: c1 + 'י' + c3, futNoVavDrop: true, inf: 'לה' + c1 + 'י' + c3,
        };
      }
      if (has('lh')) {
        // הראה: עבר הראה/הראתה/הראיתי, הווה מראה, עתיד יראה, שם-פועל להראות
        const st = 'ה' + c1 + c2;
        return {
          pastV: st + 'ה', pastC: st + 'י', pastFsOverride: st + 'תה', pastPlOverride: st + 'ו',
          presMs: 'מ' + c1 + c2 + 'ה', presOpts: { lhPresent: true },
          futStem: c1 + c2 + 'ה', futNoVavDrop: true, inf: 'ל' + st + 'ות',
        };
      }
      if (stem3) {
        const [a, b] = stem3;
        return {
          pastV: 'ה' + a + 'י' + b, pastC: 'ה' + a + b, // הפלתי, הושבתי — בלי י'
          presMs: 'מ' + a + 'י' + b, presOpts: { fsSuffix: 'ה' },
          futStem: a + 'י' + b, futNoVavDrop: true, inf: 'לה' + a + 'י' + b,
        };
      }
      if (!strong) return null;
      return {
        pastV: 'ה' + c1 + c2 + 'י' + c3, pastC: 'ה' + c1 + c2 + c3,
        presMs: 'מ' + c1 + c2 + 'י' + c3, presOpts: { fsSuffix: 'ה' },
        futStem: c1 + c2 + 'י' + c3, futNoVavDrop: true, inf: 'לה' + c1 + c2 + 'י' + c3,
      };
    }
    case 6: { // הופעל
      if (!strong) return null;
      return {
        pastV: 'הו' + c1 + c2 + c3, pastC: 'הו' + c1 + c2 + c3,
        presMs: 'מו' + c1 + c2 + c3, presOpts: {},
        futStem: 'ו' + c1 + c2 + c3, futNoVavDrop: true, inf: null,
      };
    }
    case 7: { // התפעל
      // חילופי שורקות: ס/ש → הסת/השת, צ → הצט, ז → הזד
      let mid;
      if (c1 === 'ס' || c1 === 'ש') mid = c1 + 'ת';
      else if (c1 === 'צ') mid = 'צט';
      else if (c1 === 'ז') mid = 'זד';
      else if (c1 === 'ת' || c1 === 'ד' || c1 === 'ט') return null; // Tier 3
      else mid = 'ת' + c1;
      if (has('lh')) {
        const st = 'ה' + mid + c2;
        return {
          pastV: st + 'ה', pastC: st + 'י', pastFsOverride: st + 'תה', pastPlOverride: st + 'ו',
          presMs: 'מ' + mid + c2 + 'ה', presOpts: { lhPresent: true },
          futStem: mid + c2 + 'ה', futNoVavDrop: true, inf: 'ל' + st + 'ות',
        };
      }
      if (!strong) return null;
      return {
        pastV: 'ה' + mid + c2 + c3, pastC: 'ה' + mid + c2 + c3,
        presMs: 'מ' + mid + c2 + c3, presOpts: {},
        futStem: mid + c2 + c3, futNoVavDrop: true, inf: 'לה' + mid + c2 + c3,
      };
    }
    default:
      return null;
  }
}

/**
 * נטיית פועל. מחזיר מחרוזת או null (גזרה/צירוף שלא נתמך — Tier 3).
 * @param {string} root שורש (2-4 אותיות)
 * @param {number} binyan 1-7
 * @param {{tense:'past'|'present'|'future'|'inf', person?:1|2|3, g?:'m'|'f', n?:'s'|'p'}} feat
 */
export function conjugate(root, binyan, feat = {}) {
  const cls = classifyRoot(root);
  if (!cls.ok) return null;
  const t = templateFor(Number(binyan), cls);
  if (!t) return null;
  const { tense, person = 3, g = 'm', n = 's' } = feat;

  if (tense === 'inf') return t.inf ? finalize(t.inf) : null;

  if (tense === 'present') {
    if (!t.presMs) return null;
    return buildPresent(t.presMs, t.presOpts || {}, g, n);
  }

  if (tense === 'past') {
    // ל"ה: נסתרת/נסתרים דורסים את הסיומות הרגילות (בנתה, בנו)
    if (t.pastFsOverride && person === 3 && g === 'f' && n === 's') return finalize(t.pastFsOverride);
    if (t.pastPlOverride && person === 3 && n === 'p') return finalize(t.pastPlOverride);
    if (!t.pastV || !t.pastC) return null;
    return buildPast(t.pastV, t.pastC, person, g, n);
  }

  if (tense === 'future') {
    if (!t.futStem) return null;
    return buildFuture(t.futStem, person, g, n, { onePrefixDropsYod: false });
  }

  return null;
}

/** צורות המפתח שהוולידציה שופטת — מייצגות את כל מסלולי הקוד. */
export const VALIDATION_FORM_KEYS = [
  ['past', { tense: 'past', person: 3, g: 'm', n: 's' }],
  ['pastF', { tense: 'past', person: 3, g: 'f', n: 's' }],
  ['past1', { tense: 'past', person: 1, n: 's' }],
  ['pastP', { tense: 'past', person: 3, g: 'm', n: 'p' }],
  ['pres', { tense: 'present', g: 'm', n: 's' }],
  ['presF', { tense: 'present', g: 'f', n: 's' }],
  ['presP', { tense: 'present', g: 'm', n: 'p' }],
  ['fut', { tense: 'future', person: 3, g: 'm', n: 's' }],
  ['futP', { tense: 'future', person: 3, g: 'm', n: 'p' }],
  ['inf', { tense: 'inf' }],
];

export { finalize, definalizeLast };
