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
import { STYLE_EMBEDDING_SIGNATURE } from '../../src/services/styleEmbeddingService.js';
import { ensureMaterialsEmbedded, findEvidenceForSpec } from '../../src/services/evidenceMatchService.js';
import { ensureOpenersReady, composeSectionOpener } from '../../src/services/styleOpenerService.js';
import { addDocumentSamples, ensureSampleStoreReady, getSampleStoreStats } from '../../src/services/styleSampleStore.js';
import { ensureOpenerProfile, getOpenerProfile, getOpenerProfileStatus } from '../../src/services/openerProfileService.js';
import { ensureFrameProfile, getFrameProfile, getFrameProfileStatus } from '../../src/services/styleFrameProfileService.js';
import { scoreTextAuthenticity } from '../../src/services/styleAuthenticityService.js';
import { composeSectionProseBest, ensureProseReady } from '../../src/services/proseComposeService.js';

const CORPUS_DIR = process.env.WORDAI_SCAFFOLD_CORPUS
  || 'C:/Users/rotem/OneDrive/שולחן העבודה/314999533';
const SCRATCH = process.env.WORDAI_VERIFY_SCRATCH || '.';
const NLG_DIR = process.env.WORDAI_NLG_OUT
  || 'C:/Users/rotem/AppData/Local/Temp/claude/C--Users-rotem-Projects--wordai-new/d6d315a5-2b5d-475f-8fbf-41dd6f7dff16/scratchpad/nlg-loop';
const ROUND_DIR = path.join(NLG_DIR, 'round-1');
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
];

