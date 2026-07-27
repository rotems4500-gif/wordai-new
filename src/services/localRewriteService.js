// localRewriteService.js — שכבת הניסוח המקומית: הופכת ראיה מעוגנת למשפט תשובה.
//
// זה הרכיב שסוגר את הפער שנמדד במנוע הכללים: פלט שעבר עיגון 100% אך היה **פיגום
// ולא תשובה** — 20% מילות מילוי, 63% העתקה מילה-במילה מהמקור, ורק 2 מתוך 7
// מהישויות שבשאלות הוזכרו בכלל. מנוע כללים בוחר מסגרת ומשתיל בה משפט מקור; הוא
// אינו יכול ליישם דוקטרינה על עובדות מקרה. זה דורש ניסוח.
//
// ---------- מה שומר על עקרון אפס-ההמצאות ----------
// המודל **אינו מקור סמכות**. הוא מקבל משפט מקור אחד + עובדות המקרה, ומחזיר משפט
// שנבדק מיד מול אותו מקור: ≥GROUNDING_FLOOR ממילות התוכן שלו חייבות להופיע במקור
// או בעובדות. נופל — ניסיון נוסף עם הנחיה מהודקת; נופל שוב — **מוחזר null**,
// והקורא נופל בחזרה למסלול הכללים. הרעה במקרה הגרוע = ההתנהגות הקיימת היום.
//
// ---------- מה נמדד לפני שנכתב ----------
// שער הכשירות (tools/test-bench/rewrite-probe.mjs) על מטלה אמיתית, 16 מקרים,
// דטרמיניסטי (temperature 0, seed קבוע):
//   qwen3:4b        נפסל — מודל-חשיבה, פולט נימוק באנגלית ולא מגיע לתשובה
//   aya-expanse:8b  0/16 שווה-ערך · 25.6s למשפט · **המציא סעיף חוק ופסיקה**
//   gemma3:4b       11/16 (69%) · 12.7s למשפט · העתקה 0% · ישות 16/16
// גדול יותר יצא רהוט יותר **וממציא יותר** — מצב הכשל היחיד שאסור כאן. לכן 4B,
// שהוא גם הדרגה היחידה שנכנסת אצל משתמש קצה טיפוסי.
//
// ⚠️ הגשת עובדות המקרה כטבלת ישויות/תפקידים **נוסתה ונפסלה**: 7/16 מול 11/16.
// טבלה שהשמיטה שתי דמויות והצהירה מי מתגונן גררה את המודל לענות על השאלה הלא
// נכונה בביטחון גבוה. עובדות כפסקה רציפה — כפי שהמרצה כתב אותן — עדיפות.

const DEFAULT_MODEL = 'gemma3:4b';
const DEFAULT_BASE = 'http://127.0.0.1:11434';
// ⚠️ num_ctx מפורש. ברירת המחדל של אולמה (65536) מנפחת את ה-KV cache ודוחפת את
// המודל ל-CPU: נמדד 64%/36% CPU/GPU ב-64k מול 54%/46% ב-4k על אותה מכונה.
const NUM_CTX = 4096;
const MAX_TOKENS = 400;
// ⚠️ 60s מכויל ל-4B ששוכן כולו ב-GPU (~8s למשפט). הוא **לא** מספיק לשני מצבים
// שאנחנו דווקא מתכננים אליהם: מודל 7B שחציו על ה-CPU, ומכונה בלי GPU כלל
// (~30-60s למשפט). timeout קצוב מדי אינו נראה כאיטיות אלא **ככישלון איכות** —
// המשפט נספר כנדחה בשער, ומדידת מודל נהיית מדידת חומרה. לכן ניתן להגדרה.
const TIMEOUT_MS = (() => {
  try {
    const v = Number(process?.env?.WORDAI_REWRITE_TIMEOUT_MS);
    if (Number.isFinite(v) && v >= 5000) return v;
  } catch {}
  return 60000;
})();
const PROBE_TIMEOUT_MS = 4000;

/** env בבטחה — הקובץ רץ גם ב-Node (harness) וגם בדפדפן, שבו אין `process`. */
function readEnv(name) {
  try {
    if (typeof process !== 'undefined' && process.env?.[name] != null) return process.env[name];
  } catch {}
  return undefined;
}

