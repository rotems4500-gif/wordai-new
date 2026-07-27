// styleFitService.js — מקרב פרוזה מולחנת להרגלים המבניים של המשתמש, **בלי מודל**.
//
// זה הצד האוכף של [styleTargetsService](./styleTargetsService.js): שם נמדד מה
// המשתמש עושה, כאן זה נאכף על הפלט. שלוש פעולות, וכולן דטרמיניסטיות:
//
//   1. הוספת פסיק במשמורת **נלמדת**           (פסיקים למשפט ↑)
//   2. קיבוץ פסקאות ליעד                       (משפטים לפסקה →)
//   3. פיצול משפט ארוך בגבול מקשר — ⚠️ **נמדד ונפסל, מכובה**. הטבלה עם המספרים
//      יושבת מעל splitAtConnective, ואיתה ההסבר למה הכיוון הזה חסום.
//
// ---------- מה מגן על אפס-ההמצאות ----------
// המודול **אינו כותב אף מילה**. פעולה 2 מוסיפה תו פיסוק בלבד; פעולה 1 מחליפה
// ", ו<מקשר>" ב-". <מקשר>" — מסירה ו' חיבור ומעבירה גבול משפט. אין כאן יצירת
// ניסוח, ולכן אין דרך מבנית שייווצר ג'יבריש. זה ההבדל מכל הניסיונות הלקסיקליים
// שנפסלו (ר' "נפסל במדידה" ב-docs/nlg-handoff.md): שם נבחר או נוסח טקסט, כאן רק
// מוזז פיסוק.
//
// **עיגון נשמר**: משפט שמתפצל מוריש את evidenceId שלו לשני חלקיו, ולכן שיעור
// העיגון אינו יכול לרדת מהפעולה הזאת.
//
// ---------- ⚠️ למה המשמורות נלמדות ולא קבועות ----------
// הגרסה הראשונה קבעה ביד רשימת משמורות "בטוחות". שתיים מהן הפיקו עברית שגויה
// בבדיקה יבשה על פלט אמיתי, ושתיהן נראו נכונות בכתיבה:
//   · «ניתן להצביע על, כך ש…» — "על כך ש" הוא צירוף כבול; פסיק בתוכו שגוי.
//   · «החומר, אשר נסקר מראה ש…» — פסוקית מוסגרת קיבלה פסיק פותח בלי פסיק סוגר,
//     וזה **גרוע מאין-פסיק**.
// לכן משמורת אינה נאכפת אלא אם נמדד שהמשתמש עצמו מפסק שם (`COMMA_SLOT_DEFS`
// נמדדות ב-styleTargetsService ומגיעות כ-`targets.commaSlots`). משמורת שדורשת
// פסיק סוגר כדי להיות תקינה מסומנת `applies:false` — היא נמדדת ולעולם לא נאכפת,
// כי אכיפת חצי-כלל פיסוק אינה חצי שיפור אלא שגיאה.
//
// ---------- ⚠️ טווחים מוגנים ----------
// אסור לגעת בתוך ציטוט ובתוך סוגריים, ולא רק מטעמי נאמנות למקור: מחרוזת ההפניה
// שהמלחין הפיק (citeFromEvidence) מותאמת אחר כך **כמחרוזת מדויקת** כדי להפוך
// להערת שוליים (proseComposeService, "bodyHtml.split(citeStr)"). פסיק שיישתל
// בתוכה שובר את ההתאמה והערת השוליים נעלמת בשקט.
//
// תלויות: אין. LEAF מוחלט — מחרוזות בלבד.

/**
 * מקשרים שיכולים לפתוח משפט עברי בפני עצמם. רק אלה משמשים לפיצול: פיצול לפני
 * מקשר משעבד ("בעוד", "ואילו", "ש-") מייצר שבר תחבירי ולא משפט.
 */
const SPLIT_CONNECTIVES = [
  'אולם', 'אך', 'אבל', 'ברם', 'מנגד', 'מאידך',
  'לעומת זאת', 'עם זאת', 'לצד זאת', 'יתרה מכך', 'יתר על כן', 'זאת ועוד',
  'בנוסף', 'כמו כן', 'לפיכך', 'לכן', 'על כן', 'משום כך', 'כתוצאה מכך',
  'מכאן', 'כלומר', 'למעשה', 'בפועל',
];

