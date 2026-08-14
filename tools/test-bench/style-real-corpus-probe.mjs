// style-real-corpus-probe.mjs — מריץ את **כל** צינור למידת הסגנון על הקורפוס האמיתי
// של המשתמש (העבודות הסופיות ב-OneDrive), מול ספק LLM אמיתי, ושופך dump מלא.
//
// למה: הבדיקות ב-style-learning-loop-unit.mjs דטרמיניסטיות ועובדות על פיקסטורות.
// כאן רוצים לראות מה המנוע *באמת* מחלץ מ-36 עבודות אקדמיות בעברית, כדי לאתר
// פערים לוגיים (סוגי דפוסים ריקים, blacklist בסדר הפוך, חתימה מבנית חסרה וכו').
//
// בידוד: אין כאן שום כתיבה למצב האמיתי של האפליקציה. localStorage הוא Map בזיכרון,
// indexedDB לא קיים ב-Node ⇒ styleKvStore.isIdbAvailable()===false ⇒ כל הכתיבות
// נופלות ל-localStorage המזויף. הקורפוס נקרא read-only. ה-config של הספק מגיע
// דרך WORDAI_CFG (env) ונכתב רק ל-localStorage המזויף.
//
// הרצה: node tools/test-bench/run-style-real-corpus.mjs

// ---------- browser shims (חייבים לקדום לכל import של שירות) ----------
const lsStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
  setItem: (k, v) => lsStore.set(k, String(v)),
  removeItem: (k) => lsStore.delete(k),
  clear: () => lsStore.clear(),
  key: (i) => [...lsStore.keys()][i] ?? null,
  get length() { return lsStore.size; },
};
globalThis.window = globalThis;
globalThis.self = globalThis;
if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { userAgent: 'node-styleprobe', language: 'he' };
globalThis.document = {
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }),
  createTextNode: () => ({}),
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  body: { appendChild() {}, removeChild() {} }, documentElement: { style: {} }, hidden: false,
};
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
globalThis.dispatchEvent = globalThis.dispatchEvent || (() => true);
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent { constructor(type, opts = {}) { this.type = type; this.detail = opts.detail; } };
}

// ---------- מונה קריאות רשת ל-LLM ----------
// כולל את Ollama המקומי — בלי זה ריצה שנופלת ל-ollama נראית כאילו לא נעשתה בה אף קריאה.
const LLM_PATTERN = /generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|api\.groq\.com|api\.perplexity\.ai|openrouter\.ai|localhost:11434|127\.0\.0\.1:11434|\/api\/(chat|generate)\b/i;
const WIRE = [];
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const isLlm = LLM_PATTERN.test(url);
    const t0 = Date.now();
    let status = 0;
    let err = '';
    try {
      const res = await realFetch(input, init);
      status = res?.status || 0;
      return res;
    } catch (e) {
      err = String(e?.message || e);
      throw e;
    } finally {
      if (isLlm) {
        WIRE.push({
          url: url.replace(/(key=)[^&]+/i, '$1***'),
          status,
          ms: Date.now() - t0,
          err,
          bodyChars: String(init?.body || '').length,
        });
      }
    }
  };
}

import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';

// ---------- מודולים אמיתיים (דינמי — אחרי ה-shims) ----------
const ai = await import('../../src/services/aiService.js');
const ingest = await import('../../src/services/styleIngestService.js');
const samples = await import('../../src/services/styleSampleStore.js');
const targetsStore = await import('../../src/services/styleTargetsStore.js');
const styleProfile = await import('../../src/services/styleProfileService.js');

const {
  buildStyleEngineInjectionBlock,
  buildExternalPatternAnalysisPrompt,
  normalizeStyleEngine,
  PATTERN_TYPE_LABELS,
} = styleProfile;

// ---------- dump plumbing ----------
const DUMP_PATH = process.env.WORDAI_STYLE_DUMP
  || 'C:/Users/rotem/AppData/Local/Temp/claude/C--Users-rotem-Projects--wordai-new/9000b713-d10b-4431-a93f-d2b319c7c29b/scratchpad/style-real-corpus-dump.txt';