// ---------- וריאנטים לבחירה סגנונית ----------
// ❌ **נמדד ונפסל — ברירת המחדל 0.** המנגנון בנוי ועובד, אבל הוא אינו משיג את
// מה שנבנה בשבילו. נשאר מאחורי מתג כי הוא מעלה *תפוקה*, ר' למטה.
//
// הרעיון: הפער הסגנוני מול המשתמש הוא **גיוון אוצר מילים** (0.45 מול 0.65),
// ולחץ בפרומפט כבר נמדד ונפסל (0.429→0.434). לכן — לא הנחיה אלא בחירה: לייצר
// כמה מועמדים ולדרג לפי מילות-תוכן חדשות בסעיף.
//
// המדידה (סבב מלא על מטלת דיני תקשורת, 26.7.26):
//
// | | לפני | אחרי |
// |---|---|---|
// | גיוון אוצר מילים | 0.4578 | **0.4514** |
// | סגנון | 47 | **43** |
// | נפח | 987 | 1023 מילים |
// | ראיות שעברו (sec_3) | 6 | 11 |
//
// כלומר **המדד שהמנגנון כוון אליו לא זז בכלל**, והסגנון ירד. שתי מסקנות:
//
// 1. הווריאנטים אכן נוצרו (התפוקה קפצה 6→11 בסעיף 3), ולכן זה לא no-op —
//    פשוט בחירה בין פלטים של אותו מודל אינה מרחיבה את אוצר המילים שלו.
//    **זו אותה מסקנה של ניסוי לחץ-הפרומפט, מכיוון אחר:** הרגיסטר שמודל 4B
//    כותב בו חסום לקסיקלית, ולא הנחיה ולא בחירה מעליו חורגות ממנו.
// 2. התפוקה הגבוהה יותר **פוגעת** בציון: יותר טקסט מאותו מודל ⇒ יחס
//    type/token יורד מכנית (הוא תלוי-אורך), ויותר חזרות על מילות הנושא.
//    ⚠️ הרצפים שהפלט "מגזים" בהם הם «יר» (יקיר), «תמו» (תמונה), «שימ» (שימוש)
//    — **מילות נושא, לא הרגלי סגנון.** ציון הסגנון על טקסט ממוקד-נושא מודד
//    חלקית את הנושא, וכדאי לזכור את זה לפני שרודפים אחריו.
//
// להפעלה למדידה עתידית: WORDAI_REWRITE_VARIANTS=2.
const VARIANT_TEMP = Number(readEnv('WORDAI_REWRITE_TEMP') ?? 0.8);
const EXTRA_VARIANTS = Number(readEnv('WORDAI_REWRITE_VARIANTS') ?? 0);
// מועמד שמביא לפחות כך מילות-תוכן חדשות לסעיף — מפסיקים לחפש. זה מה שהופך את
// המנגנון לאדפטיבי: משפט מגוון ממילא עולה קריאה אחת, כמו לפני השינוי.
const NOVELTY_ENOUGH = Number(readEnv('WORDAI_REWRITE_NOVELTY') ?? 0.55);

/**
 * תוכנית הייצור: שני הניסיונות המקוריים (חמדניים, כולל ההידוק) ואחריהם
 * וריאנטים בטמפרטורה. ⚠️ הסדר מכוון — הווריאנט הראשון זהה **בדיוק** להתנהגות
 * שלפני B1, ולכן EXTRA_VARIANTS=0 מחזיר את המנוע למצבו הקודם בול.
 */
function generationPlan() {
  const plan = [
    { index: 0, temperature: 0, seed: 42, tighten: false },
    { index: 1, temperature: 0, seed: 42, tighten: true },
  ];
  for (let i = 0; i < Math.max(0, EXTRA_VARIANTS); i += 1) {
    plan.push({ index: plan.length, temperature: VARIANT_TEMP, seed: 43 + i, tighten: false });
  }
  return plan;
}

// ⚠️ שיבוץ שכבות מפורש. ההתאמה האוטומטית של אולמה שמרנית מדי: נמדד על GTX 1650
// (4GB, 3.9GB פנויים) שהיא טענה **46% בלבד** של gemma3:4b ל-VRAM — 1.6GB מתוך
// 3.47 — והשאירה חצי מהמודל על ה-CPU בזמן ש-2.3GB של VRAM עמדו ריקים.
// כפיית שיבוץ מלא: 2.88GB ב-VRAM, 100% GPU, 6.0s → 4.4s לקריאה (×1.36).
//
// למה לא סתם קבוע: המשתמש הבא עשוי להיות עם 2GB VRAM, ושם שיבוץ מלא פשוט ייכשל.
// לכן זו **העדפה שמדרדרת פעם אחת**: ניסיון ראשון עם שיבוץ מלא, וכשל טעינה
// מחזיר אותנו להתאמה האוטומטית לכל שאר הסשן.
const FULL_GPU_LAYERS = 99;
let gpuLayers = FULL_GPU_LAYERS;
const OOM_RE = /memory|unable to load|failed to load|no such|out of|cuda|vram/i;

// אותה רצפה של הבנצ' ושל assignmentScaffold — מדד אחד לאורך כל הצינור.
// ⚠️ 0.5 ולא 0.4, למרות שהבנצ' דורש 0.4. השירות והבנצ' מנרמלים מילות-תוכן
// בנוסחאות מעט שונות, ולכן משפט שעובר בדיוק על הגבול כאן עלול ליפול שם. נמדד:
// עם רצפה 0.4 העיגון הכולל בעבודה היה 90% — כלומר עשירית מהמשפטים נדחו בבנצ'
// אחרי שעברו כאן. המרווח סוגר את הפער בלי לשנות את הגדרת השער.
export const GROUNDING_FLOOR = 0.5;

