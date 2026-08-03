// fetch-human-corpus.mjs — בונה קורפוס עברי אנושי גלובלי לאימון/כיול הגלאי המקומי
// (styleAuthenticityService.js), ללא צורך במפתח API — ויקיפדיה + ויקיטקסט הם ציבוריים.
//
// לא נכנס ל-src/ ולא נשלח ב-bundle — קובצי טקסט גולמיים בלבד, לשימוש offline
// ב-tools/detector-train/train.mjs וכדומה.
//
// פלט: tools/detector-train/samples/human-global/
//   wiki-XXX.txt        — 50 ערכי ויקיפדיה עבריים לקובץ, מופרדים ב-`===`
//   wikisource-XXX.txt   — אותו פורמט, ויקיטקסט (רישום ישן/מסאי, לאיזון רגיסטר)
//   wikitalk-XXX.txt    — דפי שיחה (namespace 1) עברית ויכוחית/שיחתית, רק גרסה
//                          אחרונה **לפני** עידן ה-LLM (ר' PRE_LLM_CUTOFF) — הכי
//                          קרוב שיש בגישת-API לרגיסטר אישי/יומיומי (הפער שמכתב
//                          יום-הולדת חושף: אין בקורפוס שום דבר לא-פורמלי).
//
// בן־יהודה (benyehuda.org) נבדק ונפסל ל-v1: אין API טקסט-נקי (Rails app, רק
// עמודי HTML) — ובנוסף זו פרוזה ספרותית פורמלית-ארכאית, לא רגיסטר אישי/casual
// בכל מקרה. דפי השיחה הם המקור הרלוונטי.
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
const TARGET_WIKITALK_PAGES = 200;
const TARGET_TOTAL_WORDS = 300_000;
const BATCH_SIZE = 50;
const MIN_WORDS_TALK = 150; // רגיסטר שיחתי — בלוקים קצרים יותר מהותרים (הבקשה: ≥150)
const MIN_HEBREW_RATIO_TALK = 0.7;
// דפי שיחה: רק אם הגרסה **האחרונה** קדמה ל-1.1.2022 — ערובה שהטקסט לא נכתב/נערך
// ע"י LLM (ChatGPT יצא לציבור 11.2022; שוליים בטוחים).
const PRE_LLM_CUTOFF = new Date('2022-01-01T00:00:00Z');

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

// ---------- ניקוי wikitext (דפי שיחה) ----------
//
// בשונה מ-TextExtracts (שכבר מחזיר טקסט זורם), דפי שיחה מגיעים כ-wikitext גולמי —
// תבניות, קישורים, חתימות וזמנים. מנקים בכמה מעברים (לא פרסר mediawiki מלא, אבל
// מספיק לרגיסטר שיחתי-ויכוחי; שיירי-תבנית בודדים לא פוגעים במדגם 200 עמודים).
function stripWikiTemplates(text) {
  // {{...}} עלול לקנן — מסירים איטרטיבית עד שאין עוד זוג תואם ברמה החיצונית.
  let prev;
  let cur = text;
  do {
    prev = cur;
    cur = cur.replace(/\{\{[^{}]*\}\}/g, ' ');
  } while (cur !== prev);
  return cur;
}

