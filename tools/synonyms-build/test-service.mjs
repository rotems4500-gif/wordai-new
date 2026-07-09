// test-service.mjs — בדיקות למנוע הנרדפות המקומי (Node טהור, ללא API).
// מזריק fixture לקסיקון דרך __setLexiconForTests ומריץ תרחישים.
//   node tools/synonyms-build/test-service.mjs

import assert from 'node:assert';
import {
  getSynonymSuggestions,
  analyzeHebrewWord,
  isHebrewWord,
  __setLexiconForTests,
} from '../../src/services/synonymsService.js';

// ---------------------------------------------------------------------------
// Fixture lexicon
// ---------------------------------------------------------------------------
const FIXTURE = {
  // sense יחיד
  'הסכם': [
    [['חוזה', 'ברית', 'אמנה'], ['משפט', 'צדדים', 'חתימה']],
  ],
  // רבים: base singular
  'חוזה': [
    [['הסכם', 'התקשרות', 'מסמך'], ['משפט', 'עסקה']],
  ],
  // שני sense-ים לצורך disambiguation
  'עמוד': [
    [['טור', 'עמודה'], ['טקסט', 'ספר', 'דף']],       // sense-1: עמוד בטקסט
    [['תורן', 'מוט', 'עמוד תווך'], ['בניין', 'גשר', 'תמיכה']], // sense-2: עמוד תמיכה
  ],
};

__setLexiconForTests(FIXTURE);

// ---------------------------------------------------------------------------
// עזרי הרצה
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    results.push(`  FAIL  ${name}\n        ${err && err.message}`);
  }
}

const texts = (arr) => arr.map((s) => s.text);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

await test('exact lemma hit returns synonyms', async () => {
  const out = await getSynonymSuggestions({ word: 'הסכם', sentence: '' });
  assert.ok(out.length > 0, 'expected non-empty suggestions');
  assert.ok(texts(out).includes('חוזה'), `expected חוזה in ${JSON.stringify(texts(out))}`);
});

await test('prefix: והסכם → suggestions prefixed with ו', async () => {
  const out = await getSynonymSuggestions({ word: 'והסכם', sentence: '' });
  assert.ok(out.length > 0, 'expected non-empty suggestions');
  assert.ok(texts(out).includes('וחוזה'), `expected וחוזה in ${JSON.stringify(texts(out))}`);
  // כל ההצעות צריכות להתחיל ב-ו
  assert.ok(out.every((s) => s.text.startsWith('ו')), 'all suggestions should start with ו');
});

await test('plural: חוזים → base synonym gets ים with final-letter fix', async () => {
  const out = await getSynonymSuggestions({ word: 'חוזים', sentence: '' });
  assert.ok(out.length > 0, 'expected non-empty suggestions');
  // הבסיס "הסכם" (מסתיים ב-ם סופית) → definalize + ים → "הסכמים"
  assert.ok(texts(out).includes('הסכמים'), `expected הסכמים in ${JSON.stringify(texts(out))}`);
});

await test('context disambiguation: sense-2 keyword ranks sense-2 first', async () => {
  const out = await getSynonymSuggestions({
    word: 'עמוד',
    sentence: 'העמוד תומך בגשר של הבניין',
  });
  assert.ok(out.length > 0, 'expected non-empty suggestions');
  // sense-2 keywords: בניין/גשר/תמיכה → sense-2 synonyms ראשונים
  const first = out[0].text;
  assert.ok(
    ['תורן', 'מוט', 'עמוד תווך'].includes(first),
    `expected a sense-2 synonym first, got ${first} in ${JSON.stringify(texts(out))}`,
  );
});

await test('context disambiguation: sense-1 keyword ranks sense-1 first', async () => {
  const out = await getSynonymSuggestions({
    word: 'עמוד',
    sentence: 'העמוד הראשון בספר מלא טקסט',
  });
  const first = out[0].text;
  assert.ok(
    ['טור', 'עמודה'].includes(first),
    `expected a sense-1 synonym first, got ${first}`,
  );
});

await test('no match → []', async () => {
  const out = await getSynonymSuggestions({ word: 'מילהשאיננה', sentence: '' });
  assert.deepStrictEqual(out, []);
});

await test('dedupe of original word / lemma', async () => {
  const out = await getSynonymSuggestions({ word: 'הסכם', sentence: '' });
  assert.ok(!texts(out).includes('הסכם'), 'original word must not appear in suggestions');
});

