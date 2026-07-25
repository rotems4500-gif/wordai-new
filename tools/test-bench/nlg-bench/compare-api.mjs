// nlg-bench/compare-api.mjs — השוואה: מנוע מקומי (אפס API) מול מודל API,
// על אותה מטלה ו*אותן ראיות בדיוק*.
//
// שלושה תנאים:
//   local     — הפלט של nlg-loop-round (כבר קיים ב-round dir)
//   api-eq    — מודל API מקבל את אותן ראיות + הוראת כנות ("אל תמציא, סמן חוסר")
//   api-blind — מודל API מקבל רק את המטלה, בלי ראיות (בסיס-ההזיה)
//
// כל שלושת הפלטים נמדדים באותם מדדים: מילים, עיגון-בראיות, כנות-חסימה,
// מספרים-שלא-בראיות, כפילות. api-blind נמדד מול *אותו* מאגר ראיות שהוא לא ראה —
// כך רואים כמה ממה שכתב באמת נתמך בחומרי הקורס.
//
// הרצה:
//   node tools/test-bench/nlg-bench/compare-api.mjs [roundDir]
//   WORDAI_CMP_MODEL=gemini-2.5-pro   — מודל אחר (ברירת מחדל gemini-2.5-flash)
//   WORDAI_CMP_SKIP_BLIND=1           — רק הקרב ההוגן

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveGeminiApiKey, sleep } from '../../synonyms-build/lib.mjs';
import { groundingOverlap, garbleHit } from './invariants.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROUND_DIR = process.argv[2] || path.join(DIR, '.bench-out', 'bench-mill-2026-base');
const MODEL = process.env.WORDAI_CMP_MODEL || 'gemini-2.5-flash';
const ENDPOINT = (key) => `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;

async function callModel(apiKey, prompt, retried = false) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 16384 },
  };
  const res = await fetch(ENDPOINT(apiKey), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).catch((e) => { throw e; });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    if ((res.status === 429 || res.status >= 500) && !retried) { await sleep(15000); return callModel(apiKey, prompt, true); }
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
}

// ---------- מדידה ----------

const splitSentences = (t) => String(t).split(/(?<=[.!?])\s+|\n+/)
  .map((s) => s.replace(/\s+/g, ' ').trim())
  .filter((s) => s.split(' ').length >= 4);

// מספרים/שנים שמופיעים בטקסט אך לא באף ראיה — סמן המצאה קשיח.
function unsupportedNumbers(text, evidenceText) {
  const nums = [...new Set((String(text).match(/\b\d{2,4}(?:[.,]\d+)?%?\b/g) || []))];
  return nums.filter((n) => !String(evidenceText).includes(n.replace(/%$/, '')));
}

function measureUnit(unitText, unitEvidence) {
  const evTexts = (unitEvidence?.evidence || []).map((e) => e.text);
  const evJoined = evTexts.join('\n');
  const sents = splitSentences(unitText);
  const words = unitText.split(/\s+/).filter(Boolean).length;
  let anchored = 0;
  for (const s of sents) {
    const best = evTexts.length ? Math.max(...evTexts.map((t) => groundingOverlap(s, t))) : 0;
    if (best >= 0.4) anchored += 1;
  }
  return {
    words, sentences: sents.length,
    anchoredPct: sents.length ? Math.round((anchored / sents.length) * 100) : 0,
    unsupportedNums: unsupportedNumbers(unitText, evJoined),
    garble: sents.some((s) => garbleHit(s)),
    sents,
  };
}

const BLOCK_MARK = /\[חסום/;

/**
 * @param {Set<string>} weakUnits יחידות שהמנוע המקומי סירב לכתוב (ראיות מתחת לסף/
 *   gap). זו נקודת ההשוואה החשובה: מה עשה ה-API בדיוק שם.
 */
function measureRun(label, unitTexts, evidenceUnits, weakUnits) {
  const perUnit = {};
  let totWords = 0; let totSents = 0; let totAnchored = 0;
  let wroteOnWeak = 0; let weakWords = 0; let weakSents = 0; let weakAnchored = 0;
  const allSents = new Map(); let dups = 0;
  const badNums = [];

  for (const [id, ev] of Object.entries(evidenceUnits)) {
    const raw = (unitTexts[id] || '').trim();
    const declaredBlocked = !raw || BLOCK_MARK.test(raw);
    const txt = declaredBlocked ? '' : raw;
    const m = measureUnit(txt, ev);
    const weak = weakUnits.has(id);
    // "כתב על ראיות שהמנוע פסל" — מעל 25 מילים ביחידה שהמקומי סירב לה
    if (weak && m.words > 25) {
      wroteOnWeak += 1;
      weakWords += m.words; weakSents += m.sentences;
      weakAnchored += Math.round((m.anchoredPct / 100) * m.sentences);
    }
    totWords += m.words; totSents += m.sentences;
    totAnchored += Math.round((m.anchoredPct / 100) * m.sentences);
    badNums.push(...m.unsupportedNums.map((n) => `${id}:${n}`));
    for (const s of m.sents) { if (allSents.has(s)) dups += 1; else allSents.set(s, id); }
    perUnit[id] = { words: m.words, sentences: m.sentences, anchoredPct: m.anchoredPct, blocked: declaredBlocked, weak, garble: m.garble };
  }

  return {
    label,
    unitsWritten: Object.values(perUnit).filter((u) => !u.blocked && u.words > 0).length,
    totalWords: totWords,
    sentences: totSents,
    anchoredPct: totSents ? Math.round((totAnchored / totSents) * 100) : 0,
    weakUnits: weakUnits.size,
    wroteOnWeak,
    weakWords,
    weakAnchoredPct: weakSents ? Math.round((weakAnchored / weakSents) * 100) : null,
    unsupportedNumbers: [...new Set(badNums)],
    duplicateSentences: dups,
    garbleUnits: Object.values(perUnit).filter((u) => u.garble).length,
    perUnit,
  };
}

// ---------- פרומפטים ----------

function buildEqPrompt(evJson) {
  const units = Object.entries(evJson.units).map(([id, u]) => {
    const ev = (u.evidence || []).map((e, i) => `  [${e.id}] (${e.sourceTitle}) ${String(e.text).replace(/\s+/g, ' ').slice(0, 900)}`).join('\n');
    return `### יחידה ${id}\nכותרת: ${u.title}\nמכסה: ${u.quota} מילים\n`
      + (u.mustMention?.length ? `מונחי חובה: ${u.mustMention.join(', ')}\n` : '')
      + `ראיות זמינות:\n${ev || '  (אין ראיות)'}\n`;
  }).join('\n');
  return `אתה כותב עבודה אקדמית בעברית. עבור כל יחידה כתוב פסקה/ות בהיקף המכסה.

חוקי ברזל:
1. מותר להסתמך **אך ורק** על הראיות שסופקו ליחידה. אסור להוסיף עובדות, שמות, מספרים או ציטוטים שלא מופיעים בהן.
2. יחידה שסומנה "(אין ראיות)" — אל תכתוב לה תוכן. כתוב בדיוק: [חסום — אין מקורות]
3. אם הראיות לא מספיקות למכסה — כתוב מה שנתמך ואז [דרוש מקור נוסף]. אל תמלא מכסה בניפוח.
4. עברית אקדמית, בלי כותרות, בלי רשימות.

פורמט הפלט — לכל יחידה בדיוק:
[[SEC:<מזהה היחידה>]]
<הטקסט>

המטלה: ${evJson.assignmentTitle}

${units}`;
}

