// lecturerRulesService.js — זיקוק אירועי משוב מרצה ללקחים מוכללים, והבלוק
// שמוזרק לפרומפטים של הכתיבה.
//
// שלוש שכבות, לפי דוקטרינת "דטרמיניסטי קודם":
// 1. Pre-pass דטרמיניסטי — סיווג קטגוריה בטבלאות מילות-מפתח + clustering של
//    הערות דומות (ביגרמות). אשכול של ≥2 הוא מועמד-לקח עוד לפני שמודל נגע.
// 2. קריאת מודל אחת פר-קליטה (chatWithActiveProvider, אותם דגלים כמו
//    assignmentAiService) שמכלילה אירועים ללקחים.
// 3. שער אנטי-הזיה קשיח: כל לקח חייב לצטט event ids שקיימים באמת. לקח שמצטט
//    id זר — נזרק. evidenceCount/confidence מחושבים מהציטוטים המאומתים,
//    לעולם לא נלקחים מהמודל.
//
// הלקחים עצמם הם תוצר גלוי (מסך פרופיל מרצים) — המשתמש עורך/מכבה/מוחק,
// ועריכת משתמש מנצחת זיקוק חוזר (upsert דרך lecturerProfileStore לא דורס).
//
// ⚠️ בלי \b ב-regex — עברית.

import { chatWithActiveProvider, hasUsableAiProvider } from './aiService';
import {
  ensureLecturerProfilesReady,
  getLecturerProfile,
  listLecturerProfiles,
  getActiveRulesFor,
  upsertRule,
  RULE_CATEGORIES,
} from './lecturerProfileStore';
import { bigramSimilarity } from './feedbackDiffService';

const RULE_MERGE_SIMILARITY = 0.6;
const CLUSTER_SIMILARITY = 0.5;
const MAX_DISTILLED_RULES = 10;
export const GLOBAL_PROMOTION_MIN_EVIDENCE = 3;
export const GLOBAL_PROMOTION_MIN_LECTURERS = 2;

// ── שכבה 1: pre-pass דטרמיניסטי ──

// טבלאות סיווג: מילת מפתח בטקסט המשוב ⇒ קטגוריה. סדר = עדיפות.
const CATEGORY_KEYWORDS = [
  ['citation', ['עימוד', 'ציטוט', 'מראה מקום', 'מראי מקום', 'הפניה', 'הפניות', 'APA', 'הערת שוליים', 'הערות שוליים', "עמ'"]],
  ['sources', ['מקור', 'מקורות', 'אסמכתא', 'אסמכתאות', 'ביבליוגרפיה', 'ספרות']],
  ['structure', ['מבנה', 'פסקה', 'פסקאות', 'סדר', 'ארגון', 'מסקנה', 'סיכום', 'פתיחה', 'מבוא', 'כותרת', 'כותרות']],
  ['argument', ['טיעון', 'ביסוס', 'נימוק', 'הנמקה', 'טענה', 'ניתוח', 'העמקה', 'שטחי', 'שטחית']],
  ['language', ['ניסוח', 'משלב', 'סגנון', 'דקדוק', 'תחביר', 'איות', 'שגיאות כתיב', 'מסורבל']],
  ['formatting', ['עיצוב', 'פונט', 'גופן', 'רווח', 'יישור', 'שוליים', 'מספור עמודים']],
];

/** סיווג דטרמיניסטי של אירוע לקטגוריה לפי טקסט המשוב + העוגן. */
export function categorizeFeedbackText(text) {
  const hay = String(text || '');
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => hay.includes(kw))) return category;
  }
  return 'other';
}

