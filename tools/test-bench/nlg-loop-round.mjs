// nlg-loop-round.mjs — סבב לילי של מנוע ה-NLG המקומי: מפיק *עבודה מלאה* מהמטלה
// האמיתית במסלול אפס-API, כולל פרופיל סגנון אישי מהעבודות הקודמות של המשתמש.
//
// אותו דפוס כמו scaffold-e2e.mjs (window shim, pdfjs legacy ב-Node, OCR cache
// ב-scratch) — אבל במקום eval אחזור בלבד, הוא רץ עד הסוף: parse → קליטת חומרים
// → פרופיל אישי → ראיות לכל יחידה → composeSectionProseBest → draft.html/txt +
// metrics.json. **אפס קריאות מודל בזמן היצירה.**
//
// הרצה:  node tools/test-bench/run-nlg-loop-round.mjs
// פלט:    <scratchpad>/nlg-loop/round-1/{draft.html,draft.txt,metrics.json}

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// window shim: materialChunkStore/style* דורשים window ל-cache הפנימי; בלי IDB
// הם נופלים לזיכרון בלבד — בדיוק מה שה-harness צריך.
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
globalThis.addEventListener = globalThis.addEventListener || (() => {});
if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { userAgent: 'node-lab', language: 'he' };
if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k), clear: () => mem.clear(),
    key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
  };
}

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';

import { itemsToLines, cleanOcrText } from '../../src/services/materialExtractBrowser.js';
import { parseAssignmentSpec } from '../../src/services/assignmentSpecService.js';
import {
  addMaterialDocument, commitMaterialStore, clearMaterialStore, getMaterialStoreStats,
  readMaterialStore, putMaterialVectors,
} from '../../src/services/materialChunkStore.js';
import {
  ensureRetrievalBackend, getRetrievalSignature, getRetrievalBackend,
} from '../../src/services/retrievalEmbeddingService.js';
import { ensureMaterialsEmbedded, findEvidenceForSpec } from '../../src/services/evidenceMatchService.js';
import { ensureOpenersReady, composeSectionOpener } from '../../src/services/styleOpenerService.js';
import { addDocumentSamples, ensureSampleStoreReady, getSampleStoreStats, getChunks } from '../../src/services/styleSampleStore.js';
import { ensureOpenerProfile, getOpenerProfile, getOpenerProfileStatus } from '../../src/services/openerProfileService.js';
import { ensureFrameProfile, getFrameProfile, getFrameProfileStatus } from '../../src/services/styleFrameProfileService.js';
import { scoreTextAuthenticity } from '../../src/services/styleAuthenticityService.js';
import { composeSectionProseBest, ensureProseReady } from '../../src/services/proseComposeService.js';
import { deriveStyleTargets, describeStyleTargets } from '../../src/services/styleTargetsService.js';
import { enabledCommaSlots } from '../../src/services/styleFitService.js';

// ⚠️ נפילות מוחלטות של מכונת הפיתוח הישנה הוחלפו בנגזרות מ-homedir/הפרויקט —
// נתיב עם שם משתמש קשיח שבר כל הרצה במכונה אחרת (ר' scaffold-e2e).
const CORPUS_DIR = process.env.WORDAI_SCAFFOLD_CORPUS
  || path.join(os.homedir(), 'OneDrive', 'שולחן העבודה', '314999533');
const SCRATCH = process.env.WORDAI_VERIFY_SCRATCH || '.';
// כיול סף שכבת התגבור מבחוץ — כדי להשוות ספים באותה ריצה בלי לערוך קוד.
if (process.env.WORDAI_FOCUSED_MIN_Z) {
  globalThis.__WORDAI_FOCUSED_MIN_Z = Number(process.env.WORDAI_FOCUSED_MIN_Z);
}
if (process.env.WORDAI_FRAME_REWRITES === '0') globalThis.__WORDAI_FRAME_REWRITES = 0;
// ⚠️ בחירת ה-backend ב-'auto' מותנית ב-isDesktopApp(), ובהרנס (Node) אין window
// ולכן היא נופלת ל-none — כלומר הניסוח היה נשמט בשקט וכל המדידה הייתה של מסלול
// הכללים. WORDAI_REWRITE=1 מצהיר על הכוונה, ולכן הוא גם קובע את הדרגה במפורש.
if (process.env.WORDAI_REWRITE === '1' && !process.env.WORDAI_REWRITE_BACKEND) {
  process.env.WORDAI_REWRITE_BACKEND = 'ollama';
}
const NLG_DIR = process.env.WORDAI_NLG_OUT || path.join(SCRATCH, 'nlg-loop');
const ROUND_DIR = path.join(NLG_DIR, process.env.WORDAI_NLG_ROUND || 'round-2');
const ASSIGNMENT_PATH = process.env.WORDAI_NLG_ASSIGNMENT || path.join(NLG_DIR, 'assignment.txt');

// ---------- חילוץ (זהה ל-scaffold-e2e) ----------

function pureTokenRatio(text) {
  const tokens = (String(text || '').match(/\S+/g) || []).slice(0, 2000);
  if (tokens.length < 40) return 1;
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

// ---------- OCR (Node) — cache משותף עם scaffold-e2e ----------

// cache משותף עם scaffold-e2e: ה-wrapper מצביע WORDAI_VERIFY_SCRATCH על
// .scaffolde2e-scratch, שם כבר יושבים ה-OCR וה-vector cache שנבנו.
const OCR_CACHE_DIR = process.env.WORDAI_OCR_CACHE || path.join(SCRATCH, 'ocr-cache');
const OCR_MAX_PAGES_NODE = Number(process.env.WORDAI_E2E_OCR_PAGES || 60);
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
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, intent: 'print' }).promise;
    const { data: d } = await worker.recognize(canvas.toBuffer('image/png'));
    const pageText = String(d?.text || '').trim();
    if (pageText) parts.push(pageText);
    page.cleanup();
    process.stdout.write(`\r  OCR ${path.basename(filePath).slice(0, 38)} ${i}/${pages} (${Math.round((Date.now() - t0) / 1000)}s)   `);
  }
  process.stdout.write('\n');
  try { await doc.destroy(); } catch {}
  const raw = parts.join('\n\n');
  fs.mkdirSync(OCR_CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, raw, 'utf8');
  return cleanOcrText(raw);
}