const DUMP = [];
const FAILURES = [];
// out = לקובץ בלבד · both = לקובץ ולמסך
const out = (line = '') => { DUMP.push(String(line)); };
const both = (line = '') => { DUMP.push(String(line)); console.log(String(line)); };
const hdr = (title) => {
  const bar = '═'.repeat(Math.max(10, 74 - title.length));
  both('');
  both(`═══ ${title} ${bar}`);
};
const j = (v) => { try { return JSON.stringify(v, null, 2); } catch { return String(v); } };
const round2 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : v);
const roundObj = (o) => {
  if (!o || typeof o !== 'object') return o;
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    r[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? roundObj(v) : round2(v);
  }
  return r;
};
const wordCount = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
const fail = (step, msg) => { FAILURES.push(`${step}: ${msg}`); both(`  ⚠️ ${step} — ${msg}`); };

const T0 = Date.now();
out(`# style-real-corpus-probe · ${new Date().toISOString()}`);

// ---------- 0. ספק ----------
hdr('0. ספק LLM');
let providerLabel = '(none)';
let availability = null;
if (process.env.WORDAI_CFG) {
  localStorage.setItem('ai_provider_config', process.env.WORDAI_CFG);
  try { ai.hydrateProviderConfigFromDisk?.(); } catch {}
}
try { providerLabel = ai.getActiveProviderName?.() || '(none)'; } catch (e) { fail('getActiveProviderName', String(e?.message || e)); }
try { availability = ai.getExternalAnalysisAvailability?.() || null; } catch (e) { fail('getExternalAnalysisAvailability', String(e?.message || e)); }
both(`ספק פעיל: ${providerLabel}`);
both(`זמינות לניתוח: ${j(availability)}`);
const HAS_PROVIDER = Boolean(availability?.hasLocalProvider);
if (!HAS_PROVIDER) fail('provider', 'אין ספק מוגדר — כל שלבי ה-LLM ידווחו no-provider (השלבים המקומיים ירוצו)');
let cheapModel = '';
try { cheapModel = ai.resolveCheapModelForProvider?.(availability?.processingProviderId || '') || ''; } catch {}
both(`מודל זול לחילוץ: ${cheapModel || '(ברירת מחדל של הספק)'}`);

// הסכמת למידה + מנוע פעיל — בדיוק כמו משתמש אמיתי שהפעיל את המנוע.
try {
  ai.savePersonalStyleProfile({
    ...ai.getPersonalStyleProfile(),
    learningConsent: true,
    styleEngine: { ...(ai.getPersonalStyleProfile()?.styleEngine || {}), enabled: true },
  });
} catch (e) { fail('savePersonalStyleProfile(init)', String(e?.message || e)); }

// ---------- 1. טעינת הקורפוס ----------
hdr('1. טעינת הקורפוס (READ-ONLY)');
const CORPUS_DIR = process.env.WORDAI_STYLE_CORPUS
  || 'C:/Users/rotem/OneDrive/שולחן העבודה/314999533/עבודות והגשות/עבודות סופיות';
both(`תיקייה: ${CORPUS_DIR}`);

const MIN_WORDS = Number(process.env.WORDAI_STYLE_MIN_WORDS || 400);
let entries = [];
try {
  entries = (await readdir(CORPUS_DIR)).filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$')).sort();
} catch (e) {
  fail('readdir', String(e?.message || e));
}
both(`קבצי .docx שנמצאו: ${entries.length} (קובצי .pdf מדולגים בכוונה)`);

