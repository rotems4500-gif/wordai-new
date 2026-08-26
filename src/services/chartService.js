// ═══════════════════════════════════════════════════════════════
// chartService.js — מנוע גרפים אמיתי לסטטיסטיקה (SPSS) ולמצגות.
// QuickChart (Chart.js כשירות) מרנדר PNG מדויק מהנתונים בפועל.
// AI רק מחלץ את הסדרות מהפלט — לא ממציא מספרים.
// fallback אופציונלי: יצירת תמונת AI חופשית כשאין מנוע גרפים זמין.
// כל הקריאות עוברות proxy-http-request של Electron (CORS) או fetch.
// ═══════════════════════════════════════════════════════════════

import { chatWithActiveProvider, getProviderConfig, getFeatureProviderConfig } from './aiService';
import { generateAiImage } from './imageService';

const QUICKCHART_DEFAULT_BASE = 'https://quickchart.io';
const SUPPORTED_CHART_TYPES = ['bar', 'horizontalBar', 'line', 'pie', 'doughnut', 'radar', 'scatter', 'bubble'];
const MAX_OUTPUT_CHARS = 12000;

const hasDesktopProxy = () =>
  typeof window !== 'undefined' && window.desktopApp && typeof window.desktopApp.proxyHttpRequest === 'function';

let reqCounter = 0;
const nextRequestId = () => {
  reqCounter += 1;
  return `chart-${reqCounter}-${(typeof performance !== 'undefined' && performance.now) ? Math.floor(performance.now()) : reqCounter}`;
};

// בקשת HTTP דרך proxy (דסקטופ) או fetch ישיר (דפדפן/dev)
const httpRequest = async ({ url, method = 'GET', headers = {}, body = null, responseEncoding = 'utf8', signal }) => {
  if (hasDesktopProxy()) {
    const res = await window.desktopApp.proxyHttpRequest({
      url, method, headers, body, responseEncoding, requestId: nextRequestId(),
    });
    if (!res || res.ok === false) {
      throw new Error(res?.body ? `שגיאת רשת (${res.status || 0}): ${String(res.body).slice(0, 200)}` : 'שגיאת רשת');
    }
    return { body: res.body, contentType: res.contentType || '' };
  }
  const res = await fetch(url, { method, headers, body, signal });
  if (!res.ok) throw new Error(`שגיאת רשת (${res.status})`);
  if (responseEncoding === 'base64') {
    const buf = await res.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return { body: btoa(binary), contentType: res.headers.get('content-type') || '' };
  }
  return { body: await res.text(), contentType: res.headers.get('content-type') || '' };
};

// מחלץ JSON גם אם המודל עטף ב-code fence או הוסיף טקסט
const extractJson = (raw = '') => {
  let text = String(raw || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('המודל לא החזיר JSON תקין לגרף.');
  }
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (err) {
    const repaired = candidate.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(repaired);
  }
};

const getChartEngineConfig = (cfg = null) => {
  const config = cfg || getProviderConfig();
  const engine = config.chartEngine || {};
  return {
    provider: engine.provider || 'quickchart',
    key: String(engine.key || '').trim(),
    baseUrl: String(engine.baseUrl || '').trim() || QUICKCHART_DEFAULT_BASE,
    fallbackToAi: engine.fallbackToAi !== false,
  };
};

/**
 * getChartEngineAvailability — מצב זמינות לתצוגת UI.
 */
export const getChartEngineAvailability = (cfg = null) => {
  const config = cfg || getProviderConfig();
  const engine = getChartEngineConfig(config);
  // QuickChart עובד גם בלי מפתח (free tier) — תמיד זמין כל עוד יש רשת.
  return {
    chart: engine.provider === 'quickchart',
    provider: engine.provider,
    hasKey: Boolean(engine.key),
    baseUrl: engine.baseUrl,
    fallbackToAi: engine.fallbackToAi,
  };
};

// ── חילוץ מפרט גרף מפלט SPSS דרך ה-LLM ───────────────────────────
const buildChartSpecPrompt = ({ output, analysis, focus }) => {
  const variableHint = Array.isArray(analysis?.columns) && analysis.columns.length
    ? `משתנים בדאטה: ${analysis.columns.slice(0, 40).map((c) => c.name || c).join(', ')}.`
    : '';
  const trimmedOutput = String(output || '').length > MAX_OUTPUT_CHARS
    ? `${String(output).slice(0, MAX_OUTPUT_CHARS)}\n[...קוצר...]`
    : String(output || '');

  return [
    'קיבלת פלט (Output) מ-SPSS. חלץ ממנו את המספרים בפועל ובנה תרשים שמתאר אותם נאמנה.',
    'אסור להמציא מספרים — השתמש אך ורק בערכים שמופיעים בפלט. אם אין נתונים מספריים שאפשר לתרשם, החזר {"chartable": false}.',
    variableHint,
    focus ? `דגש מבוקש מהמשתמש: ${focus}` : '',
    '',
    `החזר JSON תקין בלבד (בלי טקסט מסביב, בלי code fences):`,
    `{`,
    `  "chartable": true,`,
    `  "title": "כותרת קצרה לתרשים בעברית",`,
    `  "alt": "תיאור נגיש קצר בעברית",`,
    `  "chart": {`,
    `    "type": "אחד מ: ${SUPPORTED_CHART_TYPES.join(', ')}",`,
    `    "data": {`,
    `      "labels": ["תווית", "תווית"],`,
    `      "datasets": [{ "label": "שם הסדרה", "data": [12.3, 45.6] }]`,
    `    }`,
    `  }`,
    `}`,
    'חוקים: בחר את סוג התרשים שהכי מתאים (השוואת ממוצעים בין קבוצות → bar; התפלגות → bar/histogram כ-bar; שיעורים → pie/doughnut; קשר בין שני משתנים → scatter). תוויות בעברית. עד 2 datasets. מספרים בלבד ב-data.',
    '',
    'פלט SPSS:',
    '"""',
    trimmedOutput,
    '"""',
  ].filter((line) => line !== undefined && line !== null).join('\n');
};

