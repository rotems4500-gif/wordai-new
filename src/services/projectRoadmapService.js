// projectRoadmapService.js — "Project Hub": יצירת מתווה עבודה (roadmap) ל-AI + ייעוץ לאורך
// עבודה אקדמית ארוכה (סמינריון). יושב ליד projectService.js (schema v2 — milestones/tasks
// כבר קיימים שם); הקובץ הזה רק מוסיף שכבת AI מעליו: יצירה, תבנית fallback, הנחיה לשלב,
// "מה הצעד הבא" והשוואה מול הנחיות המטלה.
//
// בכוונה בלי import של tryParseJsonObjectResponse (module-private ב-workspaceLearningService) —
// יש שכפול מקומי למטה.

import {
  getProject,
  getProjectDocuments,
  updateProjectMeta,
  setProjectMilestones,
  updateMilestone,
  buildProjectContextBlock,
  computeProjectProgress,
  SEMINAR_MILESTONE_TEMPLATE,
} from './projectService';
import { chatWithActiveProvider } from './aiService';

const ROADMAP_AI_OPTIONS = {
  agentLabel: 'מתווה עבודה',
  skipAutomation: true,
  skipMultiModel: true,
  directChat: true,
  suppressPersonalStyle: true,
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const makeTaskId = (idx = 0) => `tsk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${idx}`;

// ── clone של tryParseJsonObjectResponse מ-workspaceLearningService (module-private שם) ──
function normalizeJsonOnlyResponse(response = '') {
  return String(response || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function tryParseJsonObjectResponse(response = '') {
  const text = String(response || '').trim();
  if (!text) return null;

  const candidates = [];
  const addCandidate = (value = '') => {
    const candidate = String(value || '').trim();
    if (!candidate || candidates.includes(candidate)) return;
    candidates.push(candidate);
  };

  addCandidate(text);
  addCandidate(normalizeJsonOnlyResponse(text));

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) addCandidate(fencedMatch[1]);

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) addCandidate(text.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
  }

  return null;
}

// ── תיאורים גנריים לתבנית סמינריון (fallback) ──
const TEMPLATE_STAGE_DESCRIPTIONS = {
  'עמוד שער': 'עיצוב עמוד השער לפי דרישות המוסד/הקורס — שם המטלה, פרטי הקורס והמגיש.',
  'נושא ושאלת מחקר': 'ניסוח נושא ממוקד ושאלת מחקר ברורה שהעבודה כולה עונה עליה.',
  'סקירת ספרות': 'איסוף וסיכום המקורות המרכזיים בתחום, מיפוי הפער שהעבודה באה למלא.',
  'מתודולוגיה': 'תיאור שיטת המחקר/הניתוח: כלים, מקורות נתונים, אופן העיבוד.',
  'ממצאים': 'הצגת התוצאות/הממצאים בצורה מסודרת, לפי שאלת המחקר.',
  'דיון': 'פרשנות הממצאים לאור הספרות, השוואה לציפיות ולמחקרים קודמים.',
  'מסקנות': 'סיכום תובנות העבודה, מגבלות והצעות להמשך מחקר.',
  'ביבליוגרפיה': 'רשימת המקורות המלאה בפורמט האזכור הנדרש (APA/אחר).',
};

// חלקי תוכן שמקבלים חלק מיעד המילים; עמוד שער וביבליוגרפיה מקבלים 0.
const TEMPLATE_WORD_SHARE = {
  'עמוד שער': 0,
  'נושא ושאלת מחקר': 0.08,
  'סקירת ספרות': 0.3,
  'מתודולוגיה': 0.12,
  'ממצאים': 0.2,
  'דיון': 0.2,
  'מסקנות': 0.1,
  'ביבליוגרפיה': 0,
};

// ── עזר: פיזור תאריכי יעד בין היום לדדליין, יחסית ל-suggestedWeeks ──
function spreadTargetDates(milestones, targetDateIso) {
  const deadline = Date.parse(targetDateIso || '');
  if (!Number.isFinite(deadline) || deadline <= Date.now()) {
    return milestones.map((m) => ({ ...m, targetDate: '' }));
  }
  const weights = milestones.map((m) => Math.max(1, Number(m.suggestedWeeks) || 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const now = Date.now();
  const span = deadline - now;
  let acc = 0;
  return milestones.map((m, idx) => {
    acc += weights[idx];
    const ratio = acc / totalWeight;
    const date = new Date(now + span * ratio);
    return { ...m, targetDate: date.toISOString().slice(0, 10) };
  });
}

// AI tasks (מערך strings) → אובייקטי task עם id.
function tasksFromStrings(rawTasks) {
  const list = Array.isArray(rawTasks) ? rawTasks : [];
  return list
    .map((t) => String(t || '').trim())
    .filter(Boolean)
    .map((text, idx) => ({ id: makeTaskId(idx), text, done: false }));
}

/**
 * תבנית סמינריון קבועה (בלי AI) — נקודת פתיחה ידנית, וגם fallback כשה-AI נכשל.
 * טהור: לא כותב לאחסון.
 */
export function buildTemplateRoadmap(project) {
  const wordTarget = Number.isFinite(+project?.wordTarget) ? Math.max(0, Math.round(+project.wordTarget)) : 0;
  const base = SEMINAR_MILESTONE_TEMPLATE.map((title) => ({
    title,
    description: TEMPLATE_STAGE_DESCRIPTIONS[title] || '',
    wordTarget: wordTarget ? Math.round(wordTarget * (TEMPLATE_WORD_SHARE[title] || 0)) : 0,
    suggestedWeeks: 1,
  }));
  const withDates = spreadTargetDates(base, project?.targetDate);
  return withDates.map((m) => ({
    title: m.title,
    description: m.description,
    wordTarget: m.wordTarget,
    targetDate: m.targetDate,
    tasks: [],
  }));
}

/**
 * מחיל את תבנית הסמינריון על הפרויקט (כתיבה בפועל).
 */
export async function applyTemplateRoadmap(projectId) {
  const project = getProject(projectId);
  if (!project) throw new Error('הפרויקט לא נמצא.');
  const milestones = buildTemplateRoadmap(project);
  const updated = setProjectMilestones(projectId, milestones, { source: 'תבנית סמינריון' });
  return updated;
}

// ── יצירת מתווה AI ──

function buildRoadmapSystemPrompt(contextBlock) {
  return [
    contextBlock,
    `== AGENT: PROJECT ROADMAP BUILDER ==
אתה מנחה אקדמי מנוסה שבונה מתווה עבודה (roadmap) למטלה/עבודה אקדמית ארוכה עבור סטודנט.
המתווה מחולק לשלבים (milestones) עם משימות קונקרטיות בכל שלב.
עבור עבודת סמינריון, השלבים בדרך כלל דומים ל: עמוד שער, נושא ושאלת מחקר, סקירת ספרות, מתודולוגיה, ממצאים, דיון, מסקנות, ביבליוגרפיה — אך התאם אותם למטלה בפועל.
5 עד 9 שלבים, כל שלב עם 2 עד 5 משימות קונקרטיות. הכל בעברית.
החזר JSON בלבד, בדיוק בסכימה הבאה, בלי שום טקסט מסביב ובלי הערות:
{"projectType":"seminar|assignment|thesis|custom","wordTarget":8000,"milestones":[{"title":"סקירת ספרות","description":"מה נדרש בשלב (2-4 משפטים)","wordTarget":1500,"tasks":["משימה קונקרטית","..."],"suggestedWeeks":2}]}
== END AGENT ==`,
  ].filter(Boolean).join('\n\n');
}

function buildRoadmapUserPrompt(project, hints) {
  const lines = [
    `בנה מתווה עבודה עבור הפרויקט "${project.name}".`,
    project.projectType ? `סוג העבודה: ${project.projectType}` : '',
    project.goal ? `מטרת העבודה: ${project.goal}` : '',
    project.targetDate ? `דדליין: ${project.targetDate}` : '',
    project.wordTarget ? `יעד מילים כולל: ${project.wordTarget}` : '',
    hints ? `הנחיות/דגשים נוספים מהמשתמש:\n${String(hints || '').trim()}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

function isValidRoadmapPayload(payload) {
  if (!isPlainObject(payload)) return false;
  const milestones = Array.isArray(payload.milestones) ? payload.milestones : [];
  const valid = milestones.filter((m) => isPlainObject(m) && String(m.title || '').trim());
  return valid.length >= 3;
}

function convertAiMilestones(payload, targetDateIso) {
  const milestones = (Array.isArray(payload.milestones) ? payload.milestones : [])
    .filter((m) => isPlainObject(m) && String(m.title || '').trim())
    .map((m) => ({
      title: String(m.title || '').trim(),
      description: String(m.description || '').trim(),
      wordTarget: Number.isFinite(+m.wordTarget) ? Math.max(0, Math.round(+m.wordTarget)) : 0,
      suggestedWeeks: Number.isFinite(+m.suggestedWeeks) ? Math.max(1, Math.round(+m.suggestedWeeks)) : 1,
      tasks: tasksFromStrings(m.tasks),
    }));
  const withDates = spreadTargetDates(milestones, targetDateIso);
  return withDates.map((m) => ({
    title: m.title,
    description: m.description,
    wordTarget: m.wordTarget,
    targetDate: m.targetDate,
    tasks: m.tasks,
  }));
}

/**
 * יוצר מתווה עבודה עם AI ושומר אותו על הפרויקט (מחליף מתווה קיים).
 * בכשלון פרסור/תוקף — ניסיון חוזר אחד, ואז נפילה לתבנית (usedFallback: true).
 * לא זורק חריגה על כשלון AI — הקורא מציג טוסט לפי usedFallback.
 */
export async function generateProjectRoadmap(projectId, { hints = '' } = {}) {
  const project = getProject(projectId);
  if (!project) throw new Error('הפרויקט לא נמצא.');

  const contextBlock = await buildProjectContextBlock(projectId);
  const systemPrompt = buildRoadmapSystemPrompt(contextBlock);
  const userPrompt = buildRoadmapUserPrompt(project, hints);

  let payload = null;
  try {
    const response = await chatWithActiveProvider(userPrompt, '', systemPrompt, ROADMAP_AI_OPTIONS);
    payload = tryParseJsonObjectResponse(response);
    if (!isValidRoadmapPayload(payload)) {
      const retryResponse = await chatWithActiveProvider(
        `${userPrompt}\n\nהחזר JSON תקין בלבד, בלי שום טקסט מסביב.`,
        '',
        systemPrompt,
        ROADMAP_AI_OPTIONS,
      );
      payload = tryParseJsonObjectResponse(retryResponse);
    }
  } catch {
    payload = null;
  }

  const targetDateForSpread = project.targetDate;
  let usedFallback = false;
  let milestones;
  if (isValidRoadmapPayload(payload)) {
    milestones = convertAiMilestones(payload, targetDateForSpread);
  } else {
    usedFallback = true;
    milestones = buildTemplateRoadmap(project);
  }

  const metaPatch = {};
  if (!usedFallback && payload && typeof payload.projectType === 'string' && payload.projectType) {
    metaPatch.projectType = payload.projectType;
  }
  if (!project.wordTarget && !usedFallback && Number.isFinite(+payload?.wordTarget) && +payload.wordTarget > 0) {
    metaPatch.wordTarget = Math.round(+payload.wordTarget);
  }
  if (Object.keys(metaPatch).length) updateProjectMeta(projectId, metaPatch);

  const updated = setProjectMilestones(projectId, milestones, {
    source: usedFallback ? 'מתווה נוצר עם AI (נפילה לתבנית)' : 'מתווה נוצר עם AI',
  });

  return { project: updated, usedFallback };
}

// ── הנחיה לשלב ──

/**
 * מחזיר הנחיה מעשית לשלב מסוים. משתמש ב-cache (aiTips) אלא אם force.
 */
export async function getMilestoneGuidance(projectId, milestoneId, { force = false } = {}) {
  const project = getProject(projectId);
  if (!project) throw new Error('הפרויקט לא נמצא.');
  const milestone = project.milestones.find((m) => m.id === String(milestoneId || ''));
  if (!milestone) throw new Error('השלב לא נמצא בפרויקט.');

  if (!force && milestone.aiTips) return milestone.aiTips;

  try {
    const contextBlock = await buildProjectContextBlock(projectId);
    const systemPrompt = [
      contextBlock,
      'אתה מנחה אקדמי — תן הנחיה מעשית וקצרה (עד 8 שורות) איך לגשת לשלב הזה בעבודה. בלי הקדמות, ישר לעניין, בעברית.',
    ].filter(Boolean).join('\n\n');

    const linkedDocs = (milestone.docHistoryIds?.length
      ? getProjectDocuments(projectId).filter((d) => milestone.docHistoryIds.includes(String(d?.id || '')))
      : []
    );
    const docsLine = linkedDocs.length
      ? `מסמכים שכבר קיימים בשלב זה: ${linkedDocs.map((d) => d?.title || d?.fileName || 'ללא שם').join(', ')}`
      : 'אין עדיין מסמך משויך לשלב זה.';

    const tasksLine = milestone.tasks.length
      ? `משימות השלב:\n${milestone.tasks.map((t) => `- ${t.done ? '✔' : '•'} ${t.text}`).join('\n')}`
      : 'לא הוגדרו משימות מפורטות לשלב.';

    const userPrompt = [
      `השלב: ${milestone.title}`,
      milestone.description ? `תיאור השלב: ${milestone.description}` : '',
      tasksLine,
      docsLine,
      'תן הנחיה מעשית איך לגשת לשלב הזה עכשיו.',
    ].filter(Boolean).join('\n');

    const response = String(await chatWithActiveProvider(userPrompt, '', systemPrompt, ROADMAP_AI_OPTIONS) || '').trim();
    if (!response) throw new Error('empty');

    updateMilestone(projectId, milestoneId, { aiTips: response });
    return response;
  } catch {
    throw new Error('קבלת הנחיה לשלב נכשלה — בדוק שספק ה-AI מוגדר.');
  }
}

// ── "מה הצעד הבא" ──

function serializeRoadmapState(project, progress) {
  const lines = [...project.milestones].sort((a, b) => a.order - b.order).map((m) => {
    const doneCount = m.tasks.filter((t) => t.done).length;
    return `- ${m.title} | סטטוס: ${m.status} | משימות: ${doneCount}/${m.tasks.length} | יעד מילים: ${m.wordTarget || 0} | תאריך יעד: ${m.targetDate || 'אין'}`;
  });
  const summary = [
    `התקדמות כוללת: ${progress.percent}% (${progress.doneCount}/${progress.totalCount} שלבים הושלמו)`,
    `מילים שנכתבו: ${progress.wordsWritten}${progress.wordTarget ? ` מתוך ${progress.wordTarget}` : ''}`,
    Number.isFinite(progress.daysToDeadline) ? `ימים לדדליין: ${progress.daysToDeadline}` : '',
  ].filter(Boolean).join('\n');
  return `${summary}\n\nשלבי המתווה:\n${lines.join('\n')}`;
}

/**
 * מציע את הצעד הבא הכי חשוב כרגע (2-3 משפטים + פעולה קונקרטית אחת). בלי cache.
 */
export async function suggestNextStep(projectId) {
  const project = getProject(projectId);
  if (!project) throw new Error('הפרויקט לא נמצא.');
  if (!project.milestones.length) {
    return 'עדיין אין מתווה עבודה לפרויקט הזה. הצעד הבא: בנה מתווה עבודה (AI או תבנית) כדי לקבל שלבים ומשימות.';
  }

  try {
    const progress = computeProjectProgress(project, getProjectDocuments(projectId));
    const contextBlock = await buildProjectContextBlock(projectId);
    const systemPrompt = [
      contextBlock,
      'אתה מנחה אקדמי. בהינתן מצב מתווה העבודה, כתוב 2-3 משפטים בעברית על מה הצעד הבא הכי חשוב עכשיו, ובסוף שורה אחת עם פעולה קונקרטית אחת לביצוע. בלי הקדמות.',
    ].filter(Boolean).join('\n\n');

    const userPrompt = serializeRoadmapState(project, progress);
    const response = String(await chatWithActiveProvider(userPrompt, '', systemPrompt, ROADMAP_AI_OPTIONS) || '').trim();
    if (!response) throw new Error('empty');
    return response;
  } catch {
    throw new Error('קבלת הצעד הבא נכשלה — בדוק שספק ה-AI מוגדר.');
  }
}

// ── בדיקת שלב מול הנחיות המטלה ──

const REVIEW_DOC_TEXT_MAX_CHARS = 15000;

/**
 * בודק את העבודה בשלב מסוים מול הנחיות המטלה (מהקונטקסט). מחזיר טקסט (בולטים קצרים + מסקנה).
 */
export async function reviewMilestoneAgainstGuidelines(projectId, milestoneId, docText = '') {
  const project = getProject(projectId);
  if (!project) throw new Error('הפרויקט לא נמצא.');
  const milestone = project.milestones.find((m) => m.id === String(milestoneId || ''));
  if (!milestone) throw new Error('השלב לא נמצא בפרויקט.');

  try {
    const contextBlock = await buildProjectContextBlock(projectId);
    const systemPrompt = [
      contextBlock,
      `אתה מנחה אקדמי. בדוק את העבודה בשלב הזה מול הנחיות המטלה (מהקונטקסט שלמעלה, אם קיימות).
החזר בעברית, בפורמט קצר:
✅ מה עומד בדרישות
⚠️ מה חסר או טעון שיפור
ולבסוף שורת מסקנה אחת (עומד בדרישות / דורש עוד עבודה / רחוק מהדרישות).`,
    ].filter(Boolean).join('\n\n');

    const cleanDocText = String(docText || '').trim().slice(0, REVIEW_DOC_TEXT_MAX_CHARS);
    const tasksLine = milestone.tasks.length
      ? `משימות השלב:\n${milestone.tasks.map((t) => `- ${t.done ? '✔' : '•'} ${t.text}`).join('\n')}`
      : '';

    const userPrompt = [
      `השלב: ${milestone.title}`,
      milestone.description ? `תיאור השלב: ${milestone.description}` : '',
      tasksLine,
      cleanDocText
        ? `תוכן העבודה בשלב זה:\n${cleanDocText}`
        : 'לא צורף מסמך לבדיקה — בסס את הבדיקה על סטטוס השלב והמשימות בלבד, וציין זאת.',
    ].filter(Boolean).join('\n\n');

    const response = String(await chatWithActiveProvider(userPrompt, '', systemPrompt, ROADMAP_AI_OPTIONS) || '').trim();
    if (!response) throw new Error('empty');
    return response;
  } catch {
    throw new Error('בדיקת השלב מול הנחיות המטלה נכשלה — בדוק שספק ה-AI מוגדר.');
  }
}

// ── seed prompt ליצירת מסמך עבור שלב ──

/**
 * בונה prompt קצר (עברית) לזריעת מחולל המסמכים עבור שלב מסוים. טהור, בלי IO.
 */
export function buildMilestoneDocPrompt(project, milestone) {
  if (!isPlainObject(project) || !isPlainObject(milestone)) return '';
  const lines = [
    `הפרויקט: ${project.name || ''}`,
    project.goal ? `מטרה: ${project.goal}` : '',
    `השלב: ${milestone.title || ''}${milestone.description ? ` — ${milestone.description}` : ''}`,
  ];
  if (Array.isArray(milestone.tasks) && milestone.tasks.length) {
    lines.push(`משימות השלב:\n${milestone.tasks.map((t) => `- ${t.text}`).join('\n')}`);
  }
  if (milestone.wordTarget) lines.push(`יעד מילים לשלב: ${milestone.wordTarget}`);
  return lines.filter(Boolean).join('\n').slice(0, 900);
}