/**
 * מועמדות למשמורת פסיק. כל אחת נמדדת בקורפוס של המשתמש, ורק מי שהוא מפסק בפועל
 * נאכפת (ר' ההערה למעלה).
 *
 *  kind:'before'  — הפסיק לפני הצירוף.
 *  kind:'opener'  — הצירוף פותח משפט והפסיק אחריו.
 *  applies:false  — נמדדת בלבד. פסוקית מוסגרת שתקינותה דורשת גם פסיק סוגר.
 *  block          — מילים שאם הן קודמות לצירוף, זהו צירוף כבול ולא גבול פסוקית.
 */
export const COMMA_SLOT_DEFS = [
  {
    id: 'contrast',
    label: 'לפני פסוקית ניגוד',
    kind: 'before',
    tokens: ['אך', 'אולם', 'אבל', 'אלא', 'ואילו', 'בעוד', 'ברם', 'ואולם'],
    applies: true,
  },
  {
    id: 'result',
    label: 'לפני פסוקית תוצאה מחוברת',
    kind: 'before',
    tokens: ['ולכן', 'ועל כן', 'ומשום כך', 'וכתוצאה מכך', 'ולפיכך'],
    applies: true,
  },
  {
    id: 'cause',
    label: 'לפני פסוקית סיבה',
    kind: 'before',
    tokens: ['מכיוון ש', 'משום ש', 'מפני ש', 'כיוון ש'],
    applies: true,
    // "על כך ש" / "בכך ש" הם צירופים כבולים — ולכן "כך ש" אינו ברשימה כלל.
  },
  {
    id: 'reported',
    label: 'לפני פסוקית תוכן ("כי")',
    kind: 'before',
    tokens: ['כי'],
    applies: true,
  },
  {
    id: 'example',
    label: 'לפני הדגמה',
    kind: 'before',
    tokens: ['למשל', 'לדוגמה', 'כגון', 'לרבות'],
    applies: true,
  },
  {
    id: 'opener',
    label: 'אחרי תיאור פותח-משפט',
    kind: 'opener',
    tokens: ['לפיכך', 'לכן', 'עם זאת', 'לעומת זאת', 'בנוסף', 'כמו כן', 'יתרה מכך',
      'יתר על כן', 'זאת ועוד', 'מנגד', 'למעשה', 'ראשית', 'שנית', 'שלישית',
      'לסיכום', 'לסיום', 'בפועל', 'כאמור'],
    applies: true,
  },
  // ---- חתימות אישיות ----
  // נמדד בקורפוס: מתוך 1,089 הפסיקים של המשתמש, «תוך» היא **המילה השכיחה ביותר
  // אחרי פסיק** (21) ו-«ובכך» חמישית (14). אלה לא כללי פיסוק כלליים אלא ההרגל
  // שלו, וזו בדיוק הסיבה שהם נמדדים ולא נקבעים: למשתמש אחר הרשימה תיראה אחרת.
  {
    id: 'gerund',
    label: 'לפני פסוקית נסיבה ("תוך")',
    kind: 'before',
    tokens: ['תוך', 'ותוך'],
    applies: true,
  },
  {
    id: 'thereby',
    label: 'לפני "ובכך" / "וכן"',
    kind: 'before',
    tokens: ['ובכך', 'וכן', 'ובאמצעות'],
    applies: true,
  },
  {
    id: 'relative',
    label: 'לפני פסוקית זיקה ("אשר")',
    kind: 'before',
    tokens: ['אשר'],
    // ⚠️ נמדדת ולא נאכפת: «החומר, אשר נסקר מראה ש…» — בלי הפסיק הסוגר זו שגיאה.
    applies: false,
  },
  {
    id: 'relativeShe',
    label: 'לפני פסוקית זיקה ("ש-")',
    kind: 'before',
    tokens: ['ש'],
    // ⚠️ נמדדת בלבד, ובכוונה. למנוע 3.97 פסוקיות ש- למשפט מול 2.27 של המשתמש,
    // ולכן זו לכאורה בריכת הפסיקים הגדולה ביותר. אבל פסיק לפני ש- תקין רק
    // בפסוקית **לא-מגבילה**, וההבחנה בין מגבילה ללא-מגבילה אינה ניתנת לזיהוי
    // דטרמיניסטי מהמחרוזת. אכיפה כאן הייתה מייצרת שגיאה גלויה בכל מופע שני.
    applies: false,
  },
];