/**
 * requestChartSpec — מבקש מה-LLM מפרט Chart.js מתוך פלט SPSS.
 * @returns {Promise<{chartable:boolean, title?:string, alt?:string, chart?:object}>}
 */
export const requestChartSpec = async ({ output = '', analysis = null, focus = '', signal } = {}) => {
  const cleanOutput = String(output || '').trim();
  if (!cleanOutput) throw new Error('אין פלט SPSS להפיכה לגרף.');

  // גרפים הם חלק מטאב SPSS — מכבדים את ה-API הייעודי ל-SPSS אם הוגדר.
  const feat = getFeatureProviderConfig('spss');

  const rawResponse = await chatWithActiveProvider(
    buildChartSpecPrompt({ output: cleanOutput, analysis, focus: String(focus || '').trim() }),
    '',
    'אתה ממיר טבלאות פלט SPSS למפרט תרשים Chart.js מדויק. החזר אך ורק JSON תקין. לעולם אל תמציא מספרים.',
    {
      providerOverride: feat?.providerId || undefined,
      strictProviderOverride: Boolean(feat?.providerId),
      ...(feat ? { providerConfigOverride: feat.config } : {}),
      skipAutomation: true,
      skipMultiModel: true,
      directChat: true,
      skipSkillSelection: true,
      omitPersonalStyleStructureHints: true,
      strictFormatting: true,
      ...(signal ? { signal } : {}),
    },
  );

  const parsed = extractJson(rawResponse);
  if (parsed?.chartable === false || !parsed?.chart) {
    return { chartable: false };
  }

  const chart = parsed.chart || {};
  const type = SUPPORTED_CHART_TYPES.includes(chart.type) ? chart.type : 'bar';
  const datasets = Array.isArray(chart.data?.datasets) ? chart.data.datasets : [];
  const hasNumbers = datasets.some((ds) => Array.isArray(ds?.data) && ds.data.some((n) => Number.isFinite(Number(n))));
  if (!hasNumbers) return { chartable: false };

  return {
    chartable: true,
    title: String(parsed.title || '').trim(),
    alt: String(parsed.alt || parsed.title || 'תרשים').trim(),
    chart: { ...chart, type },
  };
};