const docs = [];
const skippedShort = [];
const failedRead = [];
out('');
out('שם קובץ | תווים | מילים | סטטוס');
out('-'.repeat(90));
for (const f of entries) {
  let text = '';
  try {
    const buf = await readFile(path.join(CORPUS_DIR, f));
    text = String((await mammoth.extractRawText({ buffer: buf }))?.value || '');
  } catch (e) {
    failedRead.push({ f, e: String(e?.message || e) });
    out(`${f} | - | - | ✗ קריאה נכשלה: ${String(e?.message || e)}`);
    continue;
  }
  const w = wordCount(text);
  if (w < MIN_WORDS) {
    skippedShort.push({ f, w });
    out(`${f} | ${text.length} | ${w} | ⊘ דולג (< ${MIN_WORDS} מילים)`);
    continue;
  }
  docs.push({ name: f, text });
  out(`${f} | ${text.length} | ${w} | ✓`);
}
both(`נטענו: ${docs.length} · דולגו כקצרים: ${skippedShort.length} · כשלי קריאה: ${failedRead.length}`);
if (skippedShort.length) both(`  קצרים: ${skippedShort.map((s) => `${s.f} (${s.w})`).join(' · ')}`);
if (failedRead.length) both(`  כשלים: ${failedRead.map((s) => `${s.f} — ${s.e}`).join(' · ')}`);
if (!docs.length) fail('corpus', 'לא נטען אף מסמך — כל השלבים הבאים יהיו ריקים');

// ---------- 2. ingest ----------
hdr('2. ingestText — קליטה לקורפוס האמיתי של המנוע');
await samples.ensureSampleStoreReady();
await targetsStore.ensureStyleTargetsReady();
let added = 0;
let skippedDup = 0;
out('');
out('מסמך | docId | chunks שנוספו');
out('-'.repeat(90));
for (const d of docs) {
  let res = null;
  try {
    res = ingest.ingestText({ title: d.name.replace(/\.docx$/i, ''), text: d.text, source: 'upload' });
  } catch (e) {
    fail('ingestText', `${d.name} — ${String(e?.message || e)}`);
    continue;
  }
  if (res?.docId) {
    added += 1;
    // ingestText יורה addStyleTargetDoc כ-fire-and-forget; כאן מחכים לו בפועל
    // (אותו docId ⇒ אידמפוטנטי) כדי שהיעדים המבניים יהיו מוכנים לדump.
    try { await targetsStore.addStyleTargetDoc(d.text, { docId: res.docId }); } catch (e) { fail('addStyleTargetDoc', String(e?.message || e)); }
  } else {
    skippedDup += 1;
  }
  out(`${d.name} | ${res?.docId || '(דולג/כפילות)'} | ${res?.added ?? 0}`);
}
const stats = samples.getSampleStoreStats();
both(`מסמכים שנוספו: ${added} · דולגו (כפילות/ריק): ${skippedDup}`);
both(`stats: ${j(stats)}`);
if (samples.getSampleStoreWriteError?.()) fail('sampleStore', `write error: ${samples.getSampleStoreWriteError()}`);

// ---------- 3. מדדים מקומיים ----------
hdr('3. recomputeMetricsFromStore — engine.metrics / metricsSpread');
let engine = null;
try {
  engine = ingest.recomputeMetricsFromStore();
} catch (e) {
  fail('recomputeMetricsFromStore', String(e?.message || e));
}
both(`metrics (${Object.keys(engine?.metrics || {}).length} מפתחות):`);
both(j(roundObj(engine?.metrics || {})));
both(`metricsSpread (${Object.keys(engine?.metricsSpread || {}).length} מפתחות):`);
both(j(roundObj(engine?.metricsSpread || {})));
out(`metricsEligibleDocCount: ${engine?.metricsEligibleDocCount}`);
out(`confidence אחרי מדדים: ${j(engine?.confidence)}`);
if (!engine?.metrics || !Object.keys(engine.metrics).length) fail('metrics', 'engine.metrics ריק');

// ---------- 4. יעדים מבניים ----------
hdr('4. styleTargets — היעדים המבניים');
try { await targetsStore.flushStyleTargets(); } catch {}
const targets = targetsStore.getStyleTargets();
const tStatus = targetsStore.getStyleTargetsStatus();
both(`status: ${j(tStatus)}`);
if (!targets) {
  fail('styleTargets', 'getStyleTargets() החזיר null');
} else {
  const { commaSlots, spread, ...scalar } = targets;
  both(`יעדים: ${j(roundObj(scalar))}`);
  both(`spread: ${j(roundObj(spread))}`);
  both('משמורות פסיק (rate / total):');
  const slotRows = Object.entries(commaSlots || {}).sort((a, b) => (b[1]?.total || 0) - (a[1]?.total || 0));
  slotRows.forEach(([id, v]) => both(`   ${String(id).padEnd(22)} rate=${round2(v?.rate)}  total=${v?.total}`));
  if (!slotRows.length) fail('commaSlots', 'אין משמורות פסיק');
}
// הרשומות הגולמיות — פר-מסמך
try {
  const blob = targetsStore.exportStyleTargets();
  out('');
  out(`רשומות מדידה (${blob?.records?.length || 0}):`);
  (blob?.records || []).forEach((r) => out(`   ${r.docId} · sentLen=${round2(r.sentLen)} commaPerSent=${round2(r.commaPerSent)} subordination=${round2(r.subordination)} paraSents=${round2(r.paraSents)} words=${r.words} blocks=${r.blocks}`));
} catch (e) { fail('exportStyleTargets', String(e?.message || e)); }

