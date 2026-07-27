// nlg-bench/variations.mjs — וריאציות מוגרלות-בזרע של מטלה.
//
// התשובה לקיבוע: המנוע לא יכול "לשנן את המבחן" כי טקסט המטלה משתנה בכל ריצה —
// אבל בצורה דטרמיניסטית לפי זרע, כך שכל כשל ניתן לשחזור מדויק (הזרע נשמר
// ב-bench-history). הווריאציות משמרות סמנטיקה: אותן דרישות, ניסוח/סדר אחרים.

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

// החלפות ניסוח משמרות-משמעות בלשון הוראות מטלה. דו-כיווניות — נבחר כיוון לפי הזרע.
const PARAPHRASES = [
  ['על בסיס ההרצאות וחומרי הקריאה', 'בהתבסס על ההרצאות וחומרי הקריאה'],
  ['יש להפנות בהערות שוליים', 'נדרשת הפניה בהערות שוליים'],
  ['נתח.י את', 'נתחו את'],
  ['הסבר.י ונתח.י', 'הסבירו ונתחו'],
  ['הסבר.י ונמק.י', 'הסבירו ונמקו'],
  ['חובה להזכיר את', 'יש לכלול התייחסות אל'],
  ['מילים בערך', 'מילים לערך'],
  // מטלות מסוג "תיאור מקרה + שאלות יישום" (media-law-2026). בלי אלה הווריאציה
  // על מטלה כזאת מסתכמת ברעש רווחים — כלומר טקסט כמעט זהה בכל ריצה, וזה בדיוק
  // הקיבוע שהבנצ' נבנה למנוע.
  ['קראו בעיון את תיאור המקרה', 'קראו בעיון את תיאור האירוע'],
  ['יש להשיב על כל אחת מן השאלות בנפרד', 'יש לענות על כל שאלה בנפרד'],
  ['תוך התייחסות לטענות התובע', 'תוך התייחסות לטענות התביעה'],
  ['לנמק את מסקנותיכם באופן ברור ומשכנע', 'לבסס את מסקנותיכם באופן ברור ומנומק'],
  ['אילו טענות משפטיות', 'אילו טענות בדין'],
];

/**
 * מפיק וריאנט דטרמיניסטי של טקסט מטלה.
 * @param {string} assignmentText
 * @param {number|string} seed
 * @returns {{text:string, seed:string, applied:string[]}}
 */
export function varyAssignment(assignmentText, seed) {
  const rng = mulberry32(djb2(String(seed)));
  const applied = [];
  let text = String(assignmentText);

  // 1. החלפות ניסוח — כל אחת ב-50% הסתברות (לפי הזרע)
  for (const [a, b] of PARAPHRASES) {
    if (rng() < 0.5 && text.includes(a)) {
      text = text.split(a).join(b);
      applied.push(`ניסוח: "${a.slice(0, 20)}…"`);
    }
  }

  // 2. ערבול סדר השאלות הראשיות (בלוקים שמתחילים ב"מספר." בתחילת שורה),
  //    עם עדכון המספור — הפרסר חייב להחזיק בכל סדר.
  const blocks = text.split(/\n(?=\d+\.\s)/);
  if (blocks.length > 2 && rng() < 0.7) {
    const head = blocks[0];
    const qs = blocks.slice(1);
    for (let i = qs.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [qs[i], qs[j]] = [qs[j], qs[i]];
    }
    const renumbered = qs.map((b, i) => b.replace(/^\d+\.\s/, `${i + 1}. `));
    text = [head, ...renumbered].join('\n');
    applied.push(`סדר שאלות: ${qs.map((b) => (b.match(/^\d+/) || ['?'])[0]).join('→')}`);
  }

  // 2ב. ערבול שאלות **לא ממוספרות** — שורות רצופות הפותחות ב"אילו".
  //     מטלת דיני תקשורת מנסחת כך את כל שש השאלות, ולכן ערבול הבלוקים הממוספר
  //     שלמעלה אינו נוגע בה כלל. כל שאלה כזאת עומדת בפני עצמה ("...כלפי טענותיו
  //     של משה?"), ולכן הסדר הוא באמת שרירותי — וזה מה שנבדק: שהמנוע לא תלוי בו.
  //     נדרשות ≥3 שורות כדי שלא נערבל טקסט שבמקרה פותח ב"אילו".
  {
    const lines = text.split('\n');
    const idx = lines.map((l, i) => (/^\s*אילו\s/.test(l) ? i : -1)).filter((i) => i >= 0);
    if (idx.length >= 3 && rng() < 0.7) {
      const picked = idx.map((i) => lines[i]);
      for (let i = picked.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [picked[i], picked[j]] = [picked[j], picked[i]];
      }
      idx.forEach((lineNo, k) => { lines[lineNo] = picked[k]; });
      text = lines.join('\n');
      applied.push(`סדר שאלות (לא ממוספרות): ${idx.length}`);
    }
  }

  // 3. רעש רווחים/שורות ריקות קל — הפרסר אמור להיות אדיש לזה
  if (rng() < 0.5) {
    text = text.replace(/\n\n/g, (m) => (rng() < 0.3 ? '\n\n\n' : m));
    applied.push('רעש רווחים');
  }

  return { text, seed: String(seed), applied };
}
