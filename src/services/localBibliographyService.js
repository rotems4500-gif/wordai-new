// בניית ביבליוגרפיה מקומית מתוך הראיות שכבר נמצאו לשלד המטלה.
// השירות דטרמיניסטי: הוא אינו קורא לרשת ואינו משלים פרטי מקור שלא הופיעו בחומר.

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const YEAR = '(?:18|19|20)\\d{2}';

function parseSourceTitle(sourceTitle = '') {
  const label = clean(sourceTitle) || 'מקור ללא כותרת';

  // "כהן 2021 — שם המאמר"
  const authorFirst = label.match(new RegExp(`^(.+?)\\s+(${YEAR})\\s*[—–-]\\s*(.+)$`, 'u'));
  if (authorFirst) {
    return { author: clean(authorFirst[1]), year: authorFirst[2], title: clean(authorFirst[3]) };
  }

  // הפורמט שמנוע אחזור המקורות שומר: "שם המאמר (כהן 2021)".
  const titleFirst = label.match(new RegExp(`^(.+?)\\s*\\((.+?)\\s+(${YEAR})\\)\\s*$`, 'u'));
  if (titleFirst) {
    return { author: clean(titleFirst[2]), year: titleFirst[3], title: clean(titleFirst[1]) };
  }

  return { author: '', year: '', title: label };
}

function evidenceItems(scaffold) {
  if (!scaffold?.active || !scaffold?.evidence || typeof scaffold.evidence !== 'object') return [];
  return Object.entries(scaffold.evidence).flatMap(([sectionId, result]) => {
    const items = Array.isArray(result) ? result : result?.evidence;
    return (Array.isArray(items) ? items : []).map((item) => ({ ...item, sectionId }));
  });
}

function entryKey(entry) {
  const url = clean(entry?.url).toLocaleLowerCase();
  if (url) return `url:${url.replace(/\/$/, '')}`;
  const materialId = clean(entry?.materialId);
  if (materialId) return `material:${materialId}`;
  const title = clean(entry?.title).toLocaleLowerCase();
  const author = clean(entry?.author).toLocaleLowerCase();
  return `text:${title}|${author}`;
}

export function collectScaffoldBibliographyEntries(scaffold) {
  const entries = [];
  const byKey = new Map();

  for (const item of evidenceItems(scaffold)) {
    const parsed = parseSourceTitle(item?.sourceTitle);
    const candidate = {
      ...parsed,
      url: clean(item?.sourceUrl),
      materialId: clean(item?.materialId),
      origin: 'assignment-scaffold',
      sections: item?.sectionId ? [item.sectionId] : [],
    };
    const key = entryKey(candidate);
    const existing = byKey.get(key);
    if (existing) {
      if (item?.sectionId && !existing.sections.includes(item.sectionId)) existing.sections.push(item.sectionId);
      continue;
    }
    byKey.set(key, candidate);
    entries.push(candidate);
  }

  return entries;
}

export function mergeBibliographyEntries(...groups) {
  const merged = [];
  const keys = new Set();
  for (const entry of groups.flat()) {
    if (!entry || typeof entry !== 'object') continue;
    const normalized = {
      ...entry,
      author: clean(entry.author),
      year: clean(entry.year),
      title: clean(entry.title) || 'מקור ללא כותרת',
      url: clean(entry.url || entry.sourceUrl),
    };
    const key = entryKey(normalized);
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(normalized);
  }
  return merged.sort((a, b) => clean(a.author || a.title).localeCompare(clean(b.author || b.title), 'he'));
}

export function formatBibliographyEntry(entry, style = 'APA') {
  const author = clean(entry?.author);
  const year = clean(entry?.year);
  const title = clean(entry?.title) || 'מקור ללא כותרת';
  const url = clean(entry?.url || entry?.sourceUrl);
  let text;

  if (style === 'MLA') {
    text = [author && `${author}.`, `“${title}.”`, year && `${year}.`, url].filter(Boolean).join(' ');
  } else if (style === 'Chicago') {
    text = [author && `${author}.`, `“${title}.”`, year ? `${year}.` : 'ללא תאריך.', url].filter(Boolean).join(' ');
  } else {
    text = [author && `${author}.`, `(${year || 'ללא תאריך'}).`, `${title}.`, url].filter(Boolean).join(' ');
  }

  return text;
}