await test('analyzeHebrewWord strips prefix ו', async () => {
  const a = analyzeHebrewWord('והסכם');
  assert.strictEqual(a.core, 'והסכם');
  assert.ok(
    a.candidates.some((c) => c.lemma === 'הסכם' && c.prefix === 'ו'),
    `expected candidate {הסכם, ו} in ${JSON.stringify(a.candidates)}`,
  );
});

await test('analyzeHebrewWord strips plural suffix ים', async () => {
  const a = analyzeHebrewWord('חוזים');
  assert.ok(
    a.candidates.some((c) => c.lemma === 'חוז' && c.suffix === 'ים'),
    `expected candidate {חוז, ים} in ${JSON.stringify(a.candidates)}`,
  );
});

await test('isHebrewWord basic', async () => {
  assert.strictEqual(isHebrewWord('הסכם'), true);
  assert.strictEqual(isHebrewWord('א'), false);
  assert.strictEqual(isHebrewWord('hello'), false);
  assert.strictEqual(isHebrewWord(''), false);
});

await test('empty lexicon → []', async () => {
  __setLexiconForTests({});
  const out = await getSynonymSuggestions({ word: 'הסכם', sentence: '' });
  assert.deepStrictEqual(out, []);
  __setLexiconForTests(FIXTURE); // restore
});

// ---------------------------------------------------------------------------
// שכבת קהילה (communitySynonymsService)
// ---------------------------------------------------------------------------
const { __setCommunityForTests } = await import('../../src/services/communitySynonymsService.js');

await test('community-only hit: word missing from lexicon still returns contribution', async () => {
  __setCommunityForTests(new Map([
    ['מגדלור', [{ id: 'c1', synonym: 'מאור', contextWords: [], status: 'pending' }]],
  ]));
  const out = await getSynonymSuggestions({ word: 'מגדלור', sentence: '' });
  assert.ok(texts(out).includes('מאור'), `expected מאור in ${JSON.stringify(texts(out))}`);
  __setCommunityForTests(null);
});

await test('community merge: contribution appears alongside lexicon synonyms', async () => {
  __setCommunityForTests(new Map([
    ['הסכם', [{ id: 'c2', synonym: 'מזכר', contextWords: [], status: 'approved' }]],
  ]));
  const out = await getSynonymSuggestions({ word: 'הסכם', sentence: '' });
  const t = texts(out);
  assert.ok(t.includes('חוזה'), `expected lexicon חוזה in ${JSON.stringify(t)}`);
  assert.ok(t.includes('מזכר'), `expected community מזכר in ${JSON.stringify(t)}`);
  __setCommunityForTests(null);
});

await test('community with prefix: והסכם → contribution gets ו prefix', async () => {
  __setCommunityForTests(new Map([
    ['הסכם', [{ id: 'c3', synonym: 'מזכר', contextWords: [], status: 'pending' }]],
  ]));
  const out = await getSynonymSuggestions({ word: 'והסכם', sentence: '' });
  assert.ok(texts(out).includes('ומזכר'), `expected ומזכר in ${JSON.stringify(texts(out))}`);
  __setCommunityForTests(null);
});

await test('lexicon sense with real context match outranks cold community entry', async () => {
  __setCommunityForTests(new Map([
    ['עמוד', [{ id: 'c4', synonym: 'כרכוב', contextWords: [], status: 'pending' }]],
  ]));
  const out = await getSynonymSuggestions({ word: 'עמוד', sentence: 'העמוד תומך בגשר של הבניין' });
  assert.ok(
    ['תורן', 'מוט', 'עמוד תווך'].includes(out[0].text),
    `expected context-matched lexicon synonym first, got ${out[0].text}`,
  );
  assert.ok(texts(out).includes('כרכוב'), 'community entry should still be present');
  __setCommunityForTests(null);
});

await test('rejected community entries are excluded', async () => {
  __setCommunityForTests(new Map([
    ['מגדלור', [
      { id: 'c5', synonym: 'מאור', contextWords: [], status: 'rejected' },
    ]],
  ]));
  const out = await getSynonymSuggestions({ word: 'מגדלור', sentence: '' });
  assert.deepStrictEqual(out, []);
  __setCommunityForTests(null);
});

await test('empty community map → behavior identical to before (no match → [])', async () => {
  __setCommunityForTests(new Map());
  const out = await getSynonymSuggestions({ word: 'מילהשאיננה', sentence: '' });
  assert.deepStrictEqual(out, []);
  __setCommunityForTests(null);
});

// ---------------------------------------------------------------------------
// סיכום
// ---------------------------------------------------------------------------
console.log('\nSynonyms service tests:\n');
console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
