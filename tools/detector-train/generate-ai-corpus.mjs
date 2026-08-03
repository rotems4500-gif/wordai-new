// generate-ai-corpus.mjs — מרחיב את קורפוס האימון של הגלאי המקומי (styleAuthenticityService)
// עם דגימות AI אמיתיות מ-Gemini Flash, בשני מצבים: "normal" (AI רגיל) ו-"stealth"
// (מודל שמקבל רשימת מניעה מפורשת של המרקרים הידועים שלנו — מדמה AI "מבוית").
//
// טעינת מפתח Gemini (אותה שרשרת כמו tools/test-bench/server.mjs):
//   1. process.env.GEMINI_API_KEY / GOOGLE_API_KEY
//   2. tools/test-bench/keys.local.json (gitignored)
//   3. DPAPI-decrypt של %APPDATA%/com.wordai.assistant/ai-provider-config.json דרך PowerShell
//      (אותו מנגנון בדיוק כמו server.mjs — ר' src-tauri/src/secure.rs)
//
// פלט: tools/detector-train/samples/ai-extended.txt
//   כל בלוק קודמת לו שורת כותרת `#genre=<slug> mode=<normal|stealth>`,
//   ומופרד מהבא אחריו בשורת `===`.
//
// שימוש:
//   node tools/detector-train/generate-ai-corpus.mjs            # ~90 בלוקים
//   node tools/detector-train/generate-ai-corpus.mjs --double    # שתי סבבים, נושאים שונים, ~180

import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { FORMAL_CONNECTORS, CLICHE_PHRASES } from './extractor.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');
const LOCAL_KEYS = path.join(DIR, 'keys.local.json');
const OUT_FILE = path.join(DIR, 'samples', 'ai-extended.txt');
const MODEL = 'gemini-2.5-flash';
const DOUBLE = process.argv.includes('--double');
const SCRATCH = path.join(DIR, '.dpapi-scratch');

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { ...opts, shell: true });
  let out = '', err = '';
  p.stdout?.on('data', (d) => { out += d; });
  p.stderr?.on('data', (d) => { err += d; });
  p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || out || `exit ${code}`))));
  p.on('error', reject);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── טעינת מפתח Gemini — אותה שרשרת כמו tools/test-bench/server.mjs ──────────
async function decryptDpapiFile(fileName) {
  const filePath = path.join(process.env.APPDATA || '', 'com.wordai.assistant', fileName);
  try {
    const raw = await readFile(filePath);
    const magic = Buffer.from('DPAPI1\n', 'ascii');
    if (!raw.subarray(0, magic.length).equals(magic)) throw new Error('unexpected secure-file header');
  } catch (e) {
    console.warn(`DPAPI read failed (${fileName}):`, e.message);
    return '';
  }
  const outPath = path.join(SCRATCH, `dpapi-${fileName}.tmp`);
  const ps = [
    'Add-Type -AssemblyName System.Security',
    `$raw=[IO.File]::ReadAllBytes(${JSON.stringify(filePath)})`,
    '$blob=[byte[]]($raw[7..($raw.Length-1)])',
    '$dec=[Security.Cryptography.ProtectedData]::Unprotect($blob,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)',
    `[IO.File]::WriteAllBytes(${JSON.stringify(outPath)},$dec)`,
  ].join('\n');
  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  try {
    await mkdir(SCRATCH, { recursive: true });
    await run('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
    const out = await readFile(outPath, 'utf8');
    const { rm } = await import('node:fs/promises');
    await rm(outPath, { force: true });
    return out.trim();
  } catch (e) {
    console.warn(`DPAPI decrypt failed (${fileName}):`, e.message);
    return '';
  }
}

async function getGeminiKey() {
  const attempts = [];

  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    return { key: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY, source: 'env' };
  }
  attempts.push('GEMINI_API_KEY / GOOGLE_API_KEY — לא מוגדרים');

  if (await exists(LOCAL_KEYS)) {
    try {
      const raw = JSON.parse(await readFile(LOCAL_KEYS, 'utf8'));
      const source = raw?.providerConfig || raw?.aiProviderConfig || raw;
      const geminiField = source?.gemini;
      const key = typeof geminiField === 'string'
        ? geminiField
        : (geminiField?.key || geminiField?.apiKey || source?.GEMINI_API_KEY);
      if (key && String(key).trim()) return { key: String(key).trim(), source: 'keys.local.json' };
      attempts.push('keys.local.json קיים אך אין מפתח gemini בו');
    } catch (e) {
      attempts.push(`keys.local.json load failed: ${e.message}`);
    }
  } else {
    attempts.push('keys.local.json לא קיים');
  }

  const dpapi = await decryptDpapiFile('ai-provider-config.json');
  if (dpapi) {
    try {
      const cfg = JSON.parse(dpapi);
      const key = cfg?.gemini?.key || cfg?.gemini?.apiKey;
      if (key && String(key).trim()) return { key: String(key).trim(), source: 'app encrypted config (DPAPI)' };
      attempts.push('DPAPI config פוענח אך אין מפתח gemini בו');
    } catch (e) {
      attempts.push(`DPAPI config parse failed: ${e.message}`);
    }
  } else {
    attempts.push('DPAPI decrypt נכשל (או שהקובץ לא קיים)');
  }

  return { key: '', source: 'missing', attempts };
}

