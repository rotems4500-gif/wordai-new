// ═══════════════════════════════════════════════════════════════
// mediaIntentService.js — "מה ליצור, לא רק איך": ניתוב בקשת מדיה לכלי הנכון.
// גרף נתונים → QuickChart (חינם, בלי מודל תמונות); תרשים/דיאגרמה → מודל תמונה
// שחזק בטקסט בתוך תמונה (nano-banana); אחרת → תמונה אילוסטרטיבית (Imagen).
// הסיווג דטרמיניסטי (מילות מפתח + צפיפות מספרים) — אפס עלות; רק חילוץ מפרט
// הגרף עצמו הוא קריאת מודל אחת קצרה בלי טוקני חשיבה.
// ═══════════════════════════════════════════════════════════════

import { chatWithActiveProvider } from './aiService';
import { renderQuickChart } from './chartService';

const CHART_KEYWORD_RE = /(גרף|תרשים\s+(?:עמודות|עוגה|פיזור|קו)|עוגה|היסטוגרמה|דיאגרמת\s+עמודות|scatter|bar\s*chart|pie\s*chart|line\s*chart|histogram|plot\b)/i;
const DIAGRAM_KEYWORD_RE = /(תרשים\s+זרימה|דיאגרמ|סכמה|סכימה|מבנה\s+ארגוני|ציר\s+זמן|טיימליין|flow\s*chart|flowchart|diagram|timeline|org\s*chart|mind\s*map|מפת\s+חשיבה)/i;

const countNumbers = (text = '') => (String(text).match(/\d+(?:[.,]\d+)?%?/g) || []).length;

/**
 * detectMediaIntent — 'chart' | 'diagram' | 'image' מתוך טקסט הבקשה.
 * chart דורש או מילת-גרף מפורשת או ≥3 מספרים (נתונים אמיתיים לצייר).
 */
export const detectMediaIntent = (text = '') => {
  const clean = String(text || '').trim();
  if (!clean) return 'image';
  if (CHART_KEYWORD_RE.test(clean)) return 'chart';
  if (DIAGRAM_KEYWORD_RE.test(clean)) return 'diagram';
  // "צור תרשים מהנתונים: א 40, ב 25, ג 35" — בלי מילת גרף מפורשת אבל עם נתונים.
  if (countNumbers(clean) >= 3 && /(נתונים|אחוז|התפלגות|השווא|data|percent)/i.test(clean)) return 'chart';
  return 'image';
};

const extractJson = (raw = '') => {
  const text = String(raw || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
};

/**
 * generateChartFromText — בקשת גרף חופשית → מפרט Chart.js (קריאת מודל מכנית אחת)
 * → PNG דרך QuickChart (חינם). זורק שגיאה בעברית אם אין נתונים ברי-שרטוט.
 * @returns {Promise<{dataUrl:string, title:string, alt:string, engine:'quickchart'}>}
 */
export const generateChartFromText = async (text, { signal } = {}) => {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('חסר תיאור לגרף.');
  const raw = await chatWithActiveProvider(
    [
      'המר את בקשת המשתמש הבאה למפרט תרשים Chart.js. החזר אך ורק JSON תקין בצורה:',
      '{"chartable": true, "title": "...", "alt": "...", "chart": {"type": "bar|line|pie|doughnut|radar|scatter", "data": {"labels": [...], "datasets": [{"label": "...", "data": [מספרים]}]}}}',
      'השתמש אך ורק במספרים שהמשתמש סיפק — לעולם אל תמציא נתונים. אם אין בבקשה נתונים מספריים ברורים, החזר {"chartable": false, "reason": "מה חסר"}.',
      'כותרות ותוויות בעברית.',
      '',
      `בקשת המשתמש: ${clean}`,
    ].join('\n'),
    '',
    'אתה ממיר בקשות טקסט למפרטי Chart.js מדויקים. JSON בלבד.',
    {
      skipAutomation: true,
      skipMultiModel: true,
      directChat: true,
      skipSkillSelection: true,
      strictFormatting: true,
      omitPersonalStyleStructureHints: true,
      forceSuppressResearchRouting: true,
      thinkingBudget: 0,
      ...(signal ? { signal } : {}),
    },
  );
  const parsed = extractJson(typeof raw === 'string' ? raw : raw?.text || '');
  if (!parsed || parsed.chartable === false || !parsed.chart) {
    throw new Error(parsed?.reason
      ? `אי אפשר לצייר גרף מהבקשה: ${String(parsed.reason).slice(0, 160)}`
      : 'לא זוהו נתונים מספריים לגרף. כתוב את הנתונים בבקשה (למשל: "א 40%, ב 35%, ג 25%").');
  }
  const dataUrl = await renderQuickChart({ chart: parsed.chart, signal });
  return {
    dataUrl,
    title: String(parsed.title || '').trim(),
    alt: String(parsed.alt || parsed.title || 'תרשים').trim(),
    engine: 'quickchart',
  };
};

/** תבנית prompt לדיאגרמה — מנוסחת למודל תמונה שמצייר טקסט (nano-banana). */
export const buildDiagramImagePrompt = (text = '') => [
  'Create a clean, professional diagram on a white background.',
  'All labels must be written in clear, correctly-spelled Hebrew (right-to-left).',
  'Flat design, high contrast, readable typography, no decorative clutter.',
  `Diagram request: ${String(text || '').trim()}`,
].join('\n');