// ---------- 5. embeddings (צפוי להיכשל ב-Node) ----------
hdr('5. computeChunkEmbeddings — שכבת ה-WASM (מותר להיכשל)');
let embRes = null;
try {
  embRes = await ingest.computeChunkEmbeddings({ force: false });
  both(`תוצאה: ${j(embRes)}`);
  if (!embRes?.available) both('  → getRepresentativeExcerpts ייפול ל-stride fallback (תקין וצפוי ב-Node).');
} catch (e) {
  both(`נפל: ${String(e?.message || e)}`);
  both('  → getRepresentativeExcerpts ייפול ל-stride fallback (תקין וצפוי ב-Node).');
  FAILURES.push(`computeChunkEmbeddings: threw — ${String(e?.message || e)} (מותר)`);
}

// ---------- 6. חילוץ דפוסים עמוק מול ספק אמיתי ----------
hdr('6. runQualitativeAnalysis({force:true}) — חילוץ multi-batch מול הספק');
const wireBefore6 = WIRE.length;
const t6 = Date.now();
let qa = null;
try {
  qa = await ingest.runQualitativeAnalysis({ force: true });
} catch (e) {
  fail('runQualitativeAnalysis', String(e?.message || e));
}
both(`תוצאה: skipped=${qa?.skipped} reason=${qa?.reason || '-'} · ${Math.round((Date.now() - t6) / 1000)}s · קריאות LLM: ${WIRE.length - wireBefore6}`);

const eng6 = qa?.engine || normalizeStyleEngine(ai.getPersonalStyleProfile()?.styleEngine);

// 6a — דפוסים לפי סוג
const patterns = Array.isArray(eng6?.qualitativePatterns) ? eng6.qualitativePatterns : [];
both(`\nסה"כ דפוסים: ${patterns.length}`);
const byType = new Map();
patterns.forEach((p) => {
  const t = String(p?.type || '(ללא סוג)');
  if (!byType.has(t)) byType.set(t, []);
  byType.get(t).push(p);
});
const NEW_TYPES = ['citation', 'argument_move', 'transition'];
both('התפלגות לפי סוג:');
[...byType.entries()].sort((a, b) => b[1].length - a[1].length)
  .forEach(([t, list]) => both(`   ${String(t).padEnd(18)} ${String(list.length).padStart(3)}  ${PATTERN_TYPE_LABELS?.[t] || ''}`));
both('\nשלושת הסוגים החדשים:');
NEW_TYPES.forEach((t) => {
  const n = (byType.get(t) || []).length;
  both(`   ${t.padEnd(15)} ${n}${n === 0 ? '   ✗ ריק' : ''}`);
  if (n === 0) FAILURES.push(`pattern type '${t}': 0 דפוסים`);
});

out('');
out('כל הדפוסים, מקובצים לפי סוג:');
for (const [t, list] of [...byType.entries()].sort((a, b) => b[1].length - a[1].length)) {
  out('');
  out(`── ${t} (${list.length}) ${PATTERN_TYPE_LABELS?.[t] ? `— ${PATTERN_TYPE_LABELS[t]}` : ''}`);
  list.forEach((p, i) => {
    out(`  ${String(i + 1).padStart(2)}. label: ${p?.label}`);
    out(`      weight: ${round2(p?.weight)} · mined: ${p?.mined === true} · id: ${p?.id}`);
    out(`      evidence: ${typeof p?.evidence === 'string' ? p.evidence : j(p?.evidence)}`);
    const extra = Object.keys(p || {}).filter((k) => !['label', 'type', 'weight', 'evidence', 'mined', 'id'].includes(k));
    if (extra.length) out(`      שדות נוספים: ${j(Object.fromEntries(extra.map((k) => [k, p[k]])))}`);
  });
}
// 5 הדפוסים החזקים גם למסך
both('\n5 הדפוסים במשקל הגבוה ביותר:');
patterns.slice(0, 5).forEach((p) => both(`   [${p?.type}] ${p?.label} (w=${round2(p?.weight)}${p?.mined ? ', mined' : ''})`));

