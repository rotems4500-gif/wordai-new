// courseSyllabusImport.js — ייבוא קורס מקובץ סילבוס.
//
// שני מסלולים, כמו processSyllabusProfileImport ב-aiService (שהוא התבנית לקובץ
// הזה) — אבל **צורת-קורס** ולא צורת-פרופיל: התוצר הוא draft שנכנס ל-courseStore.
//   1. היוריסטיקה טהורה (extractCourseDraftHeuristically) — בלי רשת, בלי מפתח API.
//   2. מעבר LLM שמעשיר את ההיוריסטיקה (JSON בלבד). כישלון/פרסינג שבור ⇒ נופלים
//      חזרה על ההיוריסטיקה, אף פעם לא על שגיאה.
//
// ⚠️ קונבנציית ה-harness: הקובץ חייב להיות בטוח ל-Node.
//   • הפונקציות ההיוריסטיות טהורות ומיוצאות סטטית — בלי שום import כבד.
//   • aiService ו-workspaceLearningService נטענים **רק** ב-`await import()` בתוך
//     פונקציות async, כדי שגרף ה-imports הסטטי לא יגרור את firebase/TipTap.
//   • courseStore מותר סטטית — הוא נטול firebase (יושב על localStorage בלבד).

import { createCourse, updateCourseMeta, findCourseByName, getCourseById } from './courseStore';

const SYLLABUS_MAX_CHARS = 20000;
const TOPICS_BLOCK_HEADER = '\n\n--- נושאים מרכזיים ---\n';
const MAX_TOPICS = 8;
const MAX_SUGGESTED_MATERIALS = 6;
const MATERIAL_TYPES = ['מצגת', 'מאמר', 'הנחיות', 'ספר', 'אחר'];

// גרשיים בעברית מגיעים בארבע צורות (`" ״ ' ׳`) ו-OCR מערבב ביניהן — כל regex
// שנוגע ב-ד"ר / פרופ' חייב לקבל את כולן.
const QUOTE_CLASS = '["\u05F4\'\u05F3\u2019\u201C\u201D]';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** ניקוי ערך שנחתך מתוך שורה: פיסוק תוחם, מקפים ונקודות בקצוות. */
const trimEdges = (value) => clean(value)
  .replace(/^[\s:\-–—•*|]+/u, '')
  .replace(/[\s:\-–—•*|.,;]+$/u, '')
  .trim();

const stripCodeFences = (value = '') => String(value || '')
  .replace(/^\s*```[a-zA-Z]*\s*/u, '')
  .replace(/```\s*$/u, '')
  .trim();

/** אותו חוזה כמו safeJsonParse ב-aiService (שם הוא פרטי) — JSON או fallback. */
const parseJsonLoose = (value = '', fallback = null) => {
  const text = stripCodeFences(value);
  if (!text) return fallback;
  try { return JSON.parse(text); } catch {}
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (!objectMatch) return fallback;
  try { return JSON.parse(objectMatch[0]); } catch { return fallback; }
};

/** דגימת ראש+אמצע+זנב, כמו sampleSyllabusImportText — סילבוס ארוך לא נחתך בראשו. */
const sampleText = (rawText = '', maxLength = 28000) => {
  const source = String(rawText || '').trim();
  if (!source || source.length <= maxLength) return source;
  const separator = '\n\n...\n\n';
  const available = maxLength - separator.length * 2;
  if (available <= 300) return source.slice(0, maxLength);
  const headLength = Math.floor(available * 0.4);
  const middleLength = Math.floor(available * 0.2);
  const tailLength = available - headLength - middleLength;
  const middleStart = Math.max(headLength, Math.min(
    source.length - tailLength - middleLength,
    Math.floor((source.length - middleLength) / 2),
  ));
  return [
    source.slice(0, headLength).trimEnd(),
    source.slice(middleStart, middleStart + middleLength).trim(),
    source.slice(-tailLength).trimStart(),
  ].filter(Boolean).join(separator);
};

// ── היוריסטיקות ──

/** שורות משמעותיות בלבד (בלי ריקות ובלי קווים מפרידים). */
const meaningfulLines = (text) => String(text || '')
  .split(/\r?\n/)
  .map((line) => line.replace(/\s+/g, ' ').trim())
  .filter((line) => line && !/^[-–—_=*.·•\s]+$/u.test(line));