const STOP = new Set(['של', 'על', 'את', 'עם', 'כי', 'גם', 'אך', 'או', 'הוא', 'היא', 'הם', 'זו', 'זה', 'בין', 'לא', 'יש', 'אין', 'כך', 'מן', 'אל', 'כל', 'אשר', 'אלה', 'היו', 'היה', 'לפי', 'תוך', 'כדי', 'רק', 'עוד', 'כמו']);

/** מילות תוכן, בלי תחיליות — אותה נורמליזציה של groundingOverlap בבנצ'. */
export function contentWords(text) {
  return (String(text).match(/[א-ת]{3,}/g) || [])
    .map((w) => w.replace(/^[ולבכשמה](?=[א-ת]{3,})/, ''))
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/** שיעור מילות התוכן של `out` שמופיעות באחד ממקורות הייחוס. */
export function groundingRatio(out, refs) {
  const words = contentWords(out);
  if (!words.length) return 0;
  const hay = refs.filter(Boolean).join(' ');
  return words.filter((w) => hay.includes(w)).length / words.length;
}

/**
 * שיעור רצפי-4-מילים שמועתקים מילה-במילה מהמקור. מבחין בין **עיגון** (חפיפת
 * מילים — רצוי) לבין **העתקה** (חפיפת רצפים — פסול, וגם חשיפה אקדמית).
 */
export function copiedRatio(out, source) {
  const w = String(out).match(/[א-ת]{2,}/g) || [];
  if (w.length < 4) return 0;
  let hit = 0; let tot = 0;
  for (let i = 0; i + 4 <= w.length; i += 1) {
    tot += 1;
    if (String(source).includes(w.slice(i, i + 4).join(' '))) hit += 1;
  }
  return tot ? hit / tot : 0;
}

let unavailableReason = null;
export const isRewriteUnavailable = () => unavailableReason;
export const resetRewriteState = () => { unavailableReason = null; gpuLayers = FULL_GPU_LAYERS; };

const baseUrl = () => {
  try {
    if (typeof process !== 'undefined' && process.env?.WORDAI_OLLAMA_URL) {
      return String(process.env.WORDAI_OLLAMA_URL).replace(/\/+$/, '');
    }
  } catch {}
  return DEFAULT_BASE;
};
const modelName = () => {
  try {
    if (typeof process !== 'undefined' && process.env?.WORDAI_REWRITE_MODEL) return process.env.WORDAI_REWRITE_MODEL;
  } catch {}
  return DEFAULT_MODEL;
};

/** שם המודל הפעיל — לתצוגה ולדיווח ב-rewriteBackendService. */
export const getRewriteModelName = () => modelName();

/**
 * בדיקה חד-פעמית שהשרת חי **ושהמודל נמשך**.
 *
 * ⚠️ קיום השרת אינו מספיק: שרת בלי `ollama pull` של המודל יחזיר 404 על כל
 * generate, וזה כשל שקט שנראה כמו "כל המשפטים נדחו בשער". אותה מלכודת בדיוק
 * כמו ב-probeOllamaEmbedding, ואותו פתרון — בודקים את רשימת המודלים.
 *
 * @returns {Promise<{ok:boolean, reason:(string|null), model:string}>}
 */
export async function probeRewriteModel() {
  const model = modelName();
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl()}/api/tags`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`tags HTTP ${res.status}`);
    const data = await res.json();
    const models = (Array.isArray(data?.models) ? data.models : [])
      .map((m) => String(m?.name || '')).filter(Boolean);
    // סובלני לתגית: 'gemma3:4b' מול 'gemma3:4b-instruct-q4_K_M' וכו'.
    const bare = model.split(':')[0];
    const has = models.some((n) => n === model || n === bare || n.startsWith(`${bare}:`));
    if (!has) return { ok: false, reason: `המודל ${model} לא מותקן ב-Ollama (ollama pull ${model})`, model };
    return { ok: true, reason: null, model };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err || 'Ollama לא זמינה'), model };
  } finally {
    clearTimeout(id);
  }
}

// ⚠️ מודלי-חשיבה פולטים נימוק לפני התשובה, לעיתים באנגלית ובלי תגיות. החילוץ
// לוקח את השורה העברית-כמעט-מלאה האחרונה. סף 0.6 לא הספיק — שורת נימוק אנגלית
// שמצטטת שברי עברית עברה אותו ונספרה כתשובה.
function extractAnswer(raw) {
  const clean = String(raw || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
  const heb = lines.filter((l) => {
    const letters = l.match(/[א-תA-Za-z]/g) || [];
    return letters.length >= 25 && letters.filter((c) => /[א-ת]/.test(c)).length / letters.length >= 0.9;
  });
  const pick = heb.length ? heb[heb.length - 1] : (lines[lines.length - 1] || '');
  return pick.replace(/^["'״׳\-–—•\s]+/, '').replace(/\s+/g, ' ').trim();
}

// שני מהלכים מאותו מקור. ⚠️ לא הארכה של אותו משפט — זווית שנייה: הראשון מיישם
// את הכלל, השני גוזר ממנו מסקנה או סייג לצד הספציפי. שניהם כפופים לאותו שער
// עיגון, ולכן הרווח בנפח אינו בא על חשבון האמינות.
const MOVES = {
  apply: 'לנסח **משפט אחד קצר** בעברית אקדמית שמיישם את הכלל שבמקור על עובדות המקרה',
  implication: 'לנסח **משפט אחד קצר** בעברית אקדמית שגוזר את המסקנה או הסייג הנובעים מן הכלל שבמקור עבור מי שהשאלה עוסקת בו — בלי לחזור על ניסוח המשפט הקודם',
};

// ⚠️ נמדד מול העבודות של המשתמש (tools/test-bench/style-diff.mjs): הוא כותב
// משפטים בני 16.9 מילים עם פסיק אחד, והמנוע כתב 31.8 מילים עם 2.4 פסיקים —
// כפול. המקור היה הנחיה קודמת כאן שדרשה נימוק משועבד **בתוך** כל משפט, וכך
// ייצרה משפטי-שרשרת. הנימוק עבר למהלך הנפרד (implication), ואורך המשפט הוא
// עכשיו אילוץ מפורש. זהו הפער הסגנוני הגדול ביותר שנמדד.
// ⚠️ 20 כוילה על gemma3:4b, וזו **תקרה תלוית-מודל ולא קבוע לשוני**. נמדד
// (27.7): DictaLM 2.0 מייצר טענות משפטיות מנומקות באורך 26-70 מילים ונדחה כולו
// בשער האורך, בעוד gemma עובר עם משפטים קצרים שלעיתים רק משכתבים את העובדות.
// כלומר תקרה קשיחה אחת מודדת **התאמה למודל שסביבו כוילה** ולא איכות. ניתנת
// להגדרה כדי שהשוואת מודלים תהיה הוגנת.
const MAX_SENT_WORDS = (() => {
  try {
    const v = Number(process?.env?.WORDAI_REWRITE_MAX_WORDS);
    if (Number.isFinite(v) && v >= 10 && v <= 80) return v;
  } catch {}
  return 20;
})();

// שמות פרטיים בשאלה = מי שהתשובה אמורה לעסוק בו. בלי שער כזה נמדד שסעיף
// "אילו טענות הגנה עשוי **יצחק** להעלות" נענה 179 מילים על משה ויקיר: המודל
// נצמד לשמות הבולטים בעובדות המקרה ולא לזה שבשאלה. שם השאלה נשלף מהכותרת
// ונדרש להופיע בפלט — אחרת המשפט נדחה כמו כשל עיגון.
const QUESTION_STOPWORDS = new Set([
  'אילו', 'איזו', 'איזה', 'מהן', 'מהם', 'מהו', 'מהי', 'כיצד', 'האם', 'מדוע', 'למה',
  'טענות', 'טענה', 'הגנה', 'הגנות', 'משפטיות', 'משפטית', 'עשוי', 'עשויה', 'עשויים',
  'עשויות', 'להעלות', 'נגד', 'כלפי', 'בעניין', 'לגבי', 'יכול', 'יכולה', 'יכולים',
  'חברת', 'הערוץ', 'ערוץ', 'החדשות', 'ניתן', 'צריך', 'האנשים', 'הצדדים',
]);

/**
 * שמות הצדדים שבשאלה. מיוצא כי **מסלול הכללים זקוק לו בדיוק כמו שכבת הניסוח**:
 * proseComposeService משתמש בו כדי לתת למסגרות @topic צירוף שמני קצר כשכותרת
 * הסעיף היא פסוקית ארוכה. הגדרה שנייה שם הייתה נסחפת מזו בשקט.
 *
 * ⚠️ הייבוא הזה אינו שובר את היות המודול LEAF — הוא מייצא ולא מייבא, והקורא
 * (מסלול הכללים) אינו נוגע בשום קריאת מודל.
 */
export function questionSubjects(question) {
  const words = String(question || '').split(/[^א-תA-Za-z']+/).filter(Boolean);
  // שם פרטי בעברית: אין לו תחילית ה"א/ו"ו/ב', והוא לא במילון השאלה.
  return words.filter((w) => w.length >= 3 && !QUESTION_STOPWORDS.has(w) && !/^[הוב]/.test(w));
}

function mentionsSubject(text, subjects) {
  if (!subjects.length) return true;
  const t = String(text || '');
  return subjects.some((s) => t.includes(s));
}

// שתי מילים ראשונות — הפותח. נמדד שהמודל פותח כמעט כל משפט ב"שכן, בהתאם ל…",
// ארבע פעמים באותו סעיף. חזרה כזאת היא הדבר הבולט ביותר לעין בטיוטה.
function openerKey(text) {
  return String(text || '').split(/\s+/).slice(0, 2).join(' ').replace(/[,.:;]/g, '');
}

function buildPrompt({
  question, caseFacts, source, tighten, styleExamples, move = 'apply', previous = '',
  subjects = [], avoidOpeners = [], overusedWords = [],
}) {
  // ⚠️ התניית סגנון ב-few-shot. בלעדיה המודל כותב בקול שלו, וכל הרחבה של הפלט
  // מרחיקה אותו מהמשתמש: נמדד ששלושה שיפורים רצופים (יותר ראיות, נימוק במשפט)
  // העלו נפח ואיכות והורידו את ציון הסגנון מ-44 ל-23. הפרומפט פשוט לא ראה
  // מעולם שורה אחת מהכתיבה של המשתמש.
  //
  // זו גם הדרך היחידה להתאמה אישית שניתנת למשלוח: אי אפשר לאמן מודל על המכונה
  // של כל סטודנט, אבל אפשר להראות לו חמישה משפטים שלו בזמן ההסקה.
  const styleBlock = (Array.isArray(styleExamples) && styleExamples.length)
    ? `\nכך המשתמש כותב (חקה את המבנה, האורך והניסוח — לא את התוכן):\n${styleExamples.map((s) => `· ${s}`).join('\n')}\n`
    : '';

  const prevBlock = previous
    ? `\n⚠️ המשפט הקודם בסעיף היה: "${previous}"\nאל תחזור עליו ואל תנסח אותו מחדש — הוסף זווית חדשה.\n`
    : '';

  const subjBlock = subjects.length
    ? `\n⚠️ המשפט חייב לעסוק ב**${subjects.join(' / ')}** — זה מי שהשאלה שואלת עליו. משפט על דמות אחרת אינו תשובה.\n`
    : '';

  const openerBlock = avoidOpeners.length
    ? `\n⚠️ אל תפתח את המשפט ב: ${avoidOpeners.map((o) => `"${o}"`).join(' · ')}. פתח אחרת.\n`
    : '';

  // ❌ נפסל במדידה: הצגת המילים השחוקות בסעיף ובקשה לנסח בנרדפות. גיוון אוצר
  // המילים 0.429 → 0.434 (מול 0.649 אצל המשתמש), סגנון 53 → 53, נפח 1014 → 994.
  // מודל 4B לא מחזיק אילוץ לקסיקלי רך בזמן שהוא כבר כפוף לעיגון, לנושא ולאורך.
  // הפער הזה כנראה אינו נסגר בהנחיה — הוא תכונה של הרגיסטר שהמודל כותב בו.
  const varietyBlock = '';

  // ❌ נפסל: "ובתוכו פסיק אחד" במקום "פסיק אחד לכל היותר" — 1113 מילים אך
  // סגנון 51 מול 53, ואורך המשפט טיפס מ-16.8 ל-19.5. פסיק שמותר במפורש הוא
  // הזמנה לפסוקית נוספת, וזה בדיוק המנגנון שיצר את משפטי ה-32 מילים.

  return `אתה עוזר כתיבה אקדמי. משימתך: ${MOVES[move] || MOVES.apply}.${styleBlock}${subjBlock}${prevBlock}${openerBlock}${varietyBlock}

חוקים מוחלטים:
- אסור להוסיף עובדה, שם, חוק, סעיף או פסק דין שאינם מופיעים במקור או בעובדות המקרה.
- חובה להזכיר בשמו את מי שהשאלה עוסקת בו.
- לנסח מחדש במילים שלך — לא להעתיק משפטים מהמקור.
- משפט אחד בלבד, בלי הקדמה.
- ⚠️ **עד ${MAX_SENT_WORDS} מילים, פסיק אחד לכל היותר.** משפט קצר וישיר, לא
  משפט-שרשרת. אל תשרשר פסוקיות "משום ש…" ו"שכן…" באותו משפט.${tighten ? `
- ⚠️ הישען צמוד למונחים שמופיעים במקור ובעובדות. אל תוסיף הכללות, נימוקים או מסקנות משלך. קצר עדיף.` : ''}

עובדות המקרה:
${caseFacts}

השאלה: ${question}

המקור:
${String(source).slice(0, 700)}

המשפט:`;
}

async function generateOnce(prompt, layers, signal, { temperature = 0, seed = 42 } = {}) {
  const res = await fetch(`${baseUrl()}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName(),
      prompt,
      stream: false,
      think: false,
      // ⚠️ **seed קבוע תמיד** — גם כשהטמפרטורה מעל 0. זו ההבחנה שמאפשרת בכלל
      // לייצר וריאנטים בלי לאבד שחזוריות: הגיוון מגיע מ-temperature, והשחזוריות
      // מהזרע הקבוע-לכל-אינדקס. דגימה אקראית הייתה הופכת כל השוואה בין תצורות
      // לחסרת ערך (נמדד: שונות 0.3 בלי זרע הזיזה תוצאה ב-25% בין ריצות זהות).
      //
      // ובכיוון השני: ב-temperature 0 הפענוח חמדני, ולכן **החלפת זרע לבדה אינה
      // מייצרת שום גיוון**. שתי הידיות נדרשות יחד.
      options: {
        temperature, seed, num_ctx: NUM_CTX, num_predict: MAX_TOKENS,
        ...(layers ? { num_gpu: layers } : {}),
      },
    }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`ollama ${res.status} ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return extractAnswer((await res.json()).response);
}

async function callModel(prompt, sampling) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    try {
      return await generateOnce(prompt, gpuLayers, ctrl.signal, sampling);
    } catch (err) {
      // כשל שנראה כמו "לא נכנס בזיכרון" **בזמן שביקשנו שיבוץ מלא** הוא הסימן
      // היחיד שיש לנו שהמכונה קטנה מדי. מדרדרים פעם אחת ומנסים שוב; כל כשל אחר
      // (רשת, מודל חסר, timeout) מתפשט כרגיל ואינו מדרדר בטעות.
      if (!gpuLayers || ctrl.signal.aborted || !OOM_RE.test(String(err?.message || ''))) throw err;
      gpuLayers = null;
      return await generateOnce(prompt, null, ctrl.signal, sampling);
    }
  } finally {
    clearTimeout(id);
  }
}

/**
 * מנסח משפט תשובה מעוגן. מחזיר null אם לא עבר את השער — הקורא נופל למסלול הכללים.
 *
 * @param {{question:string, caseFacts:string, source:string,
 *          floor?:number, maxCopied?:number}} args
 * @returns {Promise<{text:string, grounding:number, copied:number, attempts:number}|null>}
 */
// ---------- שער האסמכתא ----------
//
// ⚠️ נוסף אחרי שנמדד (27.7): DictaLM 2.0 הפיק «יצחק עשוי לטעון להגנת חופש
// הביטוי, שכן במקרה **אבנרי נגד שפירא (1989)** נקבעו הלכות בנושא זה» — פסיקה
// עם שם ושנה שאינם במקור — ו**עברה את כל ארבעת השערים**. העיגון היה 55%, כי
// עיגון מודד חפיפת מילות-תוכן ואוצר המילים המשפטי חופף ממילא. כלומר ארבעת
// השערים אינם רואים אסמכתא מומצאת בכלל.
//
// זהו מצב הכשל החמור ביותר במוצר הזה: עבודה אקדמית עם ציטוט שאינו קיים. לכן זה
// שער ולא אזהרה. מודל שנוטה להזריק אסמכתאות פשוט ינסח פחות משפטים, ומה שלא
// נוסח נופל למסלול הכללים — בדיוק כמו כל שער אחר כאן.
//
// ההיתר: אסמכתא ש**מופיעה במקור** לגיטימית. מקורות אקדמיים מלאים בציטוטים,
// ופסילתם הייתה חוסמת בדיוק את הציטוט המיוחס שהמנוע אמור להביא.

const CITE_MARKER_RE = /(?:בג"ץ|ע"א|ע"פ|רע"א|רע"פ|בש"פ|בש"א|ד"נ|דנ"א|עע"ם|ת"א|ה"פ|פ"ד|פס"ד|תמ"ש|עת"ם)/g;
const CASE_NAME_RE = /[א-ת]{2,}(?:\s+[א-ת]{2,})?\s+(?:נ'|נגד)\s+[א-ת]{2,}/g;
const SECTION_RE = /(?:סעיף|ס')\s*\d+[א-ת]?/g;
const YEAR_RE = /\b(?:19|20)\d{2}\b/g;

/** מנרמל גרשיים עבריים לצורה אחת — אחרת «בג"ץ» ו-«בג״ץ» אינם מזדהים. */
const normCite = (s) => String(s || '')
  .replace(/[״"”“]/g, '"')
  .replace(/[׳'’‘]/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

/**
 * האסמכתא הראשונה בפלט שאינה מופיעה בטקסטי הייחוס, או null.
 *
 * @param {string} out פלט המודל
 * @param {string[]} refs המקור ועובדות המקרה
 * @returns {string|null}
 */
export function firstInventedCitation(out, refs = []) {
  const text = normCite(out);
  if (!text) return null;
  const ref = normCite((Array.isArray(refs) ? refs : [refs]).join(' \n '));

  for (const re of [CITE_MARKER_RE, CASE_NAME_RE, SECTION_RE, YEAR_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const token = normCite(m[0]);
      if (!token) continue;
      if (!ref.includes(token)) return token;
    }
  }
  return null;
}

export async function rewriteGrounded({
  question, caseFacts, source, styleExamples = null, move = 'apply', previous = '',
  avoidOpeners = [], overusedWords = [], floor = GROUNDING_FLOOR, maxCopied = 0.25,
  noveltyFn = null,
} = {}) {
  if (!question || !source) return null;
  if (unavailableReason) return null;

  const subjects = questionSubjects(question);
  const novelty = (t) => (typeof noveltyFn === 'function' ? noveltyFn(t) : 1);
  let best = null;         // המועמד הטוב ביותר שראינו, גם אם לא עבר שער
  let bestPass = null;     // המועמד הטוב ביותר **שעבר את כל השערים**
  for (const cfg of generationPlan()) {
    let out = '';
    try {
      out = await callModel(buildPrompt({
        question, caseFacts, source, styleExamples, move, previous, subjects, avoidOpeners,
        overusedWords, tighten: cfg.tighten,
      }), { temperature: cfg.temperature, seed: cfg.seed });
    } catch (err) {
      unavailableReason = String(err?.message || err || 'rewrite failed');
      return null;
    }
    if (!out) continue;
    const grounding = groundingRatio(out, [source, caseFacts]);
    const copied = copiedRatio(out, source);
    const onSubject = mentionsSubject(out, subjects);
    const freshOpener = !avoidOpeners.includes(openerKey(out));
    const inventedCite = firstInventedCitation(out, [source, caseFacts]);
    // ההנחיה לבדה אינה מספיקה — המודל חורג ממנה. האורך נאכף כשער.
    const nWords = (out.match(/\S+/g) || []).length;
    const shortEnough = nWords <= MAX_SENT_WORDS + 4;
    const cand = { text: out, grounding, copied, onSubject, shortEnough, inventedCite, attempts: cfg.index + 1 };
    // WORDAI_REWRITE_DEBUG=1 — **איזה שער הפיל את המשפט**. בלי זה החלפת מודל
    // מחזירה "נדחה בשער" בלי לומר אם המודל חלש, ענה באנגלית, או פשוט הוסיף
    // הקדמה. נמדד: זה בדיוק ההבדל בין "המודל לא מתאים" ל"התבנית לא מתאימה".
    try {
      if (process?.env?.WORDAI_REWRITE_DEBUG === '1') {
        console.log(`   [dbg] עיגון ${(grounding * 100).toFixed(0)}% · מועתק ${(copied * 100).toFixed(0)}%`
          + ` · נושא ${onSubject ? 'כן' : 'לא'} · ${nWords} מילים${shortEnough ? '' : ' ✗ארוך'}`);
        console.log(`   [dbg] «${String(out).slice(0, 260).replace(/\n/g, ' ⏎ ')}»`);
      }
    } catch {}
    // מועמד שעוסק בנושא עדיף תמיד על אחד מעוגן יותר שאינו עוסק בו.
    if (!best || (onSubject && !best.onSubject)
      || (onSubject === best.onSubject && shortEnough && !best.shortEnough)
      || (onSubject === best.onSubject && shortEnough === best.shortEnough
          && grounding > best.grounding)) best = cand;

    if (grounding >= floor && copied <= maxCopied && onSubject && shortEnough && freshOpener
      && !inventedCite) {
      cand.novelty = novelty(out);
      // ⚠️ **הבחירה, לא ההנחיה.** לחץ-גיוון בפרומפט נמדד ונפסל (0.429→0.434,
      // סגנון 53→53): מודל 4B אינו מחזיק אילוץ לקסיקלי רך בזמן שהוא כבר כפוף
      // לעיגון, לנושא ולאורך. מה שכן עובד הוא לייצר כמה מועמדים ולבחור.
      if (!bestPass || cand.novelty > bestPass.novelty) bestPass = cand;
      // יציאה מוקדמת: מועמד מגוון מספיק שווה יותר מעוד קריאה. זה מה שמחזיק את
      // העלות — רוב המשפטים נגמרים בקריאה אחת, בדיוק כמו קודם.
      if (cand.novelty >= NOVELTY_ENOUGH) return cand;
    }
  }
  if (bestPass) return bestPass;
  // הפותח הוא ליטוש; אם נכשל רק בו — עדיין מחזירים. עיגון/העתקה/נושא/אורך/אסמכתא
  // הם שערים. ⚠️ שער האסמכתא נאכף **גם כאן**: הנתיב הזה הוא הרשת האחרונה, ומשפט
  // עם פסיקה מומצאת אינו "טוב מספיק בדוחק" אלא בדיוק מה שאסור לשחרר.
  if (best && best.onSubject && best.shortEnough && !best.inventedCite
    && best.grounding >= floor && best.copied <= maxCopied) return best;
  // נכשל בשער אחרי כל הניסיונות — לא מחזירים משפט לא מעוגן.
  return null;
}

/**
 * מנסח את כל ראיות הסעיף מראש.
 *
 * ⚠️ הקריאה נעשית **לפני** composeSectionProse ולא בתוכו: המחבר סינכרוני, וכל
 * שרשרת הקריאות אליו כזו. הפיכתם לאסינכרוניים היא שינוי רחב בלי תמורה — כאן
 * הקורא מבצע את העבודה האסינכרונית פעם אחת ומעביר מפה מוכנה.
 *
 * ראיה שלא עברה את השער פשוט נעדרת מהמפה, והמחבר נופל עבורה למסלול הכללים.
 *
 * @param {{section:object, evidence:Array<object>, caseFacts:string}} args
 * @returns {Promise<{byChunk:Object<string,string>, ok:number, failed:number}>}
 */
// copiedRatio בודק רצפי-4 מילים, ולכן פרפרזה עם היפוך סדר עוברת אותו: נמדד זוג
// "פגיעה בפרטיות אדם מותרת כאשר…" / "מתירה החוק פגיעה בפרטיות אדם…" באותו סעיף.
// חפיפת מילות-תוכן חסינה להיפוך סדר ותופסת בדיוק את המקרה הזה.
function contentOverlap(a, b) {
  const A = new Set(contentWords(a));
  const B = new Set(contentWords(b));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared += 1;
  return shared / Math.min(A.size, B.size);
}
const DUP_OVERLAP = 0.6;

export async function rewriteSectionEvidence({ section, evidence, caseFacts = '', styleExamples = null } = {}) {
  const list = Array.isArray(evidence) ? evidence : [];
  const question = String(section?.title || '').trim();
  const byChunk = {};
  const accepted = [];
  const avoidOpeners = [];
  // מילות תוכן שכבר נשחקו בסעיף. שמות הדמויות מוחרגים — הם חייבים לחזור, כי
  // בלעדיהם המשפט אינו תשובה (ר' שער הנושא).
  const wordCounts = new Map();
  const subjects = questionSubjects(question);
  const overusedWords = () => [...wordCounts.entries()]
    .filter(([w, n]) => n >= 3 && !subjects.includes(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);
  // שיעור מילות התוכן של המועמד שטרם הופיעו בסעיף. זה **המדד שנמדד כפער**
  // (גיוון אוצר מילים 0.45 מול 0.68 אצל המשתמש), ולכן זה מה שמדרג את הווריאנטים.
  //
  // ⚠️ שמות הדמויות מוחרגים מהמכנה: הם חייבים לחזור בכל משפט (שער הנושא), וספירה
  // שלהם כ"שחוקים" הייתה מענישה בדיוק את המשפטים שעונים על השאלה.
  const noveltyOf = (text) => {
    const words = contentWords(text).filter((w) => !subjects.includes(w));
    if (!words.length) return 0;
    return words.filter((w) => !wordCounts.has(w)).length / words.length;
  };
  let ok = 0; let failed = 0;
  const accept = (key, text) => {
    byChunk[key] = text; ok += 1;
    accepted.push(text);
    for (const w of contentWords(text)) wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
    const o = openerKey(text);
    if (o && !avoidOpeners.includes(o)) avoidOpeners.push(o);
  };
  const isDuplicate = (text) => accepted.some((prev) => contentOverlap(text, prev) >= DUP_OVERLAP);
  for (const e of list) {
    const id = e?.chunkId ?? e?.id;
    if (!id || !e?.text) continue;
    // סדרתי בכוונה — **נמדד**, לא הונח. שרת אולמה מכוונן (OLLAMA_NUM_PARALLEL=4,
    // flash-attention, KV ב-q8_0) על אותה מטלה: 4.39s לקריאה בבודדת מול 3.73s
    // ב-6 במקביל — ×1.18 בלבד. ה-GTX 1650 רווי: 64% מזמן הקריאה הוא עיבוד
    // הפרומפט (170 tok/s prefill), וזה חסם חישוב שאצווה אינה מרפאת. המקביליות
    // מסבכת את שערי הכפילות והפותח (הם תלויי-סדר) ואינה קונה כמעט דבר.
    // eslint-disable-next-line no-await-in-loop
    const r = await rewriteGrounded({
      question, caseFacts, source: e.text, styleExamples, move: 'apply', avoidOpeners,
      overusedWords: overusedWords(), noveltyFn: noveltyOf,
    });
    if (!r?.text || isDuplicate(r.text)) { failed += 1; continue; }
    accept(id, r.text);

    // מהלך שני מאותו מקור — מסקנה/סייג. נדחה אם לא עבר את השער או אם יצא דומה
    // מדי למשפט שכבר התקבל בסעיף (הכפלה אינה תוספת).
    // eslint-disable-next-line no-await-in-loop
    const r2 = await rewriteGrounded({
      question, caseFacts, source: e.text, styleExamples, move: 'implication',
      previous: r.text, avoidOpeners, overusedWords: overusedWords(), noveltyFn: noveltyOf,
    });
    if (r2?.text && !isDuplicate(r2.text)) accept(`${id}#2`, r2.text);
  }
  return { byChunk, ok, failed };
}