async function ingestCourse() {
  clearMaterialStore();
  let ocrCount = 0;
  const loaded = [];
  for (const name of COURSE_FILES) {
    const p = path.join(CORPUS_DIR, name);
    if (!fs.existsSync(p)) { console.log(`  ⚠ חסר: ${name}`); continue; }
    let { text, scanned, garbled } = await extractFile(p);
    if (scanned || garbled) { text = await ocrPdf(p); ocrCount += 1; }
    if (!String(text || '').trim()) continue;
    addMaterialDocument({ title: name.replace(/\.[^.]+$/, ''), text, source: 'nlg-loop', defer: true });
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

// שחזור וקטורים מ-cache של scaffold-e2e (ids לפי hash תוכן — תקפים לעד).
const VEC_CACHE = process.env.WORDAI_VEC_CACHE
  || path.join(path.dirname(OCR_CACHE_DIR), 'vec-cache.json');
if (fs.existsSync(VEC_CACHE)) {
  try {
    const cache = JSON.parse(fs.readFileSync(VEC_CACHE, 'utf8'));
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
  for (const c of blob.chunks) if (c.vec && c.vecSig === STYLE_EMBEDDING_SIGNATURE) vecs[c.id] = c.vec;
  try {
    fs.mkdirSync(path.dirname(VEC_CACHE), { recursive: true });
    fs.writeFileSync(VEC_CACHE, JSON.stringify({ signature: STYLE_EMBEDDING_SIGNATURE, vectors: vecs }), 'utf8');
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

// ---------- המטלה ----------
const assignmentText = fs.readFileSync(ASSIGNMENT_PATH, 'utf8');
const spec = parseAssignmentSpec(assignmentText);
console.log(`\nמטלה: "${spec.title}" · ${spec.sections.length} סעיפים · totalWords=${spec.totalWords} · ציטוט=${spec.citationStyle}`);

const specEvidence = await findEvidenceForSpec(spec, { k: 4 });

// יחידות עבודה: סעיף, ואם יש תתי-סעיפים — כל תת-סעיף (יורש intent/מסגרת מהאב).
const sections = spec.sections.filter((s) => s?.enabled !== false);
const usedOpeners = new Set();
const workUsedSentences = new Set();
const htmlParts = [`<h1>${escapeHtml(spec.title || 'מטלה')}</h1>`];
const txtParts = [`# ${spec.title || 'מטלה'}\n`];
const metrics = {
  round: 1,
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

let totWords = 0;
let totBlocked = 0;
let totAnchored = 0;
let totContent = 0;

for (const section of sections) {
  htmlParts.push(`<h2>${escapeHtml(section.title || section.id)}</h2>`);
  txtParts.push(`\n## ${section.title || section.id}\n`);
  for (const u of unitList(section)) {
    const res = specEvidence.bySection[u.id];
    // ל-composeSectionProse: הראיה חייבת לשאת .id (המנוע מעגן משפט לפי id). מקור
    // האמת הוא chunkId — ממפים כך שהעיגון (evidenceId) יהיה אמיתי.
    const evidence = (res?.evidence || []).map((e) => ({ ...e, id: e.chunkId ?? e.id }));
    const quota = u.wordQuota || 0;
    const openerText = composeSectionOpener({
      intent: u.intent, seedKey: u.id, profile: openerProfile,
      topic: u.title, framework: u.parent?.title,
      mustMention: u.mustMention?.length ? u.mustMention : (u.parent?.mustMention || section.mustMention),
      usedTexts: usedOpeners,
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
      const head = u.parent ? `<h3>${escapeHtml(u.title.split(' — ').slice(-1)[0])}</h3>` : '';
      htmlParts.push(`${head}<p><em>[סעיף חסום — ${escapeHtml(secMetric.note)}. לא נכתבת טיוטה: אין המצאה.]</em></p>`);
      txtParts.push(`### ${u.title}\n[חסום — ${secMetric.note}]\n`);
      metrics.sections.push(secMetric);
      continue;
    }

    const r = composeSectionProseBest(
      { ...u, keywords: u.keywords || section.keywords },
      evidence,
      { quotaWords: quota, seedKey: u.id, profile: frameProfile, sharedUsedSentences: workUsedSentences },
      { scoreFn: scoreTextAuthenticity, variants: 3 },
    );

    if (!r || !r.sentences?.length) {
      secMetric.status = 'blocked';
      secMetric.note = 'ראיות חלשות מדי (מתחת ל-zFloor) — לא נכתבה טיוטה';
      secMetric.filteredWeak = evidence.length;
      totBlocked += 1;
      const head = u.parent ? `<h3>${escapeHtml(u.title.split(' — ').slice(-1)[0])}</h3>` : '';
      htmlParts.push(`${head}<p><em>[סעיף חסום — ${escapeHtml(secMetric.note)}.]</em></p>`);
      txtParts.push(`### ${u.title}\n[חסום — ${secMetric.note}]\n`);
      metrics.sections.push(secMetric);
      continue;
    }

    // עיגון: לכל משפט תוכן, מקסימום חפיפה מול כל אחת מהראיות של הסעיף.
    let anchored = 0;
    let content = 0;
    for (const s of r.sentences) {
      if (!s.evidenceId) continue; // משפט מטא/מעבר — לא נספר בעיגון
      content += 1;
      const best = Math.max(...evidence.map((e) => overlapAgainst(s.text, e.text)));
      if (best >= 0.4) anchored += 1;
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
    secMetric.note = r.notes?.length ? r.notes[0] : null;
    totWords += r.wordCount;

    const head = u.parent ? `<h3>${escapeHtml(u.title.split(' — ').slice(-1)[0])}</h3>` : '';
    const openerHtml = openerText ? `<p>${escapeHtml(openerText)}</p>` : '';
    htmlParts.push(`${head}${openerHtml}${r.html}`);
    const plain = r.sentences.map((s) => s.text).join(' ');
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
fs.writeFileSync(path.join(ROUND_DIR, 'metrics.json'), JSON.stringify(metrics, null, 2), 'utf8');

console.log('\n═══ סיכום הסבב ═══');
for (const s of metrics.sections) {
  const mark = s.status === 'local-draft' ? '✓' : '⛔';
  console.log(`${mark} ${s.id} [${s.intent}] ${s.status} · ${s.wordCount}/${s.quota} מ' · עיגון ${s.anchoredPct}% (${s.anchoredContentSentences || '-'}) · דטקטור ${s.detectorScore ?? '-'} · ${(s.usedSources || []).length} מקורות${s.note ? ` · ${s.note.slice(0, 40)}` : ''}`);
}
console.log(`\n${metrics.totals.localDraft}/${metrics.totals.units} יחידות נכתבו · ${metrics.totals.blocked} חסומות · ${metrics.totals.totalWords} מילים · עיגון כולל ${metrics.totals.overallAnchoredPct}% · דטקטור ממוצע ${metrics.totals.avgDetectorScore}`);
console.log(`פלט: ${ROUND_DIR}`);

if (ocrWorkerPromise) { try { await (await ocrWorkerPromise).terminate(); } catch {} }
process.exit(0);
