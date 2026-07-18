// ============================================================================
// style-tag-route-unit.mjs — offline smoke for tagStyleSample → Style Engine routing.
//   npx vite build --config vite.verify.config.mjs   (עם WORDAI_VERIFY_ENTRY=styletag)
//   node <scratch>/verify/out-sf/sf.mjs
// ============================================================================

globalThis.window = globalThis;
globalThis.self = globalThis;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

import { tagStyleSample } from 'styleauth';
import { getSampleStoreStats } from 'stylesamples';

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`  ok ${name}`);
  else { failures += 1; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

const TEXT_40W = 'זהו קטע ניסיוני שנועד לבדוק את מנגנון תיוג הסגנון האישי במערכת. הטקסט הזה כולל ארבעים מילים בערך כדי לעבור את סף האורך המינימלי שנדרש הן לגלאי האותנטיות והן למאגר הדוגמאות של מנוע הסגנון האישי החדש שנבנה לאחרונה בפרויקט.';

function setProfile(obj) {
  store.set('wordai_personal_style', JSON.stringify(obj));
}

console.log('\n[1] engine ON + kind=desired → gold chunk added + stale flag set');
store.clear();
setProfile({ styleEngine: { enabled: true } });
const r1 = tagStyleSample(TEXT_40W, 'desired');
check('tagStyleSample ok', r1.ok === true, JSON.stringify(r1));
const stats1 = getSampleStoreStats();
check('gold chunk added', stats1.goldCount === 1, JSON.stringify(stats1));
const profileAfter1 = JSON.parse(store.get('wordai_personal_style'));
check('qualitativePatternsStale set', profileAfter1?.styleEngine?.qualitativePatternsStale === true, JSON.stringify(profileAfter1.styleEngine));
check('legacy preferredTrainingExamples still written', Array.isArray(profileAfter1.preferredTrainingExamples) && profileAfter1.preferredTrainingExamples.length === 1, JSON.stringify(profileAfter1.preferredTrainingExamples));

console.log('\n[2] engine ON + kind=ai → no gold chunk');
store.clear();
setProfile({ styleEngine: { enabled: true } });
const r2 = tagStyleSample(TEXT_40W, 'ai');
check('tagStyleSample ok', r2.ok === true, JSON.stringify(r2));
const stats2 = getSampleStoreStats();
check('no gold chunk added', stats2.goldCount === 0, JSON.stringify(stats2));

console.log('\n[3] engine OFF + kind=desired → no gold chunk, legacy still written');
store.clear();
setProfile({ styleEngine: { enabled: false } });
const r3 = tagStyleSample(TEXT_40W, 'desired');
check('tagStyleSample ok', r3.ok === true, JSON.stringify(r3));
const stats3 = getSampleStoreStats();
check('no gold chunk added (engine off)', stats3.goldCount === 0, JSON.stringify(stats3));
const profileAfter3 = JSON.parse(store.get('wordai_personal_style'));
check('legacy preferredTrainingExamples still written (engine off)', Array.isArray(profileAfter3.preferredTrainingExamples) && profileAfter3.preferredTrainingExamples.length === 1, JSON.stringify(profileAfter3.preferredTrainingExamples));

console.log('\n[4] engine ON + kind=desired + short text (<25 words) → no gold chunk (still under too-short cutoff so ok:false)');
store.clear();
setProfile({ styleEngine: { enabled: true } });
const r4 = tagStyleSample('קצר מדי', 'desired');
check('too-short rejected', r4.ok === false && r4.reason === 'too-short', JSON.stringify(r4));

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
