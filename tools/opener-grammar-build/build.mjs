// tools/opener-grammar-build/build.mjs — בונה את דקדוק הפתיחים הגלובלי.
//
// שלושה מקורות, סדר אמון יורד:
//   1. seed-grammar.json — גרעין ידני, תמיד ממוזג. רצפת האיכות.
//   2. תיוג Flash של הלקסיקון (5,724 lemmas) — מרחיב סלוטים. חד-פעמי, אגורות.
//   3. כלום — גם בלי תיוג, ה-seed לבדו מפיק מודול עובד.
//
// פלט: tools/opener-grammar-build/grammar.json + src/services/openerGrammar.data.js
// (אותה קונבנציה כמו synonymsLexicon.data.js: מודול סטטי, lazy import, אפס רשת).
//
// הרצה:
//   node tools/opener-grammar-build/build.mjs                # ממשיך מ-checkpoint
//   node tools/opener-grammar-build/build.mjs --fresh        # תיוג מאפס
//   node tools/opener-grammar-build/build.mjs --limit 5      # N אצוות בלבד
//   node tools/opener-grammar-build/build.mjs --emit-only    # בלי רשת: seed+checkpoint → מודול
//
// מפתח: DPAPI / env / keys.local.json — דרך resolveGeminiApiKey של synonyms-build.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveGeminiApiKey, callGemini, stripJsonFences, sleep, exists,
} from '../synonyms-build/lib.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');
const SEED_PATH = path.join(DIR, 'seed-grammar.json');
const CHECKPOINT = path.join(DIR, 'checkpoint.json');
const GRAMMAR_OUT = path.join(DIR, 'grammar.json');
const MODULE_OUT = path.join(PROJECT, 'src', 'services', 'openerGrammar.data.js');
const LEXICON = path.join(DIR, '..', 'synonyms-build', 'lexicon.json');

const INTENTS = ['intro', 'review', 'analysis', 'comparison', 'argument', 'method', 'findings', 'conclusion', 'exposition'];
const SLOTS = ['connector', 'stance', 'framingVerb', 'reference', 'hedge', 'subjectNP'];
const BATCH = 100;
const CAP_PER_SLOT = 40;   // תקרת bundle: מעבר לזה המודול מתנפח בלי רווח איכות

const args = process.argv.slice(2);
const FRESH = args.includes('--fresh');
const EMIT_ONLY = args.includes('--emit-only');
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

// ── קלט ──────────────────────────────────────────────────────────────────
const seed = JSON.parse(await readFile(SEED_PATH, 'utf8'));

let checkpoint = { done: [], tagged: [] };
if (!FRESH && (await exists(CHECKPOINT))) {
  try { checkpoint = JSON.parse(await readFile(CHECKPOINT, 'utf8')); } catch {}
}

// ── תיוג Flash ────────────────────────────────────────────────────────────
// הפרומפט שמרני בכוונה: רוב המילים לא שייכות לשום סלוט, ו"לא" הוא התיוג הנפוץ
// והנכון. false-positive כאן = מילת תוכן שתישתל בכל פתיח של כל משתמש.
const PROMPT_HEAD = `אתה מתייג מילים עבריות לדקדוק "פתיחי פסקה אקדמיים" — משפטי פתיחה ניטרליים מתוכן שכל סטודנט יכול לפתוח בהם סעיף.

הסלוטים:
- connector: מילת קישור פותחת משפט ("לסיכום,", "יתרה מזאת,")
- stance: אימפרסונל עמדה ("ניתן", "ראוי", "חשוב")
- framingVerb/inf: שם פועל מסגרתי נטול תוכן ("לבחון", "להציג")
- framingVerb/fin: פועל נטוי מסגרתי ("מלמדים", "תבחן") — חובה לציין g (m/f) ו-n (s/p)
- subjectNP: צירוף שמני גנרי לפתיחת סעיף ("עבודה זו", "הממצאים") — חובה g/n
- hedge: מרכך ("ככל הנראה,")

כללים קשיחים:
1. רוב המילים אינן שייכות לשום סלוט — החזר להן [] . זו התשובה הנפוצה והנכונה.
2. פסול כל מילה נושאת תוכן: שמות, מונחי דומיין, מספרים, מילים נדירות.
3. reg: 2=אקדמי, 1=ניטרלי, 0=דיבורי/לא מתאים.
4. לפעלים: tails = אילו המשכים המילה מקבלת מתוך: את, ב, ל, כ, על, בין, כי, ש, מתוך, באמצעות.
5. intents מתוך: ${INTENTS.join(', ')}.

החזר JSON בלבד: [{"w":"<מילה>","slots":[{"slot":"framingVerb","form":"fin","g":"m","n":"p","intents":["findings"],"reg":2,"tails":["כי"]}]}, {"w":"<מילה>","slots":[]}, ...]

המילים:
`;

