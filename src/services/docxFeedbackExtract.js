// docxFeedbackExtract.js — חילוץ משוב מרצה מקובץ docx מוחזר: הערות שוליים של
// Word (word/comments.xml), שינויים עוקבים (w:ins / w:del) והדגשות מרקר.
//
// למה מודול נפרד ולא mammoth: שלוש הקריאות הקיימות ל-mammoth הן extractRawText —
// הערות ושינויים עוקבים נזרקים בשקט. כאן פותחים את ה-zip ישירות (JSZip כבר
// bundled — extractPptx עושה את זה) וקוראים את ה-OOXML עם DOMParser, שקיים גם
// בדפדפן וגם ב-WebView2 של Tauri ⇒ web+desktop באותו קוד.
//
// עקרונות:
// · דטרמיניסטי לחלוטין — אפס קריאות מודל. מה שחולץ הוא מה שכתוב בקובץ.
// · זיהוי "מי המרצה" הוא **ניחוש** (המעיר המרכזי שאינו יוצר המסמך) שהמשתמש
//   מאשר ב-wizard. אותו דין לציון (gradeSuggestion).
// · עוגנים נקצצים בהתאם לתקרות של lecturerProfileStore — לא שומרים גוף מסמך.
// · ⚠️ בלי \b ב-regex — לא עובד סביב אותיות עבריות.

import {
  ANCHOR_EXCERPT_MAX,
  FEEDBACK_TEXT_MAX,
} from './lecturerProfileStore';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const collapse = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const clip = (s, max) => {
  const c = collapse(s);
  return c.length > max ? `${c.slice(0, max - 1)}…` : c;
};

function parseXml(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;
  return doc;
}

const byTag = (root, local) => Array.from(root.getElementsByTagNameNS(W_NS, local));
const attr = (el, local) => el.getAttributeNS(W_NS, local) ?? el.getAttribute(`w:${local}`) ?? '';

/** טקסט של תת-עץ: w:t + w:delText, עם רווח בין ריצות. */
function textOf(el) {
  const parts = [];
  for (const t of [...byTag(el, 't'), ...byTag(el, 'delText')]) parts.push(t.textContent || '');
  return collapse(parts.join(' '));
}

function hasAncestor(el, local, stopAt) {
  // parentNode ולא parentElement — נדרש גם ל-DOMParser של xmldom ב-harness.
  let cur = el.parentNode;
  while (cur && cur !== stopAt && cur.nodeType === 1) {
    if (cur.localName === local && cur.namespaceURI === W_NS) return cur;
    cur = cur.parentNode;
  }
  return null;
}

/** word/comments.xml → { id: {author, date, text} } */
function parseCommentsXml(doc) {
  const out = new Map();
  if (!doc) return out;
  for (const c of byTag(doc, 'comment')) {
    const id = attr(c, 'id');
    if (id === '') continue;
    out.set(String(id), {
      author: collapse(attr(c, 'author')),
      date: attr(c, 'date') || '',
      text: clip(textOf(c), FEEDBACK_TEXT_MAX),
    });
  }
  return out;
}

/** docProps/core.xml → dc:creator (יוצר המסמך = כנראה הסטודנט). */
function parseCreator(coreXml) {
  if (!coreXml) return '';
  const m = coreXml.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/i);
  return m ? collapse(m[1].replace(/<[^>]+>/g, '')) : '';
}

/**
 * הליבה: הליכה על גוף word/document.xml בסדר המסמך.
 * מחזירה comments (עם עוגן), revisions, highlights, וטקסט מלא.
 */