// ── ז'אנרים + מאגר נושאים (10 לכל ז'אנר: 5 לסבב רגיל, 5 נוספים ל---double) ──
const GENRES = [
  {
    slug: 'academic-social', label: 'עבודה אקדמית במדעי החברה',
    topics: [
      'השפעת הרשתות החברתיות על גיבוש זהות בקרב מתבגרים',
      'תיאוריית ההון החברתי ויישומה בקהילות עירוניות',
      'אי-שוויון מגדרי בשוק העבודה הישראלי',
      'תפקיד המשפחה המורחבת בחברה הישראלית המשתנה',
      'הגירה פנימית והשפעתה על מרקם החברה האזרחית',
      'תיאוריות סוציאליזציה פוליטית בקרב בני נוער',
      'מעמד ביניים מתכווץ והשלכותיו החברתיות',
      'תפיסת האמון המוסדי בקרב אזרחים צעירים',
      'שינויים בדפוסי הצריכה התרבותית בעידן הדיגיטלי',
      'ניידות חברתית בין-דורית בפריפריה',
    ],
  },
  {
    slug: 'legal-analysis', label: 'ניתוח משפטי',
    topics: [
      'היקף חובת הזהירות ברשלנות רפואית',
      'איזון בין חופש הביטוי לזכות לשם טוב בפסיקה',
      'תניית פטור בחוזה אחיד ותוקפה המשפטי',
      'זכות הקניין מול תכנון ובנייה — פרשנות בג"ץ',
      'אחריות מעביד למעשי עובד בנזיקין',
      'עקרון תום הלב במשא ומתן טרום-חוזי',
      'זכות השתיקה בהליך הפלילי ומגבלותיה',
      'חובת הגילוי הנאות בדיני חברות',
      'הפרת חוזה צפויה וסעדי הצד הנפגע',
      'מעמד הילד בהליכי משמורת — טובת הילד כעיקרון על',
    ],
  },
  {
    slug: 'op-ed', label: 'מאמר דעה עיתונאי',
    topics: [
      'משבר הדיור ומחיריו הפוליטיים',
      'עתיד התחבורה הציבורית במטרופולין הישראלי',
      'רגולציה על בינה מלאכותית — צורך דחוף או בירוקרטיה מיותרת',
      'שחיקת מעמד המורים במערכת החינוך',
      'הפרטת שירותי בריאות ומחירה החברתי',
      'תרבות העבודה מרחוק — שינוי של קבע או אופנה חולפת',
      'משבר האמון בתקשורת המסורתית',
      'מדיניות הגירה ועבודה זרה בישראל',
      'עתיד עולם התעסוקה נוכח האוטומציה',
      'תפקיד הרשתות החברתיות בשיח הציבורי',
    ],
  },
  {
    slug: 'lecture-summary', label: 'סיכום הרצאה',
    topics: [
      'מבוא לכלכלה התנהגותית',
      'יסודות הפסיכולוגיה הקוגניטיבית',
      'תולדות המשפט החוקתי בישראל',
      'מבוא לתורת הארגונים',
      'עקרונות יסוד בסטטיסטיקה למדעי החברה',
      'מבוא לתקשורת המונים',
      'יסודות מדיניות ציבורית',
      'מבוא לתולדות הרעיונות הפוליטיים',
      'עקרונות בסיסיים בניהול משאבי אנוש',
      'מבוא לסוציולוגיה עירונית',
    ],
  },
  {
    slug: 'lit-review', label: 'סקירת ספרות',
    topics: [
      'מחקר על שחיקה מקצועית בקרב עובדי הוראה',
      'ספרות המחקר על השפעת שינה על ביצועים קוגניטיביים',
      'סקירה על מודלים לניבוי נשירה מלימודים אקדמיים',
      'מחקרים על אפקטיביות טיפול קוגניטיבי-התנהגותי בחרדה',
      'ספרות בנושא פערים דיגיטליים בין קבוצות אוכלוסייה',
      'מחקר השוואתי על מדיניות רווחה במדינות מערביות',
      'סקירה על גורמי סיכון להתמכרות למסכים בקרב ילדים',
      'ספרות המחקר על מנהיגות משתפת בארגונים',
      'מחקרים על השפעת אקלים ארגוני על שביעות רצון עובדים',
      'סקירה על יעילות תוכניות התערבות מוקדמת בגיל הרך',
    ],
  },
  {
    slug: 'professional-opinion', label: 'חוות דעת מקצועית',
    topics: [
      'חוות דעת הנדסית על יציבות מבנה ישן',
      'חוות דעת כלכלית על כדאיות רכישת נכס מניב',
      'חוות דעת פסיכולוגית לצורכי הליך משפטי',
      'חוות דעת אקטוארית על קרן פנסיה',
      'חוות דעת סביבתית להיתר בנייה בשטח פתוח',
      'חוות דעת חשבונאית על הערכת שווי חברה',
      'חוות דעת רפואית בנושא כושר עבודה',
      'חוות דעת שמאית על נזקי רכוש',
      'חוות דעת ארגונומית על תנאי עבודה במפעל',
      'חוות דעת תזונתית לתוכנית טיפול כרוני',
    ],
  },
  {
    slug: 'official-letter', label: 'מכתב רשמי',
    topics: [
      'מכתב פנייה לרשות מקומית בנושא מטרד רעש',
      'מכתב תלונה רשמי לחברת ביטוח',
      'מכתב בקשה למלגת לימודים',
      'מכתב פנייה למשרד ממשלתי בנושא זכאות',
      'מכתב המלצה מקצועי לעובד לשעבר',
      'מכתב ערעור על החלטת ועדה אקדמית',
      'מכתב פנייה ליישוב סכסוך שכנים',
      'מכתב בקשה לפריסת חוב מול בנק',
      'מכתב פנייה לחברת תקשורת בעניין חיוב שגוי',
      'מכתב פנייה רשמי לוועד בית משותף',
    ],
  },
  {
    slug: 'blog-post', label: 'פוסט בלוג מקצועי',
    topics: [
      'חמישה כלים לניהול זמן לעובדים עצמאיים',
      'איך לבנות תיק עבודות דיגיטלי אפקטיבי',
      'טעויות נפוצות בראיונות עבודה וכיצד להימנע מהן',
      'מדריך למתחילים בכתיבה שיווקית',
      'איך לבחור כלי ניהול פרויקטים לצוות קטן',
      'עקרונות בסיסיים בעיצוב חוויית משתמש',
      'טיפים לניהול תקציב אישי בתקופה של יוקר מחיה',
      'איך להתכונן לראיון עבודה טכני',
      'מדריך קצר לעבודה יעילה מהבית',
      'איך לבנות מותג אישי ברשתות מקצועיות',
    ],
  },
  {
    slug: 'reflection-answer', label: 'תשובה למטלת מחשבה',
    topics: [
      'האם טכנולוגיה מקרבת או מרחיקה בין אנשים',
      'מהי לדעתך משמעות ההצלחה בעידן הנוכחי',
      'האם יש הצדקה מוסרית להפליה מתקנת',
      'כיצד את/ה תופס/ת את מושג האחריות האישית',
      'האם החברה המודרנית מעודדת אינדיווידואליזם יתר',
      'מהו לדעתך תפקידה של האמנות בחברה',
      'האם יש לגיטימציה לצנזורה עצמית בשיח הציבורי',
      'כיצד משפיע לחץ חברתי על קבלת החלטות',
      'האם קִדמה טכנולוגית תמיד משרתת את טובת הכלל',
      'מה משמעות המושג "צדק חלוקתי" בעיניך',
    ],
  },
];