if (!EMIT_ONLY) {
  const lexicon = JSON.parse(await readFile(LEXICON, 'utf8'));
  const lemmas = Object.keys(lexicon).filter((w) => /^[א-ת]/.test(w));
  const doneSet = new Set(checkpoint.done);
  const todo = lemmas.filter((w) => !doneSet.has(w));
  console.log(`lemmas: ${lemmas.length} · נותרו לתיוג: ${todo.length}`);

  if (todo.length) {
    const { key, source } = await resolveGeminiApiKey();
    if (!key) {
      console.error('אין מפתח Gemini (env / DPAPI / keys.local.json). אפשר --emit-only.');
      process.exit(1);
    }
    console.log(`מפתח: ${source}`);

    let batches = 0;
    for (let i = 0; i < todo.length && batches < LIMIT; i += BATCH, batches += 1) {
      const words = todo.slice(i, i + BATCH);
      const prompt = PROMPT_HEAD + words.join('\n');
      try {
        const raw = await callGemini(key, prompt);
        const parsed = JSON.parse(stripJsonFences(raw));
        const rows = Array.isArray(parsed) ? parsed : [];
        rows.forEach((r) => {
          if (!r || typeof r.w !== 'string') return;
          const slots = (Array.isArray(r.slots) ? r.slots : []).filter((s) => (
            s && SLOTS.includes(s.slot) && Number(s.reg) >= 1
            && (Array.isArray(s.intents) ? s.intents.every((x) => INTENTS.includes(x)) : false)
          ));
          if (slots.length) checkpoint.tagged.push({ w: r.w.trim(), slots });
        });
        checkpoint.done.push(...words);
        await writeFile(CHECKPOINT, JSON.stringify(checkpoint), 'utf8');
        const hits = checkpoint.tagged.length;
        console.log(`  אצווה ${Math.floor(i / BATCH) + 1}/${Math.ceil(todo.length / BATCH)} · תיוגים מצטבר: ${hits}`);
      } catch (e) {
        console.warn(`  אצווה נכשלה (${e.message.slice(0, 120)}) — ממשיך; תרוץ שוב ב-resume`);
      }
      await sleep(1200);   // free-tier RPM
    }
  }
}

// ── גיזום לפי השופט ───────────────────────────────────────────────────────
// validate.mjs כותב validate-report.json; מילה שנפסלה שם לא נכנסת למודול.
// בנוסף: stance הוא מחלקה סגורה — התיוג האוטומטי מרעיש אותה ("בעקבות", "דרוש"
// כ-stance נמדדו בפועל), לכן stance מגיע מה-seed בלבד.
// נמדד בשופט המשפטים המלאים: connectors אוטומטיים ("על מנת", "בפני", "מתוך ש")
// שברו דקדוקיות מ-95% ל-69%. שלוש המחלקות הסגורות מגיעות מה-seed בלבד.
const CLOSED_SLOTS = new Set(['stance', 'connector', 'hedge']);
// מילים שהשופט המלא פסל בהרכבות אמיתיות (openers-judge): פועל שגוי לתפקיד,
// משלב לא אקדמי, או צירוף שבור.
const BLOCKLIST = new Set(['העריך', 'ביקר', 'נחשבת', 'נחשב', 'להתרשם', 'ללמד', 'לשפר', 'לשלב', 'מבטא', 'להשפיע', 'לגלות', 'הסכים', 'מבסס', 'לצמצם', 'להתברר', 'מצביע', 'לחדש', 'חקר', 'לפתח']);
let judgedBad = new Set();
if (await exists(path.join(DIR, 'validate-report.json'))) {
  try {
    const report = JSON.parse(await readFile(path.join(DIR, 'validate-report.json'), 'utf8'));
    Object.entries(report.bySlot || {}).forEach(([slotKey, r]) => {
      (r.bad || []).forEach(({ w }) => judgedBad.add(`${slotKey.split('/')[0]}|${w}`));
    });
    console.log(`גיזום לפי השופט: ${judgedBad.size} מילים פסולות`);
  } catch {}
}
// צורת פני-שטח אחת בעברית נושאת {g,n} אחד. תיוג שמייחס לאותה מילה כמה צירופי
// תכונות ("הדגים" בתור m/s וגם f/p) הוא הזיה שיטתית של המתייג — נמדד בפועל,
// והיא בדיוק מה ששבר את ההתאם בהרצה הראשונה. מילה סותרת נזרקת כולה.
const featSeen = new Map();
const conflicted = new Set();
checkpoint.tagged.forEach(({ w, slots }) => slots.forEach((s) => {
  if (s.slot !== 'framingVerb' || s.form !== 'fin') return;
  const k = `${w}`;
  const feats = `${s.g}|${s.n}`;
  if (featSeen.has(k) && featSeen.get(k) !== feats) conflicted.add(k);
  featSeen.set(k, feats);
}));
if (conflicted.size) console.log(`תכונות סותרות (נזרקות): ${[...conflicted].join(', ')}`);