// טוקני תוכן להשוואת תלונות: קילוף תחיליות שימוש (ו/ב/ל/מ/ה/ש/כ) כדי
// ש"בציטוט" ו"ציטוט" ייחשבו אותה מילה. בלי \b — עברית.
function contentTokens(text) {
  const tokens = String(text || '').match(/[א-תA-Za-z']{2,}/g) || [];
  return new Set(tokens.map((t) => {
    let w = t;
    while (w.length > 3 && /^[ובלמהשכ]/.test(w)) w = w.slice(1);
    return w;
  }).filter((w) => w.length >= 2));
}

/** חפיפת מילות תוכן (overlap coefficient) — מותאם למשפטי משוב קצרים, שבהם
 *  ביגרמות-תווים מדוללות מדי (נמדד: אותה תלונה על עימוד נתנה 0.32 בביגרמות). */
export function tokenOverlap(a, b) {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common += 1;
  return common / Math.min(ta.size, tb.size);
}

/**
 * clustering של אירועים דומים: אשכול = אותה תלונה שחזרה. אשכולות של ≥2 הם
 * מועמדי-לקח גם בלי מודל (fallback כשאין ספק AI).
 */
export function clusterEvents(events) {
  const clusters = [];
  for (const ev of events) {
    // המפתח הוא טקסט המשוב בלבד: העוגנים שונים מטבעם (כל הערה על קטע אחר)
    // והוספתם למפתח מדללת את הדמיון מתחת לסף גם כשהתלונה זהה.
    const key = String(ev.feedbackText || ev.anchorExcerpt || '').trim();
    if (!key) continue;
    const home = clusters.find((c) => tokenOverlap(c.key, key) >= CLUSTER_SIMILARITY);
    if (home) { home.events.push(ev); } else { clusters.push({ key, events: [ev] }); }
  }
  return clusters;
}

/** העשרת אירועים בקטגוריה דטרמיניסטית (אם אין להם כבר). */
export function prePassEvents(events) {
  return (events || []).map((ev) => ({
    ...ev,
    category: ev.category && ev.category !== 'other' ? ev.category : categorizeFeedbackText(`${ev.feedbackText} ${ev.anchorExcerpt}`),
  }));
}

// ── שכבה 2: זיקוק במודל ──

const DISTILL_SYSTEM = `אתה מנתח משוב של מרצה על עבודה אקדמית ומזקק ממנו לקחים מוכללים לעבודות הבאות.
חוקים מוחלטים:
1. החזר JSON בלבד, במבנה: {"rules":[{"text":"...","category":"...","eventIds":["e_..."]}]}
2. כל לקח חייב לצטט ב-eventIds את מזהי האירועים שהוא מכליל. אסור להמציא לקח שאין לו אירוע תומך.
3. text: משפט אחד בעברית, מנוסח כהנחיה לעתיד ("המרצה מוריד נקודות על X — עשה Y"), עד 200 תווים.
4. category: אחת מ-citation/structure/argument/language/formatting/sources/other.
5. עד ${MAX_DISTILLED_RULES} לקחים. אירועים שחוזרים על אותה בעיה — לקח אחד שמצטט את כולם.
6. הערה נקודתית מדי (טעות כתיב יחידה, תיקון עובדה ספציפית) אינה לקח — דלג עליה.`;

function parseDistillResponse(raw, validEventIds) {
  let payload = null;
  const text = String(raw || '');
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  try { payload = JSON.parse(jsonMatch[0]); } catch { return []; }
  const rules = Array.isArray(payload?.rules) ? payload.rules : [];
  const out = [];
  for (const r of rules) {
    const text2 = String(r?.text || '').trim();
    if (!text2) continue;
    // שער אנטי-הזיה: רק ציטוטים לאירועים שקיימים באמת.
    const cited = (Array.isArray(r?.eventIds) ? r.eventIds : [])
      .map(String)
      .filter((id) => validEventIds.has(id));
    if (!cited.length) continue; // לקח בלי ראיה מאומתת — נזרק
    out.push({
      text: text2,
      category: RULE_CATEGORIES.includes(r?.category) ? r.category : categorizeFeedbackText(text2),
      evidenceEventIds: [...new Set(cited)],
    });
  }
  return out.slice(0, MAX_DISTILLED_RULES);
}

/** fallback דטרמיניסטי כשאין ספק AI: אשכולות חוזרים הופכים ללקחים גולמיים. */
function distillDeterministic(events) {
  return clusterEvents(events)
    .filter((c) => c.events.length >= 2 && c.events.some((e) => e.feedbackText))
    .map((c) => {
      const lead = c.events.find((e) => e.feedbackText) || c.events[0];
      return {
        text: `המרצה העיר שוב ושוב: "${lead.feedbackText || lead.anchorExcerpt}"`,
        category: lead.category || categorizeFeedbackText(lead.feedbackText),
        evidenceEventIds: c.events.map((e) => e.id).filter(Boolean),
      };
    })
    .slice(0, MAX_DISTILLED_RULES);
}

/**
 * זיקוק אירועים של מרצה ללקחים מוצעים. לא שומר כלום — מחזיר מועמדים
 * שה-wizard מציג לאישור/עריכה/דחייה, ורק אז saveDistilledRules.
 *
 * @param {string} lecturerId
 * @param {object[]} [eventsOverride] ברירת מחדל: כל האירועים של המרצה
 * @returns {Promise<{ok:boolean, candidates:[], viaModel:boolean, error?:string}>}
 */
export async function distillLecturerRules(lecturerId, eventsOverride = null) {
  await ensureLecturerProfilesReady();
  const lecturer = getLecturerProfile(lecturerId);
  if (!lecturer) return { ok: false, candidates: [], viaModel: false, error: 'מרצה לא נמצא.' };

  const events = prePassEvents(eventsOverride || lecturer.events);
  if (!events.length) return { ok: true, candidates: [], viaModel: false };
  const validEventIds = new Set(events.map((e) => e.id).filter(Boolean));

  let rawRules = [];
  let viaModel = false;
  if (hasUsableAiProvider()) {
    const eventLines = events.map((e) => {
      const anchor = e.anchorExcerpt ? ` | על הטקסט: "${e.anchorExcerpt}"` : '';
      return `${e.id} [${e.kind}] "${e.feedbackText || '(סימון בלבד)'}"${anchor}`;
    }).join('\n');
    try {
      const response = await chatWithActiveProvider(
        `אירועי המשוב של המרצה ${lecturer.name}:\n${eventLines}\n\nזקק לקחים.`,
        '',
        DISTILL_SYSTEM,
        {
          skipAutomation: true,
          skipMultiModel: true,
          forceSuppressResearchRouting: true,
          agentLabel: 'זיקוק לקחי מרצה',
        },
      );
      rawRules = parseDistillResponse(response, validEventIds);
      viaModel = true;
    } catch {
      rawRules = [];
    }
  }
  if (!rawRules.length) {
    rawRules = distillDeterministic(events);
    viaModel = false;
  }

  // dedup מול לקחים קיימים של המרצה: דומה מספיק ⇒ מיזוג ראיות ללקח הקיים.
  const candidates = [];
  for (const raw of rawRules) {
    const existing = lecturer.rules.find((r) => bigramSimilarity(r.text, raw.text) >= RULE_MERGE_SIMILARITY);
    if (existing) {
      candidates.push({
        ...existing,
        // עריכת משתמש מנצחת — הטקסט של existing נשאר.
        evidenceEventIds: [...new Set([...existing.evidenceEventIds, ...raw.evidenceEventIds])],
        mergedInto: existing.id,
      });
    } else {
      candidates.push({
        text: raw.text,
        scope: 'lecturer',
        category: raw.category,
        source: 'distilled',
        evidenceEventIds: raw.evidenceEventIds,
        evidenceCount: raw.evidenceEventIds.length,
        status: 'active',
      });
    }
  }
  return { ok: true, candidates, viaModel };
}

/**
 * שמירת הלקחים שהמשתמש אישר ב-wizard + קידום לגלובלי כשמגיע.
 * @returns {Promise<{saved:number, promoted:number}>}
 */
export async function saveDistilledRules(lecturerId, approvedCandidates) {
  await ensureLecturerProfilesReady();
  let saved = 0;
  for (const candidate of approvedCandidates || []) {
    const rule = await upsertRule(candidate, { lecturerId });
    if (rule) saved += 1;
  }
  const promoted = await promoteCrossLecturerRules();
  return { saved, promoted };
}

/**
 * קידום לגלובלי: לקח שמופיע (בדמיון גבוה) אצל ≥2 מרצים עם ≥3 ראיות במצטבר
 * מועתק ל-globalRules. הלקחים המקוריים נשארים אצל המרצים.
 */
export async function promoteCrossLecturerRules() {
  const lecturers = listLecturerProfiles();
  const { rules: existingGlobal } = getActiveRulesFor({});
  let promoted = 0;

  const allRules = [];
  for (const lecturer of lecturers) {
    for (const rule of lecturer.rules) {
      if (rule.status === 'active') allRules.push({ lecturerId: lecturer.id, rule });
    }
  }
  const used = new Set();
  for (let i = 0; i < allRules.length; i += 1) {
    if (used.has(i)) continue;
    const group = [allRules[i]];
    for (let j = i + 1; j < allRules.length; j += 1) {
      if (used.has(j) || allRules[j].lecturerId === allRules[i].lecturerId) continue;
      if (bigramSimilarity(allRules[i].rule.text, allRules[j].rule.text) >= RULE_MERGE_SIMILARITY) {
        group.push(allRules[j]);
        used.add(j);
      }
    }
    if (group.length < GLOBAL_PROMOTION_MIN_LECTURERS) continue;
    const totalEvidence = group.reduce((n, g) => n + g.rule.evidenceCount, 0);
    if (totalEvidence < GLOBAL_PROMOTION_MIN_EVIDENCE) continue;
    const lead = group[0].rule;
    if (existingGlobal.some((g) => bigramSimilarity(g.text, lead.text) >= RULE_MERGE_SIMILARITY)) continue;
    const rule = await upsertRule({
      ...lead,
      id: `r_g_${lead.id}`,
      scope: 'global',
      evidenceCount: totalEvidence,
      evidenceEventIds: [...new Set(group.flatMap((g) => g.rule.evidenceEventIds))],
    }, {});
    if (rule) promoted += 1;
  }
  return promoted;
}

// ── שכבה 3: הבלוק המוזרק לפרומפטים ──

const CONFIDENCE_LABELS = { high: 'ביטחון גבוה', medium: 'ביטחון בינוני', low: 'ביטחון נמוך' };
export const LECTURER_RULES_BLOCK_HEADER = '== לקחים ממשובי מרצים (נלמד מעבודות קודמות) ==';
const BLOCK_FOOTER = '== סוף לקחים ==';
const DEFAULT_BLOCK_BUDGET = 1200;
const MAX_BLOCK_RULES = 12;

/**
 * בלוק הלקחים להזרקה לפרומפט. מחזיר '' כשאין לקחים — הקוראים משרשרים בעיוורון.
 * סינכרוני — דורש ensureLecturerProfilesReady מוקדם יותר במחזור החיים (נעשה
 * ב-cloudSyncManager וב-UI; הקוראים העיקריים רצים הרבה אחרי ההידרציה).
 *
 * @param {{lecturerName?:string, courseName?:string, budget?:number}} opts
 */
export function buildLecturerRulesBlock({ lecturerName = '', courseName = '', courseId = '', budget = DEFAULT_BLOCK_BUDGET } = {}) {
  const { lecturer, rules } = getActiveRulesFor({ lecturerName, courseName, courseId });
  if (!rules.length) return '';

  const headerParts = [];
  if (lecturer) headerParts.push(`מרצה: ${lecturer.name}`);
  if (courseName) headerParts.push(`קורס: ${courseName}`);

  const lines = [LECTURER_RULES_BLOCK_HEADER];
  if (headerParts.length) lines.push(headerParts.join(' | '));
  let used = lines.join('\n').length + BLOCK_FOOTER.length + 2;
  let count = 0;
  for (const rule of rules) {
    if (count >= MAX_BLOCK_RULES) break;
    const line = `• [${CONFIDENCE_LABELS[rule.confidence] || CONFIDENCE_LABELS.low}] ${rule.text}`;
    if (used + line.length + 1 > budget) break;
    lines.push(line);
    used += line.length + 1;
    count += 1;
  }
  if (count === 0) return '';
  lines.push(BLOCK_FOOTER);
  return lines.join('\n');
}

/**
 * רזולוציית ההקשר: ישות קורס (אם סופקה) → פרויקט (courseName/lecturerName) →
 * fallback לפרופיל האישי (lecturerNames[0]/currentCourses[0]).
 * מחזיר את הפרמטרים ל-buildLecturerRulesBlock/getActiveRulesFor.
 */
export function resolveLecturerContext({ project = null, personalStyle = null, course = null } = {}) {
  const lecturerName = String(
    course?.lecturerName || project?.lecturerName
    || personalStyle?.lecturerNames?.[0] || personalStyle?.lecturerName || '',
  ).trim();
  const courseName = String(course?.name || project?.courseName || personalStyle?.currentCourses?.[0] || '').trim();
  const courseId = String(course?.id || project?.courseId || '').trim();
  return { lecturerName, courseName, courseId };
}