// pptx → טקסט: זהה ל-extractPptx של materialExtractBrowser (jszip + <a:t>).
// מצגות ההרצאה (נושא XX) הן טקסט דיגיטלי נקי — עוקפות את בעיית ה-OCR הדו-טורי
// שהרעילה את מיל/המרקסיזם ב-round-2. (round-3, מסלול B של המבקר.)
async function extractPptxText(filePath) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const slideNum = (p) => Number((p.match(/slide(\d+)\.xml$/i) || [])[1] || 0);
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => slideNum(a) - slideNum(b));
  const parts = [];
  for (const p of slidePaths) {
    const xml = await zip.files[p].async('string');
    const texts = (xml.match(/<a:t>([\s\S]*?)<\/a:t>/gi) || [])
      .map((t) => t.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    if (texts.length) parts.push(texts.join(' '));
  }
  return { text: parts.join('\n'), pages: 0, scanned: false };
}

async function extractFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return extractPdfText(filePath);
  if (ext === '.pptx') return extractPptxText(filePath);
  if (ext === '.docx') {
    const r = await mammoth.extractRawText({ buffer: fs.readFileSync(filePath) });
    return { text: r.value || '', pages: 0, scanned: false };
  }
  if (ext === '.txt' || ext === '.md') {
    return { text: fs.readFileSync(filePath, 'utf8'), pages: 0, scanned: false };
  }
  return { text: '', pages: 0, scanned: false };
}

// ---------- קורפוס הקורס (אותה רשימה שנבדקה ב-scaffold-e2e) ----------

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
  'נח הררי – קפיטליזם.pdf',
  'קולקה - המבנה החוקתי של ארהב.pdf',
  // מצגות ההרצאה של הקורס — טקסט דיגיטלי נקי, תואמות אחד-לאחד לסעיפי המטלה.
  // round-3 (מסלול B): המקור הנקי למיל ולמרקסיזם, במקום ה-OCR המשובש.
  'נושא 14 - על החירות בדמוקרטיה - מיל.pptx',
  'נושא 14 - המהפכה התעשייתית וקפיטליזם.pptx',
  'נושא 12 - לוק וזכות המרד נגד השלטון.pptx',
  'נושא 13 - ההצהרות האמריקניות והזכויות הטבעיות.pptx',
  'נושא 15 - מלחמת העולם השניה ומשטר זכויות האדם.pptx',
  'נושא 10 - המהפכה המהוללת 31.3.2024.pptx',
  'נושא 11 - מגילת הזכויות ועיקרון עליונות הפרלמנט.pptx',
];

// רשימת הקבצים: או הקבועה (COURSE_FILES), או **כל** מה שיש בתיקייה שהוצבעה
// ב-WORDAI_NLG_COURSE_DIR. הרשימה הקבועה קושרת את ההרנס לקורס אחד; הצבעה על
// תיקייה מאפשרת להריץ אותו על כל מטלה אמיתית — וזו הדרך שבה הבנצ' אמור לגדול.
function courseFileNames() {
  const dir = process.env.WORDAI_NLG_COURSE_DIR;
  if (!dir) return { base: CORPUS_DIR, names: COURSE_FILES };
  let names = [];
  try {
    names = fs.readdirSync(dir)
      .filter((f) => /\.(pdf|docx|pptx)$/i.test(f) && !f.startsWith('~$'))
      .sort();
  } catch {}
  return { base: dir, names };
}

async function ingestCourse() {
  clearMaterialStore();
  let ocrCount = 0;
  const loaded = [];
  const { base: courseBase, names: courseNames } = courseFileNames();
  for (const name of courseNames) {
    const p = path.join(courseBase, name);
    if (!fs.existsSync(p)) { console.log(`  ⚠ חסר: ${name}`); continue; }
    let { text, scanned, garbled } = await extractFile(p);
    let viaOcr = false;
    if (scanned || garbled) { text = await ocrPdf(p); ocrCount += 1; viaOcr = true; }
    if (!String(text || '').trim()) continue;
    // round-4: cleanDigital=!viaOcr → רצפת-רלוונטיות מקלה ב-proseComposeService.
    // sourceKind='slides' למצגות (pptx) → מוגבל שם למהלך ציטוט בלבד (תבליטים).
    addMaterialDocument({
      title: name.replace(/\.[^.]+$/, ''), text, source: 'nlg-loop', defer: true,
      cleanDigital: !viaOcr,
      sourceKind: path.extname(name).toLowerCase() === '.pptx' ? 'slides' : null,
    });
    loaded.push(name);
  }
  await commitMaterialStore();
  const stats = getMaterialStoreStats();
  console.log(`קורפוס קורס: ${stats.materials} מקורות · ${stats.chunks} קטעים · ${ocrCount} עברו OCR`);
  return stats;
}

// ---------- פרופיל אישי מהעבודות הקודמות ----------

const PERSONAL_DIRS = [
  path.join(CORPUS_DIR, 'עבודות והגשות', 'עבודות סופיות'),
  path.join(CORPUS_DIR, 'עבודות והגשות', 'טיוטות וגרסאות קודמות'),
];

// ⚠️ הטקסטים הגולמיים נאספים כאן ולא נשלפים אחר כך מ-styleSampleStore, ובכוונה:
// החנות שומרת chunks, והחיתוך מאבד את גבולות הפסקה — ו-styleTargetsService נשען
// עליהם כדי להפריד פסקת פרוזה מכותרת ומשורת ביבליוגרפיה. נקודת הגזירה הנכונה
// היא הקליטה, שבה הטקסט המלא עוד קיים; זו גם הנקודה שבה האפליקציה תגזור.
const personalTexts = [];