// 6b — negativeSpace
hdr('6b. engine.negativeSpace');
both(j(eng6?.negativeSpace || []));
if (!eng6?.negativeSpace?.length) FAILURES.push('negativeSpace: ריק');

// 6c — structuralSignature
hdr('6c. engine.structuralSignature (5 מפתחות)');
const SIG_KEYS = ['opening', 'closing', 'thesisPlacement', 'sectionFlow', 'firstPersonUsage'];
const sig = eng6?.structuralSignature || {};
SIG_KEYS.forEach((k) => {
  const v = String(sig[k] ?? '');
  both(`   ${k.padEnd(18)} ${v ? v : '✗ ריק'}`);
  if (!v.trim()) FAILURES.push(`structuralSignature.${k}: ריק`);
});

// 6d — blacklist.auto — 25 הראשונים בסדר
hdr('6d. engine.blacklist.auto — 25 הראשונים לפי סדר');
const auto = Array.isArray(eng6?.blacklist?.auto) ? eng6.blacklist.auto : [];
const CLICHES = new Set((styleProfile.AI_CLICHE_BLACKLIST || []).map((c) => String(c).trim()));
both(`אורך auto: ${auto.length} · user: ${eng6?.blacklist?.user?.length || 0} · removed: ${eng6?.blacklist?.removed?.length || 0}`);
auto.slice(0, 25).forEach((p, i) => both(`   ${String(i + 1).padStart(2)}. ${CLICHES.has(String(p).trim()) ? '[קלישאה גנרית]' : '[נלמד]     '} ${p}`));
const learnedInTop25 = auto.slice(0, 25).filter((p) => !CLICHES.has(String(p).trim())).length;
both(`מתוך 25 הראשונים: ${learnedInTop25} נלמדו, ${25 - learnedInTop25} קלישאות גנריות`);
if (learnedInTop25 === 0) FAILURES.push('blacklist.auto: אין ולו ביטוי נלמד אחד ב-25 הראשונים');
out('');
out(`blacklist.auto מלא (${auto.length}):`);
auto.forEach((p, i) => out(`   ${String(i + 1).padStart(2)}. ${p}`));

// 6e — extractionMeta + confidence
hdr('6e. engine.extractionMeta + confidence');
both(j(eng6?.extractionMeta || {}));
both(`confidence: ${j(eng6?.confidence || {})}`);

// ---------- 7. פרופיל עמוק ----------
hdr('7. deriveStyleProfileFromSamples — חילוץ הפרופיל העמוק');
const wireBefore7 = WIRE.length;
let deep = null;
try {
  deep = await ingest.deriveStyleProfileFromSamples();
} catch (e) {
  fail('deriveStyleProfileFromSamples', String(e?.message || e));
}
both(`reason: ${deep?.reason || '(ריק = הצלחה)'} · קריאות LLM: ${WIRE.length - wireBefore7}`);
both(`filled (${deep?.filled?.length || 0}): ${j(deep?.filled || [])}`);
out('');
out('patch מלא:');
const patch = deep?.patch || {};
if (!Object.keys(patch).length) {
  out('  (ריק)');
  FAILURES.push('deriveStyleProfileFromSamples: patch ריק');
}
Object.entries(patch).forEach(([k, v]) => {
  out(`  ${k}: ${typeof v === 'string' ? v : j(v)}`);
});
both(`patch: ${Object.keys(patch).length} שדות — ${Object.keys(patch).join(', ') || '(ריק)'}`);
// ⚠️ הפאץ' מוצג בלבד. לא נשמר לפרופיל — הבדיקה לא מדמה משתמש שאישר.

