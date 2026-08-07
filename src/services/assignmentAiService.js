// assignmentAiService.js — שלב 2: ה-AI משלים *רק* את מה ששלב 1 לא הצליח להפיק.
//
// ההבדל מהמסלול הרגיל של יצירת מסמך: כאן המודל לא מקבל "כתוב עבודה על X". הוא
// מקבל סעיף אחד, עם הראיות של אותו סעיף בלבד, ומכסת מילים. כל טענה חייבת להיתלות
// בקטע מהרשימה. זה מצמצם דרמטית את מרחב ההזיה — המקורות הם קבצים שהמשתמש העלה,
// עם מספרי עמוד, ולא תוצאות חיפוש שהמודל "זוכר".
//
// כלל ברזל: סעיף בלי ראיות לא נכתב. הפנקס מסמן אותו BLOCKED ולא NEEDS_AI, והפונקציה
// כאן מסרבת במפורש. עדיף "חסר לך מקור" מאשר פסקה משכנעת שהומצאה.
//
// תלויות: aiService (chatWithActiveProvider), assignmentScaffoldStore, assignmentPrepService.

import { chatWithActiveProvider, hasUsableAiProvider, getPersonalStyleProfile } from './aiService';
import { readScaffold } from './assignmentScaffoldStore';
import { formatProvenance } from './evidenceMatchService';
import { INTENT_LABELS } from './assignmentSpecService';
import { buildLecturerRulesBlock, resolveLecturerContext } from './lecturerRulesService';

/** בלוק לקחי המרצים לפרומפטי הטיוטה. '' כשאין — משורשר בעיוורון. */
function lecturerRulesForDraft() {
  try {
    return buildLecturerRulesBlock({ ...resolveLecturerContext({ personalStyle: getPersonalStyleProfile() }), budget: 800 });
  } catch {
    return '';
  }
}

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

// קריאה יחידה ונקייה: בלי workflow אוטומטי ובלי ריבוי מודלים. מנוע הסגנון האישי
// נשאר *דלוק* בכוונה — הפואנטה היא טיוטה בקול של המשתמש.
//
// ⚠️ forceSuppressResearchRouting חובה כאן. בלעדיו הפרומפט ("סעיף אקדמי", "מקורות",
// "APA") מזוהה כבקשת מחקר, והקריאה נחטפת לצינור אחזור המקורות — במקום טיוטה חוזרת
// רשימת קישורים מהאינטרנט. נתפס ב-LAB; ראה tools/test-bench/assignment-ai-harness.mjs.
// זה גם עניין של נכונות ולא רק של פורמט: כל הרעיון הוא שהטיוטה תבוא *מהחומרים של
// המשתמש בלבד*, ולא ממקורות שנשלפו מהרשת.
const runModel = (prompt, context = '', system = '', label = 'Assignment') => chatWithActiveProvider(
  String(prompt || ''),
  String(context || ''),
  String(system || ''),
  {
    skipAutomation: true,
    skipMultiModel: true,
    forceSuppressResearchRouting: true,
    agentLabel: label,
  },
);

/** בלוק הראיות כפי שהוא מוזרק למודל — ממוספר, כדי שיוכל להפנות למספר. */
function formatEvidenceForPrompt(evidence) {
  return (evidence || []).map((item, i) => (
    `[${i + 1}] ${formatProvenance(item)}\n"${String(item.text || '').trim()}"`
  )).join('\n\n');
}

const SECTION_DRAFT_SYSTEM = `אתה עוזר כתיבה אקדמית בעברית.
חוקים מוחלטים:
1. מותר לך להסתמך אך ורק על הקטעים הממוספרים שסופקו. אין להוסיף עובדה, שם חוקר, שנה או ממצא שאינו מופיע בהם.
2. כל טענה מהותית חייבת להסתיים בהפניה בסוגריים לפי המקור, למשל (כהן, עמ' 14).
3. אם הקטעים אינם מספיקים לכיסוי מלא של הסעיף — כתוב את מה שהם כן מאפשרים, וסיים בשורה נפרדת: [דרוש מקור נוסף: <מה חסר>].
4. אל תמציא ביבליוגרפיה ואל תוסיף מקורות משלך.
5. כתוב פרוזה רציפה בעברית אקדמית. בלי כותרות, בלי רשימות, אלא אם התבקשת במפורש.`;

/**
 * כותב טיוטה לסעיף אחד — מהראיות של אותו סעיף בלבד.
 *
 * @param {object} section סעיף מה-spec
 * @param {{evidence?:Array, scaffold?:object}} opts
 * @returns {Promise<{ok:boolean, text?:string, reason?:string, usedEvidence?:number}>}
 */