const HE = 'א-ת';
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');

/** הרגקס לזיהוי המשמורת, עם או בלי הפסיק שכבר שם. cap1 = הפסיק (או ריק). */
function slotRegex(def) {
  const alt = def.tokens.map(esc).join('|');
  if (def.kind === 'opener') {
    // תחילת משפט: או ראש המחרוזת, או אחרי סימן סיום.
    return new RegExp(`(?:^|(?<=[.!?…]\\s))(${alt})(,?)(?=\\s)`, 'g');
  }
  // תו לפני הרווח — אם הוא פסיק, המשמורת כבר מפוסקת.
  return new RegExp(`([${HE}\\w])(,?)\\s+(${alt})(?=[\\s${HE}])`, 'g');
}

/**
 * כמה פעמים המשמורת מופיעה בטקסט וכמה מהן מפוסקות. זו הפונקציה שמזינה את
 * הלמידה — והיא אותה זיהוי-משמורת שמשמש באכיפה, כדי שלא תיווצר סחיפה בין
 * "מה שנמדד" ל"מה שנאכף".
 *
 * @returns {Object<string,{total:number, withComma:number}>}
 */
export function measureCommaSlotRates(text) {
  const s = String(text || '');
  const out = {};
  for (const def of COMMA_SLOT_DEFS) {
    const re = slotRegex(def);
    let m;
    let total = 0;
    let withComma = 0;
    while ((m = re.exec(s))) {
      total += 1;
      if ((def.kind === 'opener' ? m[2] : m[2]) === ',') withComma += 1;
    }
    out[def.id] = { total, withComma };
  }
  return out;
}

const WORDS = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);

/**
 * טווחים שאסור לגעת בתוכם: ציטוט במרכאות (על כל צורותיהן בעברית) וכל סוגר.
 * @returns {Array<[number,number]>}
 */
function protectedRanges(text) {
  const ranges = [];
  const push = (re) => {
    let m;
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    while ((m = r.exec(text))) ranges.push([m.index, m.index + m[0].length]);
  };
  push(/[""״"'][^""״"'\n]{0,400}[""״"']/);
  push(/\([^()\n]{0,400}\)/);
  push(/\[[^\][\n]{0,400}\]/);
  return ranges;
}

const inProtected = (ranges, idx) => ranges.some(([a, b]) => idx > a && idx < b);

/**
 * מפצל משפט אחד לשניים בגבול מקשר, אם יש כזה ואם שני החלקים יוצאים משפטים
 * סבירים. מחזיר מערך של 1 או 2 מחרוזות.
 *
 * ⚠️ **מכובה כברירת מחדל — נמדד ונפסל.** A/B על אותו טקסט בסיס בדיוק (34 משפטים,
 * מסלול הכללים, 26.7.26), כדי שבורר הווריאנטים לא יבלבל:
 *
 *   | תצורה        | סגנון גולמי | מנוטרל | אורך משפט | פסיק/משפט |
 *   |--------------|-------------|--------|-----------|-----------|
 *   | בסיס         | 40          | 43     | 22.94     | 0.441     |
 *   | פיצול בלבד   | **38**      | 41     | 19.86     | 0.429     |
 *   | פסיקים בלבד  | **41**      | 44     | 22.94     | 0.500     |
 *   | שניהם        | 38          | 41     | 19.86     | 0.457     |
 *
 * כלומר קירוב אורך המשפט ליעד (22.9→19.9 מול יעד 17.0) **הוריד** 2 נקודות סגנון.
 * ההשערה הראשונה הייתה שהפיצול בולע פסיקים קיימים (", ולכן" → ". לכן"); נבדקה
 * ונפסלה — `preserveCommas` נתן **אותם 3 פיצולים ואותו ציון בדיוק**, כי שלושת
 * הגבולות ממילא לא היו מפוסקים. הפיצול עצמו הוא שמזיק.
 *
 * ההסבר המבני: במדד יש 1,000 תכונות n-גרם מול 6 מבניות, ולכן הוא **99.4% בחירת
 * מילים ומורפולוגיה**. המרת מקשר לפתיחת משפט (". לכן") מייצרת רצפים שאינם של
 * המשתמש, וזה גובר על התקרבות התכונה המבנית. אותה מסקנה שכבר נרשמה על הרגיסטר
 * הלקסיקלי, מכיוון שלישי.
 *
 * נשאר בקוד ומאחורי דגל כדי שהמדידה תהיה ניתנת לשחזור ולא תיבדק שוב מאפס.
 *
 * נבחר הגבול ה**קרוב ביותר לאמצע** ולא הראשון: פיצול במילה השביעית מתוך 30
 * מותיר משפט של 23 — כלומר לא פותר את מה שבאנו לפתור.
 */