// ---------- 8. ז'אנרים ----------
hdr('8. classifyPendingGenres — ז\'אנר לכל מסמך');
const wireBefore8 = WIRE.length;
let genres = null;
try {
  genres = await ingest.classifyPendingGenres();
} catch (e) {
  fail('classifyPendingGenres', String(e?.message || e));
}
both(`classified: ${genres?.classified ?? 0} · קריאות LLM: ${WIRE.length - wireBefore8}`);
const docList = samples.getSampleDocuments();
const genreCount = new Map();
out('');
out('מסמך → ז\'אנר');
docList.forEach((d) => {
  const g = d?.genre || '(null)';
  genreCount.set(g, (genreCount.get(g) || 0) + 1);
  out(`   ${String(d?.title || d?.id).slice(0, 60).padEnd(62)} ${g}`);
});
both('התפלגות ז\'אנרים:');
[...genreCount.entries()].sort((a, b) => b[1] - a[1]).forEach(([g, n]) => both(`   ${String(g).padEnd(20)} ${n}`));
if (genreCount.size <= 1 && genreCount.has('אחר')) FAILURES.push("classifyPendingGenres: כל המסמכים סווגו 'אחר'");

// מדדים מחדש אחרי סיווג — כדי לראות genreProfiles
let engAfterGenres = null;
try { engAfterGenres = ingest.recomputeMetricsFromStore(); } catch (e) { fail('recompute(after genres)', String(e?.message || e)); }
both(`genreProfiles: ${Object.keys(engAfterGenres?.genreProfiles || {}).join(', ') || '(אין — נדרשים ≥3 מסמכים לז\'אנר)'}`);
out(`genreProfiles מלא: ${j(roundObj(engAfterGenres?.genreProfiles || {}))}`);

// ---------- 9. בלוק ההזרקה ----------
hdr('9. buildStyleEngineInjectionBlock — הבלוק שנכנס לכל פרומפט');
const engFinal = normalizeStyleEngine(ai.getPersonalStyleProfile()?.styleEngine);
let block = '';
try {
  block = String(buildStyleEngineInjectionBlock(engFinal, { seed: 'probe-seed' }) || '');
} catch (e) {
  fail('buildStyleEngineInjectionBlock', String(e?.message || e));
}
both(`אורך: ${block.length} תווים · ${wordCount(block)} מילים`);
both('');
both('┌──────────── BLOCK (includeStructure: true) ────────────');
block.split('\n').forEach((l) => both(`│ ${l}`));
both('└────────────────────────────────────────────────────────');
if (!block.trim()) FAILURES.push('buildStyleEngineInjectionBlock: ריק');

let blockNoStruct = '';
try {
  blockNoStruct = String(buildStyleEngineInjectionBlock(engFinal, { seed: 'probe-seed', includeStructure: false }) || '');
} catch (e) { fail('buildStyleEngineInjectionBlock(no-structure)', String(e?.message || e)); }
out('');
out(`── BLOCK (includeStructure: false) · ${blockNoStruct.length} תווים · ${wordCount(blockNoStruct)} מילים ──`);
out(blockNoStruct);
both(`\nגרסת includeStructure:false — ${blockNoStruct.length} תווים (הפרש ${block.length - blockNoStruct.length})`);

// ---------- 10. הפרומפט החיצוני ----------
hdr('10. buildExternalPatternAnalysisPrompt — מה שהמשתמש מעתיק לצ\'אטבוט');
let excerpts3 = [];
try { excerpts3 = ingest.getRepresentativeExcerpts({ max: 3, maxChars: 2000 }) || []; } catch (e) { fail('getRepresentativeExcerpts', String(e?.message || e)); }
both(`קטעים מייצגים: ${excerpts3.length} · ${excerpts3.join('').length} תווים`);
if (!excerpts3.length) FAILURES.push('getRepresentativeExcerpts: ריק');
let extPrompt = '';
try {
  extPrompt = String(buildExternalPatternAnalysisPrompt({
    profile: ai.getPersonalStyleProfile(),
    engine: engFinal,
    excerpts: excerpts3,
  }) || '');
} catch (e) { fail('buildExternalPatternAnalysisPrompt', String(e?.message || e)); }
both(`אורך הפרומפט: ${extPrompt.length} תווים · ${wordCount(extPrompt)} מילים`);
out('');
out('┌──────────── EXTERNAL PROMPT ────────────');
extPrompt.split('\n').forEach((l) => out(`│ ${l}`));
out('└─────────────────────────────────────────');