function walkDocument(doc, commentsById) {
  const comments = [];
  const revisions = [];
  const highlights = [];
  const fullTextParts = [];
  // ריצות גולמיות פר-פסקה, בסדר המסמך, **כולל ריצות שנמחקו** (שאינן ב-fullText).
  // זה מה שמאפשר לשחזר אחר-כך את גוף ההגשה של הסטודנט (buildSubmittedBodyText).
  const paragraphRuns = [];

  // ריצות הערה יכולות לחצות פסקאות — המצב חי מחוץ ללולאת הפסקאות.
  const openRanges = new Map(); // commentId -> { anchorParts: [] }

  const paragraphs = byTag(doc, 'p');
  for (const p of paragraphs) {
    const paraParts = [];
    let paraHadCommentRef = new Set();
    const paraDeletes = [];
    const paraInserts = [];
    const paraRuns = [];

    for (const node of Array.from(p.getElementsByTagNameNS(W_NS, '*'))) {
      const name = node.localName;
      if (name === 'commentRangeStart') {
        const id = String(attr(node, 'id'));
        if (commentsById.has(id)) openRanges.set(id, { anchorParts: [] });
      } else if (name === 'commentRangeEnd') {
        const id = String(attr(node, 'id'));
        const range = openRanges.get(id);
        if (range) {
          openRanges.delete(id);
          const meta = commentsById.get(id);
          if (meta) {
            comments.push({
              id,
              author: meta.author,
              date: meta.date,
              text: meta.text,
              anchorExcerpt: clip(range.anchorParts.join(' '), ANCHOR_EXCERPT_MAX),
            });
            paraHadCommentRef.add(id);
          }
        }
      } else if (name === 'r') {
        // ריצה: בתוך w:del / w:ins / רגילה. נמנעים מספירה כפולה — רק ריצות
        // שהאב הישיר-בהיררכיה שלהן אינו ins/del נספרות כטקסט המסמך.
        const insAncestor = hasAncestor(node, 'ins', p);
        const delAncestor = hasAncestor(node, 'del', p);
        const runText = textOf(node);
        if (!runText) continue;
        // הריצה נרשמת תמיד — גם כשהיא מחוקה (ולכן אינה נכנסת ל-fullText).
        paraRuns.push({
          text: runText,
          insAuthor: insAncestor ? collapse(attr(insAncestor, 'author')) : null,
          delAuthor: delAncestor ? collapse(attr(delAncestor, 'author')) : null,
        });
        if (delAncestor) {
          paraDeletes.push({ author: collapse(attr(delAncestor, 'author')), text: runText });
        } else if (insAncestor) {
          paraInserts.push({ author: collapse(attr(insAncestor, 'author')), text: runText });
          paraParts.push(runText); // טקסט שהוכנס הוא חלק מהמסמך הסופי
          for (const range of openRanges.values()) range.anchorParts.push(runText);
        } else {
          paraParts.push(runText);
          for (const range of openRanges.values()) range.anchorParts.push(runText);
          // הדגשת מרקר על ריצה רגילה
          const rPr = byTag(node, 'rPr')[0];
          if (rPr && byTag(rPr, 'highlight').length) {
            highlights.push({ anchorExcerpt: clip(runText, ANCHOR_EXCERPT_MAX) });
          }
        }
      }
    }

    const paraText = collapse(paraParts.join(' '));
    if (paraText) fullTextParts.push(paraText);
    // פסקה בלי אף ריצת טקסט (תמונה/מפריד) לא נרשמת — היא גם לא תורמת כלום לגוף.
    if (paraRuns.length) paragraphRuns.push(paraRuns);

    // הערת commentReference בלי range — עוגן = הפסקה כולה.
    for (const ref of byTag(p, 'commentReference')) {
      const id = String(attr(ref, 'id'));
      if (paraHadCommentRef.has(id) || !commentsById.has(id)) continue;
      if (comments.some((c) => c.id === id)) continue;
      const meta = commentsById.get(id);
      comments.push({
        id,
        author: meta.author,
        date: meta.date,
        text: meta.text,
        anchorExcerpt: clip(paraText, ANCHOR_EXCERPT_MAX),
      });
    }

    // זיווג del+ins באותה פסקה → replacement; שאריות נשארות כמחיקה/הוספה.
    const usedInserts = new Set();
    for (const del of paraDeletes) {
      const matchIdx = paraInserts.findIndex((ins, i) => !usedInserts.has(i) && ins.author === del.author);
      if (matchIdx >= 0) {
        usedInserts.add(matchIdx);
        revisions.push({
          kind: 'replacement',
          author: del.author,
          anchorExcerpt: clip(del.text, ANCHOR_EXCERPT_MAX),
          feedbackText: clip(paraInserts[matchIdx].text, FEEDBACK_TEXT_MAX),
        });
      } else {
        revisions.push({
          kind: 'deletion',
          author: del.author,
          anchorExcerpt: clip(del.text, ANCHOR_EXCERPT_MAX),
          feedbackText: '',
        });
      }
    }
    paraInserts.forEach((ins, i) => {
      if (usedInserts.has(i)) return;
      revisions.push({
        kind: 'insertion',
        author: ins.author,
        anchorExcerpt: clip(paraText, ANCHOR_EXCERPT_MAX),
        feedbackText: clip(ins.text, FEEDBACK_TEXT_MAX),
      });
    });
  }

  // ranges שלא נסגרו (קובץ פגום) — עדיין מחזירים את ההערה עם מה שנאסף.
  for (const [id, range] of openRanges) {
    const meta = commentsById.get(id);
    if (!meta || comments.some((c) => c.id === id)) continue;
    comments.push({
      id,
      author: meta.author,
      date: meta.date,
      text: meta.text,
      anchorExcerpt: clip(range.anchorParts.join(' '), ANCHOR_EXCERPT_MAX),
    });
  }

  return { comments, revisions, highlights, fullText: fullTextParts.join('\n'), paragraphRuns };
}

