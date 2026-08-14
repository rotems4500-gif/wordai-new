// skillFileImport.js — ייבוא "קובץ סקיל" שהמשתמש מעלה (Markdown + frontmatter).
//
// אותה צורה בדיוק כמו סקיל של Claude Code: בלוק `---` בראש הקובץ עם `name` ו-
// `description`, וכל השאר הוא גוף ההנחיה. דוגמה אמיתית בריפו:
// `.claude/skills/rotem-voice/SKILL.md`.
//
// התבנית היא courseSyllabusImport (קובץ → חילוץ → פרסינג → אחסון) — **אבל בלי
// שום מעבר LLM**: ה-frontmatter כבר מובנה, אין מה לנחש. ולכן גם אין כאן סיכון
// המצאה, ואין תלות במפתח API.
//
// ⚠️ קונבנציית ה-harness (זהה ל-courseSyllabusImport):
//   • parseSkillMarkdown טהורה לחלוטין — בלי window, בלי רשת, בטוחה ל-Node.
//   • workspaceLearningService נטען **רק** ב-`await import()` בתוך פונקציה async:
//     הוא מייבא סטטית את aiService, ו-aiService מייבא מהקובץ הזה את התקרות ⇒
//     import סטטי היה סוגר מעגל.
//   • lexicalRelevance מותר סטטית — הוא טהור (בלי I/O, בלי window).

import { extractContextMatchTerms } from './lexicalRelevance';

/** תקרת אורך לגוף סקיל אחד (התוכן שנכנס ל-prompt). חורג ⇒ נחתך, לא נדחה. */
export const SKILL_FILE_MAX_CHARS = 8000;

/** כמה סקילים מותאמים מותר לשמור. ⚠️ משפיע על גודל מסמך הסנכרון — ר' cloudSyncManager. */
export const MAX_CUSTOM_SKILLS = 20;

// קוראים מעט יותר מהתקרה כדי שה-frontmatter לא "יגנוב" מהגוף, ושנוכל לדעת
// שהגוף באמת נחתך (ולדווח על כך) במקום לחתוך בשקט כבר בשלב הקריאה.
const SKILL_FILE_READ_MAX_CHARS = SKILL_FILE_MAX_CHARS + 2000;

const LABEL_MAX_CHARS = 80;
const DESCRIPTION_MAX_CHARS = 600;
const USAGE_HINT_MAX_CHARS = 160;
const MAX_DERIVED_KEYWORDS = 8;

// מילים שחוזרות כמעט בכל תיאור סקיל ("משתמשים בזה כש...") — הן לא מזהות כלום,
// ומילת זיהוי גנרית מפעילה את הסקיל על כל בקשה. מסוננות מעל ה-stop-words של lexicalRelevance.
const SKILL_META_STOP_WORDS = new Set([
  'משתמשים', 'משתמש', 'כשמבקשים', 'מבקשים', 'כשצריך', 'צריך', 'מכיל', 'כולל',
  'להשתמש', 'שימוש', 'סקיל', 'הסקיל', 'כאשר', 'למשל', 'וגם', 'שנשמע', 'נשמע',
]);

const SUPPORTED_EXTENSIONS = ['md', 'markdown', 'txt'];

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** גרשיים בעברית מגיעים בכמה צורות — כל regex שנוגע בציטוט חייב לקבל את כולן. */
const QUOTE_OPEN = '["“״]';
const QUOTE_CLOSE = '["”״]';

const hashString = (value = '') => {
  let hash = 0;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
};

/**
 * מזהה בטוח מתוך שם הסקיל: a-z, 0-9 ומקף בלבד.
 * שם עברי (או כל שם שלא נשאר ממנו slug) מקבל מזהה **דטרמיניסטי** מגיבוב השם —
 * כך שייבוא חוזר של אותו קובץ מחליף את הסקיל במקום לשכפל אותו.
 */
export function slugifySkillName(name = '') {
  const slug = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  if (slug.length >= 2 && /^[a-z0-9]/.test(slug)) return slug;
  return `skill-${hashString(clean(name))}`;
}

/** הסרת מרכאות עוטפות מערך frontmatter (`name: "x"` / `name: 'x'`). */
const unquote = (value = '') => {
  const text = String(value || '').trim();
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return text.slice(1, -1).trim();
    }
  }
  return text;
};

/**
 * פרסר frontmatter מינימלי מבוסס-שורות. **בכוונה בלי תלות YAML** — הפורמט שאנחנו
 * תומכים בו הוא `key: value` שטוח, עם שורות המשך מוזחות. ערכים עבריים עוברים
 * כמות שהם (אין escaping, אין המרת קידוד).
 */
