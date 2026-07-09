// שילוב פרק ממצאים בטיוטת עבודה קיימת.
//
// טיוטות שנוצרות לפני הרצת הניתוחים מכילות הערות placeholder בסגנון:
//   "(הערה: חלק זה יורחב לאחר הרצת ניתוח המתאמים בפועל. יש לדווח כאן על ...)"
// כשהמשתמש מזרים את פרק הממצאים מהסטודיו, הזרמה נאיבית מחליפה את כל המסמך
// (או משאירה את ההערות). כאן: מזהים כל הערת placeholder, מוצאים את תת-הפרק
// המתאים בפרק הממצאים לפי נושא הניתוח, ומחליפים את ההערה בתוכן האמיתי —
// שאר הטיוטה נשארת כמות שהיא.

// הערת placeholder: פסקה שמכילה "הערה" + לשון עתיד של השלמה ("יורחב"/"יושלם")
// + אזכור הרצה/ניתוח. תופס גם ניסוחים קרובים שהמודל מייצר.
const PLACEHOLDER_NOTE_PATTERN = /הערה[:\s][^]{0,40}?(?:יורחב|יושלם|יעודכן)[^]{0,80}?(?:הרצ|ניתוח|הפלט)/;

// נושאי ניתוח לזיווג הערה→תת-פרק. הסדר קובע עדיפות בשוויון.
const ANALYSIS_TOPICS = [
  { id: 'regression', pattern: /רגרסי|ניבוי|מנבא|R²|R2/i },
  { id: 'correlation', pattern: /מתאמ|פירסון|קורלצ|קשר בין המשתנים/i },
  { id: 'reliability', pattern: /מהימנות|אלפא|קרונבך/i },
  { id: 'ttest', pattern: /מבחן\s*t|t-test|השוואת ממוצעים/i },
  { id: 'anova', pattern: /anova|ניתוח שונות|אנובה/i },
  { id: 'chisq', pattern: /חי בריבוע|chi-?square|קשר בין משתנים קטגוריאליים/i },
  { id: 'frequencies', pattern: /שכיחויות|התפלגות/i },
  { id: 'descriptives', pattern: /תיאורית|מרכז ופיזור|ממוצע.{0,20}סטיית/i },
];

const topicsOfText = (text = '') => {
  const found = new Set();
  ANALYSIS_TOPICS.forEach(({ id, pattern }) => {
    if (pattern.test(String(text || ''))) found.add(id);
  });
  return found;
};

const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4']);

// מפרק את ה-HTML של פרק הממצאים לתתי-פרקים: כל כותרת פותחת סקשן; מה שלפני
// הכותרת הראשונה נחשב מבוא (בדרך כלל <h2>פרק ממצאים</h2> + פסקת פתיחה).
const splitChapterSections = (chapterBody) => {
  const sections = [];
  let current = { headingNode: null, headingText: '', nodes: [] };
  Array.from(chapterBody.children).forEach((node) => {
    if (HEADING_TAGS.has(node.tagName)) {
      if (current.headingNode || current.nodes.length) sections.push(current);
      current = { headingNode: node, headingText: String(node.textContent || '').trim(), nodes: [] };
      return;
    }
    current.nodes.push(node);
  });
  if (current.headingNode || current.nodes.length) sections.push(current);
  return sections;
};

const sectionTopicText = (section) => [
  section.headingText,
  ...section.nodes.map((node) => String(node.textContent || '')),
].join(' ');

/**
 * משלב פרק ממצאים בטיוטה: מחליף הערות placeholder בתוכן תת-הפרק התואם.
 * @returns {null | { mergedHtml: string, replacedCount: number, appendedCount: number }}
 *   null כשאין בטיוטה הערות placeholder (המערך הקורא נופל להתנהגות הישנה).
 */
export const mergeSpssFindingsIntoDraftHtml = (draftHtml = '', chapterHtml = '') => {
  if (typeof DOMParser === 'undefined') return null;
  const draft = String(draftHtml || '').trim();
  const chapter = String(chapterHtml || '').trim();
  if (!draft || !chapter) return null;

  const parser = new DOMParser();
  const draftDoc = parser.parseFromString(`<body>${draft}</body>`, 'text/html');
  const chapterDoc = parser.parseFromString(`<body>${chapter}</body>`, 'text/html');
  const draftBody = draftDoc.body;
  const chapterBody = chapterDoc.body;
  if (!draftBody || !chapterBody) return null;

  // הערות placeholder בטיוטה + הכותרת שקדמה לכל אחת (הקשר לזיווג).
  const placeholders = [];
  let lastHeadingText = '';
  Array.from(draftBody.children).forEach((node) => {
    if (HEADING_TAGS.has(node.tagName)) {
      lastHeadingText = String(node.textContent || '').trim();
      return;
    }
    const text = String(node.textContent || '').trim();
    if (text && PLACEHOLDER_NOTE_PATTERN.test(text)) {
      placeholders.push({ node, contextText: `${lastHeadingText} ${text}` });
    }
  });
  if (!placeholders.length) return null;

  const sections = splitChapterSections(chapterBody)
    .map((section) => ({ ...section, topics: topicsOfText(sectionTopicText(section)), used: false }))
    .filter((section) => section.nodes.length); // כותרת בלי תוכן (כמו h2 של הפרק) אינה מועמדת

  let replacedCount = 0;
  placeholders.forEach((placeholder) => {
    const wantedTopics = topicsOfText(placeholder.contextText);
    if (!wantedTopics.size) return;
    // הסקשן עם החפיפה הגדולה ביותר בנושאים; שוויון → לפי סדר עדיפות הנושאים.
    let best = null;
    let bestScore = 0;
    sections.forEach((section) => {
      if (section.used) return;
      let score = 0;
      wantedTopics.forEach((topic) => { if (section.topics.has(topic)) score += 1; });
      if (score > bestScore) { best = section; bestScore = score; }
    });
    if (!best) return;
    best.used = true;
    // מחליפים את פסקת ההערה בתוכן הסקשן, בלי הכותרת שלו — לטיוטה יש כבר כותרת משלה.
    const fragment = draftDoc.createDocumentFragment();
    best.nodes.forEach((node) => fragment.appendChild(draftDoc.importNode(node, true)));
    placeholder.node.replaceWith(fragment);
    replacedCount += 1;
  });
  if (!replacedCount) return null;

  // תתי-פרקים שלא שובצו (למשל מהימנות/תיאורית שאין להם placeholder) — נוספים
  // בסוף תחת כותרת הפרק, כדי שלא יאבד מידע. המשתמש יכול למחוק כפילויות.
  const leftovers = sections.filter((section) => !section.used && section.topics.size);
  let appendedCount = 0;
  if (leftovers.length) {
    const title = draftDoc.createElement('h2');
    title.textContent = 'פרק ממצאים — השלמות';
    draftBody.appendChild(title);
    leftovers.forEach((section) => {
      if (section.headingNode) draftBody.appendChild(draftDoc.importNode(section.headingNode, true));
      section.nodes.forEach((node) => draftBody.appendChild(draftDoc.importNode(node, true)));
      appendedCount += 1;
    });
  }

  return { mergedHtml: draftBody.innerHTML, replacedCount, appendedCount };
};

export default mergeSpssFindingsIntoDraftHtml;