export function splitAtConnective(sentence, { minWords = 6, preserveCommas = false } = {}) {
  const text = String(sentence || '').trim();
  if (WORDS(text).length < minWords * 2) return [text];

  const ranges = protectedRanges(text);
  const alt = SPLIT_CONNECTIVES.map(esc).join('|');
  // ", ו<מקשר>" · ", <מקשר>" · " ו<מקשר>" · " <מקשר>" — בכל הצורות המקשר עצמו
  // נשמר ורק גבול המשפט וו' החיבור מושפעים.
  const re = new RegExp(`(\\s*,)?\\s+(ו)?(${alt})(?=\\s)`, 'g');

  let best = null;
  let m;
  while ((m = re.exec(text))) {
    const cut = m.index;
    if (cut <= 0 || inProtected(ranges, cut)) continue;
    // גבול שכבר מפוסק (", ולכן") — פיצולו **בולע פסיק קיים**, כלומר מוריד את
    // הפסיקים-למשפט בדיוק כשהמעבר השני מנסה להעלות אותם.
    if (preserveCommas && m[1]) continue;
    const left = text.slice(0, cut).trim();
    const right = `${m[3]}${text.slice(m.index + m[0].length)}`.trim();
    const lw = WORDS(left).length;
    const rw = WORDS(right).length;
    if (lw < minWords || rw < minWords) continue;
    const score = Math.abs(lw - rw);   // הקרוב ביותר לאמצע
    if (!best || score < best.score) best = { left, right, score };
  }
  if (!best) return [text];

  const left = /[.!?…]$/.test(best.left) ? best.left : `${best.left}.`;
  return [left, best.right];
}

/**
 * המשמורות שמותר לאכוף עבור המשתמש הזה: `applies` **וגם** שיעור פיסוק נמדד מעל
 * הסף, ממוינות בסדר יורד — הכלל שהוא הכי עקבי בו נכנס ראשון.
 */
export function enabledCommaSlots(targets, { minRate = 0.5, minTotal = 4 } = {}) {
  const rates = targets?.commaSlots || null;
  if (!rates) return [];
  return COMMA_SLOT_DEFS
    .filter((d) => d.applies)
    .map((d) => ({ def: d, rate: rates[d.id]?.rate ?? 0, total: rates[d.id]?.total ?? 0 }))
    .filter((x) => x.total >= minTotal && x.rate >= minRate)
    .sort((a, b) => b.rate - a.rate);
}

/**
 * מוסיף פסיקים במשמורות המותרות עד גובה התקציב.
 * @returns {{text:string, added:number}}
 */
export function addSafeCommas(sentence, budget, slots, { maxPerSentence = 2 } = {}) {
  let text = String(sentence || '');
  if (budget <= 0 || !slots?.length) return { text, added: 0 };
  let added = 0;
  const room = Math.min(budget, maxPerSentence);

  for (const { def } of slots) {
    if (added >= room) break;
    let guard = 0;
    while (added < room && guard++ < 8) {
      const ranges = protectedRanges(text);
      const re = slotRegex(def);
      let m;
      let hit = -1;
      while ((m = re.exec(text))) {
        if (m[2] === ',') continue;                       // כבר מפוסק
        const idx = def.kind === 'opener'
          ? m.index + m[1].length                          // אחרי התיאור הפותח
          : m.index + m[1].length;                         // אחרי התו שלפני הרווח
        if (idx <= 0 || idx >= text.length) continue;
        if (text[idx - 1] === ',' || text[idx] === ',') continue;
        if (inProtected(ranges, idx)) continue;
        hit = idx;
        break;
      }
      if (hit < 0) break;
      text = `${text.slice(0, hit)},${text.slice(hit)}`;
      added += 1;
    }
  }
  return { text, added };
}

