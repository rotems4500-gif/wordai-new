// scaffold-e2e.mjs — ה-harness הקבוע של צינור השלד: קליטה → הטמעה → אחזור → מסמך.
//
// מריץ את **הקוד האמיתי** (parseAssignmentSpec, materialChunkStore, evidenceMatch,
// buildScaffoldHtml) ב-Node על קורפוס אמיתי, עם eval של תשובות ידועות + בקרות
// שליליות. נבנה אחרי שכל הבאגים ביולי 2026 (rAF, CSP, O(n²), סף-בתוך-רעש) התגלו
// ידנית — לצינור לא הייתה שום בדיקה אוטומטית.
//
// הרצה:  node tools/test-bench/run-scaffold-e2e.mjs
// קורפוס: WORDAI_SCAFFOLD_CORPUS (ברירת מחדל: תיקיית OneDrive של המשתמש).
// Node מטמיע ~22ms/קטע — כל הקורפוס בשניות, לא בדקות כמו בדפדפן.

import fs from 'node:fs';
import path from 'node:path';

// window shim: materialChunkStore דורש window כדי להשתמש ב-cache הפנימי שלו;
// בלי IDB הוא נופל לזיכרון בלבד — בדיוק מה שה-harness צריך.
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

// pdfjs legacy — היחיד שרץ ב-Node בלי DOM (מכיל polyfills ל-DOMMatrix וכו').
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';

import { itemsToLines, cleanOcrText } from '../../src/services/materialExtractBrowser.js';
import { parseAssignmentSpec } from '../../src/services/assignmentSpecService.js';
import {
  addMaterialDocument, commitMaterialStore, clearMaterialStore, getMaterialStoreStats,
  readMaterialStore, putMaterialVectors,
} from '../../src/services/materialChunkStore.js';
import { STYLE_EMBEDDING_SIGNATURE } from '../../src/services/styleEmbeddingService.js';
import { ensureMaterialsEmbedded, findEvidenceForSection, findEvidenceForSpec } from '../../src/services/evidenceMatchService.js';
import { buildScaffoldHtml } from '../../src/services/assignmentScaffoldDoc.js';
import { ensureOpenersReady, composeSectionOpener } from '../../src/services/styleOpenerService.js';

const CORPUS_DIR = process.env.WORDAI_SCAFFOLD_CORPUS
  || 'C:/Users/rotem/OneDrive/שולחן העבודה/314999533';

// ---------- חילוץ ----------

// יחס הטוקנים ה"טהורים" (עברית נקייה / לטינית נקייה / מספר). PDF עם קידוד גופן
// שבור מוציא ג'יבריש כמו ")Ntur: nttxnt ETNn" — נמדד: קבצים תקינים 0.71–0.95,
// שבורים 0.12–0.25. ⚠️ 8 מ-15 מקורות הקורס העבריים היו כאלה — ועברו בשקט את
// מבחן ה"סרוק" כי יש בהם המון תווים.
function pureTokenRatio(text) {
  const tokens = (String(text || '').match(/\S+/g) || []).slice(0, 2000);
  if (tokens.length < 40) return 1; // קצר מדי לשפוט — שיטופל ע"י מבחן הסרוק
  const pure = tokens.filter((x) => /^[֐-׿]{2,}[.,;:!?'"׳״)]?$|^[A-Za-z]{2,}[.,;:!?'")]?$|^\d+([.,]\d+)?$/.test(x)).length;
  return pure / tokens.length;
}
const GARBLE_FLOOR = 0.5;

async function extractPdfText(filePath, maxLength = 400000) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const parts = [];
  let total = 0;
  for (let i = 1; i <= doc.numPages; i += 1) {
    const content = await (await doc.getPage(i)).getTextContent();
    const pageText = itemsToLines(content.items);
    parts.push(pageText);
    total += pageText.length;
    if (total > maxLength) break;
  }
  const pages = doc.numPages;
  try { await doc.destroy(); } catch {}
  const text = parts.join('\n\n');
  const perPage = pages ? text.replace(/\s/g, '').length / pages : 0;
  const scanned = pages > 0 && perPage < 30;
  const garbled = !scanned && pureTokenRatio(text) < GARBLE_FLOOR;
  return { text, pages, scanned, garbled };
}

// ---------- OCR (Node) ----------

const OCR_CACHE_DIR = path.join(process.env.WORDAI_VERIFY_SCRATCH || '.', 'ocr-cache');
const OCR_MAX_PAGES_NODE = Number(process.env.WORDAI_E2E_OCR_PAGES || 60); // תואם ל-OCR_MAX_PAGES של המוצר
let ocrWorkerPromise = null;

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker('heb+eng');
    })();
  }
  return ocrWorkerPromise;
}