const AVOID_LIST = [...FORMAL_CONNECTORS, ...CLICHE_PHRASES].slice(0, 40);

// ── מצב "עבודה שלמה" — נגד לימוד ז'אנר במקום AI-ness: המחלקה האנושית ב-detector-eval
// היא עבודות אקדמיות מלאות (windowed), אז מחלקת ה-AI צריכה גם היא צורה מלאה, לא רק
// בלוקים קצרים. 5 משימות × 2 מצבים = 10 קריאות Gemini נוספות (בתקציב ~10-12).
const ASSIGNMENT_FILES = [
  { slug: 'media-law-2026', label: 'מטלת סיום — דיני תקשורת (מטלה אמיתית)', file: 'tools/test-bench/nlg-bench/cases/media-law-2026/assignment.txt' },
  { slug: 'mill-2026', label: "מטלה — הגותו של ג'ון סטיוארט מיל (מטלה אמיתית)", file: 'tools/test-bench/nlg-bench/cases/mill-2026/assignment.txt' },
];
const GENERIC_FULL_WORK_TASKS = [
  {
    slug: 'social-sci-essay', label: 'עבודה אקדמית מלאה — מדעי החברה',
    instructions: 'כתוב עבודה אקדמית מלאה בעברית (מבוא, גוף דיון מובנה, סיכום) בנושא: השפעת הפערים הדיגיטליים על ניידות חברתית בין-דורית בישראל. יש לכלול טיעון מרכזי, התייחסות לגישות תיאורטיות מתחום הסוציולוגיה, ומסקנה מבוססת.',
  },
  {
    slug: 'legal-analysis-full', label: 'ניתוח משפטי מלא — מקרה כללי',
    instructions: 'כתוב ניתוח משפטי מלא ורציף (לא בפורמט שאלה-תשובה) של הסוגיה הבאה: אחריותן הנזיקית של פלטפורמות מקוונות לתוכן פוגעני שמפרסמים משתמשים באתריהן, כולל התייחסות לעקרונות של רשלנות, חופש ביטוי, ואיזון אינטרסים מתחרים.',
  },
  {
    slug: 'philosophy-essay', label: 'עבודה אקדמית מלאה — פילוסופיה פוליטית',
    instructions: "כתוב עבודה אקדמית מלאה בעברית (מבוא, גוף, מסקנה) הדנה בשאלה: האם עקרון הנזק (harm principle) של ג'ון סטיוארט מיל רלוונטי כמסגרת להסדרת שיח שנאה ברשתות החברתיות בעידן הנוכחי? יש לבסס את הטיעון על עקרונות מיל ולהתמודד עם ביקורות אפשריות.",
  },
];

