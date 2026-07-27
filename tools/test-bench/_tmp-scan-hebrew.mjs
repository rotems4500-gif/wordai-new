// זמני — מחלץ את טקסט המטלה האמיתית לקובץ txt עבור nlg-loop-round. נמחק אחרי.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { itemsToLines } from '../../src/services/materialExtractBrowser.js';

const ROOT = process.env.WORDAI_SCAFFOLD_CORPUS
  || path.join(os.homedir(), 'OneDrive', 'שולחן העבודה', '314999533');
const SRC = process.env.WORDAI_ASSIGNMENT_PDF
  || path.join(ROOT, 'עבודות והגשות', 'הנחיות מרצה', 'מטלת סיום דיני תקשורת-רב תחומי.pdf');
const OUT = process.env.WORDAI_ASSIGNMENT_OUT || path.join(ROOT, '..', 'assignment-media-law.txt');

if (!fs.existsSync(SRC)) { console.log(`חסר: ${SRC}`); process.exit(1); }
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(SRC)), useSystemFonts: true }).promise;
const parts = [];
for (let i = 1; i <= doc.numPages; i += 1) {
  const content = await (await doc.getPage(i)).getTextContent();
  parts.push(itemsToLines(content.items));
}
try { await doc.destroy(); } catch {}
const text = parts.join('\n\n');
fs.writeFileSync(OUT, text, 'utf8');
console.log(`נכתב: ${OUT}  (${doc.numPages} עמודים, ${(text.match(/\S+/g) || []).length} מילים)\n`);
console.log(text.slice(0, 1600));