async function ocrPdf(filePath) {
  const stat = fs.statSync(filePath);
  const cacheFile = path.join(OCR_CACHE_DIR, `${path.basename(filePath)}.${stat.size}.txt`);
  // ה-cache שומר טקסט OCR גולמי; הניקוי רץ בקריאה — כך שינוי סף הניקוי לא דורש
  // OCR מחדש של הכל.
  if (fs.existsSync(cacheFile)) return cleanOcrText(fs.readFileSync(cacheFile, 'utf8'));

  const { createCanvas } = await import('@napi-rs/canvas');
  const worker = await getOcrWorker();
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pages = Math.min(doc.numPages, OCR_MAX_PAGES_NODE);
  const parts = [];
  const t0 = Date.now();
  for (let i = 1; i <= pages; i += 1) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 2.0 });
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    // intent:'print' — מנטרל את לולאת ה-rAF של pdfjs. בלעדיו: ב-Node עם ה-window
    // shim זה קורס (אין rAF), ובטאב מוסתר זה נתקע לנצח. הפעם הרביעית שהמלכודת
    // הזו נושכת בפרויקט.
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, intent: 'print' }).promise;
    const { data: d } = await worker.recognize(canvas.toBuffer('image/png'));
    const pageText = String(d?.text || '').trim();
    if (pageText) parts.push(pageText);
    page.cleanup();
    process.stdout.write(`\r  OCR ${path.basename(filePath).slice(0, 38)} ${i}/${pages} (${Math.round((Date.now() - t0) / 1000)}s)   `);
  }
  process.stdout.write('\n');
  try { await doc.destroy(); } catch {}
  // ה-cache שומר גולמי; הסינון (cleanOcrText) רץ בקריאה ובהחזרה — הקטעים
  // המורעלים שאובחנו ב-eval (אסטרונומיה→אדם סמית z4.95) הגיעו מעמודי איורים.
  const raw = parts.join('\n\n');
  fs.mkdirSync(OCR_CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, raw, 'utf8');
  return cleanOcrText(raw);
}

async function extractFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return extractPdfText(filePath);
  if (ext === '.docx') {
    const r = await mammoth.extractRawText({ buffer: fs.readFileSync(filePath) });
    return { text: r.value || '', pages: 0, scanned: false };
  }
  if (ext === '.txt' || ext === '.md') {
    return { text: fs.readFileSync(filePath, 'utf8'), pages: 0, scanned: false };
  }
  return { text: '', pages: 0, scanned: false };
}

// ---------- קורפוס ----------

// כל חומרי הקורס — כולל הסרוקים וה-garbled (עוברים OCR, כמו אצל המשתמש בדפדפן)
// + מסיחים באנגלית מתחום זר (עיתונות אלטרנטיבית) — אחזור בריא לא אמור להחזיר
// אותם לאף סעיף במטלה על תרבות המערב.
const COURSE_FILES = [
  'אדם סמית.pdf',
  'בר–נביא – למען הדת הפרוטסטנטית למען פרלמנט חופשי – לוק עמ 76–88.pdf',
  'מארקס ואנגלס – המניפסט הקומוניסטי.pdf',
  'מגילת הזכויות באנגליה 1689.pdf',
  'חוקת מסצוסטס 1780.pdf',
  'חוק יסוד הממשלה.pdf',
  'ההכרזה האוניברסלית בדבר זכויות האדם 1948.pdf',
  'זבוטינסקי – הדמוקרטיה לא אשמה.pdf',
  'זיסר – החזון של מרקס.pdf',
  'גון סטיוארט מיל – על החירות וממשל של נציגים.pdf',
  'לוק – על הממשל המדיני.pdf',
  'הכרזת העצמאות של ארהב.pdf',
  'כתב הזכויות של וירגיניה.pdf',
  'Fukuyama - the Glorious Revolution.pdf',
  'Constitution of Japan.pdf',
  'The Constitution of the Netherlands 2018.pdf',
];
const EXTRA_FILES = [
  'נח הררי – קפיטליזם.pdf',
  'קולקה - המבנה החוקתי של ארהב.pdf',
];
const DISTRACTORS = [
  'Atton_-_What_is_alternative_journalism.pdf',
  'lacy et al. 2010.pdf',
  'mellor 2009.pdf',
  'ripatti-tornianinen  stachyra 2019.pdf',
];

async function ingestFiles(paths) {
  clearMaterialStore();
  let ocrCount = 0;
  for (const p of paths) {
    let { text, scanned, garbled } = await extractFile(p);
    if (scanned || garbled) {
      text = await ocrPdf(p);
      ocrCount += 1;
    }
    if (!String(text || '').trim()) continue;
    addMaterialDocument({
      title: path.basename(p).replace(/\.[^.]+$/, ''),
      text,
      source: 'e2e-harness',
      defer: true,
    });
  }
  await commitMaterialStore();
  const stats = getMaterialStoreStats();
  console.log(`קורפוס: ${stats.materials} מקורות · ${stats.chunks} קטעים · ${ocrCount} עברו OCR`);
  return stats;
}

