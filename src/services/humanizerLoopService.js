// humanizerLoopService — לולאת האנשה יריבה (adversarial humanizer).
// במקום shot אחד עיוור: צור/האנש → נקד מול הגלאי המקומי (styleAuthenticityService)
// → אם הציון מעל היעד, הזרק את ה-markers הספציפיים שנתפסו לתוך prompt תיקון ממוקד
// → שכתב שוב → נקד שוב → שמור את הטוב ביותר (ציון נמוך = אנושי) עד יעד או max passes.
//
// המדד שמנצחים עליו הוא בדיוק הגלאי שהמשתמש רואה ב-MagicWand/AiSidebar — כך
// שהפלט נשמע אנושי גם לפי המודד הפנימי, לא רק "בתחושה".
//
// invokeModel(prompt, context) => Promise<string>. הקורא עוטף את ספק ה-AI הפעיל.

import { scoreTextAuthenticity } from './styleAuthenticityService';
// הדוגמאות בהנחיות נגזרות מאותן רשימות שהגלאי סופר — כך שההנחיה למודל וההענשה
// בפועל לא יכולות להיפרד. ר' styleMarkers.shared.
import {
  FORMAL_CONNECTORS, CLICHE_PHRASES, AI_REGISTER_PROMPT_EXAMPLES, markerExamplesQuoted,
} from './styleMarkers.shared';

export const DEFAULT_HUMANIZER_LOOP = { target: 35, maxPasses: 3 };

// תוספת system חזקה לכתיבה "בלתי ניתנת לזיהוי". מנוסחת כדי לסתור ישירות את
// הסיגנלים שהגלאי מודד: אחידות אורך משפט, מחברים פורמליים, קלישאות, מבנה מלוטש-מדי,
// אוצר מילים דל, ופתיחי משפט חוזרים.
export const STEALTH_HUMANIZE_GUIDE = [
  'כתוב כך שאדם אמיתי כתב את זה ולא מערכת. שמור על המשמעות, הטיעון, העובדות והדיוק — שנה רק איך זה נשמע.',
  'קצב לא אחיד (burstiness): ערבב משפטים קצרים מאוד (3-6 מילים) עם משפטים ארוכים. אסור שכל המשפטים יהיו באותו אורך.',
  'גוון פתיחי משפט: אל תפתח שני משפטים סמוכים באותה מילה או מבנה. הימנע מ"בנוסף", "כמו כן", "יתרה מכך" כפתיח חוזר.',
  // ⚠️ **דוגמאות ולא הרשימה המלאה** (11 ו-9 פריטים מראש הרשימות הקנוניות). הזרקת
  // כל 58 המחברים ו-29 הקלישאות הייתה מנפחת את ה-system פי כמה ומדללת את שאר
  // ההנחיות — והלולאה ממילא מזריקה את המרקרים ה**ספציפיים** שנתפסו ב-buildRepairPrompt.
  `הימנע ממחברים פורמליים שחוקים: ${markerExamplesQuoted(FORMAL_CONNECTORS, 11)}. אם צריך קשר — השתמש בקשר טבעי ופשוט או בלי מחבר בכלל.`,
  `הימנע מקלישאות AI: ${markerExamplesQuoted(CLICHE_PHRASES, 9)}.`,
  'מבנה לא מלוטש-מדי: מעט מאוד מקפים ארוכים (–/—), כמעט בלי הערות בסוגריים מבארות, בלי מרכאות-הדגשה ("scare quotes"), בלי נקודה-פסיק. כתוב ישיר.',
  'אוצר מילים חי ומגוון: אל תחזור על אותן מילות תוכן. העדף מילים קונקרטיות וספציפיות על פני מופשטות וכלליות.',
  'העדף משפט פעיל על סביל. שלב פנייה אנושית טבעית, אסוציאציה קצרה או דוגמה ממשית כשזה מתאים — בלי להמציא עובדות.',
  'מותר אי-סדר אנושי קל: משפט שמתחיל בקישור, פסקה לא סימטרית, אורך לא צפוי. זה מה שמבדיל אדם ממכונה.',
  'החזר רק את הטקסט עצמו — בלי כותרות, בלי הסברים, בלי הקדמות, בלי "הנה הגרסה".',
].join('\n');