/**
 * מריץ את פעולות 1-2 על משפטי סעיף.
 *
 * @param {Array<{text:string, move:string, evidenceId:(string|null)}>} sentences
 * @param {object} targets מ-deriveStyleTargets
 * @returns {{sentences:Array<object>, stats:{split:number, commas:number}}}
 */
export function fitSentencesToStyle(sentences, targets, { split: doSplit = false } = {}) {
  const list = Array.isArray(sentences) ? sentences : [];
  if (!targets || !list.length) return { sentences: list, stats: { split: 0, commas: 0 } };

  const spread = targets.spread || {};
  // רצפת הפיצול: היעד ועוד שני פיזורים. משפט בתוך הטווח שהמשתמש עצמו נע בו אינו
  // "ארוך מדי" — פיצולו הוא רדיפה אחרי נקודה, בדיוק מה שרזולוציית המדידה אוסרת.
  const splitAbove = Math.max((targets.sentLen || 17) + Math.max(spread.sentLen || 0, 2) * 2, 12);

  const out = [];
  let split = 0;
  for (const s of list) {
    const text = String(s?.text || '');
    if (!doSplit || WORDS(text).length <= splitAbove) { out.push(s); continue; }
    const parts = splitAtConnective(text, { preserveCommas: true });
    if (parts.length === 2) {
      split += 1;
      // ⚠️ evidenceId מועבר לשני החלקים — שניהם נגזרים מאותה ראיה, ולכן העיגון
      // נשמר 100% ואינו יכול לרדת מהפעולה הזאת.
      out.push({ ...s, text: parts[0] }, { ...s, text: parts[1] });
    } else {
      out.push(s);
    }
  }

  // תקציב הפסיקים מחושב על הסעיף כולו ואחרי הפיצול (שמגדיל את מספר המשפטים
  // ולכן את התקציב), ומכוון ליעד — לא לרוויה.
  const slots = enabledCommaSlots(targets);
  let budget = 0;
  if (Number.isFinite(targets.commaPerSent) && slots.length) {
    const current = out.reduce((a, s) => a + ((String(s.text).match(/,/g) || []).length), 0);
    budget = Math.max(0, Math.round(targets.commaPerSent * out.length) - current);
  }

  let commas = 0;
  for (let i = 0; i < out.length && budget > 0; i += 1) {
    const { text, added } = addSafeCommas(out[i].text, budget, slots);
    if (added) {
      out[i] = { ...out[i], text };
      budget -= added;
      commas += added;
    }
  }

  return { sentences: out, stats: { split, commas } };
}

/**
 * מקבץ משפטים לפסקאות סביב היעד.
 *
 * לא גודל קבוע: יעד 2.54 אינו שלם, וגודל קבוע 3 היה נותן 3.0. הקיבוץ נשען על
 * הממוצע הרץ ולכן מייצר תערובת של 2 ו-3 שמתכנסת ליעד.
 *
 * @param {Array<{text:string, move:string}>} sentences
 * @param {number} target משפטים לפסקה
 * @param {{breakAfter?:Set<string>}} opts מהלכים שאחריהם תמיד נשבר
 * @returns {string[]} פסקאות
 */
export function groupParagraphs(sentences, target, { breakAfter = null } = {}) {
  const list = Array.isArray(sentences) ? sentences : [];
  const t = Number.isFinite(target) && target >= 1 ? target : 3;
  const brk = breakAfter || new Set(['wrap', 'transition']);

  const paragraphs = [];
  let current = [];
  let sentCount = 0;
  for (const s of list) {
    current.push(s.text);
    sentCount += 1;
    if ((sentCount / (paragraphs.length + 1)) >= t || brk.has(s.move)) {
      paragraphs.push(current.join(' '));
      current = [];
    }
  }
  if (current.length) paragraphs.push(current.join(' '));
  return paragraphs;
}