/** רחרוח ציון בקצוות המסמך. הצעה בלבד — המשתמש מאשר. בלי \b. */
export function sniffGrade(fullText) {
  const edges = `${String(fullText || '').slice(0, 600)}\n${String(fullText || '').slice(-600)}`;
  const patterns = [
    /ציון[\s:]*([0-9]{1,3})/,
    /(?:^|[\s:.,(])([0-9]{1,3})\s*\/\s*100(?:$|[\s:.,)])/m,
    /[Gg]rade[\s:]*([0-9]{1,3})/,
  ];
  for (const re of patterns) {
    const m = edges.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n >= 0 && n <= 100) return n;
    }
  }
  return null;
}

/**
 * זיהוי מחברים: מונה הערות+שינויים פר-מחבר. המרצה המשוער = המעיר המרכזי שאינו
 * יוצר המסמך (docProps). ניחוש — ה-wizard מציג לבחירה.
 */
function inferAuthors({ comments, revisions }, creator) {
  const counts = new Map();
  for (const item of [...comments, ...revisions]) {
    const a = item.author || '';
    if (!a) continue;
    counts.set(a, (counts.get(a) || 0) + 1);
  }
  const authors = [...counts.entries()]
    .map(([name, count]) => ({ name, count, isCreator: !!creator && name === creator }))
    .sort((a, b) => b.count - a.count);
  const suspected = authors.find((a) => !a.isCreator) || authors[0] || null;
  return { authors, suspectedLecturer: suspected ? suspected.name : '' };
}

/**
 * חילוץ משוב מלא מ-docx.
 * @param {Uint8Array} uint8
 * @returns {Promise<{ok:boolean, comments:[], revisions:[], highlights:[], authors:[],
 *                    suspectedLecturer:string, gradeSuggestion:number|null, fullText:string, error?:string}>}
 */
export async function extractDocxFeedback(uint8) {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(uint8);
    const docEntry = zip.files['word/document.xml'];
    if (!docEntry) return { ok: false, error: 'לא נמצא word/document.xml — כנראה לא קובץ docx תקין.' };

    const [docXml, commentsXml, coreXml] = await Promise.all([
      docEntry.async('string'),
      zip.files['word/comments.xml'] ? zip.files['word/comments.xml'].async('string') : Promise.resolve(''),
      zip.files['docProps/core.xml'] ? zip.files['docProps/core.xml'].async('string') : Promise.resolve(''),
    ]);

    const docTree = parseXml(docXml);
    if (!docTree) return { ok: false, error: 'word/document.xml לא נפרס (XML פגום).' };
    const commentsById = parseCommentsXml(commentsXml ? parseXml(commentsXml) : null);
    const creator = parseCreator(coreXml);

    const { comments, revisions, highlights, fullText, paragraphRuns } = walkDocument(docTree, commentsById);
    const { authors, suspectedLecturer } = inferAuthors({ comments, revisions }, creator);

    return {
      ok: true,
      comments,
      revisions,
      highlights,
      authors,
      creator,
      suspectedLecturer,
      gradeSuggestion: sniffGrade(fullText),
      fullText,
      paragraphRuns,
    };
  } catch (err) {
    const detail = [err?.name, err?.message].filter(Boolean).join(': ');
    return { ok: false, error: detail || String(err) || 'שגיאת חילוץ משוב' };
  }
}