async function loadAssignmentText(relPath) {
  try {
    return (await readFile(path.join(PROJECT, relPath), 'utf8')).trim();
  } catch (e) {
    console.warn(`  לא הצלחתי לקרוא ${relPath}: ${e.message}`);
    return '';
  }
}

async function buildFullWorkTasks() {
  const tasks = [];
  for (const a of ASSIGNMENT_FILES) {
    const text = await loadAssignmentText(a.file);
    if (!text) continue;
    tasks.push({
      slug: a.slug,
      label: a.label,
      instructions: `להלן מטלה אקדמית אמיתית. כתוב תשובה מלאה ורציפה למטלה (לא בפורמט שאלה-תשובה נקודתי אלא כעבודה כתובה קוהרנטית), הכוללת מענה לכל הסעיפים תוך ניתוח וטיעון מבוסס:\n\n${text}`,
    });
  }
  tasks.push(...GENERIC_FULL_WORK_TASKS);
  return tasks;
}

function buildPrompt(genre, topics, mode) {
  const topicLines = topics.map((t, i) => `${i + 1}. ${t}`).join('\n');
  let prompt = `כתוב 5 בלוקים נפרדים בעברית תקנית, כל בלוק כ-120 עד 200 מילים, בסגנון "${genre.label}".
בלוק אחד לכל נושא, לפי הסדר הזה:
${topicLines}

הפרד בין הבלוקים בשורה שמכילה אך ורק ###
אל תוסיף מספור, כותרות, הקדמות או הסברים — רק את הטקסט של כל בלוק, ברצף.`;

  if (mode === 'stealth') {
    prompt += `

חשוב מאוד: אל תשתמש באף אחד מהביטויים או הניסוחים הבאים (וגם לא בניסוחים דומים במשמעותם):
${AVOID_LIST.join(', ')}

הנחיות נוספות לגיוון:
- גוון את אורכי המשפטים בתוך כל בלוק (משפט קצר, אחריו ארוך, אחריו קצר שוב).
- אל תשתמש במבנה של רשימה ממוספרת או תבליטים בתוך בלוק.
- אל תפתח שני בלוקים שונים באותה מילה או באותה צורת פתיחה.`;
  }

  return prompt;
}