async function buildCorpus() {
  const files = [];
  for (const name of [...COURSE_FILES, ...EXTRA_FILES, ...DISTRACTORS]) {
    const p = path.join(CORPUS_DIR, name);
    if (fs.existsSync(p)) files.push(p);
    else console.log(`  ⚠ חסר: ${name}`);
  }
  return ingestFiles(files);
}

// קורפוס הקורס השני — דיפלומטיה ציבורית, כמעט כולו באנגלית. מבחן ההכללה:
// שאילתות בעברית מול מקורות באנגלית, ומטלה מקורס אחר מולו (אפס המצאות).
const DIPLOMACY_DIR = path.join(CORPUS_DIR, 'מאמרים וקריאה');
const DIPLOMACY_FILES = [
  'nye-2008-public-diplomacy-and-soft-power.pdf',
  'Walker, C. (2018). What is Sharp Power_ Journal of Democracy, 29(3), 9-.32.pdf',
  'Gundel (2005) Towards a New Topology of Crises.pdf',
  'Wolfsfeld 2013 The Politics-Media-Politics Principle.pdf',
  'Avraham and  Ketter (2008). Media Strategies for Marketing Places in Crisis.pdf',
  'Brecher, M. (1979). State behavior in international crisis.pdf',
  'Feezell 2018. Agenda setting through social media.pdf',
  'Manor and Segev (2020). Social Media Mobility.pdf',
  'Wang, J. (2006). Managing national reputation and international relations in the global era.pdf',
  'Hlihor_2024 Public Diplomacy in Time of War..pdf',
];

// ---------- המטלה האמיתית ----------

const ASSIGNMENT_PATH = process.env.WORDAI_SCAFFOLD_ASSIGNMENT
  || path.join(CORPUS_DIR, 'עבודת סיום קורס סמסטר ב תשפו.pdf');

// ---------- eval ----------