// צבעים נעימים ועקביים לסדרות (כשה-LLM לא סיפק)
const PALETTE = ['#2563EB', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

// ── עברית ב-QuickChart ───────────────────────────────────────────
// QuickChart מריץ Chart.js v4 בשרת. אין "options.font" גלובלי — משפחת הפונט
// נקבעת פר-סקייל ופר-legend (labels.font.family), ו-RTL נקבע ב-plugins.legend.rtl
// ו-plugins.tooltip.rtl. בלי זה תוויות עבריות יצאו בפונט ברירת-מחדל לטיני
// (ריבועים/היפוך). ⚠️ דורש אימות אמפירי מול השרת — אם המשפחה לא מותקנת שם,
// Chart.js נופל לפונט הבא ברשימה.
const HEB_FONT_FAMILY = 'Noto Sans Hebrew, Alef, Arial, sans-serif';

const withHebrewFont = (node = {}) => ({
  ...node,
  ticks: { ...(node.ticks || {}), font: { family: HEB_FONT_FAMILY, ...((node.ticks || {}).font || {}) } },
  title: { ...(node.title || {}), font: { family: HEB_FONT_FAMILY, ...((node.title || {}).font || {}) } },
});

// טיפוסים קרטזיים בלבד מקבלים scales.x/scales.y — לגרף עוגה/רדאר אין צירים כאלה.
const CARTESIAN_TYPES = new Set(['bar', 'horizontalBar', 'line', 'scatter', 'bubble']);

const decorateChartOptions = (options = {}, { showLegend, type }) => {
  const plugins = options.plugins || {};
  const scales = options.scales || {};
  const cartesian = CARTESIAN_TYPES.has(type);
  return {
    ...options,
    plugins: {
      ...plugins,
      legend: {
        display: showLegend,
        rtl: true,
        textDirection: 'rtl',
        ...(plugins.legend || {}),
        labels: { font: { family: HEB_FONT_FAMILY }, ...((plugins.legend || {}).labels || {}) },
      },
      tooltip: { rtl: true, textDirection: 'rtl', ...(plugins.tooltip || {}) },
      title: {
        ...(plugins.title || {}),
        font: { family: HEB_FONT_FAMILY, ...((plugins.title || {}).font || {}) },
      },
    },
    ...(cartesian
      ? { scales: { ...scales, x: withHebrewFont(scales.x), y: withHebrewFont(scales.y) } }
      : (options.scales ? { scales } : {})),
  };
};

const decorateChartSpec = (chart) => {
  const type = chart.type;
  const isCategorical = type === 'pie' || type === 'doughnut';
  const datasets = (chart.data?.datasets || []).map((ds, idx) => {
    if (isCategorical) {
      const points = Array.isArray(ds.data) ? ds.data.length : 0;
      return {
        ...ds,
        backgroundColor: ds.backgroundColor || Array.from({ length: points }, (_, i) => PALETTE[i % PALETTE.length]),
      };
    }
    const color = PALETTE[idx % PALETTE.length];
    return {
      ...ds,
      backgroundColor: ds.backgroundColor || (type === 'line' ? 'transparent' : color),
      borderColor: ds.borderColor || color,
      borderWidth: ds.borderWidth ?? (type === 'line' ? 2 : 0),
      fill: type === 'line' ? false : ds.fill,
    };
  });
  return {
    ...chart,
    data: { ...chart.data, datasets },
    options: decorateChartOptions(chart.options || {}, {
      showLegend: datasets.length > 1 || isCategorical,
      type,
    }),
  };
};

/**
 * renderQuickChart — מרנדר מפרט Chart.js ל-PNG dataUrl דרך QuickChart.
 */
export const renderQuickChart = async ({ chart, width = 720, height = 440, signal, cfg = null } = {}) => {
  if (!chart || typeof chart !== 'object') throw new Error('חסר מפרט תרשים לרינדור.');
  const engine = getChartEngineConfig(cfg);
  const url = `${engine.baseUrl.replace(/\/+$/, '')}/chart`;
  const payload = {
    chart: decorateChartSpec(chart),
    width,
    height,
    format: 'png',
    backgroundColor: 'white',
    devicePixelRatio: 2,
    version: '4',
    ...(engine.key ? { key: engine.key } : {}),
  };
  const { body, contentType } = await httpRequest({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    responseEncoding: 'base64',
    signal,
  });
  const mime = contentType && contentType.startsWith('image/') ? contentType : 'image/png';
  return `data:${mime};base64,${body}`;
};

/**
 * generateSpssChart — הזרימה המלאה: פלט SPSS → מפרט (AI) → PNG (QuickChart).
 * נופל ל-AI image כגיבוי כשמנוע הגרפים נכשל וההגדרה מאפשרת.
 * @returns {Promise<{ok:boolean, dataUrl?:string, title?:string, alt?:string, engine?:string, reason?:string}>}
 */
export const generateSpssChart = async ({ output = '', analysis = null, focus = '', signal } = {}) => {
  const cleanOutput = String(output || '').trim();
  if (!cleanOutput) return { ok: false, reason: 'אין פלט SPSS להפיכה לגרף.' };

  const engine = getChartEngineConfig();
  let spec = null;
  try {
    spec = await requestChartSpec({ output: cleanOutput, analysis, focus, signal });
  } catch (error) {
    spec = null;
  }

  if (spec?.chartable && spec.chart) {
    try {
      const dataUrl = await renderQuickChart({ chart: spec.chart, signal });
      return { ok: true, dataUrl, title: spec.title || 'תרשים מהפלט', alt: spec.alt || spec.title || 'תרשים', engine: 'quickchart' };
    } catch (error) {
      if (!engine.fallbackToAi) {
        return { ok: false, reason: error instanceof Error ? error.message : 'רינדור הגרף נכשל.' };
      }
    }
  } else if (!engine.fallbackToAi) {
    return { ok: false, reason: 'לא נמצאו נתונים מספריים בפלט שאפשר לתרשם.' };
  }

  // ── גיבוי AI: ויזואליזציה חופשית (לא מדויקת — להמחשה בלבד) ──
  try {
    const promptParts = [
      'Clean professional statistical chart illustration',
      spec?.title ? `titled "${spec.title}"` : 'summarizing SPSS results',
      focus ? `focus: ${focus}` : '',
      'flat design, white background, clear axis labels',
    ].filter(Boolean);
    const image = await generateAiImage(promptParts.join(', '), { signal, featureId: 'spss' });
    return {
      ok: true,
      dataUrl: image.dataUrl,
      title: spec?.title || 'תרשים (המחשה)',
      alt: spec?.alt || 'תרשים שנוצר ב-AI להמחשה',
      engine: 'ai',
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'יצירת הגרף נכשלה. בדוק הגדרות תמונות וגרפים.' };
  }
};