function buildFullWorkPrompt(task, mode) {
  let prompt = `${task.instructions}

היקף הכתיבה: 1,500 עד 2,500 מילים. כתוב טקסט רציף ומגובש בעברית תקנית, בפורמט של עבודה אקדמית מוגשת (מותר עם כותרות משנה קצרות אם מתאים לסוג המטלה). אל תוסיף הערות מטא על עצמך או על תהליך הכתיבה — רק את גוף העבודה.`;

  if (mode === 'stealth') {
    prompt += `

חשוב מאוד: אל תשתמש באף אחד מהביטויים או הניסוחים הבאים (וגם לא בניסוחים דומים במשמעותם), בשום מקום בעבודה:
${AVOID_LIST.join(', ')}

הנחיות נוספות לגיוון:
- גוון את אורכי המשפטים לאורך כל העבודה (משפט קצר, אחריו ארוך, אחריו קצר שוב).
- אל תשתמש במבנה של רשימות ממוספרות או תבליטים בתוך פסקאות הדיון.
- אל תפתח שתי פסקאות שונות באותה מילה או באותה צורת פתיחה.`;
  }

  return prompt;
}

async function callGemini(key, prompt, { attempt = 0, maxOutputTokens = 4096 } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.95, maxOutputTokens },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if ((res.status === 429 || res.status >= 500) && attempt < 1) {
      console.warn(`  HTTP ${res.status}, retrying in 4s…`);
      await sleep(4000);
      return callGemini(key, prompt, { attempt: attempt + 1, maxOutputTokens });
    }
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text.trim()) throw new Error(`תשובה ריקה: ${JSON.stringify(data).slice(0, 300)}`);
  return text;
}