// לכל מקרה: השאילתה = סעיף מהמטלה (או מפוברק לבקרה), expect = שמות קבצים
// שחייבים להופיע בראיות, forbid = 'gap' פירושו שהתשובה הנכונה היא "אין חומר".
const EVAL_CASES = [
  {
    id: 'american-innovations',
    section: {
      id: 'ev1', title: 'החידושים שהנהיגו האמריקנים בדמוקרטיה', intent: 'argument',
      instructions: 'מהם החידושים אשר הנהיגו האמריקנים עבור פיתוח הדמוקרטיה ומדוע? חובה להזכיר את מושגי הבלימה ההופכית ומאזני הצדק. הפרדת רשויות, איזונים ובלמים, חוקה כתובה.',
      keywords: ['חידושים', 'אמריקנים', 'דמוקרטיה', 'חוקה', 'רשויות'],
      // כמו שהפרסר מחלץ מהמטלה האמיתית (extractMustMention) — מזין את גשוש-החובה.
      mustMention: ['הבלימה ההופכית', 'מאזני הצדק'],
    },
    expectAny: ['קולקה - המבנה החוקתי של ארהב', 'חוקת מסצוסטס 1780', 'הכרזת העצמאות של ארהב', 'כתב הזכויות של וירגיניה'],
    // מגבלה ידועה: העותק בקורפוס הוא תקציר 14 עמ' מתוך ספר של 125 — פרק
    // "הבלימה ההופכית/מאזני הצדק" (ההפניה של המרצה: קולקה 1999: 99) לא בתקציר.
    // קולקה כן מדורג ראשון (z=3.33) — הדירוג נכון, החומר חסר. עם הספר המלא
    // המקרה צפוי לעבור.
    knownLimit: 'excerpt-missing-pages',
  },
  {
    id: 'mill-free-speech',
    section: {
      id: 'ev5', title: 'עקרונות חופש הביטוי של מיל', intent: 'argument',
      instructions: 'עקרון הנזק של ג׳ון סטיוארט מיל, חופש הביטוי והדעה, גבולות ההתערבות של החברה בחירות הפרט, עריצות הרוב.',
      keywords: ['מיל', 'חופש הביטוי', 'עקרון הנזק', 'חירות'],
    },
    expectAny: ['גון סטיוארט מיל – על החירות וממשל של נציגים'],
    // מגבלה ידועה: הסריקה של מיל דו-טורית ו-tesseract מערבב את הטורים — הטקסט
    // יוצא חצי-קוהרנטי וההטמעה נחלשת. נספר בנפרד ולא מפיל את ה-exit code.
    knownLimit: 'two-column-ocr',
  },
  {
    id: 'marx-industrial',
    section: {
      id: 'ev2', title: 'המרקסיזם כתגובה למהפכה התעשייתית', intent: 'analysis',
      instructions: 'האם נכון לומר כי החשיבה המרקסיסטית היא תגובה למהפכה התעשייתית? מעמד הפועלים, ניכור, בעלות על אמצעי הייצור, קפיטליזם.',
      keywords: ['מרקסיזם', 'מהפכה תעשייתית', 'קפיטליזם', 'פועלים'],
    },
    expectAny: ['מארקס ואנגלס – המניפסט הקומוניסטי', 'נח הררי – קפיטליזם', 'אדם סמית', 'זיסר – החזון של מרקס'],
  },
  {
    id: 'locke-rebellion',
    section: {
      id: 'ev3', title: 'לוק וזכות המרד נגד השלטון', intent: 'argument',
      instructions: 'זכות המרד של האזרחים נגד שלטון עריץ לפי ג׳ון לוק, אמנה חברתית, זכויות טבעיות, הגבלת השלטון.',
      keywords: ['לוק', 'מרד', 'אמנה חברתית', 'זכויות טבעיות'],
    },
    expectAny: ['לוק – על הממשל המדיני', 'בר–נביא – למען הדת הפרוטסטנטית למען פרלמנט חופשי – לוק עמ 76–88'],
  },
  {
    id: 'human-rights-1948',
    section: {
      id: 'ev4', title: 'משטר זכויות האדם אחרי מלחמת העולם השנייה', intent: 'analysis',
      instructions: 'ההכרזה האוניברסלית בדבר זכויות האדם 1948 והקמת משטר זכויות האדם הבין-לאומי אחרי מלחמת העולם השנייה.',
      keywords: ['זכויות אדם', 'הכרזה אוניברסלית', '1948'],
    },
    expectAny: ['ההכרזה האוניברסלית בדבר זכויות האדם 1948'],
  },
  // ---- בקרות שליליות: התשובה הנכונה היא gap ----
  {
    id: 'neg-ai-labor',
    section: {
      id: 'ng1', title: 'השפעת הבינה המלאכותית על שוק העבודה', intent: 'analysis',
      instructions: 'כיצד משפיעה הבינה המלאכותית על שוק העבודה המודרני? אוטומציה, אובדן משרות, הסבה מקצועית, כלכלת חליפין דיגיטלית.',
      keywords: ['בינה מלאכותית', 'שוק העבודה', 'אוטומציה'],
    },
    expectGap: true,
  },
  {
    id: 'neg-climate',
    section: {
      id: 'ng2', title: 'משבר האקלים ומדיניות סביבתית', intent: 'analysis',
      instructions: 'התחממות גלובלית, פליטות פחמן, הסכם פריז, אנרגיה מתחדשת ומדיניות סביבתית של מדינות מתועשות.',
      keywords: ['אקלים', 'התחממות', 'פליטות', 'אנרגיה'],
    },
    expectGap: true,
  },
  {
    // הבקרה הקודמת (תזונה) הייתה פגומה: הררי-קפיטליזם באמת דן בתעשיית המזון
    // ובצריכה — החפיפה שנמצאה הייתה סמנטיקה נכונה, לא כשל. אסטרונומיה באמת
    // נעדרת מהקורפוס.
    id: 'neg-astronomy',
    section: {
      id: 'ng3', title: 'מבנה מערכת השמש', intent: 'description',
      instructions: 'מסלולי כוכבי הלכת סביב השמש, כוח הכבידה, ירחים וטבעות, חגורת האסטרואידים ותצפיות טלסקופ.',
      keywords: ['כוכבי לכת', 'שמש', 'כבידה', 'טלסקופ'],
    },
    expectGap: true,
  },
];

async function runEval() {
  const rows = [];
  for (const c of EVAL_CASES) {
    const res = await findEvidenceForSection(c.section, { k: 4 });
    const sources = (res.evidence || []).map((e) => e.sourceTitle);
    const scores = (res.evidence || []).map((e) => `${Number(e.score).toFixed(3)}/z${e.z}`);
    let pass;
    if (c.expectGap) pass = res.gap;
    else pass = !res.gap && c.expectAny.some((want) => sources.some((s) => s.includes(want) || want.includes(s)));
    rows.push({ id: c.id, pass, knownLimit: c.knownLimit || null, gap: res.gap, mode: res.mode, sources, scores, diag: res.diag });
  }
  return rows;
}

function printEval(rows, label) {
  console.log(`\n═══ eval: ${label} ═══`);
  let ok = 0;
  let required = 0;
  for (const r of rows) {
    const mark = r.pass ? '✓' : (r.knownLimit ? '⚠' : '✗');
    if (!r.knownLimit) { required += 1; if (r.pass) ok += 1; }
    else if (r.pass) ok += 1;
    console.log(`${mark} ${r.id}  [${r.mode}${r.gap ? ' · gap' : ''}${r.knownLimit && !r.pass ? ` · known-limit:${r.knownLimit}` : ''}]`);
    r.sources.forEach((s, i) => console.log(`     ${r.scores[i]}  ${s.slice(0, 55)}`));
    if (r.diag) console.log(`     diag: ${JSON.stringify(r.diag)}`);
  }
  console.log(`─── ${ok}/${rows.length} עוברים (${required} מחייבים)`);
  // ה-exit code נשען רק על המחייבים.
  const requiredOk = rows.filter((r) => !r.knownLimit && r.pass).length;
  return { ok, requiredOk, required };
}