// ---------- 11. סיכום ----------
hdr('11. SUMMARY');
const overview = (() => { try { return ingest.getStyleOverview(); } catch { return null; } })();
const summary = [
  `ספק: ${providerLabel} (${availability?.processingProviderId || '-'}) · מודל זול: ${cheapModel || '-'}`,
  `קבצי docx בתיקייה: ${entries.length} · נטענו: ${docs.length} · דולגו קצרים: ${skippedShort.length} · כשלי קריאה: ${failedRead.length}`,
  `מסמכים בקורפוס: ${overview?.stats?.docCount ?? '?'} · chunks: ${overview?.stats?.chunkCount ?? '?'} · מילים: ${overview?.stats?.totalWords ?? '?'}`,
  `metrics keys: ${Object.keys(engine?.metrics || {}).length} · metricsEligibleDocCount: ${engAfterGenres?.metricsEligibleDocCount ?? engine?.metricsEligibleDocCount}`,
  `styleTargets: ${targets ? `docCount=${targets.docCount} sentLen=${round2(targets.sentLen)} commaPerSent=${round2(targets.commaPerSent)} paraSents=${round2(targets.paraSents)}` : 'null'}`,
  `embeddings: available=${embRes?.available === true} reason=${embRes?.reason || '-'}`,
  `דפוסים: ${patterns.length} (citation=${(byType.get('citation') || []).length} argument_move=${(byType.get('argument_move') || []).length} transition=${(byType.get('transition') || []).length})`,
  `negativeSpace: ${eng6?.negativeSpace?.length || 0} · blacklist.auto: ${auto.length} (נלמדו ב-25 הראשונים: ${learnedInTop25})`,
  `structuralSignature מפתחות מלאים: ${SIG_KEYS.filter((k) => String(sig[k] || '').trim()).length}/5`,
  `deep profile: reason='${deep?.reason || ''}' patchFields=${Object.keys(patch).length} filled=${deep?.filled?.length || 0}`,
  `ז'אנרים: classified=${genres?.classified ?? 0} · ${[...genreCount.entries()].map(([g, n]) => `${g}:${n}`).join(' ')}`,
  `בלוק הזרקה: ${block.length} תווים / ${wordCount(block)} מילים · פרומפט חיצוני: ${extPrompt.length} תווים`,
  `קריאות LLM בסה"כ: ${WIRE.length} (הצלחות ${WIRE.filter((w) => w.status >= 200 && w.status < 300).length} · שגיאות ${WIRE.filter((w) => w.status >= 400 || w.err).length})`,
  `זמן ריצה: ${Math.round((Date.now() - T0) / 1000)}s`,
];
summary.forEach((l) => both(`· ${l}`));

both('');
both(`שלבים שנכשלו/דורדרו (${FAILURES.length}):`);
if (!FAILURES.length) both('   (אין)');
FAILURES.forEach((f) => both(`   ✗ ${f}`));

out('');
out('── קריאות LLM (wire log) ──');
WIRE.forEach((w, i) => out(`  ${String(i + 1).padStart(2)}. status=${w.status} ${w.ms}ms body=${w.bodyChars}ch ${w.err ? `ERR=${w.err}` : ''} ${w.url}`));

// ---------- כתיבת ה-dump ----------
await mkdir(path.dirname(DUMP_PATH), { recursive: true });
await writeFile(DUMP_PATH, DUMP.join('\n'), 'utf8');
both('');
both(`📄 dump מלא נכתב ל: ${DUMP_PATH} (${DUMP.length} שורות)`);
both('🔒 בידוד: localStorage=Map בזיכרון · indexedDB לא קיים ב-Node · לא נכתב דבר ל-%APPDATA%/com.wordai.assistant · הקורפוס נקרא בלבד.');
