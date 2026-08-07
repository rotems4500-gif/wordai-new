// lecturer-learning-unit.mjs — בדיקות offline למערך הלמידה ממשובי מרצים.
// הרצה: WORDAI_VERIFY_ENTRY=lprof + vite build -c vite.verify.config.mjs → node sf.mjs
// אפס קריאות API: הזיקוק נבדק במסלול הדטרמיניסטי (אין ספק AI ב-Node).
//
// docxFeedbackExtract לא נבדק כאן — צריך DOMParser (דפדפן). נבדק ב-preview.

import {
  __resetLecturerProfilesForTests,
  recordGradedReturn,
  addManualFeedback,
  resolveLecturerByName,
  listLecturerProfiles,
  getLecturerProfile,
  upsertRule,
  updateRule,
  deleteRule,
  deleteLecturer,
  mergeLecturers,
  getActiveRulesFor,
  exportLecturerProfiles,
  importLecturerProfiles,
  MAX_EVENTS_PER_LECTURER,
  normalizeLecturerName,
} from '../../src/services/lecturerProfileStore.js';
import {
  categorizeFeedbackText,
  clusterEvents,
  distillLecturerRules,
  saveDistilledRules,
  buildLecturerRulesBlock,
  LECTURER_RULES_BLOCK_HEADER,
} from '../../src/services/lecturerRulesService.js';
import {
  splitSentences,
  diffSubmissionVsReturned,
  bigramSimilarity,
} from '../../src/services/feedbackDiffService.js';
import { reviewDraft, SEVERITY } from '../../src/services/assignmentReviewService.js';
import { DOMParser as XmlDomParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { extractDocxFeedback, docxFeedbackToEvents, sniffGrade } from '../../src/services/docxFeedbackExtract.js';

// docxFeedbackExtract רץ בדפדפן על DOMParser — ב-Node משתמשים ב-xmldom.
globalThis.DOMParser = XmlDomParser;

let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
};

// ── 1. store: יצירה, רזולוציה, הזנה ידנית ──
console.log('\n[store]');
__resetLecturerProfilesForTests();

check('normalizeLecturerName strips titles', normalizeLecturerName('ד"ר יעל כהן') === 'יעל כהן');
check('normalizeLecturerName strips niqqud+spaces', normalizeLecturerName('  פרופ\' דָּוִד   לוי ') === 'דוד לוי');

const ret1 = await recordGradedReturn('ד"ר יעל כהן', {
  courseName: 'דיני חוקה', assignmentTitle: 'מטלה 1', grade: 82, source: 'manual',
}, [
  { kind: 'comment', anchorExcerpt: 'כפי שנקבע בבג"צ קול העם', feedbackText: 'חסר עימוד בציטוט — הוסף עמ\'' },
  { kind: 'comment', anchorExcerpt: 'הזכות לחופש ביטוי', feedbackText: 'ציטוט ללא עימוד שוב. חובה עמ\' בכל הפניה' },
]);
check('recordGradedReturn creates lecturer', !!ret1?.lecturer?.id);
check('return has 2 events', ret1.addedEvents.length === 2);
check('resolve by plain name', resolveLecturerByName('יעל כהן')?.id === ret1.lecturer.id);
check('resolve with different title', resolveLecturerByName('פרופ\' יעל כהן')?.id === ret1.lecturer.id);
check('course recorded', getLecturerProfile(ret1.lecturer.id).courses.includes('דיני חוקה'));

const manual = await addManualFeedback({
  lecturerName: 'יעל כהן', courseName: 'דיני חוקה', assignmentTitle: 'מטלה 2', grade: 88,
  feedbackText: 'העבודה טובה אבל חסרה מסקנה מסכמת.\n\nשוב אין עמוד בהפניות — עימוד חסר.',
});
check('manual feedback splits paragraphs', manual.addedEvents.length === 2);
check('manual lands on same lecturer', manual.lecturer.id === ret1.lecturer.id);
check('two returns recorded', getLecturerProfile(ret1.lecturer.id).returns.length === 2);

// ── 2. rules: זיקוק דטרמיניסטי (בלי ספק AI), אנטי-הזיה, userEdited ──
console.log('\n[rules]');
check('categorize citation', categorizeFeedbackText('חסר עימוד בציטוט') === 'citation');
check('categorize structure', categorizeFeedbackText('חסרה מסקנה מסכמת') === 'structure');
check('categorize argument', categorizeFeedbackText('הטיעון שטחי ולא מבוסס') === 'argument');
check('categorize fallback', categorizeFeedbackText('משהו כללי לגמרי') === 'other');