/** שורת "כותרת מוסד" — מוסד/פקולטה/חוג/כותרת סילבוס. לא שם קורס. */
const INSTITUTION_LINE_RE = /(אוניברסיט|מכלל|הפקולט|פקולט|בית\s*הספר|המרכז\s+האקדמי|טכניון|מכון\s|החוג\s|חוג\s+ל|תוכנית\s+הלימודים|שנת\s+הלימודים|שנה["\u05F4]ל|סילבוס|תכנית\s+הלימודים|syllabus|university|college|faculty|department|school\s+of)/iu;

const LECTURER_TITLE_RE = new RegExp(`(?:ד${QUOTE_CLASS}?ר|דוקטור|פרופ${QUOTE_CLASS}?|פרופסור|עו${QUOTE_CLASS}?ד|מר|גב${QUOTE_CLASS}?)\\s`, 'u');

const TERM_LINE_RE = /(סמסטר|תש[א-ת]["\u05F4'\u05F3]?[א-ת]|שנת\s*20\d{2})/u;

/** שם קורס מתוך שם הקובץ: בלי סיומת, בלי קווים תחתונים, בלי "סילבוס". */
export function deriveCourseNameFromFileName(fileName = '') {
  const base = String(fileName || '').split(/[\\/]/).pop() || '';
  const noExt = base.replace(/\.[a-zA-Z0-9]{1,6}$/u, '');
  const spaced = noExt.replace(/[_+]+/g, ' ').replace(/\s*-\s*/g, ' - ');
  const withoutLabel = spaced
    .replace(/^\s*(סילבוס|סילאבוס|syllabus|course)\s*(של|ל|[-–—:])?\s*/iu, '')
    .replace(/\s*(סילבוס|syllabus)\s*$/iu, '');
  return trimEdges(withoutLabel).slice(0, 120);
}

function extractCourseName(text, fileName) {
  const explicit = String(text || '').match(
    /(?:שם\s*הקורס|שם\s+קורס|כותרת\s+הקורס|course\s+title|course\s+name)\s*[:\-–]\s*([^\n]{2,140})/iu,
  ) || String(text || '').match(/(?:^|\n)\s*(?:קורס|course)\s*[:\-–]\s*([^\n]{2,140})/iu);
  const fromPattern = trimEdges(explicit?.[1] || '');
  if (fromPattern) return fromPattern.slice(0, 120);

  // אין דפוס מפורש: השורה המשמעותית הראשונה שאינה כותרת מוסד / מרצה / סמסטר.
  const candidate = meaningfulLines(text).find((line) => (
    line.length >= 3 && line.length <= 120
    && !INSTITUTION_LINE_RE.test(line)
    && !LECTURER_TITLE_RE.test(line)
    && !/^(מרצה|מנחה|מתרגל|מייל|דוא|טלפון|שעות|נקודות|מספר\s+הקורס)/u.test(line)
    && !TERM_LINE_RE.test(line)
    && !/^\d+[.)\s]/u.test(line)
  ));
  if (candidate) return trimEdges(candidate).slice(0, 120);

  return deriveCourseNameFromFileName(fileName);
}

function extractLecturerName(text) {
  const source = String(text || '');
  const labeled = source.match(
    /(?:מרצה\s+הקורס|מרצה\s+אחראי[תה]?|מרצת\s+הקורס|מרצה|מרצים|מנחה|Instructor|Lecturer|Professor)\s*[:\-–]\s*([^\n]{2,140})/iu,
  );
  const fromLabel = trimEdges(labeled?.[1] || '');
  if (fromLabel) return fromLabel.slice(0, 120);

  // בלי תווית: שם עם תואר (ד"ר / ד״ר / פרופ' / פרופסור), עד סוף השורה או פסיק.
  const titled = source.match(new RegExp(
    `((?:ד${QUOTE_CLASS}?ר|פרופ${QUOTE_CLASS}?|פרופסור)\\s+[^\\n,;()|]{2,80})`, 'u',
  ));
  return trimEdges(titled?.[1] || '').slice(0, 120);
}

function extractTerm(text) {
  const source = String(text || '');
  const yearMatch = source.match(/תש[א-ת]["\u05F4'\u05F3]?[א-ת]/u)
    || source.match(/(?:^|\s)(20\d{2}(?:\s*[-–/]\s*(?:20)?\d{2})?)/u);
  const year = trimEdges(yearMatch?.[1] || yearMatch?.[0] || '');

  const labeled = source.match(/סמסטר\s*[:\-–]\s*([^\n]{1,60})/u);
  let term = '';
  if (labeled) {
    term = `סמסטר ${trimEdges(labeled[1])}`.trim();
  } else {
    const letter = source.match(/סמסטר\s*(קיץ|[אבג])(?:['\u05F3])?/u);
    if (letter) term = letter[1] === 'קיץ' ? 'סמסטר קיץ' : `סמסטר ${letter[1]}'`;
  }

  if (!term) return year ? year.slice(0, 80) : '';
  if (year && !term.includes(year)) term = `${term} ${year}`;
  return term.slice(0, 80);
}

const TOPIC_PREFIX_RE = /^(?:[•▪●◦*\-–—]\s*|\d{1,2}\s*[.)]\s*|(?:שבוע|שיעור|מפגש|יחידה|פרק|week|unit|module|lesson)\s*\d{1,2}\s*[:.\-–)]?\s*)/iu;

function extractTopics(text) {
  const out = [];
  const seen = new Set();
  for (const line of meaningfulLines(text)) {
    if (!TOPIC_PREFIX_RE.test(line)) continue;
    const topic = trimEdges(line.replace(TOPIC_PREFIX_RE, ''));
    if (topic.length < 3 || topic.length > 80) continue;
    // שורות תאריך/הגשה אינן נושא לימוד.
    // ⚠️ בלי \b — הוא חסר משמעות בעברית (וגם `\b?` הוא regex לא חוקי).
    if (/^(?:מועד|תאריך|הגשה|בחינה|מבחן)/u.test(topic) && /\d/.test(topic)) continue;
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(topic);
    if (out.length >= MAX_TOPICS) break;
  }
  return out;
}

/**
 * חילוץ טיוטת קורס מטקסט סילבוס — **פונקציה טהורה**, בלי רשת ובלי מודל.
 * זה גם מסלול ה-fallback היחיד כשאין ספק AI מוגדר.
 *
 * @returns {{name:string, lecturerName:string, term:string, topics:string[], syllabusText:string, suggestedMaterials:Array}}
 */
export function extractCourseDraftHeuristically({ rawText = '', fileName = '' } = {}) {
  const text = String(rawText || '').trim();
  return {
    name: extractCourseName(text, fileName),
    lecturerName: extractLecturerName(text),
    term: extractTerm(text),
    topics: extractTopics(text),
    syllabusText: text,
    suggestedMaterials: [],
  };
}

// ── נורמליזציה של פלט ה-LLM ──

const normalizeTopics = (value) => {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const topic = trimEdges(item).slice(0, 80);
    if (topic.length < 3) continue;
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(topic);
    if (out.length >= MAX_TOPICS) break;
  }
  return out;
};

const normalizeSuggestedMaterials = (value) => {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const raw = item && typeof item === 'object' ? item : { label: item };
    const label = trimEdges(raw.label).slice(0, 120);
    if (label.length < 2) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const type = MATERIAL_TYPES.includes(trimEdges(raw.type)) ? trimEdges(raw.type) : 'אחר';
    out.push({ label, type, reason: trimEdges(raw.reason).slice(0, 160) });
    if (out.length >= MAX_SUGGESTED_MATERIALS) break;
  }
  return out;
};

const buildExtractionPrompt = ({ fileName, analysisText }) => [
  'נתח קובץ סילבוס של קורס אקדמי והחזר JSON בלבד, בלי טקסט מסביב.',
  'החזר בדיוק במבנה הבא:',
  '{"courseName":"","lecturerName":"","term":"","topics":[],"suggestedMaterials":[{"label":"","type":"","reason":""}]}',
  'כללים:',
  '- חלץ רק מידע שמופיע בטקסט או בשם הקובץ. אל תמציא שום פרט.',
  '- courseName הוא שם הקורס בלבד, לא שם המוסד ולא שם הפקולטה.',
  '- lecturerName הוא שם המרצה כפי שהוא מופיע (כולל תואר אם נכתב).',
  '- term הוא הסמסטר והשנה, למשל "סמסטר א\' תשפ"ו". אם לא מופיע — "".',
  '- topics: עד 8 נושאים קצרים (לא משפטים ארוכים ולא תאריכי הגשה).',
  '- suggestedMaterials: עד 6 חומרי עזר שכדאי לאסוף לקורס, **נגזרים מהסילבוס בלבד** — למשל "מצגות השיעורים", "מאמר החובה של X", "דף הנחיות ההגשה".',
  `- type של כל חומר חייב להיות אחד מ: ${MATERIAL_TYPES.join('|')}.`,
  '- אם שדה לא ידוע, החזר "" או [].',
  `שם הקובץ: ${fileName || 'לא צוין'}`,
  `טקסט הסילבוס:\n${analysisText}`,
].join('\n');

/**
 * ייבוא קובץ סילבוס → טיוטת קורס.
 * status: 'empty' (אין תוכן) | 'heuristic' (אין ספק AI / המודל נכשל) | 'processed'.
 */
export async function processCourseSyllabusImport({ file = null, providerConfig = null } = {}) {
  const fileName = String(file?.name || '').trim();

  let rawText = '';
  try {
    const { readInstructionFile } = await import('./workspaceLearningService.js');
    rawText = String(await readInstructionFile(file, SYLLABUS_MAX_CHARS) || '').trim();
  } catch (error) {
    return {
      ok: false,
      status: 'empty',
      error: error?.message === 'unsupported-binary-file'
        ? 'סוג הקובץ אינו נתמך. נסה PDF, DOCX או TXT.'
        : 'לא הצלחתי לקרוא את הקובץ.',
      draft: null,
    };
  }

  if (!rawText) {
    return { ok: false, status: 'empty', error: 'לא נמצא תוכן קריא בקובץ.', draft: null };
  }

  const draft = extractCourseDraftHeuristically({ rawText, fileName });

  let ai = null;
  let availability = null;
  try {
    ai = await import('./aiService.js');
    availability = ai.getExternalAnalysisAvailability('', providerConfig);
  } catch {
    return { ok: true, status: 'heuristic', error: '', draft };
  }
  if (!availability?.hasLocalProvider) {
    return { ok: true, status: 'heuristic', error: '', draft };
  }

  try {
    const raw = await ai.chatWithActiveProvider(
      buildExtractionPrompt({ fileName, analysisText: sampleText(rawText, 28000) }),
      '',
      '',
      {
        providerOverride: availability.processingProviderId,
        providerConfigOverride: providerConfig,
        strictProviderOverride: true,
        strictFormatting: true,
        skipAutomation: true,
        skipMultiModel: true,
        agentLabel: 'Course Syllabus Import',
        runId: `course-syllabus-${Date.now()}`,
      },
    );
    const parsed = parseJsonLoose(raw, null);
    if (!parsed || typeof parsed !== 'object') throw new Error('לא התקבל JSON תקין מהעיבוד.');

    // המודל מנצח על ההיוריסטיקה רק בשדה שהוא באמת מילא.
    const llmTopics = normalizeTopics(parsed.topics);
    const merged = {
      ...draft,
      name: trimEdges(parsed.courseName).slice(0, 120) || draft.name,
      lecturerName: trimEdges(parsed.lecturerName).slice(0, 120) || draft.lecturerName,
      term: trimEdges(parsed.term).slice(0, 80) || draft.term,
      topics: llmTopics.length ? llmTopics : draft.topics,
      suggestedMaterials: normalizeSuggestedMaterials(parsed.suggestedMaterials),
    };
    return { ok: true, status: 'processed', error: '', draft: merged };
  } catch {
    return { ok: true, status: 'heuristic', error: '', draft };
  }
}

// ── כתיבה ל-courseStore ──

/**
 * גוף הסילבוס + בלוק הנושאים, מוגבל ל-20,000 תווים.
 * ⚠️ הגוף נחתך **לפני** ההרכבה כדי שבלוק הנושאים תמיד ייכנס — אחרת החיתוך של
 * normalizeCourse היה בולע בדיוק את מה שהוספנו.
 */
export function buildSyllabusTextFromDraft(draft = {}) {
  const body = String(draft.syllabusText || '');
  const topics = Array.isArray(draft.topics) ? draft.topics.filter((t) => trimEdges(t)) : [];
  if (!topics.length) return body.slice(0, SYLLABUS_MAX_CHARS);
  const block = `${TOPICS_BLOCK_HEADER}${topics.map((t) => `• ${trimEdges(t)}`).join('\n')}`;
  const room = Math.max(0, SYLLABUS_MAX_CHARS - block.length);
  return `${body.slice(0, room)}${block}`;
}

/**
 * יצירה/עדכון של קורס מתוך טיוטה.
 *
 * ⚠️ createCourse הוא **אידמפוטנטי לפי שם** — הוא מחזיר קורס קיים בלי לעדכן שדות.
 * לכן תמיד עוקבים אחריו ב-updateCourseMeta, ומעדכנים רק שדות לא-ריקים כדי שטיוטה
 * חסרה לא תמחק מרצה/סמסטר שכבר נשמרו.
 *
 * @returns {{course:object|null, existed:boolean}}
 */
export function createCourseFromDraft(draft = {}, { existingCourseId = null } = {}) {
  const name = trimEdges(draft.name).slice(0, 120);
  const lecturerName = trimEdges(draft.lecturerName).slice(0, 120);
  const term = trimEdges(draft.term).slice(0, 80);
  const syllabusText = buildSyllabusTextFromDraft(draft);

  const patch = {};
  if (lecturerName) patch.lecturerName = lecturerName;
  if (term) patch.term = term;
  if (syllabusText) patch.syllabusText = syllabusText;

  const targetId = String(existingCourseId || '').trim();
  if (targetId) {
    if (!getCourseById(targetId)) return { course: null, existed: false };
    if (name) patch.name = name;
    const course = updateCourseMeta(targetId, patch);
    return { course, existed: true };
  }

  if (!name) return { course: null, existed: false };
  const existed = Boolean(findCourseByName(name));
  const created = createCourse({ name });
  if (!created) return { course: null, existed };
  const course = Object.keys(patch).length ? updateCourseMeta(created.id, patch) : created;
  return { course: course || created, existed };
}
