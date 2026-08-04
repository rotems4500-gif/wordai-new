// make-labeler.mjs — בונה עורך תיוג HTML עצמאי מתוך openers-candidates.json.
//
// למה קובץ מקומי ולא עמוד מתארח: השורות הן הכתיבה של המשתמש. אין סיבה שהן
// יעברו דרך שום שרת בשביל לסמן 52 תיבות.
//
// הרצה: node tools/test-bench/make-labeler.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ברירת המחדל היא אותה תיקייה ש-run-openers-labelset.mjs כותב אליה
// (tools/test-bench/lab-results/openers-labelset — gitignored). עוקפים ב-WORDAI_LABELSET_OUT.
const DIR = path.dirname(fileURLToPath(import.meta.url));
const IN_DIR = process.env.WORDAI_LABELSET_OUT
  || path.join(DIR, 'lab-results', 'openers-labelset');
const OUT = process.env.WORDAI_LABELER_OUT
  || 'C:/Users/rotem/OneDrive/שולחן העבודה/תיוג-פתיחים.html';
const PER_REJECT = Number(process.env.WORDAI_PER_REJECT || 25);

const rows = JSON.parse(await readFile(path.join(IN_DIR, 'openers-candidates.json'), 'utf8'));

// אותה דה-דופליקציה ואותה דגימה מאוזנת כמו ב-CSV, כדי ששני הקבצים יתארו את
// אותו סט. פריסה קבועה ולא אקראית — הרצה חוזרת נותנת אותו קובץ.
const uniq = new Map();
rows.forEach((r) => {
  const shown = r.opener || r.rawCandidate;
  const key = shown.toLowerCase();
  if (!uniq.has(key)) uniq.set(key, { ...r, shown, docsSeen: new Set() });
  uniq.get(key).docsSeen.add(r.docId);
});
const kept = [], rejected = new Map();
[...uniq.values()].forEach((r) => {
  if (!r.reject) { kept.push(r); return; }
  if (!rejected.has(r.reject)) rejected.set(r.reject, []);
  rejected.get(r.reject).push(r);
});
const sample = [...kept];
rejected.forEach((list) => {
  const step = Math.max(1, Math.floor(list.length / PER_REJECT));
  for (let i = 0; i < list.length && sample.length - kept.length < PER_REJECT * rejected.size; i += step) {
    sample.push(list[i]);
  }
});