const lecturer = getLecturerProfile(ret1.lecturer.id);
const clusters = clusterEvents(lecturer.events);
check('similar comments cluster', clusters.some((c) => c.events.length >= 2),
  `clusters: ${clusters.map((c) => c.events.length).join(',')}`);

const distilled = await distillLecturerRules(lecturer.id);
check('distill ok (deterministic path)', distilled.ok && !distilled.viaModel);
check('distill produced candidates', distilled.candidates.length >= 1);
check('candidates cite real events', distilled.candidates.every((c) =>
  c.evidenceEventIds.every((id) => lecturer.events.some((e) => e.id === id))));

const saveRes = await saveDistilledRules(lecturer.id, distilled.candidates);
check('rules saved', saveRes.saved === distilled.candidates.length);

const withRules = getLecturerProfile(lecturer.id);
const firstRule = withRules.rules[0];
check('confidence derived from evidence', ['low', 'medium', 'high'].includes(firstRule.confidence));

await updateRule(firstRule.id, { text: 'טקסט שהמשתמש ניסח בעצמו' }, { lecturerId: lecturer.id });
const editedRule = getLecturerProfile(lecturer.id).rules.find((r) => r.id === firstRule.id);
check('user edit applied + flagged', editedRule.text === 'טקסט שהמשתמש ניסח בעצמו' && editedRule.userEdited);

// זיקוק חוזר לא דורס עריכת משתמש (merge לפי דמיון לא יתפוס טקסט שונה לגמרי,
// אז בודקים דרך upsert עם אותו id)
await upsertRule({ ...editedRule, text: 'טקסט אחר מהמודל', userEdited: false }, { lecturerId: lecturer.id });
// upsert מחליף — אבל המסלול האמיתי (candidates עם mergedInto) שומר טקסט. כאן בודקים deleteRule:
await deleteRule(editedRule.id, { lecturerId: lecturer.id });
const resurrect = await upsertRule({ id: editedRule.id, text: 'ניסיון החייאה' }, { lecturerId: lecturer.id });
check('deleted rule not resurrected', resurrect === null);

// ── 3. getActiveRulesFor + block builder ──
console.log('\n[block]');
await upsertRule({ text: 'המרצה דורש עימוד בכל הפניה — הוסף עמ\'', category: 'citation', evidenceEventIds: lecturer.events.slice(0, 2).map((e) => e.id) }, { lecturerId: lecturer.id });
await upsertRule({ text: 'לקח גלובלי: תמיד פסקת מסקנה', category: 'structure', scope: 'global', evidenceEventIds: [lecturer.events[0].id] }, {});

const { rules: activeRules } = getActiveRulesFor({ lecturerName: 'ד"ר יעל כהן' });
check('active rules include lecturer+global', activeRules.length >= 2);

const block = buildLecturerRulesBlock({ lecturerName: 'יעל כהן', courseName: 'דיני חוקה' });
check('block has header', block.startsWith(LECTURER_RULES_BLOCK_HEADER));
check('block names lecturer+course', block.includes('יעל כהן') && block.includes('דיני חוקה'));
const tinyBlock = buildLecturerRulesBlock({ lecturerName: 'יעל כהן', budget: 120 });
check('tiny budget → empty or within budget', tinyBlock === '' || tinyBlock.length <= 140, `len=${tinyBlock.length}`);
check('no-lecturer → global only, still works', buildLecturerRulesBlock({}).includes('גלובלי') || buildLecturerRulesBlock({}).includes('מסקנה'));

// ── 4. sync merge: import דו-כיווני, tombstones, cap ──
console.log('\n[sync]');
const exported = exportLecturerProfiles();
__resetLecturerProfilesForTests();
await importLecturerProfiles(exported);
check('import restores lecturers', listLecturerProfiles().length === 1);
check('import restores rules', getLecturerProfile(ret1.lecturer.id)?.rules.length >= 1);

// מיזוג: צד מרוחק עם אירוע נוסף לא מוחק מקומי, ולהפך
const remote = JSON.parse(JSON.stringify(exportLecturerProfiles()));
remote.lecturers[ret1.lecturer.id].events.push({
  id: 'e_remote1', returnId: 'ret_x', kind: 'manual', anchorExcerpt: '', feedbackText: 'אירוע שנוסף במכשיר אחר', sectionHint: '', category: 'other', createdAt: new Date().toISOString(),
});
const localEventCount = getLecturerProfile(ret1.lecturer.id).events.length;
await importLecturerProfiles(remote);
check('merge unions events', getLecturerProfile(ret1.lecturer.id).events.length === localEventCount + 1);