function buildBlindPrompt(evJson, assignmentText) {
  const units = Object.entries(evJson.units)
    .map(([id, u]) => `### יחידה ${id}\nכותרת: ${u.title}\nמכסה: ${u.quota} מילים${u.mustMention?.length ? `\nמונחי חובה: ${u.mustMention.join(', ')}` : ''}`)
    .join('\n\n');
  return `אתה כותב עבודה אקדמית בעברית לפי המטלה הבאה. כתוב לכל יחידה פסקה/ות בהיקף המכסה.
עברית אקדמית, בלי כותרות, בלי רשימות.

פורמט הפלט — לכל יחידה בדיוק:
[[SEC:<מזהה היחידה>]]
<הטקסט>

נוסח המטלה:
${String(assignmentText).slice(0, 4000)}

היחידות:
${units}`;
}

function parseMarked(text, ids) {
  const out = {};
  const re = /\[\[SEC:\s*([^\]\s]+)\s*\]\]/g;
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ id: m[1], start: m.index, end: re.lastIndex });
  for (let i = 0; i < marks.length; i += 1) {
    const body = text.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].start : undefined).trim();
    if (ids.includes(marks[i].id)) out[marks[i].id] = body;
  }
  return out;
}

// ---------- ריצה ----------

const evPath = path.join(ROUND_DIR, 'evidence.json');
if (!fs.existsSync(evPath)) {
  console.error(`חסר evidence.json ב-${ROUND_DIR}. הרץ קודם: npm run bench:nlg`);
  process.exit(1);
}
const evJson = JSON.parse(fs.readFileSync(evPath, 'utf8'));
const ids = Object.keys(evJson.units);
const assignmentText = fs.existsSync(path.join(ROUND_DIR, 'assignment.txt'))
  ? fs.readFileSync(path.join(ROUND_DIR, 'assignment.txt'), 'utf8') : '';

// היחידות שהמנוע המקומי סירב לכתוב — נקודת ההשוואה המרכזית.
const localMetrics = JSON.parse(fs.readFileSync(path.join(ROUND_DIR, 'metrics.json'), 'utf8'));
const weakUnits = new Set((localMetrics.sections || []).filter((s) => s.status === 'blocked').map((s) => s.id));

