// opener-profile.mjs — בדיקת האימון האישי: כרייה, מיזוג, ומשוב. אפס רשת.
//
// מה נבדק:
//   1. buildProfile על הקורפוס האמיתי מפיק מילות סלוט אישיות (לא ריק).
//   2. המיזוג משנה את ההרכבה: פתיחי global+profile ≠ global-only (באותו seed).
//   3. משוב accept מעלה משקל; reject לא יורד מתחת ל-0.
//   4. פירוק (decomposeOpener) לא מכניס מילות תוכן.
//
// הרצה: node tools/test-bench/run-opener-profile.mjs

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

globalThis.window = globalThis;
globalThis.self = globalThis;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k), clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { userAgent: 'node-lab', language: 'he' };
globalThis.addEventListener = globalThis.addEventListener || (() => {});

const samples = await import('stylesamples');
const openers = await import('openersvc');
const profileSvc = await import('../../src/services/openerProfileService.js');

const CORPUS = process.env.WORDAI_CORPUS_OUT
  || 'C:/Users/rotem/AppData/Local/Temp/claude/C--Users-rotem-Projects--wordai-new/5dfe23d5-acbf-4f96-9551-9997128f4b6f/scratchpad/real-corpus';

let fail = 0;
const say = (ok, msg) => { if (!ok) { fail += 1; console.error(`  ✗ ${msg}`); } };

// טעינת הקורפוס האמיתי — אותו מסלול כמו ב-labelset.
await samples.ensureSampleStoreReady();
const dir = path.join(CORPUS, 'finals');
const files = (await readdir(dir)).filter((f) => f.endsWith('.txt')).sort();
const seen = new Set();
for (const f of files) {
  const raw = await readFile(path.join(dir, f), 'utf8');
  const title = raw.split('\n', 1)[0].replace(/^#\s*/, '');
  const body = raw.split('\n').slice(2).join('\n').trim();
  const fp = body.replace(/\s+/g, '').slice(0, 400);
  if (!body || seen.has(fp)) continue;
  seen.add(fp);
  samples.addDocumentSamples({ title, text: body, source: 'real-finals' });
}
await openers.ensureOpenersReady();

// 1. בניית פרופיל
const profile = await profileSvc.ensureOpenerProfile();
say(Boolean(profile), 'הפרופיל לא נבנה');
const status = profileSvc.getOpenerProfileStatus();
console.log(`מסמכים: ${status.distinctDocs} · מילות סלוט אישיות: ${status.personalWords} · λ=${status.blendLambda.toFixed(2)}`);
say(status.personalWords > 0, 'הכרייה לא מצאה אף מילת סלוט אישית');

console.log('\nמילות הסלוט האישיות המובילות:');
Object.entries(profile?.slots || {}).forEach(([intent, slots]) => {
  Object.entries(slots).forEach(([slot, words]) => {
    const top = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([w, c]) => `${w}(${c})`).join(' · ');
    console.log(`  ${intent}/${slot}: ${top}`);
  });
});

// 2. המיזוג משפיע על ההרכבה (על פני כמה seeds — seed בודד יכול להתלכד במקרה)
let differs = false;
for (const seed of ['s1', 's2', 's3', 's4', 's5']) {
  const plain = openers.composeOpeners('conclusion', { count: 3, seedKey: seed }).map((o) => o.text).join('|');
  const blended = openers.composeOpeners('conclusion', { count: 3, seedKey: seed, profile }).map((o) => o.text).join('|');
  if (plain !== blended) { differs = true; break; }
}
say(status.blendLambda === 0 || differs, 'λ>0 אבל הפרופיל לא שינה שום הרכבה בחמישה seeds');

// 3. משוב
const composed = openers.composeOpeners('intro', { count: 1, seedKey: 'fb' })[0];
say(Boolean(composed), 'אין פתיח מורכב לבדוק עליו משוב');
if (composed) {
  const w = composed.slots.framingVerb;
  const before = profile.slots?.intro?.framingVerb?.[w] || 0;
  await profileSvc.recordOpenerFeedback({ intent: 'intro', slots: composed.slots, accepted: true });
  const after = profile.slots?.intro?.framingVerb?.[w] || 0;
  say(after === before + 2, `accept לא העלה משקל (${before}→${after})`);
  await profileSvc.recordOpenerFeedback({ intent: 'intro', slots: composed.slots, accepted: false });
  await profileSvc.recordOpenerFeedback({ intent: 'intro', slots: composed.slots, accepted: false });
  await profileSvc.recordOpenerFeedback({ intent: 'intro', slots: composed.slots, accepted: false });
  const floored = profile.slots?.intro?.framingVerb?.[w] || 0;
  say(floored >= 0, `reject ירד מתחת ל-0 (${floored})`);
}

// 4. פירוק לא מכניס תוכן: מילים בפרופיל חייבות להופיע בדקדוק
const grammar = await openers.ensureGrammarReady();
const grammarWords = new Set();
const eat = (arr) => (arr || []).forEach((e) => grammarWords.add(e.w));
eat(grammar.shared.connector); eat(grammar.shared.stance); eat(grammar.shared.hedge);
Object.values(grammar.intents).forEach((d) => {
  eat(d.slots.subjectNP); eat(d.slots.reference);
  eat(d.slots.framingVerb?.inf); eat(d.slots.framingVerb?.fin);
});
let alien = 0;
Object.values(profile?.slots || {}).forEach((slots) => Object.values(slots).forEach((words) => {
  Object.keys(words).forEach((w) => { if (!grammarWords.has(w)) alien += 1; });
}));
say(alien === 0, `${alien} מילים בפרופיל שאינן בדקדוק (דליפת תוכן?)`);

console.log(fail ? `\n${fail} בדיקות נכשלו` : '\nהכול ירוק ✓');
process.exit(fail ? 1 : 0);