await deleteLecturer(ret1.lecturer.id);
check('tombstone hides lecturer', listLecturerProfiles().length === 0);
await importLecturerProfiles(remote); // remote עוד לא יודע על המחיקה — updatedAt שלו ישן יותר
check('tombstone survives import of older remote', listLecturerProfiles().length === 0);

// cap: אירוע 61+ מדיח ישנים
__resetLecturerProfilesForTests();
const manyEvents = Array.from({ length: MAX_EVENTS_PER_LECTURER + 15 }, (_, i) => ({
  kind: 'manual', anchorExcerpt: `עוגן ${i}`, feedbackText: `הערה ייחודית מספר ${i} עם תוכן שונה לגמרי ${i * 7}`,
}));
const big = await recordGradedReturn('מרצה עמוס', { source: 'manual' }, manyEvents);
check('event cap enforced', getLecturerProfile(big.lecturer.id).events.length <= MAX_EVENTS_PER_LECTURER,
  `events=${getLecturerProfile(big.lecturer.id).events.length}`);

// ── 5. diff service ──
console.log('\n[diff]');
const sents = splitSentences('ההלכה נקבעה בעמ\' 12 לפסק הדין. ראו ד"ר כהן, עמ\' 3.5 ואילך. משפט שלישי כאן.');
check('abbrev/decimal not split', sents.length === 3, `got ${sents.length}: ${JSON.stringify(sents)}`);

const submitted = 'הזכות לחופש ביטוי היא זכות יסוד במשפט הישראלי. היא הוכרה בפסיקה עוד לפני חקיקת חוקי היסוד. עם זאת קיימות לה מגבלות שונות. המסקנה היא שהאיזון נדרש בכל מקרה לגופו.';
const returned = 'הזכות לחופש ביטוי היא זכות יסוד במשפט הישראלי. היא הוכרה בפסיקה עוד לפני חקיקת חוקי היסוד, ראו בג"צ קול העם. עם זאת קיימות לה מגבלות שונות. המסקנה היא שהאיזון נדרש בכל מקרה לגופו.';
const diffRes = diffSubmissionVsReturned(submitted, returned);
check('diff ok', diffRes.ok);
check('single change → replacement pair', diffRes.events.length === 1 && diffRes.events[0].kind === 'replacement',
  JSON.stringify(diffRes.events));
check('no confirmation needed for small change', !diffRes.needsConfirmation);

const unrelated = diffSubmissionVsReturned(submitted, 'טקסט אחר לגמרי על נושא שונה בכלל. אין שום קשר בין המסמכים האלה. עוד משפט שונה לחלוטין. וגם רביעי שאין לו אח ורע.');
check('unrelated docs → needsConfirmation', unrelated.needsConfirmation);
check('bigramSimilarity sane', bigramSimilarity('ציטוט ללא עימוד', 'ציטוט ללא עימוד') === 1
  && bigramSimilarity('ציטוט ללא עימוד', 'משהו אחר לגמרי') < 0.3);

// ── 6. reviewDraft עם לקחי מרצה ──
console.log('\n[review]');
const spec = {
  title: 'עבודה', totalWords: 0, sections: [
    { id: 'sec_1', title: 'דיון', enabled: true, wordQuota: 0 },
  ],
};
const draft = {
  sections: [{ id: 'sec_1', title: 'דיון', text: 'טענה מרכזית שנשענת על הפסיקה (כהן, 2019) והיא חשובה מאוד לניתוח. '.repeat(3) }],
  bibliography: [],
};
const pageLessRules = [
  { id: 'r1', text: 'המרצה מוריד נקודות על ציטוט ללא עימוד — הוסף עמ\' לכל הפניה', category: 'citation', status: 'active', evidenceCount: 2, confidence: 'medium' },
  { id: 'r2', text: 'חובה פסקת מסקנה מסכמת', category: 'structure', status: 'active', evidenceCount: 1, confidence: 'low' },
];
const rev = reviewDraft(spec, draft, { lecturerRules: pageLessRules, lecturerName: 'ד"ר כהן' });
check('citation-without-page flagged', rev.findings.some((f) => f.id === 'lect-citation-pages'));
check('missing conclusion flagged', rev.findings.some((f) => f.id === 'lect-conclusion'));
check('finding cites lecturer', rev.findings.find((f) => f.id === 'lect-citation-pages')?.detail.includes('ד"ר כהן'));