function splitBlocks(rawText) {
  return rawText
    .split(/^\s*#{3}\s*$/m)
    .map((b) => b.trim())
    .filter(Boolean);
}

function wordCount(s) {
  return s.split(/\s+/).filter(Boolean).length;
}

// ── קריאה/כתיבה של ai-extended.txt (append-safe, dedupe לפי 200 תווים ראשונים) ──
async function readExistingFingerprints() {
  if (!(await exists(OUT_FILE))) return new Set();
  const raw = await readFile(OUT_FILE, 'utf8');
  const fps = new Set();
  const chunks = raw.split(/^===\s*$/m);
  for (const chunk of chunks) {
    const lines = chunk.trim().split('\n');
    if (!lines.length) continue;
    const body = lines[0].startsWith('#genre=') ? lines.slice(1).join('\n') : chunk;
    const fp = body.trim().slice(0, 200);
    if (fp) fps.add(fp);
  }
  return fps;
}

async function appendBlocks(entries) {
  const lines = [];
  for (const { genre, mode, text, form } of entries) {
    const header = form ? `#genre=${genre} mode=${mode} form=${form}` : `#genre=${genre} mode=${mode}`;
    lines.push(header);
    lines.push(text.trim());
    lines.push('===');
  }
  const chunk = lines.join('\n') + '\n';
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  const prefix = (await exists(OUT_FILE)) ? await readFile(OUT_FILE, 'utf8') : '';
  await writeFile(OUT_FILE, prefix + chunk, 'utf8');
}

async function main() {
  const { key, source, attempts } = await getGeminiKey();
  if (!key) {
    console.error('לא נמצא מפתח Gemini. נסיונות:');
    for (const a of attempts || []) console.error(`  - ${a}`);
    console.error('הגדר GEMINI_API_KEY, או צור tools/test-bench/keys.local.json עם {"gemini":{"key":"..."}}, או הרץ את האפליקציה ותן לה לשמור מפתח מוצפן.');
    process.exit(1);
  }
  console.log(`מפתח Gemini נטען ✓ (${source})`);

  const seen = await readExistingFingerprints();
  console.log(`בלוקים קיימים בקובץ: ${seen.size}`);

  const rounds = DOUBLE ? 2 : 1;
  const modes = ['normal', 'stealth'];
  let totalNew = 0;
  let totalSkippedShort = 0;
  let totalSkippedDup = 0;
  const countsByGenreMode = {};

  for (let round = 0; round < rounds; round++) {
    for (const genre of GENRES) {
      const topicOffset = round * 5;
      const topics = genre.topics.slice(topicOffset, topicOffset + 5);
      for (const mode of modes) {
        const key2 = `${genre.slug}/${mode}${round ? `#${round}` : ''}`;
        console.log(`→ ${genre.label} [${mode}] סבב ${round + 1}/${rounds}…`);
        const prompt = buildPrompt(genre, topics, mode);
        let raw;
        try {
          raw = await callGemini(key, prompt);
        } catch (e) {
          console.warn(`  נכשל: ${e.message}`);
          await sleep(2000);
          continue;
        }
        const blocks = splitBlocks(raw);
        const toAppend = [];
        for (const b of blocks) {
          const wc = wordCount(b);
          if (wc < 60) { totalSkippedShort++; continue; }
          const fp = b.slice(0, 200);
          if (seen.has(fp)) { totalSkippedDup++; continue; }
          seen.add(fp);
          toAppend.push({ genre: genre.slug, mode, text: b });
        }
        if (toAppend.length) {
          await appendBlocks(toAppend);
          totalNew += toAppend.length;
          const ck = `${genre.slug} ${mode}`;
          countsByGenreMode[ck] = (countsByGenreMode[ck] || 0) + toAppend.length;
        }
        console.log(`  ${blocks.length} בלוקים גולמיים → ${toAppend.length} נוספו`);
        await sleep(2000);
      }
    }
  }

  // ── מצב "עבודה שלמה" (form=full-work) — ר' הערה ליד ASSIGNMENT_FILES למעלה ──
  const fullWorkTasks = await buildFullWorkTasks();
  console.log(`\nעבודות מלאות: ${fullWorkTasks.length} משימות × 2 מצבים = ${fullWorkTasks.length * 2} קריאות`);
  const countsByForm = {};
  for (const task of fullWorkTasks) {
    for (const mode of modes) {
      console.log(`→ [עבודה מלאה] ${task.label} [${mode}]…`);
      const prompt = buildFullWorkPrompt(task, mode);
      let raw;
      try {
        raw = await callGemini(key, prompt, { maxOutputTokens: 8192 });
      } catch (e) {
        console.warn(`  נכשל: ${e.message}`);
        await sleep(2000);
        continue;
      }
      const text = raw.trim();
      const wc = wordCount(text);
      const fp = text.slice(0, 200);
      if (seen.has(fp)) {
        totalSkippedDup++;
        console.log(`  ${wc} מילים → כפילות, נדחה`);
      } else {
        seen.add(fp);
        await appendBlocks([{ genre: task.slug, mode, text, form: 'full-work' }]);
        totalNew += 1;
        const ck = `${task.slug} ${mode} (full-work)`;
        countsByGenreMode[ck] = (countsByGenreMode[ck] || 0) + 1;
        countsByForm[mode] = (countsByForm[mode] || 0) + 1;
        console.log(`  ${wc} מילים → נוסף כבלוק אחד (יעד: 1,500-2,500)`);
      }
      await sleep(2000);
    }
  }

  console.log('\n=== סיכום ===');
  console.log(`בלוקים/עבודות חדשים שנוספו: ${totalNew}`);
  console.log(`נדחו (קצר מ-60 מילים): ${totalSkippedShort}`);
  console.log(`נדחו (כפילות): ${totalSkippedDup}`);
  for (const [k, v] of Object.entries(countsByGenreMode)) console.log(`  ${k}: ${v}`);
  console.log(`עבודות מלאות שנוספו: normal=${countsByForm.normal || 0}, stealth=${countsByForm.stealth || 0}`);
  console.log('הערה: עבודות מלאות נשמרות כבלוק === יחיד (לא מפוצלות). detector-eval מחלונן מסמכים אנושיים אבל מניקד בלוקי AI כמו שהם — מקובל לשלב הזה.');
  console.log(`קובץ יעד: ${OUT_FILE}`);
}

main().catch((e) => { console.error('שגיאה כללית:', e); process.exit(1); });