async function ingestPersonalCorpus() {
  await ensureSampleStoreReady();
  let docs = 0;
  const seen = new Set();
  for (const dir of PERSONAL_DIRS) {
    if (!fs.existsSync(dir)) { console.log(`  ⚠ תיקיית סגנון חסרה: ${dir}`); continue; }
    const files = fs.readdirSync(dir).filter((f) => /\.docx$/i.test(f) && !f.startsWith('~$'));
    for (const f of files) {
      let text = '';
      try {
        const r = await mammoth.extractRawText({ buffer: fs.readFileSync(path.join(dir, f)) });
        text = r.value || '';
      } catch { continue; }
      const body = text.replace(/\s+/g, ' ').trim();
      if (body.length < 200) continue;
      const fp = body.slice(0, 400); // דה-דופ גרסאות כמעט-זהות
      if (seen.has(fp)) continue;
      seen.add(fp);
      addDocumentSamples({ title: f.replace(/\.[^.]+$/, ''), text, source: 'personal-finals' });
      personalTexts.push(text);
      docs += 1;
    }
  }
  const stats = getSampleStoreStats();
  console.log(`קורפוס אישי: ${docs} מסמכים נקלטו · ${stats.chunks ?? stats.totalChunks ?? '?'} קטעי סגנון`);
  return docs;
}

// ---------- עיגון: חפיפת מילות-תוכן מול ה-chunk ----------

const STOP = new Set(['של', 'על', 'את', 'עם', 'כי', 'גם', 'אך', 'או', 'הוא', 'היא', 'הם', 'זו', 'זה', 'בין', 'לא', 'יש', 'אין', 'כך', 'מן', 'אל', 'כל', 'the', 'of', 'and', 'in', 'to', 'that', 'is', 'are', 'was', 'as', 'for', 'with', 'by', 'from']);
function contentWords(sentence) {
  return String(sentence).split(/\s+/)
    .map((w) => w.replace(/^[ולבכשמה]{1,2}(?=[א-ת]{3,})/, '').replace(/[^א-תa-zA-Z0-9]/g, ''))
    .filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase()));
}
function overlapAgainst(sentence, chunkText) {
  const words = contentWords(sentence);
  if (!words.length) return 1;
  const hay = String(chunkText || '');
  const hayLower = hay.toLowerCase();
  const hit = words.filter((w) => hay.includes(w) || hayLower.includes(w.toLowerCase())).length;
  return hit / words.length;
}

// ---------- main ----------

const t0 = Date.now();
fs.mkdirSync(ROUND_DIR, { recursive: true });

await ingestCourse();

// מנוע האחזור נבחר כאן, לפני ההטמעה — החתימה שלו קובעת גם את ה-cache וגם את
// vecSig בחנות. WORDAI_EMBED_BACKEND=ollama מפעיל את bge-m3.
await ensureRetrievalBackend();
const EMBED_SIG = getRetrievalSignature();
console.log(`מנוע אחזור: ${getRetrievalBackend()} · חתימה ${EMBED_SIG}`);

// שחזור וקטורים מ-cache של scaffold-e2e (ids לפי hash תוכן — תקפים לעד).
// ⚠️ קובץ נפרד לכל מנוע: cache יחיד היה נדרס בכל החלפת מנוע, כלומר כל השוואה
// בין e5 ל-bge-m3 הייתה משלמת הטמעה מלאה מחדש בכל כיוון.
const VEC_CACHE = process.env.WORDAI_VEC_CACHE
  || path.join(path.dirname(OCR_CACHE_DIR), `vec-cache-${EMBED_SIG.replace(/[^\w.-]/g, '_')}.json`);
