// extract-real-corpus.mjs — מחלץ טקסט מקורפוס המטלות האמיתי של רותם ל-scratchpad.
//
// למה: הפרסר כויל על הנחיות שאני המצאתי, ולכן הוא טוב בדיוק במה שדמיינתי.
// הנחיות אמיתיות של מרצים נראות אחרת — טבלאות, מחוונים, נספחים, ניסוח חופשי.
// זה השלב שממיר את הקבצים לטקסט פעם אחת, כדי שההרנסים ירוצו מהר.
//
// כותב ל-scratchpad בלבד. **לא נוגע בתיקיית המקור.**
//
// הרצה: node tools/test-bench/extract-real-corpus.mjs

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const ROOT = 'C:/Users/rotem/OneDrive/שולחן העבודה/314999533';
const OUT = process.env.WORDAI_CORPUS_OUT
  || 'C:/Users/rotem/AppData/Local/Temp/claude/C--Users-rotem-Projects--wordai-new/5dfe23d5-acbf-4f96-9551-9997128f4b6f/scratchpad/real-corpus';

// קטגוריה → תיקיית מקור. שמות התיקיות בעברית, כמו שהם על הדיסק.
const SOURCES = {
  instructions: 'עבודות והגשות/הנחיות מרצה',
  finals: 'עבודות והגשות/עבודות סופיות',
  drafts: 'עבודות והגשות/טיוטות וגרסאות קודמות',
  syllabi: 'סילבוסים',
  summaries: 'סיכומים ותקצירים',
};

async function extractDocx(buf) {
  const mammoth = require('mammoth');
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return String(value || '');
}

// זהה ל-itemsToLines ב-src/services/materialExtractBrowser.js. חייב להישאר מיושר:
// אם ההרנס מחלץ אחרת מהאפליקציה, הכיול נעשה על טקסט שהמשתמש לעולם לא יראה.
const LINE_Y_TOLERANCE = 2.5;

const needsSpace = (prev, cur) => {
  if (!prev || !cur) return false;
  const prevStr = String(prev.str ?? '');
  const curStr = String(cur.str ?? '');
  if (!prevStr || !curStr) return false;
  if (/\s$/.test(prevStr) || /^\s/.test(curStr)) return false;
  const px = prev.transform?.[4];
  const cx = cur.transform?.[4];
  if (typeof px !== 'number' || typeof cx !== 'number') return false;
  const pw = Number(prev.width) || 0;
  const cw = Number(cur.width) || 0;
  const gap = Math.max(px - (cx + cw), cx - (px + pw));
  if (gap <= 0) return false;
  const avgChar = (pw / Math.max(1, prevStr.length) + cw / Math.max(1, curStr.length)) / 2;
  return gap >= Math.max(0.8, avgChar * 0.28);
};

const itemsToLines = (items = []) => {
  const lines = [];
  let current = null;
  items.forEach((item) => {
    const str = String(item?.str ?? '');
    const y = Array.isArray(item?.transform) ? item.transform[5] : null;
    if (current && y !== null && Math.abs(current.y - y) <= LINE_Y_TOLERANCE) {
      if (needsSpace(current.lastItem, item)) current.parts.push(' ');
      current.parts.push(str);
      if (str) current.lastItem = item;
    } else {
      if (current) lines.push(current);
      current = { y, parts: [str], lastItem: str ? item : null };
    }
    if (item?.hasEOL) { lines.push(current); current = null; }
  });
  if (current) lines.push(current);
  return lines.map((l) => l.parts.join('').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
};

async function extractPdf(buf) {
  // ה-build הלגסי של pdfjs הוא זה שרץ ב-Node בלי DOM.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
    // בלי זה pdfjs מנסה להביא worker ונופל ב-Node.
    disableWorker: true,
allowfont: false,
  }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // ⚠️ בלי סימוני "[עמוד N]": האפליקציה לא מייצרת אותם (materialExtractBrowser
    // מחבר עמודים ב-\n\n בלבד). הרנס שמוסיף טקסט משלו מכייל על קלט שהמשתמש
    // לעולם לא יראה — וזה בדיוק מה שקרה: הסימון נבחר ככותרת המטלה.
    pages.push(itemsToLines(content.items));
  }
  return pages.join('\n\n');
}

const clean = (text) => String(text || '')
  .replace(/\r/g, '')
  .replace(/[ \t ]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

async function run() {
  await mkdir(OUT, { recursive: true });
  const manifest = [];

  for (const [category, rel] of Object.entries(SOURCES)) {
    const dir = path.join(ROOT, rel);
    let files = [];
    try { files = await readdir(dir); } catch { console.warn(`דילוג על ${rel} — לא נמצא`); continue; }

    await mkdir(path.join(OUT, category), { recursive: true });
    let ok = 0; let failed = 0;

    for (const name of files) {
      const ext = path.extname(name).toLowerCase();
      if (!['.docx', '.pdf'].includes(ext)) continue;
      try {
        const buf = await readFile(path.join(dir, name));
        const text = clean(ext === '.docx' ? await extractDocx(buf) : await extractPdf(buf));
        // קובץ שנתן פחות מ-200 תווים הוא כמעט תמיד סרוק/תמונה — מסומן ולא נספר כהצלחה.
        if (text.length < 200) { failed += 1; manifest.push({ category, name, chars: text.length, note: 'thin' }); continue; }
        const slug = `${String(ok).padStart(3, '0')}.txt`;
        await writeFile(path.join(OUT, category, slug), `# ${name}\n\n${text}`, 'utf8');
        manifest.push({ category, name, file: `${category}/${slug}`, chars: text.length });
        ok += 1;
      } catch (err) {
        failed += 1;
        manifest.push({ category, name, error: String(err?.message || err).slice(0, 120) });
      }
    }
    console.log(`${category}: ${ok} חולצו, ${failed} נכשלו/דלילים`);
  }

  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\nמניפסט: ${path.join(OUT, 'manifest.json')}`);
  const thin = manifest.filter((m) => m.note === 'thin' || m.error);
  if (thin.length) {
    console.log(`\n${thin.length} קבצים לא ניתנים לקריאה (סרוקים/מוגנים) — לא ישמשו לכיול:`);
    thin.slice(0, 12).forEach((m) => console.log(`  · ${m.name} ${m.error ? `(${m.error})` : '(דליל)'}`));
  }
}

run().catch((e) => { console.error(e); process.exitCode = 1; });