// ---------- main ----------

const t0 = Date.now();
await buildCorpus();

// cache וקטורים: ids נגזרים מ-hash התוכן, ולכן וקטור שחושב פעם תקף לעד.
// בלעדיו כל איטרציית כיול עולה ~100 שניות הטמעה מחדש.
const CACHE_PATH = path.join(process.env.WORDAI_VERIFY_SCRATCH || '.', 'vec-cache.json');
if (fs.existsSync(CACHE_PATH)) {
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    if (cache.signature === STYLE_EMBEDDING_SIGNATURE) {
      const restored = putMaterialVectors(
        Object.entries(cache.vectors).map(([chunkId, vec]) => ({ chunkId, vec })),
        cache.signature,
      );
      console.log(`שוחזרו ${restored} וקטורים מה-cache`);
    }
  } catch {}
}

console.log('מטמיע…');
let embedded = 0;
for (let pass = 0; pass < 200; pass += 1) {
  const r = await ensureMaterialsEmbedded({});
  embedded += r.embedded;
  if (r.unavailable) { console.log('הטמעה לא זמינה:', r.unavailable); break; }
  if (!r.remaining) break;
}
console.log(`הוטמעו ${embedded} קטעים ב-${Math.round((Date.now() - t0) / 1000)}s`);

{
  const blob = readMaterialStore();
  const vecs = {};
  for (const c of blob.chunks) if (c.vec && c.vecSig === STYLE_EMBEDDING_SIGNATURE) vecs[c.id] = c.vec;
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify({ signature: STYLE_EMBEDDING_SIGNATURE, vectors: vecs }), 'utf8');
}

// ---------- אבחון עומק (WORDAI_E2E_DIAG=1) ----------
if (process.env.WORDAI_E2E_DIAG === '1') {
  const { embedText, base64ToInt8, dequantizeVector, cosineSim: cosSim } =
    await import('../../src/services/styleEmbeddingService.js');
  const blob = readMaterialStore();
  const chunks = blob.chunks.filter((c) => c.vec);
  const vecs = new Map(chunks.map((c) => [c.id, dequantizeVector(base64ToInt8(c.vec))]));
  const dim = 384;
  const centroid = new Float32Array(dim);
  for (const c of chunks) { const v = vecs.get(c.id); for (let i = 0; i < dim; i += 1) centroid[i] += v[i]; }
  let n = 0; for (let i = 0; i < dim; i += 1) n += centroid[i] ** 2;
  n = Math.sqrt(n) || 1; for (let i = 0; i < dim; i += 1) centroid[i] /= n;

  for (const qText of [
    'query: תזונה נכונה ופעילות גופנית ובריאות מטבולית',
    'query: החידושים שהנהיגו האמריקנים בדמוקרטיה חוקה הפרדת רשויות',
  ]) {
    const qv = await embedText(qText.replace(/^query: /, ''), { kind: 'query' });
    const bySource = new Map();
    for (const c of chunks) {
      const v = vecs.get(c.id);
      const cos = cosSim(qv, v);
      const hub = cosSim(centroid, v);
      const s = bySource.get(c.sourceTitle) || { maxCos: -1, maxAdj: -1, sumHub: 0, n: 0, sample: '' };
      if (cos > s.maxCos) s.maxCos = cos;
      if (cos - hub > s.maxAdj) { s.maxAdj = cos - hub; s.sample = c.text.slice(0, 60); }
      s.sumHub += hub; s.n += 1;
      bySource.set(c.sourceTitle, s);
    }
    console.log(`\nDIAG "${qText.slice(7, 50)}":`);
    [...bySource.entries()]
      .sort((a, b) => b[1].maxAdj - a[1].maxAdj)
      .forEach(([src, s]) => console.log(
        `  maxCos ${s.maxCos.toFixed(3)} · hub̄ ${(s.sumHub / s.n).toFixed(3)} · maxAdj ${s.maxAdj.toFixed(3)} · ${src.slice(0, 40)}`,
      ));
  }
}

const rows = await runEval();
const evalRes = printEval(rows, 'אחזור ראיות');

