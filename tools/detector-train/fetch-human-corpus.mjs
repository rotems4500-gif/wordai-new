// fetch-human-corpus.mjs — בונה קורפוס עברי אנושי גלובלי לאימון/כיול הגלאי המקומי
// (styleAuthenticityService.js), ללא צורך במפתח API — ויקיפדיה + ויקיטקסט הם ציבוריים.
//
// לא נכנס ל-src/ ולא נשלח ב-bundle — קובצי טקסט גולמיים בלבד, לשימוש offline
// ב-tools/detector-train/train.mjs וכדומה.
//
// פלט: tools/detector-train/samples/human-global/
//   wiki-XXX.txt        — 50 ערכי ויקיפדיה עבריים לקובץ, מופרדים ב-`===`
//   wikisource-XXX.txt   — אותו פורמט, ויקיטקסט (רישום ישן/מסאי, לאיזון רגיסטר)
//
// שימוש:
//   node tools/detector-train/fetch-human-corpus.mjs

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(DIR, 'samples', 'human-global');
const UA = 'WordFlowAI-DetectorTrain/1.0 (offline corpus tool; rotems4500@gmail.com)';
const DELAY_MS = 500;
const MIN_WORDS = 300;
const MIN_HEBREW_RATIO = 0.7;
const TARGET_WIKI_ARTICLES = 700;
const TARGET_WIKISOURCE_TEXTS = 100;
const TARGET_TOTAL_WORDS = 300_000;
const BATCH_SIZE = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hebrewRatio(text) {
  const letters = text.match(/[א-ת]|[a-zA-Z]/g) || [];
  if (!letters.length) return 0;
  const hebrew = letters.filter((c) => /[א-ת]/.test(c)).length;
  return hebrew / letters.length;
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function cleanExtract(raw) {
  // מסיר כותרות סקשן == X == / === X === וכו', משאיר טקסט זורם
  return raw
    .replace(/^=+\s*.*?\s*=+\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isSkippableTitle(title) {
  return /^רשימת/.test(title) || /פירושונים/.test(title);
}

// הערה: ה-TextExtracts API מגביל exlimit=1 כשמבקשים טקסט מלא (explaintext בלי exintro) —
// בקשה עם grnlimit>1 "מבזבזת" מכסה כי רק העמוד הראשון מקבל extract בפועל. לכן דף אחד לבקשה.
async function fetchRandomPage(host) {
  const url = `https://${host}/w/api.php?action=query&generator=random&grnnamespace=0&grnlimit=1&prop=extracts&explaintext=1&exlimit=1&format=json&formatversion=2`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} מ-${host}`);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`תשובה לא-JSON (סביר: rate-limit): ${text.slice(0, 80)}`); }
  return data?.query?.pages || [];
}

// מקביליות: ערך אקראי בודד לבקשה (מגבלת exlimit=1) עם רוב דחיות (סטאבים) —
// טורי עם 500ms זה שעות. 6 workers במקביל + כתיבה מצטברת של כל batch מלא,
// כדי שגם ריצה שנקטעת משאירה קבצים על הדיסק.
const CONCURRENCY = 6;

async function collect(host, targetCount, label, onBatch) {
  const seen = new Set();
  const texts = [];
  let attempts = 0;
  let written = 0; // כמה כבר נשלחו ל-onBatch
  let consecutiveFailures = 0;
  const maxAttempts = targetCount * 12 + 100; // מרווח לדחיות (סטאב קצר/לא עברית/פירושונים/כפילות)

  const worker = async () => {
    while (texts.length < targetCount && attempts < maxAttempts) {
      attempts++;
      let pages;
      try {
        pages = await fetchRandomPage(host);
        consecutiveFailures = 0;
      } catch (e) {
        consecutiveFailures++;
        const delay = Math.min(DELAY_MS * (1 + consecutiveFailures), 8000); // backoff נגד rate-limit
        if (consecutiveFailures <= 3 || consecutiveFailures % 10 === 0) {
          console.warn(`  [${label}] בקשה נכשלה (${e.message}) — ממתין ${delay}ms`);
        }
        await sleep(delay);
        continue;
      }
      for (const p of pages) {
        const title = p.title || '';
        if (seen.has(title)) continue;
        seen.add(title);
        if (isSkippableTitle(title)) continue;
        const extract = cleanExtract(p.extract || '');
        if (!extract) continue;
        if (wordCount(extract) < MIN_WORDS) continue;
        if (hebrewRatio(extract) < MIN_HEBREW_RATIO) continue;
        texts.push({ title, text: extract });
        if (texts.length % 25 === 0) {
          console.log(`  [${label}] נאספו ${texts.length}/${targetCount} (ניסיון ${attempts})`);
        }
      }
      // batch מלא שטרם נכתב → לכתוב מיד (עמידות לקטיעה)
      while (onBatch && texts.length - written >= BATCH_SIZE) {
        await onBatch(texts.slice(written, written + BATCH_SIZE), Math.floor(written / BATCH_SIZE) + 1);
        written += BATCH_SIZE;
      }
      await sleep(DELAY_MS);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  // שארית אחרונה
  if (onBatch && texts.length > written) {
    await onBatch(texts.slice(written), Math.floor(written / BATCH_SIZE) + 1);
  }
  if (texts.length < targetCount) {
    console.warn(`  [${label}] הגיע ל-${texts.length}/${targetCount} אחרי ${attempts} ניסיונות — עוצר.`);
  }
  return texts;
}

function makeBatchWriter(prefix, tally) {
  return async (batch, batchNum) => {
    const body = batch.map((t) => t.text).join('\n===\n');
    const fname = `${prefix}-${String(batchNum).padStart(3, '0')}.txt`;
    await writeFile(path.join(OUT_DIR, fname), body + '\n', 'utf8');
    const words = batch.reduce((sum, t) => sum + wordCount(t.text), 0);
    tally.totalWords += words;
    tally.files.push({ file: fname, articles: batch.length, words });
    console.log(`  נכתב ${fname} — ${batch.length} ערכים, ${words} מילים (סה"כ מצטבר: ${tally.totalWords})`);
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`אוסף ${TARGET_WIKI_ARTICLES} ערכי ויקיפדיה עברית אקראיים…`);
  const wikiResult = { files: [], totalWords: 0 };
  const wikiTexts = await collect('he.wikipedia.org', TARGET_WIKI_ARTICLES, 'wikipedia', makeBatchWriter('wiki', wikiResult));

  console.log(`\nאוסף ${TARGET_WIKISOURCE_TEXTS} טקסטים מוויקיטקסט עברי (איזון רגיסטר)…`);
  let wikisourceTexts = [];
  const wikisourceResult = { files: [], totalWords: 0 };
  try {
    wikisourceTexts = await collect('he.wikisource.org', TARGET_WIKISOURCE_TEXTS, 'wikisource', makeBatchWriter('wikisource', wikisourceResult));
    if (!wikisourceTexts.length) {
      console.warn('  ויקיטקסט לא החזיר טקסטים שימושיים (כנראה שירה/מקרא מקוטע) — מדלג, ויקיפדיה מספיקה ל-v1.');
    }
  } catch (e) {
    console.warn(`  ויקיטקסט נכשל לגמרי (${e.message}) — מדלג, ויקיפדיה מספיקה ל-v1.`);
  }

  const grandTotal = wikiResult.totalWords + wikisourceResult.totalWords;
  console.log('\n=== סיכום ===');
  console.log(`ויקיפדיה: ${wikiTexts.length} ערכים, ${wikiResult.totalWords} מילים, ${wikiResult.files.length} קבצים`);
  console.log(`ויקיטקסט: ${wikisourceTexts.length} טקסטים, ${wikisourceResult.totalWords} מילים, ${wikisourceResult.files.length} קבצים`);
  console.log(`סה"כ מילים: ${grandTotal} (יעד: ${TARGET_TOTAL_WORDS})`);
  console.log(grandTotal >= TARGET_TOTAL_WORDS ? '✓ עבר את היעד' : '⚠ מתחת ליעד');
  console.log(`תיקיית יעד: ${OUT_DIR}`);
}

main().catch((e) => { console.error('שגיאה כללית:', e); process.exit(1); });