function cleanWikitext(raw) {
  let t = String(raw || '');
  t = t.replace(/<!--[\s\S]*?-->/g, ' '); // הערות HTML
  t = t.replace(/<ref[^>]*\/>/gi, ' ').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ' '); // הערות שוליים
  t = t.replace(/<[^>]+>/g, ' '); // תגי HTML נותרים (small, br, nowiki וכו')
  t = stripWikiTemplates(t);
  t = t.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1'); // [[קישור|תצוגה]] → תצוגה
  t = t.replace(/\[\[([^\]]*)\]\]/g, '$1'); // [[קישור]] → קישור
  t = t.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]*)\]/g, '$1'); // [http://x טקסט] → טקסט
  t = t.replace(/\[https?:\/\/[^\s\]]+\]/g, ' '); // [http://x] בלי טקסט
  t = t.replace(/^=+\s*.*?\s*=+\s*$/gm, ''); // == כותרת ==
  t = t.replace(/'''''([^']*)'''''/g, '$1').replace(/'''([^']*)'''/g, '$1').replace(/''([^']*)''/g, '$1'); // הדגשות
  t = t.replace(/~{3,5}/g, ' '); // חתימות ~~~~
  // חותמות זמן ("23:38, 15 בספטמבר 2008 (IDT)") — שיירי חתימה שנשארו אחרי הסרת שם המשתמש.
  t = t.replace(/\d{1,2}:\d{2},\s*\d{1,2}\s+ב[א-ת]+\s+\d{4}\s*\([A-Z]+\)/g, ' ');
  t = t.replace(/^[ \t]*:+/gm, ''); // הזחת-תגובה (: :: ::: בתחילת שורה)
  t = t.replace(/^[ \t]*\*+/gm, ''); // תבליטי רשימה
  t = t.replace(/[|]/g, ' '); // שיירי טבלה/פרמטרים
  t = t.replace(/[ \t]{2,}/g, ' ');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
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

// דף שיחה אקראי + התוכן והזמן של הגרסה **האחרונה** (בלי rvlimit — ברירת המחדל
// היא הגרסה הכי חדשה). rvslots=main כי rvprop=content דורש slot מפורש ב-API החדש.
async function fetchRandomTalkPage(host) {
  const url = `https://${host}/w/api.php?action=query&generator=random&grnnamespace=1&grnlimit=1`
    + `&prop=revisions&rvprop=content|timestamp&rvslots=main&format=json&formatversion=2`;
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

// אוסף דפי-שיחה: כמו collect(), אבל עם שער נוסף — הגרסה האחרונה חייבת לקדום
// ל-PRE_LLM_CUTOFF (אחרת דף שיחה עדכני עלול להכיל תגובה שנוסחה ע"י LLM, שמפר
// בדיוק את מה שהמקור הזה אמור להבטיח). דחיות רבות צפויות (רוב דפי השיחה פעילים).
async function collectWikiTalk(host, targetCount, label, onBatch) {
  const seen = new Set();
  const texts = [];
  let attempts = 0;
  let written = 0;
  let consecutiveFailures = 0;
  let rejectedRecent = 0;
  let rejectedShortOrNonHebrew = 0;
  const maxAttempts = targetCount * 25 + 150; // דחיות תדירות יותר מ-collect() (עדכני + קצר + לא-עברית)

  const worker = async () => {
    while (texts.length < targetCount && attempts < maxAttempts) {
      attempts++;
      let pages;
      try {
        pages = await fetchRandomTalkPage(host);
        consecutiveFailures = 0;
      } catch (e) {
        consecutiveFailures++;
        const delay = Math.min(DELAY_MS * (1 + consecutiveFailures), 8000);
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
        const rev = p.revisions?.[0];
        if (!rev) continue;
        const ts = new Date(rev.timestamp || 0);
        if (!(ts < PRE_LLM_CUTOFF)) { rejectedRecent++; continue; }
        const wikitext = rev.slots?.main?.content || '';
        const cleaned = cleanWikitext(wikitext);
        if (!cleaned) continue;
        if (wordCount(cleaned) < MIN_WORDS_TALK) { rejectedShortOrNonHebrew++; continue; }
        if (hebrewRatio(cleaned) < MIN_HEBREW_RATIO_TALK) { rejectedShortOrNonHebrew++; continue; }
        texts.push({ title, text: cleaned });
        if (texts.length % 25 === 0) {
          console.log(`  [${label}] נאספו ${texts.length}/${targetCount} (ניסיון ${attempts}, נדחו: עדכני=${rejectedRecent} קצר/לא-עברי=${rejectedShortOrNonHebrew})`);
        }
      }
      while (onBatch && texts.length - written >= BATCH_SIZE) {
        await onBatch(texts.slice(written, written + BATCH_SIZE), Math.floor(written / BATCH_SIZE) + 1);
        written += BATCH_SIZE;
      }
      await sleep(DELAY_MS);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (onBatch && texts.length > written) {
    await onBatch(texts.slice(written), Math.floor(written / BATCH_SIZE) + 1);
  }
  console.log(`  [${label}] סה"כ נדחו: עדכני(≥2022)=${rejectedRecent}, קצר/לא-עברי=${rejectedShortOrNonHebrew}`);
  if (texts.length < targetCount) {
    console.warn(`  [${label}] הגיע ל-${texts.length}/${targetCount} אחרי ${attempts} ניסיונות — עוצר.`);
  }
  return texts;
}

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

// WORDAI_FETCH_ONLY=casual — מדלג על ויקיפדיה/ויקיטקסט (כבר נאספו, יעד מלא) ואוסף
// רק דפי שיחה. משתמשים בזה כשמרחיבים קורפוס קיים בלי לבזבז מכסת API על מה שכבר יש.
const FETCH_ONLY = process.env.WORDAI_FETCH_ONLY || 'all';

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  let wikiTexts = [];
  const wikiResult = { files: [], totalWords: 0 };
  let wikisourceTexts = [];
  const wikisourceResult = { files: [], totalWords: 0 };

  if (FETCH_ONLY === 'all') {
    console.log(`אוסף ${TARGET_WIKI_ARTICLES} ערכי ויקיפדיה עברית אקראיים…`);
    wikiTexts = await collect('he.wikipedia.org', TARGET_WIKI_ARTICLES, 'wikipedia', makeBatchWriter('wiki', wikiResult));

    console.log(`\nאוסף ${TARGET_WIKISOURCE_TEXTS} טקסטים מוויקיטקסט עברי (איזון רגיסטר)…`);
    try {
      wikisourceTexts = await collect('he.wikisource.org', TARGET_WIKISOURCE_TEXTS, 'wikisource', makeBatchWriter('wikisource', wikisourceResult));
      if (!wikisourceTexts.length) {
        console.warn('  ויקיטקסט לא החזיר טקסטים שימושיים (כנראה שירה/מקרא מקוטע) — מדלג, ויקיפדיה מספיקה ל-v1.');
      }
    } catch (e) {
      console.warn(`  ויקיטקסט נכשל לגמרי (${e.message}) — מדלג, ויקיפדיה מספיקה ל-v1.`);
    }
  } else {
    console.log('WORDAI_FETCH_ONLY=casual — מדלג על ויקיפדיה/ויקיטקסט.');
  }

  console.log(`\nאוסף ${TARGET_WIKITALK_PAGES} דפי שיחה עברית (רגיסטר שיחתי-ויכוחי, גרסה אחרונה לפני ${PRE_LLM_CUTOFF.toISOString().slice(0, 10)})…`);
  let wikitalkTexts = [];
  const wikitalkResult = { files: [], totalWords: 0 };
  try {
    wikitalkTexts = await collectWikiTalk('he.wikipedia.org', TARGET_WIKITALK_PAGES, 'wikitalk', makeBatchWriter('wikitalk', wikitalkResult));
    if (!wikitalkTexts.length) {
      console.warn('  דפי שיחה לא החזירו טקסטים שימושיים — בדוק את cleanWikitext / הסף הזמני.');
    }
  } catch (e) {
    console.warn(`  איסוף דפי שיחה נכשל לגמרי (${e.message}).`);
  }

  const grandTotal = wikiResult.totalWords + wikisourceResult.totalWords + wikitalkResult.totalWords;
  console.log('\n=== סיכום ===');
  console.log(`ויקיפדיה: ${wikiTexts.length} ערכים, ${wikiResult.totalWords} מילים, ${wikiResult.files.length} קבצים`);
  console.log(`ויקיטקסט: ${wikisourceTexts.length} טקסטים, ${wikisourceResult.totalWords} מילים, ${wikisourceResult.files.length} קבצים`);
  console.log(`דפי שיחה: ${wikitalkTexts.length} עמודים, ${wikitalkResult.totalWords} מילים, ${wikitalkResult.files.length} קבצים`);
  console.log(`סה"כ מילים: ${grandTotal} (יעד: ${TARGET_TOTAL_WORDS})`);
  console.log(grandTotal >= TARGET_TOTAL_WORDS ? '✓ עבר את היעד' : '⚠ מתחת ליעד');
  console.log(`תיקיית יעד: ${OUT_DIR}`);
}

main().catch((e) => { console.error('שגיאה כללית:', e); process.exit(1); });