const revDisabled = reviewDraft(spec, draft, { lecturerRules: pageLessRules.map((r) => ({ ...r, status: 'disabled' })) });
check('disabled rules flag nothing', !revDisabled.findings.some((f) => String(f.id).startsWith('lect-')));

const draftWithPages = {
  sections: [{ id: 'sec_1', title: 'דיון ומסקנה', text: 'טענה עם הפניה מלאה (כהן, 2019, עמ\' 14). לסיכום, האיזון נדרש.' }],
  bibliography: [],
};
const revClean = reviewDraft(spec, draftWithPages, { lecturerRules: pageLessRules });
check('clean draft passes lecturer checks', !revClean.findings.some((f) => String(f.id).startsWith('lect-')));

// ── 7. חילוץ docx: הערות, שינויים עוקבים, זיהוי מרצה, ציון ──
console.log('\n[docx]');
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const fixtureZip = new JSZip();
fixtureZip.file('word/document.xml', `<?xml version="1.0"?>
<w:document ${W}><w:body>
  <w:p>
    <w:r><w:t>ציון: 79</w:t></w:r>
  </w:p>
  <w:p>
    <w:commentRangeStart w:id="1"/>
    <w:r><w:t>הזכות לחופש הביטוי הוכרה בפסיקה</w:t></w:r>
    <w:commentRangeEnd w:id="1"/>
    <w:r><w:commentReference w:id="1"/></w:r>
    <w:r><w:t> עוד לפני חוקי היסוד.</w:t></w:r>
  </w:p>
  <w:p>
    <w:del w:author="ד״ר יעל כהן"><w:r><w:delText>ניסוח מסורבל שנמחק</w:delText></w:r></w:del>
    <w:ins w:author="ד״ר יעל כהן"><w:r><w:t>ניסוח בהיר שהוכנס</w:t></w:r></w:ins>
    <w:r><w:t>המשך הפסקה.</w:t></w:r>
  </w:p>
  <w:p>
    <w:r><w:commentReference w:id="2"/></w:r>
    <w:r><w:t>פסקה עם הערה בלי טווח מסומן.</w:t></w:r>
  </w:p>
</w:body></w:document>`);
fixtureZip.file('word/comments.xml', `<?xml version="1.0"?>
<w:comments ${W}>
  <w:comment w:id="1" w:author="ד״ר יעל כהן" w:date="2026-08-01T10:00:00Z"><w:p><w:r><w:t>חסר מקור להכרה בפסיקה — הוסיפי אסמכתא</w:t></w:r></w:p></w:comment>
  <w:comment w:id="2" w:author="ד״ר יעל כהן"><w:p><w:r><w:t>הפסקה הזו שטחית — העמיקי את הניתוח</w:t></w:r></w:p></w:comment>
</w:comments>`);
fixtureZip.file('docProps/core.xml', `<?xml version="1.0"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>רותם הסטודנט</dc:creator></cp:coreProperties>`);
const fixtureBytes = await fixtureZip.generateAsync({ type: 'uint8array' });

const docxRes = await extractDocxFeedback(fixtureBytes);
check('docx extract ok', docxRes.ok, docxRes.error);
check('two comments extracted', docxRes.comments.length === 2, `got ${docxRes.comments.length}`);
const ranged = docxRes.comments.find((c) => c.id === '1');
check('ranged comment anchored to marked text', ranged?.anchorExcerpt?.includes('הזכות לחופש הביטוי'), ranged?.anchorExcerpt);
check('anchor excludes text after range end', !ranged?.anchorExcerpt?.includes('חוקי היסוד'), ranged?.anchorExcerpt);
const rangeless = docxRes.comments.find((c) => c.id === '2');
check('rangeless comment anchored to paragraph', rangeless?.anchorExcerpt?.includes('פסקה עם הערה'), rangeless?.anchorExcerpt);
check('del+ins paired to replacement', docxRes.revisions.some((r) => r.kind === 'replacement' && r.anchorExcerpt.includes('מסורבל') && r.feedbackText.includes('בהיר')), JSON.stringify(docxRes.revisions));
check('lecturer inferred (not creator)', docxRes.suspectedLecturer.includes('יעל כהן'), docxRes.suspectedLecturer);
check('grade sniffed', docxRes.gradeSuggestion === 79, String(docxRes.gradeSuggestion));
const docxEvents = docxFeedbackToEvents(docxRes, { lecturerAuthor: docxRes.suspectedLecturer });
check('events filtered to lecturer', docxEvents.length === 3, `got ${docxEvents.length}`);
check('sniffGrade x/100 form', sniffGrade('העבודה קיבלה 92/100 בזכות הניתוח') === 92);

// ── סיכום ──
console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
