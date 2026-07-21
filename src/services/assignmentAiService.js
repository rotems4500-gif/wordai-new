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

import { chatWithActiveProvider, hasUsableAiProvider } from './aiService';
import { readScaffold } from './assignmentScaffoldStore';
import { formatProvenance } from './evidenceMatchService';
import { INTENT_LABELS } from './assignmentSpecService';

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

// הערה: השלמה באצווה ("השלם את כל מה שסומן NEEDS_AI בלחיצה") נשארה בחוץ בכוונה.
// היא הרחבה ישירה של draftSectionFromEvidence, אבל אי אפשר לאמת אותה בלי ספק חי,
// ואצווה לא-מאומתת ששורפת קריאה לכל סעיף היא בדיוק סוג הדבר שעדיף לא לשלוח.

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

  return lines.join('\n');
}