// ממפה את ה-markers שהגלאי החזיר להוראות תיקון ממוקדות וקונקרטיות.
export const MARKER_REPAIR = {
  uniformity: (d) => `אורך המשפטים אחיד מדי${d ? ` (${d})` : ''} — שבור את האחידות: הכנס כמה משפטים קצרים מאוד (3-6 מילים) לצד ארוכים.`,
  formalConnector: (d) => `יש עומס מחברים פורמליים${d ? `: ${d}` : ''} — מחק או החלף אותם בקשר טבעי ופשוט, או הסר את המחבר לגמרי.`,
  cliche: (d) => `יש קלישאות שחוקות${d ? `: ${d}` : ''} — נסח אותן מחדש במילים קונקרטיות ומקוריות.`,
  structural: (d) => `המבנה מלוטש-מדי${d ? ` (${d})` : ''} — הורד מקפים ארוכים, סוגריים מבארות, מרכאות-הדגשה ונקודה-פסיק. כתוב ישיר.`,
  lowRichness: (d) => `אוצר המילים חוזר/דל${d ? ` (${d})` : ''} — גוון את הניסוח והמילים, אל תחזור על אותם ביטויים.`,
  openerRepeat: (d) => `פתיחי משפט חוזרים${d ? ` (${d})` : ''} — פתח כל משפט אחרת, בלי אותה מילה/מבנה פעמיים ברצף.`,
  personalMismatch: (d) => `הטקסט לא תואם את הקול האישי שנלמד${d ? ` (${d})` : ''} — קרב אותו לאוצר המילים ולקצב האישי.`,
  // תבנית מפוזרת (רמת רצפי-אותיות) — אין תיקון נקודתי אפשרי, כי הבעיה אינה ביטוי
  // ספציפי. ההנחיה: לנסח מחדש לגמרי, לא להחליף מילה-במילה.
  ngramGeneric: () => 'התבנית הסטטיסטית של הטקסט (רצפי-אותיות) עדיין אופיינית ל-AI — זו לא בעיה של ביטוי בודד, אלא של הניסוח כולו. נסח מחדש לגמרי במילים ובמבנה משפט שונים לחלוטין, לא רק תיקון נקודתי.',
  aiTemplate: (d) => `תבנית המסמך אופיינית ל-AI${d ? ` (${d})` : ''} — פרק את תבנית המסמך: בלי כותרות עם נקודתיים בסגנון תבליט, בלי כותרת-שאלה רטורית, בלי "מוסר השכל"/המלצה בסוף, ובלי ניגוד מלאכותי מסוג "מצד אחד...מצד שני". תן לטקסט לזרום כפרוזה רגילה.`,
  // הדוגמאות הן הצורות הקריאות של AI_REGISTER_PATTERN (אי אפשר להראות regex למודל),
  // ומוחזקות לצדו במקור המשותף כדי שלא ייפרדו ממנו.
  aiRegister: (d) => `יש ניסוחי מסגור והמלצה אופייניים ל-AI${d ? `: ${d}` : ''} — הימנע מ${markerExamplesQuoted(AI_REGISTER_PROMPT_EXAMPLES, 5)}. תבע את הטענה ישירות, בלי המסגור הכללי.`,
};

export const buildRepairPrompt = (currentText, scoreResult, passNumber, htmlMode = false) => {
  const markers = Array.isArray(scoreResult?.markers) ? scoreResult.markers : [];
  const directives = markers
    .map((m) => (MARKER_REPAIR[m.key] ? `• ${MARKER_REPAIR[m.key](m.detail)}` : `• ${m.label}`))
    .slice(0, 7);

  return [
    `שכתוב האנשה ממוקד (סבב ${passNumber}). הגלאי האוטומטי עדיין מזהה את הטקסט כגנרי/מכונה (ציון ${scoreResult?.score ?? '?'}/100).`,
    'תקן בדיוק את הסימנים שנתפסו, בלי לשנות את המשמעות, הטיעון, העובדות או הנתונים:',
    directives.length ? directives.join('\n') : '• המשפטים אחידים ומלוטשים מדי — הוסף קצב אנושי לא צפוי וגיוון.',
    htmlMode
      ? 'שמר בדיוק על כל תגיות ה-HTML, הכותרות, הרשימות ומבנה המסמך — שכתב רק את הטקסט הקריא בתוך התגיות. אל תוסיף ואל תסיר תגיות.'
      : '',
    htmlMode ? 'ה-HTML לשכתוב:' : 'הטקסט לשכתוב:',
    `"""\n${currentText}\n"""`,
    htmlMode
      ? 'החזר רק את ה-HTML המעודכן, בלי הסברים, בלי markdown ובלי הקדמה.'
      : 'החזר רק את הנוסח החדש, בלי הסברים ובלי הקדמה.',
  ].filter(Boolean).join('\n\n');
};

const safeScore = (text, profile) => {
  try {
    return scoreTextAuthenticity(text, profile ? { profile } : {});
  } catch {
    return { ok: false };
  }
};

// אורך הטקסט הנקי (בלי תגיות) — להשוואת מועמד מול מקור גם במצב HTML.
const plainLen = (value = '') => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;

const clampNum = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

// כמה סבבים רצופים בלי שיפור עוצרים את מצב ההתכנסות.
const DEFAULT_NO_IMPROVE_STOP = 2;
// תקרת בטיחות קשיחה למצב התכנסות (מונע לולאה אינסופית/עלות חורגת).
const DEFAULT_SAFETY_CAP = 10;