// local: מחלצים את טקסט היחידות מ-draft.txt לפי כותרות "### <title>"
const draft = fs.readFileSync(path.join(ROUND_DIR, 'draft.txt'), 'utf8');
const localUnits = {};
{
  const lines = draft.split('\n');
  let cur = null; let buf = [];
  const titleToId = new Map(Object.entries(evJson.units).map(([id, u]) => [u.title, id]));
  const flush = () => { if (cur) localUnits[cur] = buf.join('\n').trim(); buf = []; };
  for (const line of lines) {
    const h = line.match(/^###\s+(.*?)(?:\s{2,}\(.*\))?$/);
    if (h) { flush(); cur = titleToId.get(h[1].trim()) || null; continue; }
    if (line.startsWith('## ') || line.startsWith('# ')) { flush(); cur = null; continue; }
    if (cur) buf.push(line);
  }
  flush();
}
// שורות מטא של ההרנס (מקורות קרובים / הערות) אינן פרוזה — מסירים למדידה הוגנת.
// סמן [חסום] נשמר: הוא ההצהרה של המנוע "לא כתבתי", ונמדד כמו סירוב של ה-API.
for (const id of ids) {
  const kept = String(localUnits[id] || '').split('\n')
    .filter((l) => !/^מקורות קרובים|^\[דרוש מקור/.test(l.trim()));
  const blocked = kept.some((l) => /^\[חסום/.test(l.trim()));
  localUnits[id] = blocked ? '[חסום]' : kept.join('\n').trim();
}

const { key: apiKey, source: keySource } = await resolveGeminiApiKey();
if (!apiKey) { console.error('אין מפתח Gemini (env/DPAPI/keys.local.json)'); process.exit(1); }

console.log(`מודל השוואה: ${MODEL} · מפתח: ${keySource} · יחידות: ${ids.length} · round: ${path.basename(ROUND_DIR)}\n`);

// REUSE=1 — מדידה מחדש על פלטי API שכבר נשמרו (בלי לשלם שוב)
const REUSE = process.env.WORDAI_CMP_REUSE === '1';
const cached = (name) => {
  const p = path.join(ROUND_DIR, name);
  return REUSE && fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};

let eqRaw = cached('api-eq.txt');
if (eqRaw) console.log('api-eq: שימוש בפלט שמור');
else {
  console.log('api-eq: שולח את אותן ראיות בדיוק…');
  eqRaw = await callModel(apiKey, buildEqPrompt(evJson));
  fs.writeFileSync(path.join(ROUND_DIR, 'api-eq.txt'), eqRaw, 'utf8');
}
const eqUnits = parseMarked(eqRaw, ids);

let blindUnits = null;
if (process.env.WORDAI_CMP_SKIP_BLIND !== '1') {
  let blindRaw = cached('api-blind.txt');
  if (blindRaw) console.log('api-blind: שימוש בפלט שמור');
  else {
    console.log('api-blind: שולח את המטלה בלי ראיות…');
    blindRaw = await callModel(apiKey, buildBlindPrompt(evJson, assignmentText));
    fs.writeFileSync(path.join(ROUND_DIR, 'api-blind.txt'), blindRaw, 'utf8');
  }
  blindUnits = parseMarked(blindRaw, ids);
}

const runs = [
  measureRun('מקומי (אפס API)', localUnits, evJson.units, weakUnits),
  measureRun(`API ${MODEL} — אותן ראיות`, eqUnits, evJson.units, weakUnits),
];
if (blindUnits) runs.push(measureRun(`API ${MODEL} — בלי ראיות`, blindUnits, evJson.units, weakUnits));

const pad = (s, n) => String(s).padEnd(n);
console.log('\n═══ השוואה ═══');
console.log(pad('מדד', 26) + runs.map((r) => pad(r.label.slice(0, 26), 28)).join(''));
const row = (name, fn) => console.log(pad(name, 26) + runs.map((r) => pad(fn(r), 28)).join(''));
row('יחידות שנכתבו', (r) => `${r.unitsWritten}/${ids.length}`);
row('מילים סה"כ', (r) => r.totalWords);
row('משפטים', (r) => r.sentences);
row('עיגון בראיות %', (r) => `${r.anchoredPct}%`);
row(`כתב ביחידות שנפסלו (${runs[0].weakUnits})`, (r) => `${r.wroteOnWeak} · ${r.weakWords} מ' · עיגון ${r.weakAnchoredPct ?? '-'}%`);
row('מספרים ללא תימוכין', (r) => r.unsupportedNumbers.length);
row('משפטים כפולים', (r) => r.duplicateSentences);
row('יחידות עם ג\'יבריש', (r) => r.garbleUnits);

console.log('\nלפי יחידה (מילים · עיגון%) — ⚠ = ראיות שהמנוע פסל:');
for (const id of ids) {
  const cells = runs.map((r) => {
    const u = r.perUnit[id];
    return pad(u?.blocked ? '[חסום]' : `${u?.words ?? 0}מ' ${u?.anchoredPct ?? 0}%`, 28);
  }).join('');
  console.log(pad(`${id} ${weakUnits.has(id) ? '⚠' : '📚'}`, 26) + cells);
}

const out = { model: MODEL, roundDir: ROUND_DIR, generatedAt: new Date().toISOString(), runs };
fs.writeFileSync(path.join(ROUND_DIR, 'compare-api.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(`\nפלט: ${ROUND_DIR}\\{api-eq.txt, api-blind.txt, compare-api.json}`);