/**
 * האם ריצה בודדת שייכת לגוף שהסטודנט הגיש?
 * · ריצה רגילה (בלי ins/del) — כן.
 * · הוספה של מישהו שאינו המרצה — כן (הסטודנט כתב עם עקוב-אחר-שינויים פעיל).
 * · הוספה של המרצה — לא (זו כתיבה של המרצה, לא של המשתמש).
 * · מחיקה של המרצה — כן: הטקסט הזה **היה** בהגשה המקורית.
 * · מחיקה של מישהו אחר — לא (הסטודנט עצמו הסיר אותה).
 * בלי מרצה מזוהה נוקטים בזהירות: כל ההוספות נזרקות (אי אפשר לייחס אותן).
 */
function runBelongsToSubmission(run, lecturerAuthor) {
  const ins = String(run?.insAuthor || '').trim();
  const del = String(run?.delAuthor || '').trim();
  if (!ins && !del) return true;
  if (!lecturerAuthor) return !ins;
  if (ins === lecturerAuthor) return false;
  if (ins) return true;
  return del === lecturerAuthor;
}

/** משחזר את גוף ההגשה המקורי של הסטודנט: בלי הוספות המרצה, עם הטקסט שהמרצה מחק. */
export function buildSubmittedBodyText(result, { lecturerAuthor = '' } = {}) {
  const paragraphs = Array.isArray(result?.paragraphRuns) ? result.paragraphRuns : [];
  if (!paragraphs.length) return '';
  // השוואת מחברים: trim בלבד — מחרוזות המחבר של Word רגישות-רישיות כמו שהן.
  const wanted = String(lecturerAuthor || '').trim();
  const out = [];
  for (const runs of paragraphs) {
    if (!Array.isArray(runs) || !runs.length) continue;
    const kept = runs
      .filter((r) => r && runBelongsToSubmission(r, wanted))
      .map((r) => String(r.text || ''));
    const paraText = collapse(kept.join(' '));
    if (paraText) out.push(paraText);
  }
  // הערות Word יושבות ב-comments.xml ולעולם אינן מזהמות את גוף המסמך — אין מה לסנן.
  return out.join('\n');
}

/**
 * המרה לאירועי משוב של lecturerProfileStore, מסונן למחבר שנבחר.
 * lecturerAuthor ריק ⇒ כל המחברים (קובץ שכולו של המרצה).
 */
export function docxFeedbackToEvents(result, { lecturerAuthor = '' } = {}) {
  if (!result?.ok) return [];
  const wanted = (author) => !lecturerAuthor || author === lecturerAuthor;
  const events = [];
  for (const c of result.comments) {
    if (!wanted(c.author) || !c.text) continue;
    events.push({ kind: 'comment', anchorExcerpt: c.anchorExcerpt, feedbackText: c.text });
  }
  for (const r of result.revisions) {
    if (!wanted(r.author)) continue;
    events.push({ kind: r.kind, anchorExcerpt: r.anchorExcerpt, feedbackText: r.feedbackText });
  }
  // הדגשות אין להן מחבר ב-OOXML — נכללות רק כשלא מסננים לפי מחבר, כי לבדן הן
  // אמירה חלשה ("שים לב לזה") בלי טקסט משוב.
  if (!lecturerAuthor) {
    for (const h of result.highlights) {
      events.push({ kind: 'highlight', anchorExcerpt: h.anchorExcerpt, feedbackText: '' });
    }
  }
  return events;
}