// ---------- שלד מהמטלה האמיתית ----------
if (fs.existsSync(ASSIGNMENT_PATH)) {
  const { text } = await extractFile(ASSIGNMENT_PATH);
  const spec = parseAssignmentSpec(text);
  console.log(`\nמטלה: ${spec.sections.length} סעיפים · totalWords=${spec.totalWords} · ציטוט=${spec.citationStyle}`);

  // ראיות לכל סעיף *ותת-סעיף* — זו ההבטחה של המסלול.
  const evidence = {};
  const units = [];
  for (const s of spec.sections.filter((x) => x.enabled !== false)) {
    units.push(s);
    for (const sub of (s.subSections || [])) units.push({ ...sub, intent: s.intent });
  }
  // אותו מסלול כמו הסטודיו: findEvidenceForSpec (ירושת מסגרת לתתי-סעיפים) —
  // לא findEvidenceForSection ידני, שמפספס את הירושה.
  const specEvidence = await findEvidenceForSpec(spec, { k: 3 });
  Object.assign(evidence, specEvidence.bySection);

  await ensureOpenersReady();
  const openers = {};
  const used = new Set();
  for (const s of spec.sections.filter((x) => x.enabled !== false)) {
    const subs = Array.isArray(s.subSections) ? s.subSections : [];
    if (subs.length) {
      for (const sub of subs) {
        const text = composeSectionOpener({
          intent: s.intent, seedKey: sub.id, topic: sub.title, framework: s.title,
          mustMention: sub.mustMention?.length ? sub.mustMention : s.mustMention,
          usedTexts: used,
        });
        if (text) openers[sub.id] = text;
      }
      continue;
    }
    const text = composeSectionOpener({
      intent: s.intent, seedKey: s.id, topic: s.title,
      mustMention: s.mustMention, usedTexts: used,
    });
    if (text) openers[s.id] = text;
  }

  const html = buildScaffoldHtml(spec, { openers, evidence });
  const outPath = path.join(process.env.WORDAI_VERIFY_SCRATCH || '.', 'scaffold-output.html');
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`\nשלד נכתב: ${outPath} (${html.length} תווים)`);

  // תצוגה טקסטואלית של השלד
  console.log('\n═══ השלד ═══');
  console.log(html
    .replace(/<h1>(.*?)<\/h1>/g, '\n# $1')
    .replace(/<h2>(.*?)<\/h2>/g, '\n## $1')
    .replace(/<h3>(.*?)<\/h3>/g, '\n### $1')
    .replace(/<p><strong>(.*?)<\/strong><\/p>/g, '**$1**')
    .replace(/<p><em>(.*?)<\/em><\/p>/g, (m, t) => `_${t.length > 110 ? `${t.slice(0, 110)}…` : t}_`)
    .replace(/<p><\/p>/g, '·')
    .replace(/<[^>]+>/g, ''));
}

// ---------- תרחיש 2: קורפוס דיפלומטיה (אנגלית) — חוצה-שפה + אפס-המצאות ----------

console.log('\n═══ תרחיש 2: קורפוס דיפלומטיה ציבורית (אנגלית) ═══');
const diploPaths = DIPLOMACY_FILES
  .map((n) => path.join(DIPLOMACY_DIR, n))
  .filter((p) => fs.existsSync(p) || (console.log(`  ⚠ חסר: ${path.basename(p)}`), false));
await ingestFiles(diploPaths);
{
  // וקטורים: קטעים חדשים בלבד (ids לפי hash תוכן — ה-cache הקודם לא רלוונטי כאן)
  for (let pass = 0; pass < 200; pass += 1) {
    const r = await ensureMaterialsEmbedded({});
    if (r.unavailable || !r.remaining) break;
  }
}

const DIPLO_CASES = [
  {
    // כמו שמרצה ישראלי מנסח: עברית + שם המחבר בלועזית. העוגן חוצה-השפה = "nye".
    id: 'xl-soft-power',
    section: {
      id: 'dp1', title: 'כוח רך ודיפלומטיה ציבורית', intent: 'analysis',
      instructions: 'הסבר.י את מושג הכוח הרך (soft power) של ג׳וזף ניי (Nye) ואת תפקידה של הדיפלומטיה הציבורית בהפעלתו.',
      keywords: ['כוח רך', 'soft power', 'Nye', 'דיפלומטיה ציבורית', 'public diplomacy'],
    },
    expectAny: ['nye-2008-public-diplomacy-and-soft-power'],
  },
  {
    id: 'xl-crisis-typology',
    section: {
      id: 'dp2', title: 'טיפולוגיה של משברים', intent: 'analysis',
      instructions: 'הצג.י את הטיפולוגיה של גונדל (Gundel) לסיווג משברים לפי צפיות (predictability) ויכולת השפעה (influence).',
      keywords: ['משבר', 'טיפולוגיה', 'Gundel', 'crisis', 'predictability'],
    },
    expectAny: ['Gundel (2005) Towards a New Topology of Crises'],
  },
  {
    id: 'xl-politics-media',
    section: {
      id: 'dp3', title: 'עקרון פוליטיקה-תקשורת-פוליטיקה', intent: 'argument',
      instructions: 'דון.י בעקרון ה-PMP של וולפספלד (Wolfsfeld): הפוליטיקה קודמת לתקשורת והתקשורת משפיעה בחזרה על הפוליטיקה.',
      keywords: ['וולפספלד', 'Wolfsfeld', 'PMP', 'פוליטיקה', 'תקשורת'],
    },
    expectAny: ['Wolfsfeld 2013 The Politics-Media-Politics Principle'],
  },
  // מטלה מקורס אחר מול הקורפוס הזה — חובה gap. זו הבטחת האפס-המצאות.
  {
    id: 'xl-neg-mill',
    section: {
      id: 'dp4', title: 'עקרונות חופש הביטוי של מיל', intent: 'argument',
      instructions: 'עקרון הנזק של ג׳ון סטיוארט מיל, חופש הביטוי והדעה, גבולות ההתערבות של החברה בחירות הפרט.',
      keywords: ['מיל', 'חופש הביטוי', 'עקרון הנזק'],
    },
    expectGap: true,
  },
  {
    id: 'xl-neg-marx',
    section: {
      id: 'dp5', title: 'המרקסיזם כתגובה למהפכה התעשייתית', intent: 'analysis',
      instructions: 'האם נכון לומר כי החשיבה המרקסיסטית היא תגובה למהפכה התעשייתית? מעמד הפועלים, ניכור, אמצעי הייצור.',
      keywords: ['מרקסיזם', 'מהפכה תעשייתית', 'פועלים'],
    },
    expectGap: true,
  },
];

