// ---------------------------------------------------------------------------
// SPSS Output (.spv) light-table extractor.
//
// A .spv file is a ZIP whose pivot tables are stored as IBM's proprietary
// "light" binary members (`*_lightTableData.bin` / `*_lightNotesData.bin`),
// NOT as text — which is why a naive XML read returns only headings and the
// numbers come back missing/binary. This parser reverse-engineers the parts we
// need so an .spv upload yields a readable, AI-verifiable text dump.
//
// Two recoverable layers, both validated against real SPSS 29 output:
//   1. Strings — length-prefixed (uint32 LE length + UTF-8 bytes). These carry
//      the table title, variable names + labels, statistic column names, and
//      category labels (incl. Hebrew, stored UTF-8).
//   2. Number cells — each is `01 58 <decimals> 28 05 00` followed by an 8-byte
//      IEEE-754 LE double. (Verified: e.g. Std. Error Mean = Std.Dev / sqrt(N).)
//
// Versions other than the tested one may not match the number-cell marker; in
// that case the string layer still yields the table STRUCTURE, and we degrade
// gracefully (structure without values) rather than throwing.
// ---------------------------------------------------------------------------

const MAX_SPV_TEXT_CHARS = 100000;

// Strings that are styling / formatting / locale metadata, not table content.
const SPV_NOISE_PATTERN = /^(?:SansSerif|Serif|Monospaced|Dialog|#[0-9a-fA-F]{3,8}|-?[,.]+|[A-Za-z]{2}_[A-Za-z]{2}.*|[a-z]{2}|windows-\d+|UTF-?8|default|DataSet\d+|.*\.sav|.*\.windows-\d+|\^?\d+\\?%.*)$/;

const readUInt32LE = (view, offset) => view.getUint32(offset, true);

// Pull every length-prefixed UTF-8 string out of a light member. Robust across
// SPSS versions because the string framing is stable.
const extractLightStrings = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const strings = [];
  let i = 0;
  while (i + 4 <= bytes.length) {
    const len = readUInt32LE(view, i);
    if (len >= 1 && len <= 400 && i + 4 + len <= bytes.length) {
      const slice = bytes.subarray(i + 4, i + 4 + len);
      let printable = true;
      for (let k = 0; k < slice.length; k += 1) {
        const c = slice[k];
        if (c < 9 || (c > 13 && c < 32)) { printable = false; break; }
      }
      if (printable) {
        const text = decoder.decode(slice);
        // Skip entries that decoded with replacement chars (mis-framed binary).
        if (!text.includes('�')) {
          strings.push(text);
          i += 4 + len;
          continue;
        }
      }
    }
    i += 1;
  }
  return strings;
};

// Number cells: `01 58 <decimals> 28 05 00` + double. We anchor on `01 58` and a
// plausible decimals byte, then read the double at +6.
const extractNumberCells = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = [];
  let i = 0;
  while (i + 14 <= bytes.length) {
    if (bytes[i] === 0x01 && bytes[i + 1] === 0x58 && bytes[i + 2] < 16) {
      const value = view.getFloat64(i + 6, true);
      if (Number.isFinite(value) && Math.abs(value) < 1e12) {
        const decimals = Math.min(bytes[i + 2] + 2, 6);
        values.push(Number(value.toFixed(decimals)));
        i += 13;
        continue;
      }
    }
    i += 1;
  }
  return values;
};

// Reduce the raw string list to human-meaningful labels: drop styling/locale
// noise, the lowercase snake_case internal category ids, replacement junk, and
// adjacent duplicates (each label is stored ~3x: [display, id, display]).
const cleanLabels = (strings) => {
  const labels = [];
  for (const raw of strings) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!text || text.includes('�')) continue;
    if (SPV_NOISE_PATTERN.test(text)) continue;
    // internal category id (snake_case, lowercase, no spaces) — skip as noise.
    if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(text)) continue;
    if (labels[labels.length - 1] === text) continue;
    labels.push(text);
  }
  // Drop later exact duplicates while preserving first-seen order.
  const seen = new Set();
  return labels.filter((label) => (seen.has(label) ? false : seen.add(label)));
};

const parseLightMember = (bytes) => {
  const strings = extractLightStrings(bytes);
  if (!strings.length) return null;
  const title = strings[0];
  const labels = cleanLabels(strings.slice(1)).filter((label) => label !== title);
  const values = extractNumberCells(bytes);
  return { title, labels, values };
};

const formatTableBlock = (table) => {
  if (!table) return '';
  const lines = [`=== ${table.title} ===`];
  // The light-binary format streams labels and numbers as two separate sequences,
  // so we cannot perfectly reconstruct the row×column grid. We expose the explicit
  // counts (k labels, m values, in reading order) so the model can align them — far
  // more reliable for it than a bare flat list with no cardinality cues.
  if (table.labels.length) {
    lines.push(`תוויות/שדות (${table.labels.length}): ${table.labels.join(' | ')}`);
  }
  if (table.values.length) {
    lines.push(`ערכים מספריים (${table.values.length}, בסדר קריאה שורה-אחר-שורה): ${table.values.join(', ')}`);
  }
  return lines.join('\n');
};

// Public: take raw .spv bytes (Uint8Array) and return a readable text dump of
// every table (titles + structure labels + numeric values). Throws only on a
// genuinely unreadable archive; returns '' when no tables are recoverable.
export const extractSpvTablesText = async (bytes) => {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes);
  const memberPaths = Object.keys(zip.files)
    .filter((path) => !zip.files[path].dir && /light(?:Table|Notes)Data\.bin$/i.test(path))
    .sort();

  const blocks = [];
  for (const path of memberPaths) {
    try {
      const memberBytes = await zip.files[path].async('uint8array');
      const table = parseLightMember(memberBytes);
      const block = formatTableBlock(table);
      if (block) blocks.push(block);
    } catch {
      /* skip an unreadable member, keep the rest */
    }
  }

  return blocks.join('\n\n').slice(0, MAX_SPV_TEXT_CHARS);
};

// גרפים בתוך .spv נשמרים כתמונות (png/jpg) בארכיון — הפרסר הטבלאי מדלג עליהם.
// כאן מחלצים אותם כדי שמודל vision יוכל "לקרוא" אותם (ראה chartVisionService).
const SPV_IMAGE_PATTERN = /\.(png|jpe?g)$/i;
const MAX_SPV_CHART_IMAGES = 12;

export const extractSpvChartImages = async (bytes) => {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes);
  const imagePaths = Object.keys(zip.files)
    .filter((path) => !zip.files[path].dir && SPV_IMAGE_PATTERN.test(path))
    .sort()
    .slice(0, MAX_SPV_CHART_IMAGES);

  const images = [];
  for (const path of imagePaths) {
    try {
      const base64 = await zip.files[path].async('base64');
      // תמונות זעירות (אייקונים/לוגו) אינן גרפים — מסננים לפי גודל מקודד (~3KB).
      if (base64.length < 4000) continue;
      images.push({
        base64,
        mimeType: /\.png$/i.test(path) ? 'image/png' : 'image/jpeg',
        fileName: path.split('/').pop(),
      });
    } catch {
      /* דלג על תמונה לא קריאה */
    }
  }
  return images;
};