function parseFrontmatterBlock(block = '') {
  const out = {};
  let currentKey = '';
  for (const rawLine of String(block || '').split(/\r?\n/)) {
    if (!rawLine.trim() || /^\s*#/.test(rawLine)) { currentKey = ''; continue; }
    const match = rawLine.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (match) {
      currentKey = match[1].toLowerCase();
      out[currentKey] = unquote(match[2]);
      continue;
    }
    // שורת המשך: מוזחת, שייכת למפתח הקודם.
    if (currentKey && /^\s+\S/.test(rawLine)) {
      out[currentKey] = `${out[currentKey]} ${rawLine.trim()}`.trim();
      continue;
    }
    currentKey = '';
  }
  return out;
}

/**
 * מילות זיהוי מתוך התיאור — **שמרני בכוונה**.
 * קודם ביטויי הפעלה במרכאות (בסקילים כותבים שם בדיוק את "מתי משתמשים בזה"),
 * ורק אם אין מספיק — מונחים בודדים מובחנים. המשתמש יכול לערוך אחר כך בהגדרות.
 */
export function deriveKeywordsFromDescription(description = '') {
  const text = clean(description);
  if (!text) return [];

  const keywords = [];
  const seen = new Set();
  const push = (value) => {
    const item = clean(value).toLowerCase();
    if (!item || item.length < 3 || item.length > 40 || seen.has(item)) return;
    seen.add(item);
    keywords.push(item);
  };

  const quoted = text.match(new RegExp(`${QUOTE_OPEN}([^"“”״]{2,40})${QUOTE_CLOSE}`, 'gu')) || [];
  quoted.forEach((chunk) => push(chunk.replace(new RegExp(`^${QUOTE_OPEN}|${QUOTE_CLOSE}$`, 'gu'), '')));

  if (keywords.length < 4) {
    // ⚠️ בלי \b — הוא חסר משמעות בעברית. extractContextMatchTerms כבר מסנן מילות תפל.
    extractContextMatchTerms(text)
      .filter((term) => term.length >= 4 && !SKILL_META_STOP_WORDS.has(term))
      .slice(0, MAX_DERIVED_KEYWORDS - keywords.length)
      .forEach(push);
  }

  return keywords.slice(0, MAX_DERIVED_KEYWORDS);
}

/** רמז שימוש כשלא נכתב במפורש: המשפט הראשון של התיאור. */
function deriveUsageHint(description = '') {
  const text = clean(description);
  if (!text) return '';
  const firstSentence = text.split(/(?:\.|!|\?)\s/)[0] || text;
  return firstSentence.replace(/[.!?]+$/u, '').trim().slice(0, USAGE_HINT_MAX_CHARS);
}

/**
 * פרסינג של קובץ סקיל (Markdown עם frontmatter) לרשומת סקיל.
 * **לעולם לא זורק** — קלט שבור חוזר כ-`{ok:false, error:'<הודעה בעברית>'}`.
 *
 * @returns {{ok:boolean, skill?:object, error?:string, clipped?:boolean}}
 */
export function parseSkillMarkdown(rawText = '') {
  try {
    const text = String(rawText || '').replace(/^﻿/, '').replace(/\r\n/g, '\n');
    if (!text.trim()) {
      return { ok: false, error: 'הקובץ ריק — אין ממה לבנות סקיל.' };
    }

    const match = text.match(/^\s*---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
    if (!match) {
      return {
        ok: false,
        error: 'לא נמצא בלוק הגדרות בראש הקובץ. קובץ סקיל מתחיל בשורת "---", אחריה name ו-description, ואז שוב "---".',
      };
    }

    const meta = parseFrontmatterBlock(match[1]);
    const body = text.slice(match[0].length).trim();

    const name = clean(meta.name);
    if (!name) {
      return { ok: false, error: 'חסר שדה name בבלוק ההגדרות של הקובץ.' };
    }

    const description = clean(meta.description).slice(0, DESCRIPTION_MAX_CHARS);
    if (!description) {
      return { ok: false, error: 'חסר שדה description בבלוק ההגדרות — צריך משפט שמסביר מתי להפעיל את הסקיל.' };
    }

    if (!body) {
      return { ok: false, error: 'גוף הסקיל ריק. אחרי בלוק ההגדרות צריכות לבוא ההנחיות עצמן.' };
    }

    const clipped = body.length > SKILL_FILE_MAX_CHARS;
    const prompt = clipped ? body.slice(0, SKILL_FILE_MAX_CHARS) : body;

    const explicitKeywords = String(meta.keywords || '')
      .split(/[\n,•]+/)
      .map((item) => clean(item).toLowerCase())
      .filter(Boolean);

    const skill = {
      id: slugifySkillName(name),
      label: name.slice(0, LABEL_MAX_CHARS),
      description,
      usageHint: clean(meta.usagehint || meta.usage || meta.when).slice(0, USAGE_HINT_MAX_CHARS)
        || deriveUsageHint(description),
      prompt,
      keywords: (explicitKeywords.length ? explicitKeywords : deriveKeywordsFromDescription(description))
        .slice(0, MAX_DERIVED_KEYWORDS),
      custom: true,
      addedAt: Date.now(),
    };

    return { ok: true, skill, clipped, error: '' };
  } catch {
    return { ok: false, error: 'לא הצלחתי לפרסר את קובץ הסקיל.' };
  }
}

/**
 * ייבוא קובץ סקיל שהמשתמש בחר → רשומת סקיל מוכנה ל-addCustomSkill.
 * **לעולם לא זורק.**
 *
 * @returns {Promise<{ok:boolean, skill?:object, error?:string, clipped?:boolean}>}
 */
export async function importSkillFile(file = null) {
  if (!file) return { ok: false, error: 'לא נבחר קובץ.' };

  const fileName = String(file?.name || '').trim();
  const ext = fileName.toLowerCase().split('.').pop();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return { ok: false, error: 'קובץ סקיל צריך להיות .md או .txt.' };
  }

  let rawText = '';
  try {
    const { readInstructionFile } = await import('./workspaceLearningService.js');
    rawText = String(await readInstructionFile(file, SKILL_FILE_READ_MAX_CHARS) || '');
  } catch {
    return { ok: false, error: 'לא הצלחתי לקרוא את הקובץ.' };
  }

  if (!rawText.trim()) {
    return { ok: false, error: 'לא נמצא תוכן קריא בקובץ.' };
  }

  return parseSkillMarkdown(rawText);
}