const diploRows = [];
for (const c of DIPLO_CASES) {
  const res = await findEvidenceForSection(c.section, { k: 3 });
  const sources = (res.evidence || []).map((e) => e.sourceTitle);
  const scores = (res.evidence || []).map((e) => `${Number(e.score).toFixed(3)}/z${e.z}`);
  const pass = c.expectGap
    ? res.gap
    : (!res.gap && c.expectAny.some((w) => sources.some((s) => s.includes(w) || w.includes(s))));
  diploRows.push({ id: c.id, pass, knownLimit: c.knownLimit || null, gap: res.gap, mode: res.mode, sources, scores, diag: res.diag });
}
const diploRes = printEval(diploRows, 'הכללה: חוצה-שפה + אפס-המצאות');

// ---------- תרחיש 3: סריקה מבנית על מגוון מטלות אמיתיות ----------

const INSTR_DIR = process.env.WORDAI_SPEC_CORPUS
  || 'C:/Users/rotem/AppData/Local/Temp/claude/C--Users-rotem-Projects--wordai-new/5dfe23d5-acbf-4f96-9551-9997128f4b6f/scratchpad/real-corpus/instructions';
let structOk = 0;
let structTotal = 0;
if (fs.existsSync(INSTR_DIR)) {
  console.log('\n═══ תרחיש 3: שלד תקין על מגוון מטלות ═══');
  const files = fs.readdirSync(INSTR_DIR).filter((f) => f.endsWith('.txt'));
  for (const f of files) {
    const text = fs.readFileSync(path.join(INSTR_DIR, f), 'utf8');
    const spec = parseAssignmentSpec(text);
    if (!spec.sections.length) continue; // מטלות שלא פורקו — מכוסות בסוויטת הפרסר
    structTotal += 1;
    const used = new Set();
    const openers = {};
    for (const s of spec.sections) {
      const subs = Array.isArray(s.subSections) ? s.subSections : [];
      for (const sub of subs) {
        const t = composeSectionOpener({ intent: s.intent, seedKey: sub.id, topic: sub.title, framework: s.title, mustMention: sub.mustMention?.length ? sub.mustMention : s.mustMention, usedTexts: used });
        if (t) openers[sub.id] = t;
      }
      if (!subs.length) {
        const t = composeSectionOpener({ intent: s.intent, seedKey: s.id, topic: s.title, mustMention: s.mustMention, usedTexts: used });
        if (t) openers[s.id] = t;
      }
    }
    const html = buildScaffoldHtml(spec, { openers });
    // אינווריאנטות: יש כותרות; אין undefined; אין גדם קטוע ("…"); אין השלמת-גדם
    // שבורה (פועל השלמה ואחריו פסוקית עם פועל מוטה — הסימפטום שנמדד).
    const bad = [];
    if (!/<h2>/.test(html)) bad.push('אין כותרות');
    if (/undefined|\[object/.test(html)) bad.push('undefined');
    if (/…<\/p>/.test(html)) bad.push('גדם קטוע');
    for (const t of Object.values(openers)) {
      if (/\s(?:את|של|ב|ל)\s+(?:\S+\s+){0,3}(?:דורשת|דורשים|ביקשה|ביצעה|מונעת|עתרה|מסרבת|טוענת)\s/.test(` ${t} `)) {
        bad.push(`עברית שבורה: "${t.slice(0, 60)}"`);
        break;
      }
    }
    if (bad.length) console.log(`✗ ${f}: ${bad.join(' · ')}`);
    else structOk += 1;
  }
  console.log(`─── ${structOk}/${structTotal} מטלות עם שלד תקין`);
}

// ---------- תרחיש 4: פרוזה מקומית — עיגון, אי-כפילות, כנות מכסה ----------
// composeSectionProse על ראיות *אמיתיות* מהקורפוס (המקרים החיוביים של תרחיש 2).
// הבדיקות דטרמיניסטיות: (א) כל משפט תוכן נושא chunk-id שקיים ברשימת הראיות;
// (ב) עיגון: ≥40% ממילות-התוכן של המשפט מופיעות ב-chunk שלו (המסגור מותר);
// (ג) אין משפט כפול; (ד) אין undefined; (ה) מכסה לא-ישיגה ⇒ הערת [דרוש מקור נוסף].

console.log('\n═══ תרחיש 4: פרוזה מקומית מעוגנת ═══');
const { composeSectionProse } = await import('../../src/services/proseComposeService.js');
const { ensureSentenceGrammarReady } = await import('../../src/services/sentenceComposeService.js');
await ensureSentenceGrammarReady();

const STOP_FOR_GROUNDING = new Set(['של', 'על', 'את', 'עם', 'כי', 'גם', 'אך', 'או', 'הוא', 'היא', 'הם', 'זו', 'זה', 'בין', 'לא', 'יש', 'אין', 'כך', 'מן', 'אל', 'כל']);
function groundingOverlap(sentence, chunkText) {
  const words = String(sentence).split(/\s+/)
    .map((w) => w.replace(/^[ולבכשמה]{1,2}(?=[א-ת]{3,})/, '').replace(/[^א-תa-zA-Z0-9]/g, ''))
    .filter((w) => w.length >= 3 && !STOP_FOR_GROUNDING.has(w));
  if (!words.length) return 1;
  const hay = String(chunkText);
  const hit = words.filter((w) => hay.includes(w)).length;
  return hit / words.length;
}

let proseOk = 0;
let proseTotal = 0;
const proseCases = DIPLO_CASES.filter((c) => !c.expectGap);
for (const c of proseCases) {
  const res = await findEvidenceForSection(c.section, { k: 4 });
  const evidence = res.evidence || [];
  if (!evidence.length) continue; // אין ראיות — מכוסה בתרחיש 2
  proseTotal += 1;
  const r = composeSectionProse(c.section, evidence, { quotaWords: 250, seedKey: c.id });
  const bad = [];
  if (!r || !r.sentences?.length) {
    bad.push(`לא נוצרה פרוזה (z: ${evidence.map((e) => Number(e.z).toFixed(1)).join(', ')})`);
  } else {
    // הראיה מ-findEvidenceForSection נושאת chunkId (לא id); המנוע מעגן לפי chunkId.
    const evId = (e) => e.chunkId ?? e.id;
    const evidenceIds = new Set(evidence.map(evId));
    const seen = new Set();
    for (const s of r.sentences) {
      if (/undefined|\[object/.test(s.text)) { bad.push('undefined'); break; }
      if (seen.has(s.text)) { bad.push(`משפט כפול: "${s.text.slice(0, 40)}…"`); break; }
      seen.add(s.text);
      if (s.evidenceId) {
        if (!evidenceIds.has(s.evidenceId)) { bad.push('chunk-id זר'); break; }
        const chunk = evidence.find((e) => evId(e) === s.evidenceId);
        const overlap = groundingOverlap(s.text, chunk.text);
        if (overlap < 0.4) { bad.push(`עיגון חלש (${(overlap * 100).toFixed(0)}%): "${s.text.slice(0, 50)}…"`); break; }
      }
    }
    // כנות מכסה: 250 מילים מ-4 ראיות כמעט תמיד לא ישיג — חייבת הערה או ≥60%.
    if (!bad.length && r.wordCount < 150 && !r.notes.length) bad.push('מכסה חסרה בלי הערת [דרוש מקור נוסף]');
  }
  if (bad.length) console.log(`✗ ${c.id}: ${bad.join(' · ')}`);
  else { proseOk += 1; console.log(`✓ ${c.id}: ${r.sentences.length} משפטים, ${r.wordCount} מילים${r.notes.length ? ' + הערת מכסה' : ''}`); }
}
console.log(`─── ${proseOk}/${proseTotal} סעיפי פרוזה מעוגנים תקינים`);

// tesseract worker מחזיק את התהליך חי — חובה לסגור.
if (ocrWorkerPromise) { try { await (await ocrWorkerPromise).terminate(); } catch {} }
const allPass = evalRes.requiredOk === evalRes.required
  && diploRes.requiredOk === diploRes.required
  && structOk === structTotal
  && proseOk === proseTotal;
process.exit(allPass ? 0 : 1);