if (fs.existsSync(VEC_CACHE)) {
  try {
    const cache = JSON.parse(fs.readFileSync(VEC_CACHE, 'utf8'));
    if (cache.signature === EMBED_SIG) {
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
for (let pass = 0; pass < 400; pass += 1) {
  const r = await ensureMaterialsEmbedded({});
  embedded += r.embedded;
  if (r.unavailable) { console.log('הטמעה לא זמינה:', r.unavailable); break; }
  if (!r.remaining) break;
}
console.log(`הוטמעו ${embedded} קטעים ב-${Math.round((Date.now() - t0) / 1000)}s`);

// שמירת cache מעודכן (חוסך הטמעה בסבב הבא).
{
  const blob = readMaterialStore();
  const vecs = {};
  for (const c of blob.chunks) if (c.vec && c.vecSig === EMBED_SIG) vecs[c.id] = c.vec;
  try {
    fs.mkdirSync(path.dirname(VEC_CACHE), { recursive: true });
    fs.writeFileSync(VEC_CACHE, JSON.stringify({ signature: EMBED_SIG, vectors: vecs }), 'utf8');
  } catch {}
}

// פרופיל אישי
await ingestPersonalCorpus();
await ensureOpenersReady();
await ensureProseReady();
const openerProfile = await ensureOpenerProfile();
const frameProfile = await ensureFrameProfile();
const oStatus = getOpenerProfileStatus();
const fStatus = getFrameProfileStatus();
console.log(`פרופיל פתיחים: ${oStatus.distinctDocs} מסמכים · ${oStatus.personalWords} מילות-סלוט · λ=${Number(oStatus.blendLambda).toFixed(2)}`);
console.log(`פרופיל מסגרות: ${fStatus.minedFrames} מסגרות · ${fStatus.distinctDocs} מסמכים`);

// פרופיל היעדים המבניים. WORDAI_STYLE_FIT=0 מנטרל — כדי שאפשר יהיה למדוד A/B
// על אותו סבב בדיוק ולא מול ריצה אחרת.
const styleTargets = process.env.WORDAI_STYLE_FIT === '0'
  ? null
  : deriveStyleTargets(personalTexts);
if (styleTargets) {
  console.log(`פרופיל סגנון: ${describeStyleTargets(styleTargets)}`);
  const on = enabledCommaSlots(styleTargets).map((s) => s.def.label).join(' · ');
  console.log(`  משמורות פסיק פעילות: ${on || '(אין — הקורפוס לא הראה עקביות)'}`);
} else {
  console.log(`פרופיל סגנון: ${process.env.WORDAI_STYLE_FIT === '0' ? 'מנוטרל (WORDAI_STYLE_FIT=0)' : 'אין מספיק עבודות'}`);
}

// ---------- אבחון (WORDAI_NLG_DIAG=1) ----------
if (process.env.WORDAI_NLG_DIAG === '1') {
  const { readMaterialStore } = await import('../../src/services/materialChunkStore.js');
  const { base64ToInt8, dequantizeVector, cosineSim } =
    await import('../../src/services/styleEmbeddingService.js');
  const { embedForRetrieval } = await import('../../src/services/retrievalEmbeddingService.js');
  const embedText = async (t) => (await embedForRetrieval([t], { kind: 'query' }))?.[0] || null;
  const blob = readMaterialStore();
  const bySrc = new Map();
  for (const c of blob.chunks) {
    const s = bySrc.get(c.sourceTitle) || { total: 0, garbled: 0, vec: 0 };
    s.total += 1; if (c.garbled) s.garbled += 1; if (c.vec) s.vec += 1;
    bySrc.set(c.sourceTitle, s);
  }
  console.log('\n=== DIAG: chunks per source (garbled/total) ===');
  for (const [src, s] of [...bySrc.entries()].sort((a, b) => b[1].garbled - a[1].garbled)) {
    console.log(`  ${s.garbled}/${s.total} garbled · ${src.slice(0, 45)}`);
  }
  const chunks = blob.chunks.filter((c) => c.vec && !c.garbled);
  const vecs = new Map(chunks.map((c) => [c.id, dequantizeVector(base64ToInt8(c.vec))]));
  // הממד נגזר מהווקטור עצמו — e5 הוא 384 ו-bge-m3 הוא 1024. קבוע קשיח כאן היה
  // מייצר צנטרואיד חתוך ואבחון שקרי ברגע שמחליפים מנוע.
  const dim = vecs.size ? (vecs.values().next().value?.length || 0) : 0;
  const centroid = new Float32Array(dim);
  for (const c of chunks) { const v = vecs.get(c.id); for (let i = 0; i < dim; i += 1) centroid[i] += v[i]; }
  let nn = 0; for (let i = 0; i < dim; i += 1) nn += centroid[i] ** 2;
  nn = Math.sqrt(nn) || 1; for (let i = 0; i < dim; i += 1) centroid[i] /= nn;
  for (const q of ['הגותו של גון סטיוארט מיל חופש הביטוי עריצות הרוב חירות הפרט', 'המהפכה התעשייתית ועקרונות המרקסיזם']) {
    const qv = await embedText(q, { kind: 'query' });
    const rows = chunks.map((c) => { const v = vecs.get(c.id); const cos = cosineSim(qv, v); return { c, adj: cos - cosineSim(centroid, v) }; });
    const adj = rows.map((r) => r.adj).sort((a, b) => a - b);
    const med = adj[Math.floor(adj.length / 2)];
    const mad = (adj.map((x) => Math.abs(x - med)).sort((a, b) => a - b)[Math.floor(adj.length / 2)] || 1e-6) * 1.4826;
    const bySrc2 = new Map();
    for (const r of rows) { const z = (r.adj - med) / mad; const cur = bySrc2.get(r.c.sourceTitle); if (!cur || z > cur.z) bySrc2.set(r.c.sourceTitle, { z, head: r.c.text.slice(0, 45) }); }
    console.log(`\n=== DIAG probe: "${q.slice(0, 40)}" ===`);
    [...bySrc2.entries()].sort((a, b) => b[1].z - a[1].z).slice(0, 8).forEach(([src, s]) => console.log(`  z${s.z.toFixed(2)}  ${src.slice(0, 40)} · ${s.head}`));
  }
}

// ---------- המטלה ----------
// המטלה מגיעה מהמרצה כ-PDF/DOCX, לא כ-txt. קריאה גולמית החזירה "%PDF-1.7"
// ומתוכה 0 סעיפים — כישלון שקט. אותו מחלץ המשמש לחומרי הקורס משמש גם כאן.
const assignmentText = /\.txt$/i.test(ASSIGNMENT_PATH)
  ? fs.readFileSync(ASSIGNMENT_PATH, 'utf8')
  : (await extractFile(ASSIGNMENT_PATH)).text;
const spec = parseAssignmentSpec(assignmentText);
console.log(`\nמטלה: "${spec.title}" · ${spec.sections.length} סעיפים · totalWords=${spec.totalWords} · ציטוט=${spec.citationStyle}`);

console.log(`עוגן דוקטרינרי מהפתיח: ${spec.doctrineScope ? `"${spec.doctrineScope}"` : '— לא נמצא —'}`);
// ⚠️ k=6 — **נמדד ונבחר**, והפוך מהמסקנה הקודמת. המדידה הישנה (k=4 סגנון 44 מול
// k=6 סגנון 31) נעשתה כשהמנוע כתב משפטים בני 32 מילים: ראיה נוספת האריכה עוד
// משפטי-שרשרת, וזה מה שהרג את הסגנון. מרגע שאורך המשפט נאכף (~17 מילים, כמו
// המשתמש) התלות התהפכה ונעלמה:
//     k=4   845 מילים · סגנון 54/100
//     k=6  1014 מילים · סגנון 53/100   ← +169 מילים בעלות נקודה אחת
// המכסה של המטלה היא 1000 מילים, ולכן 6.
// ⚠️ בלי env — יורש את DEFAULT_EVIDENCE_K של השירות, כלומר בדיוק מה שהאפליקציה
// מריצה. ההרנס נהג לקבוע 6 בזמן שהאפליקציה שלחה 5, והבנצ' מדד תצורה אחרת.
const specEvidence = await findEvidenceForSpec(spec,
  process.env.WORDAI_EV_K ? { k: Number(process.env.WORDAI_EV_K) } : {});

// ---------- דוגמאות סגנון ל-few-shot ----------
// ⚠️ זו ההתאמה האישית **היחידה שניתנת למשלוח**: אי אפשר לאמן מודל על המכונה של
// כל סטודנט, אבל אפשר להראות לו כמה משפטים שלו בזמן ההסקה. נבחרים משפטים
// באורך בינוני מהעבודות הקודמות — לא קצרים מדי (כותרות) ולא ארוכים מדי.
// מספר דוגמאות ה-few-shot ניתן לכיול מבחוץ. 0 = בקרה בלי התניית סגנון כלל —
// הניסוי שמכריע אם ההתניה הזו בכלל עובדת, שכן עד כה היא נמדדה מול קובץ ישן.
const STYLE_SHOT_COUNT = Number(process.env.WORDAI_STYLE_SHOTS ?? 5);
const styleShots = (() => {
  if (!STYLE_SHOT_COUNT) return null;
  try {
    const chunks = getChunks() || [];
    const sents = [];
    for (const c of chunks) {
      for (const s of String(c?.text || '').split(/(?<=[.!?])\s+/)) {
        const t = s.trim();
        const words = (t.match(/\S+/g) || []).length;
        const heb = (t.match(/[א-ת]/g) || []).length / Math.max(t.length, 1);
        if (words >= 12 && words <= 28 && heb >= 0.7 && !/[()"']/.test(t)) sents.push(t);
      }
    }
    // דטרמיניסטי: פריסה אחידה על פני הקורפוס במקום חמשת הראשונים ממסמך אחד.
    const step = Math.max(1, Math.floor(sents.length / STYLE_SHOT_COUNT));
    return sents.filter((_, i) => i % step === 0).slice(0, STYLE_SHOT_COUNT);
  } catch { return null; }
})();
console.log(`דוגמאות סגנון ל-few-shot: ${styleShots?.length || 0}`);
if (process.env.WORDAI_EV_DIAG === '1') {
  for (const [id, res] of Object.entries(specEvidence.bySection || {})) {
    const top = (res.diag?.top || []).map((t) => `z${t.z} ${String(t.src).slice(0, 22)}`).join(' | ');
    console.log(`  [${id}] ראיות=${(res.evidence || []).length} gap=${res.gap} · top: ${top || '-'}`);
  }
}

// יחידות עבודה: סעיף, ואם יש תתי-סעיפים — כל תת-סעיף (יורש intent/מסגרת מהאב).
const sections = spec.sections.filter((s) => s?.enabled !== false);
const usedOpeners = new Set();
const workUsedSentences = new Set();
const htmlParts = [`<h1>${escapeHtml(spec.title || 'מטלה')}</h1>`];
const txtParts = [`# ${spec.title || 'מטלה'}\n`];
// ⚠️ הקלט של מדידת הסגנון: **רק** משפטי הגוף — בלי כותרות, בלי פותחי-מסגרת
// ובלי הערות. עד כה הקובץ נוצר ידנית, ולכן כל ריצה נמדדה מול טיוטה ישנה
// ודיווחה את אותו ציון בדיוק. נכתב עכשיו בכל סבב.
const prosePartsForStyle = [];
const metrics = {
  round: Number(process.env.WORDAI_NLG_ROUND_NUM || 2),
  generatedAt: new Date().toISOString(),
  assignment: { title: spec.title, totalWords: spec.totalWords, citationStyle: spec.citationStyle, sectionCount: sections.length },
  corpus: getMaterialStoreStats(),
  styleProfile: { openerDocs: oStatus.distinctDocs, openerPersonalWords: oStatus.personalWords, blendLambda: oStatus.blendLambda, frameCount: fStatus.minedFrames, frameDocs: fStatus.distinctDocs },
  sections: [],
  totals: {},
};

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// מדד "ראיה שמישה": חוזר על סף ה-zFloor תלוי-השפה של proseComposeService.
function heRatio(s) {
  const letters = (String(s).match(/[א-תa-zA-Z]/g) || []).length;
  const heb = (String(s).match(/[א-ת]/g) || []).length;
  return letters ? heb / letters : 0;
}
function isUsable(e) {
  if (typeof e.z !== 'number') return true;
  return e.z >= (heRatio(e.text) >= 0.5 ? 4.5 : 3.6);
}

function unitList(section) {
  const subs = Array.isArray(section.subSections) ? section.subSections : [];
  if (subs.length) {
    return subs.map((sub) => ({
      ...sub,
      intent: sub.intent || section.intent,
      title: [section.title, sub.title].filter(Boolean).join(' — '),
      keywords: sub.keywords?.length ? sub.keywords : section.keywords,
      mustMention: sub.mustMention?.length ? sub.mustMention : section.mustMention,
      parent: section,
    }));
  }
  return [{ ...section, parent: null }];
}

// C (round-3): דרגרדציה מבוקרת. סעיף חסום לא מציג רק "[חסום]" אלא שלד ישר:
// פתיח כן (בלי הבטחות-שווא — evidenceText=''), הפניה למקורות הקרובים ביותר עם
// z, ו-"מה חסר כדי לכתוב". זה ה-fallback הכן — לא המצאה, אבל גם לא דף ריק.
function blockedSkeleton(u, res, openerText, note) {
  const near = (res?.diag?.top || []).slice(0, 3);
  const nearTxt = near.length
    ? near.map((t) => `${t.src} (z${t.z})`).join(' · ')
    : 'אין מועמדים קרובים בקורפוס';
  const framework = u.parent?.title || u.title || 'הנושא';
  const missing = res?.gap
    ? `דרוש מקור נקי וממוקד על ${framework} — לא נמצא חומר מעל סף הרלוונטיות.`
    : `דרוש מקור קריא על ${framework} — המקורות הקרובים משובשי-OCR או מתחת לסף.`;
  const headTxt = u.parent ? u.title.split(' — ').slice(-1)[0] : u.title;
  const head = u.parent ? `<h3>${escapeHtml(headTxt)}</h3>` : '';
  const openHtml = openerText ? `<p>${escapeHtml(openerText)}</p>` : '';
  const html = `${head}${openHtml}`
    + `<p><em>מקורות קרובים (מתחת לסף): ${escapeHtml(nearTxt)}</em></p>`
    + `<p><strong>[חסום — ${escapeHtml(note)}] מה חסר כדי לכתוב: ${escapeHtml(missing)}</strong></p>`;
  const txt = `### ${u.title}\n${openerText ? `${openerText}\n` : ''}`
    + `מקורות קרובים (מתחת לסף): ${nearTxt}\n`
    + `[חסום — ${note}] מה חסר: ${missing}\n`;
  return { html, txt };
}

// דאמפ ראיות: מאפשר להריץ מודל API על *אותן ראיות בדיוק* (nlg-bench/compare-api).
const evidenceDump = {};

let totWords = 0;
let totBlocked = 0;
let totAnchored = 0;
let totContent = 0;

// מכסת קשירת-הצד יחסית למספר היחידות בעבודה כולה (ר' partyBudget).
const totalUnits = sections.reduce((a, s) => a + unitList(s).length, 0);

for (const section of sections) {
  htmlParts.push(`<h2>${escapeHtml(section.title || section.id)}</h2>`);
  txtParts.push(`\n## ${section.title || section.id}\n`);
  for (const u of unitList(section)) {
    const res = specEvidence.bySection[u.id];
    // ל-composeSectionProse: הראיה חייבת לשאת .id (המנוע מעגן משפט לפי id). מקור
    // האמת הוא chunkId — ממפים כך שהעיגון (evidenceId) יהיה אמיתי.
    const evidence = (res?.evidence || []).map((e) => ({ ...e, id: e.chunkId ?? e.id }));
    const quota = u.wordQuota || 0;
    evidenceDump[u.id] = {
      title: u.title, intent: u.intent, quota,
      mustMention: u.mustMention?.length ? u.mustMention : (u.parent?.mustMention || section.mustMention || []),
      gap: Boolean(res?.gap),
      evidence: evidence.map((e) => ({ id: e.id, sourceTitle: e.sourceTitle, z: e.z, text: e.text })),
    };
    const openerText = composeSectionOpener({
      intent: u.intent, seedKey: u.id, profile: openerProfile,
      topic: u.title, framework: u.parent?.title,
      mustMention: u.mustMention?.length ? u.mustMention : (u.parent?.mustMention || section.mustMention),
      usedTexts: usedOpeners,
      evidenceText: evidence.map((e) => e.text).join(' '),
    });

    const secMetric = {
      id: u.id, title: u.title, intent: u.intent, quota,
      evidenceFound: (res?.evidence || []).length,
      evidenceUsable: evidence.filter(isUsable).length,
      evidenceMode: res?.mode || 'none',
      evidenceZ: (res?.evidence || []).map((e) => ({ src: String(e.sourceTitle || '').slice(0, 24), z: e.z, he: Number(heRatio(e.text).toFixed(2)), usable: isUsable(e) })),
      diagTop: res?.diag?.top || null,
      gap: Boolean(res?.gap),
      status: 'blocked',
      sentences: 0, wordCount: 0, anchoredPct: 0, detectorScore: null,
      usedSources: [], filteredWeak: 0, note: null,
    };

    if (!evidence.length || res?.gap) {
      secMetric.status = 'blocked';
      secMetric.note = res?.gap ? 'אין ראיות בסף הרלוונטיות (gap)' : 'אין ראיות';
      totBlocked += 1;
      const sk = blockedSkeleton(u, res, openerText, secMetric.note);
      htmlParts.push(sk.html);
      txtParts.push(sk.txt);
      metrics.sections.push(secMetric);
      continue;
    }

    // ---------- שכבת הניסוח (opt-in) ----------
    // WORDAI_REWRITE=1 מפעיל. מנוסח מראש כי המחבר סינכרוני (ר' rewriteSectionEvidence).
    //
    // ⚠️ עובר דרך rewriteBackendService — **אותו תפר שה-Studio משתמש בו**. זה
    // מכוון: בנצ' שמודד מסלול אחר מזה שנשלח למשתמש מודד את הדבר הלא נכון.
    let rewrites = null;
    if (process.env.WORDAI_REWRITE === '1' && evidence.length) {
      try {
        const { rewriteEvidenceForSection } = await import('../../src/services/rewriteBackendService.js');
        const rr = await rewriteEvidenceForSection({
          section: u, evidence, caseFacts: assignmentText.slice(0, 2500), styleExamples: styleShots,
        });
        rewrites = rr.byChunk;
        console.log(`    [${u.id}] ניסוח: ${rr.ok} עברו · ${rr.failed} נדחו בשער`);
      } catch (err) {
        console.log(`    [${u.id}] ניסוח לא זמין: ${err.message}`);
      }
    }

    const r = composeSectionProseBest(
      { ...u, keywords: u.keywords || section.keywords },
      evidence,
      // WORDAI_NLG_SEED_SALT — מזיז את הגרלת המסגרות בלי לשנות שום לוגיקה.
      // נועד למדוד את **פיזור ציון הסגנון בין הגרלות**, כלומר את רזולוציית
      // המדידה האמיתית. בלי המספר הזה אי אפשר לדעת אילו הפרשים משמעותיים.
      {
        quotaWords: quota,
        seedKey: `${u.id}${process.env.WORDAI_NLG_SEED_SALT || ''}`,
        profile: frameProfile,
        sharedUsedSentences: workUsedSentences,
        rewrites,
        styleTargets,
        sectionCount: totalUnits,
      },
      { scoreFn: scoreTextAuthenticity, variants: 3 },
    );

    // ---------- מדד "תשובה מול פיגום" ----------
    // ⚠️ הביקורת שהובילה למדד: הפלט נראה כמו רצף **פתיחים**, לא כמו תשובה.
    // שלושה מספרים שמכמתים זאת:
    //   scaffoldWordShare — שיעור המילים במשפטים בלי ראיה כלל (פתיח/סיכום/מעבר).
    //   copiedWordShare   — שיעור המילים שמקורן מילה-במילה בטקסט הראיה.
    //   caseEntityHits    — כמה מהישויות שבשאלה (שמות הדמויות) בכלל מוזכרות.
    // תשובה אמיתית מיישמת דוקטרינה על המקרה; אם אף שם מהשאלה אינו מופיע בגוף
    // התשובה, לא נענתה השאלה אלא הוצג רקע.
    if (r?.sentences?.length) {
      const wc = (s) => (String(s).match(/\S+/g) || []).length;
      const noEv = r.sentences.filter((s) => !s.evidenceId);
      const evTexts = (evidence || []).map((e) => String(e.text || ''));
      let copied = 0; let total = 0;
      for (const s of r.sentences) {
        for (const w of String(s.text).match(/[א-ת]{4,}/g) || []) {
          total += 1;
          if (evTexts.some((t) => t.includes(w))) copied += 1;
        }
      }
      // ישויות השאלה: מילים בנות ≥3 אותיות מכותרת הסעיף שאינן מילות תפקוד.
      const STOP = new Set(['אילו', 'טענות', 'הגנה', 'עשוי', 'עשויה', 'עשויים', 'להעלות', 'משפטיות', 'נגד', 'ואת', 'של', 'את', 'על']);
      const ents = [...new Set((String(u.title || '').match(/[א-ת]{3,}/g) || []).filter((w) => !STOP.has(w)))];
      const body = r.sentences.map((s) => s.text).join(' ');
      const hits = ents.filter((e) => body.includes(e));
      secMetric.scaffoldWordShare = r.wordCount ? +(noEv.reduce((a, s) => a + wc(s.text), 0) / r.wordCount).toFixed(2) : 0;
      secMetric.copiedWordShare = total ? +(copied / total).toFixed(2) : 0;
      secMetric.caseEntities = `${hits.length}/${ents.length}`;
      console.log(`    [${u.id}] פיגום ${Math.round(secMetric.scaffoldWordShare * 100)}% · מועתק ${Math.round(secMetric.copiedWordShare * 100)}% · ישויות מהשאלה ${secMetric.caseEntities}`);
    }

    if (!r || !r.sentences?.length) {
      secMetric.status = 'blocked';
      secMetric.note = 'ראיות חלשות מדי (מתחת ל-zFloor) — לא נכתבה טיוטה';
      secMetric.filteredWeak = evidence.length;
      totBlocked += 1;
      const sk = blockedSkeleton(u, res, openerText, secMetric.note);
      htmlParts.push(sk.html);
      txtParts.push(sk.txt);
      metrics.sections.push(secMetric);
      continue;
    }

    // עיגון: לכל משפט תוכן, מקסימום חפיפה מול הראיות של הסעיף **ומול טקסט
    // המטלה**.
    //
    // ⚠️ הרחבת הייחוס לטקסט המטלה אינה הרפיה. "אפס המצאות" פירושו שכל מילת תוכן
    // מגיעה ממשהו שהמשתמש סיפק — והמטלה היא קלט של המשתמש בדיוק כמו חומרי
    // הקריאה. משפט שמיישם כלל על עובדות המקרה **חייב** לשאת מילים מהמקרה, והן
    // אינן בקטע המקור מעצם הגדרתן.
    //
    // נמדד: עם שכבת הניסוח העיגון "נפל" ל-40% בזמן שהישויות מהשאלה עלו מ-1/7
    // ל-7/7 — כלומר בדיוק המשפטים שהתחילו לענות על השאלה נספרו כלא-מעוגנים,
    // כי הזכירו את יקיר ואת דליה. זו הייתה אי-התאמה בין מדדים, לא נסיגה.
    // מה שנשאר אסור ונאכף כרגיל: מילה שאינה בקטע **ולא** במטלה = המצאה.
    // ⚠️ **איחוד** המקורות, לא מקסימום מול מקור בודד. הבדיקה הישנה דרשה 40%
    // חפיפה מול ראיה אחת; משפט שמיישם כלל על עובדות המקרה שואב במכוון משניהם —
    // ~30% מהקטע ו~30% מהמקרה — ולכן נכשל בכל אחד בנפרד למרות שכל מילה בו
    // הגיעה מקלט של המשתמש. נמדד: עם מקסימום-בודד העיגון היה 90% ו-0 משפטים
    // נדחו בשער הניסוח, כלומר הפער היה בין שתי הנוסחאות ולא באיכות הפלט.
    //
    // ההגדרה הנכונה של "אפס המצאות" היא איחוד: מילה שאינה באף אחד מהקלטים —
    // המצאה. זה נאכף כאן במלואו.
    const groundHay = [...evidence.map((e) => String(e.text || '')), assignmentText].join('\n');
    let anchored = 0;
    let content = 0;
    for (const s of r.sentences) {
      if (!s.evidenceId) continue; // משפט מטא/מעבר — לא נספר בעיגון
      content += 1;
      if (overlapAgainst(s.text, groundHay) >= 0.4) anchored += 1;
    }
    totContent += content;
    totAnchored += anchored;

    const usedSources = [...new Set(r.usedEvidenceIds
      .map((id) => evidence.find((e) => e.id === id))
      .filter(Boolean)
      .map((e) => e.sourceTitle))];

    secMetric.status = 'local-draft';
    secMetric.sentences = r.sentences.length;
    secMetric.wordCount = r.wordCount;
    secMetric.anchoredPct = content ? Math.round((anchored / content) * 100) : 0;
    secMetric.anchoredContentSentences = `${anchored}/${content}`;
    secMetric.detectorScore = Number.isFinite(r.authenticityScore) ? Math.round(r.authenticityScore) : null;
    secMetric.usedSources = usedSources;
    // ⚠️ `note` היחידה שנשמרה עד 27.7 הייתה **notes[0]**, וזו כמעט תמיד הערת
    // "הראיות נבחרו בדירוג יחסי" — בעוד שהערת המכסה נדחפת אחריה. האינווריאנטה
    // `quota-honesty` קוראת את `notes`, שלא היה קיים במדדים כלל, ולכן היא **לא
    // יכלה לעבור לעולם** בסעיף קצר: המנוע כתב «דרוש מקור נוסף — החומר מספיק
    // לכ-77 מילים מתוך 180» לתוך הטיוטה, וההרנס לא העביר את זה הלאה.
    // `note` נשמר לתצוגה; `notes` הוא מה שנבדק.
    secMetric.note = r.notes?.length ? r.notes[0] : null;
    secMetric.notes = Array.isArray(r.notes) ? r.notes : [];
    secMetric.fit = r.fitStats || null;
    totWords += r.wordCount;

    const head = u.parent ? `<h3>${escapeHtml(u.title.split(' — ').slice(-1)[0])}</h3>` : '';
    const openerHtml = openerText ? `<p>${escapeHtml(openerText)}</p>` : '';
    htmlParts.push(`${head}${openerHtml}${r.html}`);
    const plain = r.sentences.map((s) => s.text).join(' ');
    // ⚠️ שומר את **חלוקת הפסקאות** של המחבר. גרסה שהדביקה סעיף שלם לשורה אחת
    // גרמה למדד המבני לדווח 5 משפטים לפסקה — ארטיפקט של קובץ המדידה, לא הפלט.
    // ⚠️ נחתך לפני <hr/> — רשימת הערות השוליים חוזרת על שם המקור עשרות פעמים
    // מחוץ לסוגריים, ולכן היא הציפה את חתימת התווים ומחצה את גיוון אוצר המילים.
    // היא אינה פרוזה של המחבר ואין לה מקום במדידת סגנון.
    prosePartsForStyle.push(
      String(r.html || '')
        .split(/<hr\s*\/?>/i)[0]
        .split(/<\/p>/i)
        .map((p) => p.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>').replace(/\s+/g, ' ')
          .trim())
        .filter(Boolean)
        .join('\n\n') || plain,
    );
    txtParts.push(`### ${u.title}  (${r.wordCount}/${quota} מילים, עיגון ${secMetric.anchoredPct}%, דטקטור ${secMetric.detectorScore})`);
    if (openerText) txtParts.push(openerText);
    txtParts.push(plain);
    if (r.notes?.length) txtParts.push(r.notes.join(' '));
    txtParts.push('');
    metrics.sections.push(secMetric);
  }
}

metrics.totals = {
  units: metrics.sections.length,
  localDraft: metrics.sections.filter((s) => s.status === 'local-draft').length,
  blocked: totBlocked,
  totalWords: totWords,
  contentSentences: totContent,
  anchoredContentSentences: totAnchored,
  overallAnchoredPct: totContent ? Math.round((totAnchored / totContent) * 100) : 0,
  avgDetectorScore: (() => {
    const xs = metrics.sections.map((s) => s.detectorScore).filter((x) => Number.isFinite(x));
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  })(),
};

fs.writeFileSync(path.join(ROUND_DIR, 'draft.html'), `<!doctype html><meta charset="utf-8"><body dir="rtl">${htmlParts.join('\n')}</body>`, 'utf8');
fs.writeFileSync(path.join(ROUND_DIR, 'draft.txt'), txtParts.join('\n'), 'utf8');
fs.writeFileSync(path.join(ROUND_DIR, 'prose-only.txt'), prosePartsForStyle.join('\n\n'), 'utf8');
fs.writeFileSync(path.join(ROUND_DIR, 'metrics.json'), JSON.stringify(metrics, null, 2), 'utf8');
fs.writeFileSync(path.join(ROUND_DIR, 'evidence.json'), JSON.stringify({
  assignmentTitle: spec.title, citationStyle: spec.citationStyle, units: evidenceDump,
}, null, 2), 'utf8');

console.log('\n═══ סיכום הסבב ═══');
for (const s of metrics.sections) {
  const mark = s.status === 'local-draft' ? '✓' : '⛔';
  console.log(`${mark} ${s.id} [${s.intent}] ${s.status} · ${s.wordCount}/${s.quota} מ' · עיגון ${s.anchoredPct}% (${s.anchoredContentSentences || '-'}) · דטקטור ${s.detectorScore ?? '-'} · ${(s.usedSources || []).length} מקורות${s.fit?.commas || s.fit?.split ? ` · התאמה +${s.fit.commas}פסיק/${s.fit.split}פיצול` : ''}${s.note ? ` · ${s.note.slice(0, 34)}` : ''}`);
}
console.log(`\n${metrics.totals.localDraft}/${metrics.totals.units} יחידות נכתבו · ${metrics.totals.blocked} חסומות · ${metrics.totals.totalWords} מילים · עיגון כולל ${metrics.totals.overallAnchoredPct}% · דטקטור ממוצע ${metrics.totals.avgDetectorScore}`);
console.log(`פלט: ${ROUND_DIR}`);

if (ocrWorkerPromise) { try { await (await ocrWorkerPromise).terminate(); } catch {} }
process.exit(0);