export async function draftSectionFromEvidence(section, { evidence = null, scaffold = null } = {}) {
  if (!isPlainObject(section)) return { ok: false, reason: 'סעיף לא תקין.' };
  if (!hasUsableAiProvider()) return { ok: false, reason: 'אין ספק AI מוגדר.' };

  const blob = scaffold || readScaffold();
  const list = Array.isArray(evidence)
    ? evidence
    : (blob?.evidence?.[section.id]?.evidence || []);

  // הסירוב הזה הוא הפיצ'ר, לא מגבלה. ראה כותרת הקובץ.
  if (!list.length) {
    return {
      ok: false,
      reason: 'אין ראיות לסעיף הזה. טיוטה בלי מקורות תהיה המצאה — הוסף מקור ונסה שוב.',
    };
  }

  const quota = Number(section.wordQuota) || 0;
  const intentLabel = INTENT_LABELS[section.intent] || section.intent;
  const citationStyle = blob?.spec?.citationStyle;

  const prompt = [
    `כתוב טיוטה לסעיף "${section.title}" בעבודה אקדמית.`,
    `אופי הסעיף: ${intentLabel}.`,
    section.instructions ? `הנחיות המטלה לסעיף:\n${section.instructions}` : '',
    quota ? `היקף מבוקש: כ-${quota} מילים.` : '',
    citationStyle ? `סגנון ציטוט: ${citationStyle}.` : '',
    lecturerRulesForDraft(),
    '',
    'הקטעים היחידים שמותר להסתמך עליהם:',
    formatEvidenceForPrompt(list),
  ].filter(Boolean).join('\n');

  try {
    const text = await runModel(prompt, '', SECTION_DRAFT_SYSTEM, `טיוטת סעיף: ${section.title}`);
    const clean = String(text || '').trim();
    if (!clean) return { ok: false, reason: 'המודל החזיר תשובה ריקה.' };
    return { ok: true, text: clean, usedEvidence: list.length };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
}

const OPENER_SYSTEM = `אתה מנסח משפטי פתיחה לפסקאות אקדמיות בעברית.
החזר משפט פתיחה אחד בלבד, בלי מירכאות ובלי הסבר. משפט קצר (עד 15 מילים) שפותח את הפסקה ואינו מסכם אותה.
אל תמציא עובדות — הפתיח צריך להיות מסגרת ניסוחית בלבד.`;

/**
 * פתיח לסעיף כשלא נמצא כזה בקורפוס האישי. תוצר קטן וזול בכוונה.
 * @returns {Promise<{ok:boolean, text?:string, reason?:string}>}
 */
export async function draftOpenerForSection(section) {
  if (!hasUsableAiProvider()) return { ok: false, reason: 'אין ספק AI מוגדר.' };
  const intentLabel = INTENT_LABELS[section?.intent] || section?.intent || '';
  const prompt = [
    `נסח משפט פתיחה לפסקה מסוג "${intentLabel}" בסעיף בשם "${section?.title || ''}".`,
    section?.instructions ? `הקשר: ${String(section.instructions).slice(0, 300)}` : '',
  ].filter(Boolean).join('\n');

  try {
    const text = await runModel(prompt, '', OPENER_SYSTEM, 'פתיח סעיף');
    const clean = String(text || '').trim().replace(/^["'״׳]|["'״׳]$/g, '');
    if (!clean) return { ok: false, reason: 'המודל החזיר תשובה ריקה.' };
    return { ok: true, text: clean };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
}

// ---------- כתיבת העבודה כולה בקריאה אחת ----------
//
// למה קריאה אחת ולא אחת לסעיף: סעיף-סעיף עולה N קריאות, וגרוע מזה — כל קריאה
// עיוורת למה שנכתב בסעיפים האחרים. מכאן חזרות, סתירות, ואפס מעברים. קריאה אחת
// עם כל בלוקי הראיות נותנת למודל את התמונה המלאה, ומאפשרת לו לכתוב מעברים.
//
// מה המודל *לא* מייצר: ביבליוגרפיה. היא נבנית כאן דטרמיניסטית מהפרובננס של
// הראיות שבאמת שימשו. מודל שמייצר רשימת מקורות ממציא פרטים ביבליוגרפיים גם
// כשהתוכן עצמו מעוגן — זה היה וקטור ההזיה הקלאסי.

// תקציבים: עבודה עם 8 סעיפים × 5 ראיות × קטע מלא מפוצצת את חלון ההקשר.
const WHOLE_WORK_EVIDENCE_PER_SECTION = 4;
const WHOLE_WORK_WORDS_PER_EVIDENCE = 110;

// סמן שהמודל לא יפיק במקרה. כותרות markdown (## ) נדחו — המודל משתמש בהן גם
// בתוך גוף הטקסט, והפרסור התבלבל.
const SECTION_MARK = '@@סעיף:';
const SECTION_MARK_RE = /^@@סעיף:\s*(.+)$/;

const WHOLE_WORK_SYSTEM = `אתה עוזר כתיבה אקדמית בעברית. אתה כותב עבודה שלמה בפעם אחת.
חוקים מוחלטים:
1. מותר לך להסתמך אך ורק על הקטעים הממוספרים שסופקו. אין להוסיף עובדה, שם חוקר, שנה או ממצא שאינו מופיע בהם.
2. המספור של הקטעים הוא רציף לאורך כל העבודה. כל טענה מהותית חייבת להסתיים בהפניה בסוגריים למקור שממנו היא באה, למשל (כהן, עמ' 14).
3. אם הקטעים של סעיף אינם מספיקים — כתוב את מה שהם מאפשרים וסיים אותו סעיף בשורה נפרדת: [דרוש מקור נוסף: <מה חסר>]. אל תרפד עד המכסה.
4. **אל תכתוב רשימת מקורות/ביבליוגרפיה.** היא נבנית אוטומטית ואינה באחריותך.
5. כתוב מעבר קצר בין סעיף לסעיף — משפט שקושר את מה שנאמר למה שבא. המעבר הוא ניסוחי בלבד ואינו טוען טענה חדשה.
6. פורמט הפלט, בדיוק: לפני כל סעיף שורה בפני עצמה "${SECTION_MARK} <כותרת הסעיף בדיוק כפי שנמסרה>", ואחריה גוף הסעיף בפרוזה רציפה. בלי כותרות משנה ובלי רשימות.`;

/** בלוק ראיות עם מספור *גלובלי* — כדי שהפניה אחת תעבוד לאורך כל העבודה. */
function formatEvidenceNumbered(evidence, startIndex) {
  return (evidence || []).map((item, i) => (
    `[${startIndex + i}] ${formatProvenance(item)}\n"${truncateWords(item.text, WHOLE_WORK_WORDS_PER_EVIDENCE)}"`
  )).join('\n\n');
}

/**
 * ביבליוגרפיה מהפרובננס של הראיות ששימשו בפועל. דטרמיניסטי לגמרי — המודל לא
 * נוגע בזה. dedupe לפי materialId, כי כמה קטעים מגיעים מאותו מאמר.
 *
 * @param {Array<object>} usedEvidence
 * @returns {Array<{title:string, url:string, weak:boolean}>}
 */
export function buildBibliography(usedEvidence = []) {
  const byMaterial = new Map();
  (Array.isArray(usedEvidence) ? usedEvidence : []).forEach((item) => {
    if (!isPlainObject(item)) return;
    const key = item.materialId || item.sourceTitle;
    if (!key || byMaterial.has(key)) return;
    byMaterial.set(key, {
      title: String(item.sourceTitle || '').trim() || 'מקור ללא כותרת',
      url: String(item.sourceUrl || '').trim(),
      // מקור שנשמר כתקציר בלבד — המשתמש צריך לדעת שלא נקרא הטקסט המלא.
      weak: item.strength === 'abstract',
    });
  });
  return [...byMaterial.values()].sort((a, b) => a.title.localeCompare(b.title, 'he'));
}

/**
 * כותבת את כל העבודה בקריאת מודל **אחת**.
 *
 * סעיפים בלי ראיות לא נשלחים למודל כלל (כלל הברזל של הקובץ) — הם חוזרים
 * בתוצאה כ-blocked, וה-UI שותל במקומם סימון "דרוש מקור".
 *
 * @param {object} spec
 * @param {{scaffold?:object|null, sectionIds?:string[]|null}} opts
 * @returns {Promise<{ok:boolean, reason?:string, sections?:Array<{id,title,text}>,
 *                    blocked?:Array<{id,title}>, bibliography?:Array<object>,
 *                    usedEvidence?:number, raw?:string}>}
 */
export async function draftWholeWork(spec, { scaffold = null, sectionIds = null } = {}) {
  if (!isPlainObject(spec)) return { ok: false, reason: 'אין spec של מטלה.' };
  if (!hasUsableAiProvider()) return { ok: false, reason: 'אין ספק AI מוגדר.' };

  const blob = scaffold || readScaffold();
  const all = (Array.isArray(spec.sections) ? spec.sections : [])
    .filter((s) => s?.enabled !== false)
    .filter((s) => !sectionIds || sectionIds.includes(s.id));
  if (!all.length) return { ok: false, reason: 'אין סעיפים לכתיבה.' };

  // חלוקה: מי נכתב ומי חסום. הפרדה מפורשת ולא "נשלח בכל זאת ונקווה".
  const writable = [];
  const blocked = [];
  all.forEach((section) => {
    const found = (blob?.evidence?.[section.id]?.evidence || []).slice(0, WHOLE_WORK_EVIDENCE_PER_SECTION);
    if (found.length) writable.push({ section, evidence: found });
    else blocked.push({ id: section.id, title: section.title });
  });

  if (!writable.length) {
    return { ok: false, reason: 'לאף סעיף אין ראיות. חפש מקורות לפני הכתיבה.', blocked };
  }

  // מספור גלובלי רציף על פני כל הסעיפים — הפניה [7] מזוהה חד-משמעית.
  const usedEvidence = [];
  const sectionBlocks = writable.map(({ section, evidence }) => {
    const start = usedEvidence.length + 1;
    usedEvidence.push(...evidence);
    return [
      `${SECTION_MARK} ${section.title}`,
      `אופי הסעיף: ${INTENT_LABELS[section.intent] || section.intent}`,
      section.instructions ? `הנחיות: ${truncateWords(section.instructions, 60)}` : '',
      section.wordQuota ? `היקף: כ-${section.wordQuota} מילים.` : '',
      'הקטעים המותרים לסעיף הזה:',
      formatEvidenceNumbered(evidence, start),
    ].filter(Boolean).join('\n');
  });

  const prompt = [
    `כתוב את העבודה "${spec.title || 'עבודה אקדמית'}" במלואה.`,
    spec.totalWords ? `היקף כולל מבוקש: כ-${spec.totalWords} מילים.` : '',
    spec.citationStyle ? `סגנון ציטוט: ${spec.citationStyle}.` : '',
    `מספר הסעיפים לכתיבה: ${writable.length}. כתוב את כולם, בסדר הזה, כל אחד עם השורה "${SECTION_MARK} <כותרת>" לפניו.`,
    blocked.length
      ? `שים לב: ${blocked.length} סעיפים נוספים בעבודה חסרי מקורות ולכן אינם נכתבים כאן. אל תתייחס אליהם ואל תכתוב אותם.`
      : '',
    lecturerRulesForDraft(),
    '',
    sectionBlocks.join('\n\n---\n\n'),
  ].filter(Boolean).join('\n');

  let raw;
  try {
    raw = await runModel(prompt, '', WHOLE_WORK_SYSTEM, `עבודה שלמה: ${spec.title || ''}`);
  } catch (err) {
    return { ok: false, reason: String(err?.message || err), blocked };
  }

  const clean = String(raw || '').trim();
  if (!clean) return { ok: false, reason: 'המודל החזיר תשובה ריקה.', blocked };

  const parsed = parseWholeWorkOutput(clean, writable.map((w) => w.section));
  if (!parsed.length) {
    // המודל התעלם מהסמנים. מחזירים את הטקסט הגולמי כדי שלא ללכת לאיבוד — עדיף
    // שהמשתמש יראה טיוטה בסעיף אחד מאשר "נכשל" אחרי קריאה ששולמה.
    return {
      ok: true,
      sections: [{ id: writable[0].section.id, title: writable[0].section.title, text: clean, unparsed: true }],
      blocked,
      bibliography: buildBibliography(usedEvidence),
      usedEvidence: usedEvidence.length,
      raw: clean,
    };
  }

  return {
    ok: true,
    sections: parsed,
    blocked,
    bibliography: buildBibliography(usedEvidence),
    usedEvidence: usedEvidence.length,
    raw: clean,
  };
}

/**
 * מפרק את הפלט לפי סמני הסעיפים. ההתאמה לכותרות המקוריות היא נורמליזציה של
 * טקסט — המודל משנה ניקוד/רווחים/מירכאות גם כשביקשנו "בדיוק כפי שנמסרה".
 */
export function parseWholeWorkOutput(text, sections = []) {
  const lines = String(text || '').split('\n');
  const norm = (s) => String(s || '').replace(/["'״׳“”]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const byTitle = new Map(sections.map((s) => [norm(s.title), s]));

  const out = [];
  let current = null;
  let buffer = [];

  const flush = () => {
    if (!current) return;
    const body = buffer.join('\n').trim();
    if (body) out.push({ id: current.id, title: current.title, text: body });
    buffer = [];
  };

  lines.forEach((line) => {
    const hit = line.trim().match(SECTION_MARK_RE);
    if (!hit) { if (current) buffer.push(line); return; }
    flush();
    const title = hit[1].trim();
    // כותרת שלא זוהתה עדיין נשמרת — עדיף סעיף עם כותרת שהמודל ניסח מאשר לזרוק טקסט.
    current = byTitle.get(norm(title)) || { id: `unmatched_${out.length}`, title };
  });
  flush();

  return out;
}

// ---------- הקשר לחלונית ה-AI ----------

const CONTEXT_EVIDENCE_LIMIT = 4;
const CONTEXT_SNIPPET_WORDS = 70;

function truncateWords(text, maxWords) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  return words.length > maxWords ? `${words.slice(0, maxWords).join(' ')}…` : words.join(' ');
}

/**
 * בלוק הקשר שמוזרק לכל שיחה בחלונית ה-AI כשיש מטלה פעילה — באותו דפוס של
 * buildProjectContextBlock. בלעדיו המשתמש שואל "תרחיב לי כאן" והמודל לא יודע
 * באיזה סעיף הוא נמצא, מה המכסה, ואילו מקורות מותרים.
 *
 * @param {{sectionId?:string|null, scaffold?:object|null}} opts
 *        scaffold — הזרקה במקום קריאה מהחנות. נדרש ל-harness ב-Node (אין IndexedDB),
 *        ובאפליקציה נשאר null כדי לקרוא תמיד את המצב החי.
 * @returns {string} '' כשאין מטלה פעילה
 */
export function buildScaffoldContextBlock({ sectionId = null, scaffold = null } = {}) {
  const blob = scaffold || readScaffold();
  if (!blob?.active || !blob.spec) return '';

  const spec = blob.spec;
  const lines = ['— הקשר מטלה פעילה —', `מטלה: ${spec.title || 'ללא שם'}`];
  if (spec.totalWords) lines.push(`היקף כולל: ${spec.totalWords} מילים`);
  if (spec.citationStyle) lines.push(`סגנון ציטוט: ${spec.citationStyle}`);
  if (spec.sourceRequirement?.count) lines.push(`נדרשים לפחות ${spec.sourceRequirement.count} מקורות`);

  const section = sectionId
    ? (spec.sections || []).find((s) => s.id === sectionId)
    : null;

  if (section) {
    lines.push('', `הסעיף שהמשתמש נמצא בו: "${section.title}"`);
    lines.push(`אופי הסעיף: ${INTENT_LABELS[section.intent] || section.intent}`);
    if (section.wordQuota) lines.push(`מכסת הסעיף: כ-${section.wordQuota} מילים`);
    if (section.instructions) lines.push(`הנחיות הסעיף: ${truncateWords(section.instructions, 60)}`);

    const evidence = (blob.evidence?.[section.id]?.evidence || []).slice(0, CONTEXT_EVIDENCE_LIMIT);
    if (evidence.length) {
      lines.push('', 'מקורות שהמשתמש העלה ורלוונטיים לסעיף הזה — הסתמך עליהם והפנה אליהם:');
      evidence.forEach((item, i) => {
        lines.push(`[${i + 1}] ${formatProvenance(item)}`);
        lines.push(`    "${truncateWords(item.text, CONTEXT_SNIPPET_WORDS)}"`);
      });
      lines.push('אל תוסיף מקורות שאינם ברשימה. אם חסר מידע — אמור זאת במפורש.');
    } else {
      lines.push('', 'אין לסעיף הזה חומר תומך בחומרים שהמשתמש העלה. אל תמציא מקורות — הצע לו להוסיף מקור.');
    }
  } else {
    const titles = (spec.sections || []).map((s) => s.title).filter(Boolean);
    if (titles.length) lines.push('', `סעיפי המטלה: ${titles.join(' · ')}`);
  }

  // לקחים ממשובי מרצים — רזולוציה מהפרופיל האישי (אין לסקאפולד שיוך פרויקט).
  // תקציב 800: הפרומפטים כאן כבר עמוסים בראיות.
  const rulesBlock = lecturerRulesForDraft();
  if (rulesBlock) lines.push('', rulesBlock);

  return lines.join('\n');
}