// הלולאה. מקבלת טקסט שכבר עבר האנשה ראשונית, ומזקקת אותו מול הגלאי.
// מחזירה את הגרסה עם הציון הנמוך ביותר (= הכי אנושית) שנמצאה.
//
// שני מצבי עצירה:
// - convergence=false (ברירת מחדל): עד ציון < target או עד maxPasses סבבים.
// - convergence=true: ממשיך כל עוד יש שיפור; עוצר כשאין שיפור ב-noImproveStop סבבים
//   רצופים, או כשהציון < target, או בתקרת הבטיחות safetyCap. ("עד תוצאה מספקת").
//
// htmlMode=true: שומר על מבנה HTML בשכתוב (לטקסט שלם מהמסמך).
export async function runHumanizerLoop({
  text = '',
  context = '',
  invokeModel,
  target = DEFAULT_HUMANIZER_LOOP.target,
  maxPasses = DEFAULT_HUMANIZER_LOOP.maxPasses,
  convergence = false,
  noImproveStop = DEFAULT_NO_IMPROVE_STOP,
  safetyCap = DEFAULT_SAFETY_CAP,
  htmlMode = false,
  profile = null,
  onProgress = () => {},
} = {}) {
  const start = String(text || '').trim();
  if (typeof invokeModel !== 'function' || !start) {
    return { text: start, score: null, passes: 0, hitTarget: false, trace: [] };
  }

  let goal = clampNum(target, 0, 100, DEFAULT_HUMANIZER_LOOP.target);
  const hardLimit = convergence
    ? clampNum(safetyCap, 1, 16, DEFAULT_SAFETY_CAP)
    : clampNum(maxPasses, 0, 8, DEFAULT_HUMANIZER_LOOP.maxPasses);
  const noImproveLimit = clampNum(noImproveStop, 1, 5, DEFAULT_NO_IMPROVE_STOP);
  const startLen = plainLen(start);

  let best = start;
  let bestResult = safeScore(start, profile);
  // היעד לעולם לא רפוי מסף-ההתרעה של הגלאי: בלי ההצמדה הזו לולאה יכולה "להצליח"
  // מתחת לסף ברירת-המחדל (DEFAULT_THRESHOLD=78 כרגע, או מכויל) בעוד שאותו טקסט
  // עדיין יסומן כגנרי בהעלאה הבאה. DEFAULT_HUMANIZER_LOOP.target=35 נשאר תקף:
  // גם ב-goal המקסימלי (threshold-15=63) הוא עדיין מתחתיו בהרבה.
  if (bestResult.ok && Number.isFinite(bestResult.threshold)) {
    goal = Math.max(10, Math.min(goal, bestResult.threshold - 15));
  }
  let bestScore = bestResult.ok ? bestResult.score : 100;
  let noImprove = 0;
  const trace = [{ pass: 0, score: bestResult.ok ? bestResult.score : null }];

  for (let pass = 1; pass <= hardLimit; pass += 1) {
    // עוצרים כשהגרסה הטובה מספקת (מתחת ליעד) או כשהטקסט קצר מדי לניתוח אמין.
    if (!bestResult.ok || bestScore < goal) break;

    onProgress({
      pass,
      maxPasses: hardLimit,
      score: bestScore,
      target: goal,
      convergence,
      message: convergence
        ? `מזקק עד התכנסות — סבב ${pass} (ציון ${bestScore}, יעד <${goal})`
        : `סבב האנשה ${pass}/${hardLimit} — ציון נוכחי ${bestScore}, יעד <${goal}`,
    });

    let candidate = '';
    try {
      candidate = String(await invokeModel(buildRepairPrompt(best, bestResult, pass, htmlMode), context) || '').trim();
    } catch {
      break; // כשל מודל — נשארים עם הטוב ביותר עד כה.
    }
    // מגן מפני פלט ריק או קצר בצורה חשודה (פחות מ-40% מהמקור = כנראה נחתך/הוסבר).
    if (!candidate || plainLen(candidate) < startLen * 0.4) {
      trace.push({ pass, score: null, rejected: 'too-short-or-empty' });
      noImprove += 1;
      if (noImprove >= noImproveLimit) break;
      continue;
    }

    const candResult = safeScore(candidate, profile);
    const candScore = candResult.ok ? candResult.score : 100;
    trace.push({ pass, score: candResult.ok ? candResult.score : null });

    if (candScore < bestScore) {
      best = candidate;
      bestResult = candResult;
      bestScore = candScore;
      noImprove = 0;
    } else {
      noImprove += 1;
      // עצירת אין-שיפור בשני המצבים. מאז ngramGeneric יעד 35 לרוב אינו בר-השגה
      // לטקסט AI (רצפת הסיגנל ~65 — עמידות מכוונת של הגלאי לשכתוב), ובלי העצירה
      // הזו המצב הרגיל שורף את כל הסבבים על שכתובים שאינם משפרים דבר.
      if (noImprove >= noImproveLimit) break;
    }
  }

  return {
    text: best,
    score: bestResult.ok ? bestResult.score : null,
    label: bestResult.ok ? bestResult.label : null,
    passes: trace.length - 1,
    hitTarget: bestResult.ok ? bestResult.score < goal : false,
    converged: convergence && noImprove >= noImproveLimit,
    trace,
  };
}