checkpoint.tagged = checkpoint.tagged.map(({ w, slots }) => ({
  w,
  slots: slots.filter((s) => !CLOSED_SLOTS.has(s.slot)
    && !BLOCKLIST.has(w)
    && !judgedBad.has(`${s.slot}|${w}`)
    && !(s.slot === 'framingVerb' && conflicted.has(w))),
})).filter((t) => t.slots.length);

// ── מיזוג: seed (אמון מלא) + tagged (מסונן) ──────────────────────────────
const grammar = structuredClone(seed);
delete grammar._comment;

const keyOf = (e) => `${e.w}|${e.g || ''}|${e.n || ''}`;
const existing = new Set();
const collect = (arr) => (arr || []).forEach((e) => existing.add(keyOf(e)));
collect(grammar.shared.connector); collect(grammar.shared.stance); collect(grammar.shared.hedge);
INTENTS.forEach((it) => {
  const s = grammar.intents[it]?.slots;
  if (!s) return;
  collect(s.subjectNP); collect(s.reference);
  collect(s.framingVerb?.inf); collect(s.framingVerb?.fin);
});

let added = 0;
for (const { w, slots } of checkpoint.tagged) {
  for (const s of slots) {
    const entry = { w, reg: s.reg ?? 1 };
    if (s.g) entry.g = s.g;
    if (s.n) entry.n = s.n;
    if (Array.isArray(s.tails) && s.tails.length) entry.tails = s.tails;
    if (existing.has(keyOf(entry))) continue;

    if (s.slot === 'connector' || s.slot === 'stance' || s.slot === 'hedge') {
      const list = grammar.shared[s.slot];
      if (list.length >= CAP_PER_SLOT * 2) continue;
      if (s.slot === 'connector') entry.intents = s.intents;
      list.push(entry); existing.add(keyOf(entry)); added += 1;
      continue;
    }
    for (const it of s.intents) {
      const slotDefs = grammar.intents[it]?.slots;
      if (!slotDefs) continue;
      let list;
      if (s.slot === 'framingVerb') {
        const form = s.form === 'fin' ? 'fin' : 'inf';
        if (form === 'fin' && (!s.g || !s.n)) continue;   // fin בלי תכונות = לא שמיש
        list = slotDefs.framingVerb[form];
      } else {
        if (s.slot === 'subjectNP' && (!s.g || !s.n)) continue;
        list = slotDefs[s.slot];
        if (!list) continue;
      }
      if (list.length >= CAP_PER_SLOT) continue;
      list.push(entry); existing.add(keyOf(entry)); added += 1;
    }
  }
}
console.log(`מיזוג: ${checkpoint.tagged.length} תיוגים · ${added} נוספו מעבר ל-seed`);

await writeFile(GRAMMAR_OUT, JSON.stringify(grammar, null, 1), 'utf8');

// ── emit המודול ───────────────────────────────────────────────────────────
const banner = `// openerGrammar.data.js — דקדוק הפתיחים הגלובלי. קובץ מיוצר — לא לערוך ידנית.
// נבנה ע"י tools/opener-grammar-build/build.mjs מ-seed-grammar.json + תיוג Flash אופליין.
// נטען lazy (import()) ע"י styleOpenerService.composeOpeners — אפס רשת בזמן ריצה.
`;
const js = `${banner}export const OPENER_GRAMMAR_VERSION = 1;\nexport const OPENER_GRAMMAR = ${JSON.stringify(grammar)};\n`;
await writeFile(MODULE_OUT, js, 'utf8');

const kb = (Buffer.byteLength(js) / 1024).toFixed(1);
console.log(`\n-> ${GRAMMAR_OUT}`);
console.log(`-> ${MODULE_OUT} (${kb}KB)`);