const cards = sample.map((r, i) => ({
  i,
  text: r.shown,
  raw: r.rawCandidate === r.shown ? '' : r.rawCandidate,
  verdict: r.reject ? 'נפסל' : 'נשמר',
  reason: r.reject || '',
  intent: r.intent || '',
  docs: r.docs || r.docsSeen.size,
  para: r.paragraph || '',
  doc: [...r.docsSeen][0] || '',
}));

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>תיוג פתיחים</title>
<style>
  :root{
    --bg:#f6f6f4; --card:#fff; --ink:#1a1a19; --dim:#6b6b66; --line:#e2e2dd;
    --yes:#2f7d5d; --no:#a8442c; --skip:#8a7a3f;
  }
  @media (prefers-color-scheme:dark){
    :root{ --bg:#17171a; --card:#212126; --ink:#ececeb; --dim:#9a9a95; --line:#33333a;
           --yes:#4fae83; --no:#d4735a; --skip:#c0a95e; }
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
       font-family:"Segoe UI",system-ui,sans-serif;
       display:flex;flex-direction:column;min-height:100vh}
  header{padding:14px 20px;border-bottom:1px solid var(--line);
         display:flex;align-items:center;gap:16px;flex-wrap:wrap}
  h1{font-size:15px;margin:0;font-weight:600}
  .bar{flex:1;min-width:120px;height:5px;background:var(--line);border-radius:3px;overflow:hidden}
  .bar i{display:block;height:100%;background:var(--yes);width:0;transition:width .2s}
  .count{font-variant-numeric:tabular-nums;color:var(--dim);font-size:13px}
  main{flex:1;display:flex;align-items:center;justify-content:center;padding:24px 16px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;
        width:min(720px,100%);padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  .meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
  .tag{font-size:11px;padding:3px 9px;border-radius:20px;border:1px solid var(--line);color:var(--dim)}
  .tag.keep{color:var(--yes);border-color:var(--yes)}
  .tag.drop{color:var(--no);border-color:var(--no)}
  .opener{font-size:25px;line-height:1.5;font-weight:600;margin:0 0 16px}
  .raw{font-size:13px;color:var(--dim);border-inline-start:2px solid var(--line);
       padding-inline-start:10px;margin-bottom:16px;line-height:1.6}
  .raw b{font-weight:600;color:var(--ink)}
  .para{font-size:13px;color:var(--dim);line-height:1.7;max-height:120px;overflow-y:auto;
        border-top:1px solid var(--line);padding-top:14px}
  .btns{display:flex;gap:10px;margin-top:22px}
  button{flex:1;padding:13px;border-radius:10px;border:1px solid var(--line);
         background:transparent;color:var(--ink);font-size:14px;font-family:inherit;
         cursor:pointer;transition:.12s}
  button:hover{transform:translateY(-1px)}
  button kbd{display:block;font-size:10px;color:var(--dim);margin-top:3px;font-family:inherit}
  .yes{border-color:var(--yes);color:var(--yes)}
  .no{border-color:var(--no);color:var(--no)}
  .skip{border-color:var(--skip);color:var(--skip)}
  footer{padding:12px 20px;border-top:1px solid var(--line);display:flex;gap:10px;
         align-items:center;flex-wrap:wrap;font-size:12px;color:var(--dim)}
  footer button{flex:0 0 auto;padding:7px 14px;font-size:12px}
  .done{text-align:center}
  .done h2{font-size:20px;margin:0 0 10px}
  .tally{display:flex;gap:22px;justify-content:center;margin:20px 0;font-size:14px}
  .tally b{display:block;font-size:26px;font-variant-numeric:tabular-nums}
  textarea{width:100%;height:150px;margin-top:14px;font-family:ui-monospace,monospace;
           font-size:11px;background:var(--bg);color:var(--ink);
           border:1px solid var(--line);border-radius:8px;padding:10px;direction:ltr}
</style>
</head>
<body>
<header>
  <h1>תיוג פתיחים</h1>
  <div class="bar"><i id="prog"></i></div>
  <span class="count" id="count"></span>
</header>
<main><div id="stage"></div></main>
<footer>
  <button id="back">← אחורה</button>
  <button id="save">שמור קובץ</button>
  <button id="reset">התחל מחדש</button>
  <span id="hint">נשמר אוטומטית בדפדפן</span>
</footer>

<script>
const CARDS = ${JSON.stringify(cards)};
const KEY = 'wordai-opener-labels-v1';
let labels = {};
try { labels = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { labels = {}; }
let idx = CARDS.findIndex(c => labels[c.i] === undefined);
if (idx < 0) idx = CARDS.length;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

function persist() { try { localStorage.setItem(KEY, JSON.stringify(labels)); } catch (e) {} }

function payload() {
  return CARDS.map(c => ({
    opener: c.text, label: labels[c.i] ?? null,
    currentVerdict: c.verdict, reason: c.reason, docs: c.docs, intent: c.intent,
  }));
}

function render() {
  const done = Object.keys(labels).length;
  $('prog').style.width = (done / CARDS.length * 100) + '%';
  $('count').textContent = done + ' / ' + CARDS.length;

  if (idx >= CARDS.length) {
    const v = Object.values(labels);
    const n = (x) => v.filter(y => y === x).length;
    $('stage').innerHTML = '<div class="card done"><h2>סיימת</h2>' +
      '<div class="tally">' +
      '<div style="color:var(--yes)"><b>' + n('כ') + '</b>ניסוח</div>' +
      '<div style="color:var(--no)"><b>' + n('ל') + '</b>תוכן</div>' +
      '<div style="color:var(--skip)"><b>' + n('?') + '</b>לא בטוח</div>' +
      '</div><p style="color:var(--dim);font-size:13px">לחץ «שמור קובץ», או העתק מכאן:</p>' +
      '<textarea readonly onclick="this.select()">' + esc(JSON.stringify(payload())) + '</textarea></div>';
    return;
  }

  const c = CARDS[idx];
  $('stage').innerHTML = '<div class="card">' +
    '<div class="meta">' +
      '<span class="tag ' + (c.verdict === 'נשמר' ? 'keep' : 'drop') + '">' +
        c.verdict + (c.reason ? ' · ' + esc(c.reason) : '') + '</span>' +
      (c.intent ? '<span class="tag">' + esc(c.intent) + '</span>' : '') +
      '<span class="tag">' + c.docs + ' מסמכים</span>' +
    '</div>' +
    '<p class="opener">' + esc(c.text) + '</p>' +
    (c.raw ? '<div class="raw"><b>לפני הגזירה:</b> ' + esc(c.raw) + '</div>' : '') +
    (c.para ? '<div class="para">' + esc(c.para) + '</div>' : '') +
    '<div class="btns">' +
      '<button class="no"  data-v="ל">לא — תוכן/שם<kbd>← חץ שמאלה</kbd></button>' +
      '<button class="skip" data-v="?">לא בטוח<kbd>רווח</kbd></button>' +
      '<button class="yes" data-v="כ">כן — ניסוח שלי<kbd>חץ ימינה →</kbd></button>' +
    '</div></div>';
  [...document.querySelectorAll('[data-v]')].forEach(b =>
    b.onclick = () => mark(b.dataset.v));
}

function mark(v) {
  if (idx >= CARDS.length) return;
  labels[CARDS[idx].i] = v;
  persist(); idx++; render();
}

$('back').onclick = () => { if (idx > 0) { idx--; delete labels[CARDS[idx].i]; persist(); render(); } };
$('reset').onclick = () => { if (confirm('למחוק את כל התיוגים?')) { labels = {}; idx = 0; persist(); render(); } };
$('save').onclick = () => {
  const blob = new Blob([JSON.stringify(payload(), null, 1)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'opener-labels.json';
  a.click();
  $('hint').textContent = 'ירד לתיקיית ההורדות: opener-labels.json';
};

addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') { e.preventDefault(); mark('כ'); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); mark('ל'); }
  else if (e.key === ' ') { e.preventDefault(); mark('?'); }
  else if (e.key === 'Backspace') { e.preventDefault(); $('back').click(); }
});

render();
</script>
</body>
</html>`;

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, html, 'utf8');
console.log(`${cards.length} כרטיסים -> ${OUT}`);
