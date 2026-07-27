// rewrite-probe.mjs — שער הכשירות של שכבת הניסוח.
//
//   node tools/test-bench/rewrite-probe.mjs
//   WORDAI_REWRITE_MODEL=gemma3:4b   מודל לבדיקה
//
// ⚠️ קורא ל-**שירות הייצור** (localRewiteService) ולא לוגיקה משוכפלת, כדי שמה
// שנמדד כאן יהיה בדיוק מה שירוץ במנוע. הלוגיקה כאן היא רק הרכבת המקרים והדיווח.
//
// שלושת המדדים הם אלה שהמנוע נכשל בהם: עיגון, העתקה, ומענה-לשאלה (האם הישות
// שבשאלה מוזכרת). המדידה דטרמיניסטית — ראה הערת temperature בשירות.

import fs from 'node:fs';
import path from 'node:path';
import { rewriteGrounded, groundingRatio, copiedRatio } from '../../src/services/localRewriteService.js';

const ROUND = process.env.WORDAI_NLG_ROUND_DIR
  || path.join(process.cwd(), 'tools', 'test-bench', '.scaffolde2e-scratch', 'nlg', 'media-law');

// עובדות המטלה כפסקה — כפי שהמרצה כתב אותן. הגשה מובנית (טבלת ישויות/תפקידים)
// נוסתה ונפסלה: 7/16 מול 11/16. ר' ההסבר ב-localRewriteService.
const CASE = `משה, אמן מפורסם, התראיין בביתו לכתב התרבות יקיר מערוץ "ישראל שלנו". הצלם צילם תמונה של דליה, אשתו של משה, בבגד ים, והתמונה שולבה בשידור. הכתב יקיר ציין בכתבה שדליה חזרה בתשובה. בנוסף דיווח יקיר שאברהם, קבלן וחברו של משה, רכש יצירות אמנות בלי לדווח לרשויות המס, ותגובתו של אברהם לא הובאה.`;

const evPath = path.join(ROUND, 'evidence.json');
if (!fs.existsSync(evPath)) { console.log(`חסר ${evPath} — הרץ קודם run-nlg-loop-round`); process.exit(1); }
const ev = JSON.parse(fs.readFileSync(evPath, 'utf8'));

const STOP_Q = ['אילו', 'טענות', 'הגנה', 'עשוי', 'עשויה', 'עשויים', 'להעלות', 'משפטיות', 'נגד', 'ואת'];
const cases = [];
for (const [id, u] of Object.entries(ev.units || {})) {
  let n = 0;
  for (const e of (u.evidence || []).slice(0, 3)) {
    n += 1;
    cases.push({ id: `${id}/${n}`, question: u.title, source: e.text });
  }
}

console.log(`מודל: ${process.env.WORDAI_REWRITE_MODEL || 'gemma3:4b'} · ${cases.length} מקרים\n`);
let pass = 0; let retried = 0;
const times = [];

for (const c of cases) {
  const t0 = Date.now();
  const r = await rewriteGrounded({ question: c.question, caseFacts: CASE, source: c.source });
  const secs = (Date.now() - t0) / 1000;
  times.push(secs);

  if (!r) { console.log(`✗ [${c.id}] נדחה בשער · ${secs.toFixed(1)}s`); continue; }
  if (r.attempts > 1) retried += 1;

  const ents = (String(c.question).match(/[א-ת]{3,}/g) || []).filter((w) => !STOP_Q.includes(w));
  const hit = ents.some((e) => r.text.includes(e));
  const ok = hit;   // עיגון והעתקה כבר נאכפו בשירות; כאן נותר מענה-לשאלה
  if (ok) pass += 1;
  console.log(`${ok ? '✓' : '✗'} [${c.id}] עיגון ${(r.grounding * 100).toFixed(0)}% · מועתק ${(r.copied * 100).toFixed(0)}% · ישות ${hit ? 'כן' : 'לא'} · ניסיונות ${r.attempts} · ${secs.toFixed(1)}s`);
  console.log(`   ${r.text.slice(0, 220)}`);
}

const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
console.log(`\n─── ${pass}/${cases.length} עברו · ${retried} נדרשו ניסיון שני`);
console.log(`─── זמן ממוצע ${avg.toFixed(1)}s למשפט · לעבודה שלמה (~35 משפטים): ${Math.round((avg * 35) / 60)} דקות`);
