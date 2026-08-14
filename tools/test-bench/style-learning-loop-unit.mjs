// style-learning-loop-unit.mjs — בדיקות offline למשטח הלמידה החדש של מנוע הסגנון.
// אפס קריאות API: כל המסלולים כאן דטרמיניסטיים (counters, dedupe, שערי הסכמה/בעלות).
//
// הרצה:
//   $env:WORDAI_VERIFY_ENTRY='stylelearn'; npx vite build -c vite.verify.config.mjs
//   node tools/test-bench/.verify-scratch/out-stylelearn/sf.mjs
//
// מה נבדק (workstream 1d):
//   1. accept → מונה בלבד, הקורפוס לא זז
//   2. reject עם דלתא קטנה → signals מתמזגים ל-editCounters, בלי gold
//   3. reject עם דלתא גדולה → gold chunk 'gold-reject' + dedupe
//   4. שערי הסכמה/מנוע-כבוי → recorded:false, מונים לא זזים
//   5. addGoldChunk — dedupe תוכן
//   6. buildSubmittedBodyText (רק אם workstream 1b נחת)
//   7. ingestGradedSubmission — consent / too-short / happy / dedupe
//   8. assessDocOwnership — 4 ההכרעות
//   9. maybeCaptureFinishedDocument — לכידה, unchanged, throttled
//  10. normalizeStyleEngine — round-trip של השדות החדשים
//
// מה נבדק (השכבה העמוקה — A2/A4-A8):
//  11. parsePatternExtractionResult — 3 סוגי הדפוסים החדשים, strict מול lenient
//  12. parsePatternExtractionResult — structuralSignature/avoidedPhrases: clip, dedupe, cap
//  13. mergeStructuralSignature — קיפול פר-מפתח, null-safe
//  14. normalizeStyleEngine — structuralSignature שורד round-trip
//  15. buildExternalPatternAnalysisPrompt / buildPatternExtractionPrompt (deep)
//  16. buildDeepProfileExtractionPrompt — סכימת המטא בלבד
//  17. extractQualitativePatterns עם invokeModel כ-stub (בלי ספק, בלי רשת)
//  18. getRepresentativeExcerpts — קורפוס ריק, מכסות, id שבור
//  19. deriveStyleProfileFromSamples — מסלול no-provider
//  20. applyExternalPatternAnalyses — מיזוג חתימה + avoidedPhrases→blacklist (סדר!)
//      + extractionMeta: externalBatches/structuralKeysLearned/avoidedPhrasesAdded שורדים שמירה
//  21. buildStyleEngineInjectionBlock — סקשן "מבנה אופייני"
//  22. applyExternalPatternAnalyses — הדבקה בלי דפוסים אך עם אות עמוק (deep-only):
//      נקלטת בלי לדלל את batches; מסלול מטא-בלבד לא מסמן ניתוח שהושלם; early-fail נשמר
//
// ⚠️ ה-shims של הדפדפן חייבים להיות מוגדרים *לפני* טעינת המודולים (styleSampleStore
// מריץ hydrate ברמת המודול), ולכן כל הייבוא כאן דינמי — כמו ב-lab-entry.mjs.

// ---------- browser shims ----------
const lsStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
  setItem: (k, v) => lsStore.set(k, String(v)),
  removeItem: (k) => lsStore.delete(k),
  clear: () => lsStore.clear(),
  key: (i) => [...lsStore.keys()][i] ?? null,
  get length() { return lsStore.size; },
};
globalThis.window = globalThis;
globalThis.self = globalThis;
if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { userAgent: 'node-stylelearn', language: 'he' };
globalThis.document = {
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }),
  createTextNode: () => ({}),
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  body: { appendChild() {}, removeChild() {} }, documentElement: { style: {} }, hidden: false,
};
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
globalThis.dispatchEvent = globalThis.dispatchEvent || (() => true);
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent { constructor(type, opts = {}) { this.type = type; this.detail = opts.detail; } };
}

// ---------- real modules ----------
const { DOMParser: XmlDomParser } = await import('@xmldom/xmldom');
globalThis.DOMParser = XmlDomParser; // docxFeedbackExtract רץ על DOMParser של הדפדפן
const JSZip = (await import('jszip')).default;

const ai = await import('../../src/services/aiService.js');
const styleProfile = await import('../../src/services/styleProfileService.js');
const {
  normalizeStyleEngine,
  parsePatternExtractionResult,
  mergeStructuralSignature,
  extractQualitativePatterns,
  buildPatternExtractionPrompt,
  buildExternalPatternAnalysisPrompt,
  buildDeepProfileExtractionPrompt,
  buildStyleEngineInjectionBlock,
  AI_CLICHE_BLACKLIST,
} = styleProfile;
const samples = await import('../../src/services/styleSampleStore.js');
const delta = await import('../../src/services/styleDeltaService.js');
const ingest = await import('../../src/services/styleIngestService.js');
const docxFeedback = await import('../../src/services/docxFeedbackExtract.js');

let passed = 0;
let failed = 0;
let skipped = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
};
const skip = (name, why) => { skipped += 1; console.log(`  ⊘ ${name} — ${why}`); };

const FINISHED_CAPTURE_KEY = 'wordai_style_finished_capture_v1';

// מצב נקי בין מקרים: שלוש שכבות האחסון + מפת ה-throttle + פרופיל עם הסכמה ומנוע פעיל.
function resetAll({ consent = true, engineEnabled = true } = {}) {
  try { ingest.resetStyleLearning(); } catch {}
  localStorage.removeItem(FINISHED_CAPTURE_KEY);
  ai.savePersonalStyleProfile({
    ...ai.getPersonalStyleProfile(),
    learningConsent: consent,
    styleEngine: { enabled: engineEnabled },
  });
}

const engineNow = () => normalizeStyleEngine(ai.getPersonalStyleProfile()?.styleEngine);
const countersNow = () => engineNow().editCounters;
const statsNow = () => samples.getSampleStoreStats();
const goldChunks = () => samples.getChunks({ goldOnly: true });

// ---------- fixtures ----------

// ~30 מילים; ההחלפה היחידה היא 'חשובה' → 'מרכזית' (דלתא < 20%).
const AI_SENTENCE = 'הזכות לחופש הביטוי היא זכות יסוד במשפט הישראלי והיא הוכרה בפסיקה עוד לפני חקיקת חוקי היסוד ולכן היא חשובה מאוד לניתוח המשפטי של הסוגיה הנדונה בעבודה הזאת.';
const USER_SENTENCE = AI_SENTENCE.replace('חשובה', 'מרכזית');

// ≥45 מילים, ניסוח של המשתמש שאין לו שום קשר לניסוח ה-AI (דלתא ~1).
const USER_LONG = 'בית המשפט העליון נדרש לא אחת לשאלה כיצד יש לאזן בין חופש הביטוי לבין הזכות לשם טוב, '
  + 'והתשובה שגובשה בפסיקה אינה נוסחה מתמטית אלא מבחן גמיש שמשקלל את זהות הדובר, את ההקשר שבו נאמרו הדברים '
  + 'ואת מידת הפגיעה הצפויה. גישה זו מאפשרת לבית המשפט להתאים את ההכרעה לנסיבות הקונקרטיות של כל מקרה ומקרה, '
  + 'ובכך היא נאמנה לתפיסה שלפיה זכויות יסוד אינן מוחלטות אלא יחסיות.';
const AI_LONG = 'האיזון בין הזכויות נקבע לפי מבחן משולב.';

// טקסט עברי ארוך (>1200 תווים) בפסקאות — מייצר chunks אמיתיים.
function longHebrewText(seedWord) {
  const para = `הדיון ב${seedWord} מחייב הבחנה בין הרובד הנורמטיבי לבין הרובד היישומי, שכן ההסדרה הפורמלית `
    + 'אינה מעידה בהכרח על אופן ההפעלה בשטח. ניתוח הפסיקה מלמד שבתי המשפט נוטים להעדיף מבחנים גמישים על פני '
    + 'כללים נוקשים, גם כשהדבר בא על חשבון הוודאות המשפטית, משום שהגמישות מאפשרת התאמה לנסיבות משתנות. '
    + 'עם זאת, גמישות זו גובה מחיר מצטבר: היא מקשה על הצדדים לכלכל את צעדיהם מראש ומעבירה משקל רב לשיקול הדעת השיפוטי.';
  return Array.from({ length: 5 }, (_, i) => `${para} כך עולה גם מן הדוגמה ה${i + 1} שנדונה לעיל.`).join('\n\n');
}

// ── 1. accept → מונה בלבד ──
console.log('\n[1] accept — מונה בלבד, הקורפוס לא זז');
await samples.ensureSampleStoreReady();
resetAll();
const before1 = statsNow();
const r1 = delta.recordSuggestionOutcome({ action: 'accept', originalText: USER_SENTENCE, replacementText: AI_SENTENCE, docId: 'doc_a' });
check('accept recorded', r1?.recorded === true, JSON.stringify(r1));
const ec1 = countersNow();
check('aiSuggestionAccepted=1', ec1.aiSuggestionAccepted === 1, String(ec1.aiSuggestionAccepted));
check('totalEditsObserved=1', ec1.totalEditsObserved === 1, String(ec1.totalEditsObserved));
check('rejected/dismissed נשארו 0', ec1.aiSuggestionRejected === 0 && ec1.aiSuggestionDismissed === 0);
const after1 = statsNow();
check('docCount לא השתנה', after1.docCount === before1.docCount, `${before1.docCount}→${after1.docCount}`);
check('chunkCount לא השתנה', after1.chunkCount === before1.chunkCount, `${before1.chunkCount}→${after1.chunkCount}`);
check('אין gold (טקסט AI לא נכנס לקורפוס)', after1.goldCount === 0, String(after1.goldCount));

// ── 2. reject עם דלתא קטנה → signals ל-counters ──
console.log('\n[2] reject דלתא קטנה — signals מתמזגים, בלי gold');
resetAll();
const r2 = delta.recordSuggestionOutcome({ action: 'reject', originalText: USER_SENTENCE, replacementText: AI_SENTENCE, docId: 'doc_b' });
check('reject recorded', r2?.recorded === true, JSON.stringify(r2));
check('classification=style', r2?.classification === 'style', JSON.stringify(r2));
const ec2 = countersNow();
check('aiSuggestionRejected=1', ec2.aiSuggestionRejected === 1, String(ec2.aiSuggestionRejected));
check('editsSinceSynthesis=1', ec2.editsSinceSynthesis === 1, String(ec2.editsSinceSynthesis));
check('replacedWord קלט את המילה של ה-AI', Object.keys(ec2.replacedWord).includes('חשובה'), JSON.stringify(ec2.replacedWord));
check('replacementPairs חשובה→מרכזית', ec2.replacementPairs?.['חשובה']?.reps?.['מרכזית'] === 1, JSON.stringify(ec2.replacementPairs));
check('לא נוצר gold chunk', statsNow().goldCount === 0, JSON.stringify(statsNow()));

// ── 3. reject עם דלתא גדולה → gold-reject + dedupe ──
console.log('\n[3] reject דלתא גדולה — gold-reject + dedupe');
resetAll();
const r3 = delta.recordSuggestionOutcome({ action: 'reject', originalText: USER_LONG, replacementText: AI_LONG, docId: 'doc_c' });
check('reject recorded', r3?.recorded === true, JSON.stringify(r3));
check('classification=content', r3?.classification === 'content', JSON.stringify(r3));
const gold3 = goldChunks();
check('נוצר gold chunk יחיד', gold3.length === 1, String(gold3.length));
check("title='gold-reject'", gold3[0]?.title === 'gold-reject', String(gold3[0]?.title));
check('gold מכיל את הטקסט של המשתמש', String(gold3[0]?.text || '').includes('מבחן גמיש'), String(gold3[0]?.text || '').slice(0, 40));
check('gold נושא docId', gold3[0]?.docId === 'doc_c', String(gold3[0]?.docId));
check('editsSinceSynthesis לא זז (דלתא גדולה)', countersNow().editsSinceSynthesis === 0, String(countersNow().editsSinceSynthesis));
delta.recordSuggestionOutcome({ action: 'reject', originalText: USER_LONG, replacementText: AI_LONG, docId: 'doc_c' });
check('קריאה חוזרת → dedupe (עדיין gold אחד)', goldChunks().length === 1, String(goldChunks().length));
check('אבל המונה כן עלה ל-2', countersNow().aiSuggestionRejected === 2, String(countersNow().aiSuggestionRejected));

// dismiss — מונה בלבד
resetAll();
const r3b = delta.recordSuggestionOutcome({ action: 'dismiss', originalText: USER_LONG, replacementText: AI_LONG });
check('dismiss recorded, מונה בלבד', r3b?.recorded === true && countersNow().aiSuggestionDismissed === 1 && goldChunks().length === 0,
  JSON.stringify({ r3b, ec: countersNow().aiSuggestionDismissed, gold: goldChunks().length }));

// ── 4. שערי הסכמה / מנוע כבוי ──
console.log('\n[4] שערים — learningConsent=false, styleEngine.enabled=false');
resetAll({ consent: false });
const r4a = delta.recordSuggestionOutcome({ action: 'accept', originalText: USER_SENTENCE, replacementText: AI_SENTENCE });
check('consent=false → recorded:false', r4a?.recorded === false, JSON.stringify(r4a));
check('consent=false → מונים לא זזו', countersNow().aiSuggestionAccepted === 0 && countersNow().totalEditsObserved === 0, JSON.stringify(countersNow()));

resetAll({ engineEnabled: false });
const r4b = delta.recordSuggestionOutcome({ action: 'reject', originalText: USER_LONG, replacementText: AI_LONG });
check('engine off → recorded:false', r4b?.recorded === false, JSON.stringify(r4b));
check('engine off → מונים לא זזו', countersNow().aiSuggestionRejected === 0 && countersNow().totalEditsObserved === 0, JSON.stringify(countersNow()));
check('engine off → אין gold', goldChunks().length === 0, String(goldChunks().length));

const r4c = delta.recordSuggestionOutcome({ action: 'bogus', originalText: USER_SENTENCE, replacementText: AI_SENTENCE });
check('פעולה לא מוכרת → recorded:false', r4c?.recorded === false, JSON.stringify(r4c));

// ── 5. addGoldChunk — dedupe תוכן ──
console.log('\n[5] addGoldChunk — dedupe תוכן');
resetAll();
const GOLD_TEXT = 'המסקנה המתבקשת מן הניתוח היא שהאיזון בין הערכים המתנגשים אינו נקבע במנותק מן ההקשר, '
  + 'אלא נגזר מן המשקל היחסי שמייחסת השיטה לכל אחד מהם בנסיבות הקונקרטיות שנדונו בפסק הדין המנחה בסוגיה זו.';
const gid1 = samples.addGoldChunk({ text: GOLD_TEXT, docId: 'doc_d', title: 'gold-reject' });
const gid2 = samples.addGoldChunk({ text: GOLD_TEXT, docId: 'doc_d', title: 'gold-reject' });
check('שתי הוספות → chunk אחד', goldChunks().length === 1, String(goldChunks().length));
check('אותו chunkId חוזר', Boolean(gid1) && gid1 === gid2, `${gid1} / ${gid2}`);
const gid3 = samples.addGoldChunk({ text: `${GOLD_TEXT} תוספת שמשנה את התוכן לחלוטין.`, docId: 'doc_d' });
check('טקסט שונה → chunk חדש', goldChunks().length === 2 && gid3 !== gid1, String(goldChunks().length));

// ── 6. buildSubmittedBodyText (workstream 1b) ──
console.log('\n[6] buildSubmittedBodyText — שחזור גוף ההגשה מ-docx בדוק');
if (typeof docxFeedback.buildSubmittedBodyText !== 'function') {
  skip('buildSubmittedBodyText', 'לא מיוצא מ-docxFeedbackExtract.js (workstream 1b טרם נחת)');
} else {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  // ⚠️ מחרוזת המחבר מושווית ב-buildSubmittedBodyText בהתאמה מדויקת (trim בלבד) — הגרשיים
  // ב-XML חייבים להיות אותו תו בדיוק כמו ב-lecturerAuthor. גרשיים עבריים (״) מול " נראים
  // זהים במסך ומפילים את הסינון בשקט.
  const zip = new JSZip();
  zip.file('word/document.xml', `<?xml version="1.0"?>
<w:document ${W}><w:body>
  <w:p><w:r><w:t>הזכות לחופש הביטוי הוכרה בפסיקה, עוד לפני חקיקת חוקי היסוד.</w:t></w:r></w:p>
  <w:p>
    <w:del w:author="ד&quot;ר כהן"><w:r><w:delText>הטיעון המרכזי שלי נשען על ההלכה שנקבעה בעניין קול העם.</w:delText></w:r></w:del>
    <w:ins w:author="ד&quot;ר כהן"><w:r><w:t>ההלכה בעניין קול העם היא אבן היסוד.</w:t></w:r></w:ins>
  </w:p>
</w:body></w:document>`);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const res6 = await docxFeedback.extractDocxFeedback(bytes);
  check('extractDocxFeedback ok', res6?.ok === true, String(res6?.error || ''));
  check('suspectedLecturer זוהה מתוך השינויים העוקבים', res6?.suspectedLecturer === 'ד"ר כהן', String(res6?.suspectedLecturer));
  const body = docxFeedback.buildSubmittedBodyText(res6, { lecturerAuthor: 'ד"ר כהן' });
  check('גוף ההגשה כולל את הטקסט הרגיל', String(body).includes('הזכות לחופש הביטוי הוכרה בפסיקה'), String(body).slice(0, 80));
  check('גוף ההגשה כולל את הטקסט שהמרצה מחק (המקור של הסטודנט)', String(body).includes('הטיעון המרכזי שלי נשען'), String(body).slice(0, 120));
  check('גוף ההגשה לא כולל את ההוספה של המרצה', !String(body).includes('אבן היסוד'), String(body).slice(0, 120));
  check('פיסוק עברי שרד', String(body).includes('בפסיקה, עוד'), String(body).slice(0, 80));
}

// ── 7. ingestGradedSubmission ──
console.log('\n[7] ingestGradedSubmission — שערים, קליטה, dedupe');
resetAll({ consent: false });
const g7a = await ingest.ingestGradedSubmission({ title: 'עבודה בדוקה', text: longHebrewText('חופש הביטוי') });
check("consent=false → skipped:'consent'", g7a?.skipped === 'consent', JSON.stringify(g7a));

resetAll();
const g7b = await ingest.ingestGradedSubmission({ title: 'עבודה קצרה', text: 'טקסט קצר מדי לקליטה.' });
check("טקסט קצר → skipped:'too-short'", g7b?.skipped === 'too-short', JSON.stringify(g7b));
check('הקורפוס נשאר ריק', statsNow().docCount === 0, JSON.stringify(statsNow()));

const GRADED_TEXT = longHebrewText('חופש הביטוי');
check('פיקסטורה חוצה 1200 תווים', GRADED_TEXT.trim().length >= 1200, String(GRADED_TEXT.trim().length));
const g7c = await ingest.ingestGradedSubmission({ title: 'עבודה בדוקה 1', text: GRADED_TEXT });
check('קליטה מוצלחת', Boolean(g7c?.docId) && Number(g7c?.added) > 0, JSON.stringify(g7c));
const doc7 = samples.getSampleDocuments().find((d) => d.id === g7c.docId);
check("source='graded-submission'", doc7?.source === 'graded-submission', String(doc7?.source));
const docCount7 = statsNow().docCount;
const g7d = await ingest.ingestGradedSubmission({ title: 'עבודה בדוקה 1 שוב', text: GRADED_TEXT });
check('קליטה חוזרת → skipped', g7d?.skipped === true, JSON.stringify(g7d));
check('docCount לא השתנה', statsNow().docCount === docCount7, `${docCount7}→${statsNow().docCount}`);

// ── 8. assessDocOwnership ──
console.log('\n[8] assessDocOwnership — ארבע ההכרעות');
resetAll();
const OWN_TEXT = longHebrewText('הליך ההסדרה');
const own8a = delta.assessDocOwnership({ docId: 'doc_own_1', currentText: OWN_TEXT });
check('מסמך ללא פלט AI → eligible/no-ai-generation',
  own8a?.eligible === true && own8a.reason === 'no-ai-generation', JSON.stringify(own8a));

delta.snapshotGeneration({ docId: 'doc_own_2', generatedText: OWN_TEXT });
const own8b = delta.assessDocOwnership({ docId: 'doc_own_2', currentText: OWN_TEXT });
check('פלט AI בתולי → ineligible/ai-pristine',
  own8b?.eligible === false && own8b.reason === 'ai-pristine', JSON.stringify(own8b));

// דלתא גדולה: הטקסט הנוכחי שונה לגמרי → diffAfterEdit מסמן changeRatio≥0.2
const diff8 = delta.diffAfterEdit({ docId: 'doc_own_2', currentText: `${USER_LONG} ${USER_LONG}` });
check('diffAfterEdit סיווג content עם ratio≥0.2', diff8?.classification === 'content' && diff8.changeRatio >= 0.2, JSON.stringify(diff8 && { c: diff8.classification, r: diff8.changeRatio }));
const own8c = delta.assessDocOwnership({ docId: 'doc_own_2', currentText: `${USER_LONG} ${USER_LONG}` });
check('אחרי שכתוב עמוק → eligible/heavily-reworked',
  own8c?.eligible === true && own8c.reason === 'heavily-reworked', JSON.stringify(own8c));

// דלתא קטנה על מסמך אחר → mostly-ai
delta.snapshotGeneration({ docId: 'doc_own_3', generatedText: AI_SENTENCE.repeat(4) });
const diff8b = delta.diffAfterEdit({ docId: 'doc_own_3', currentText: `${AI_SENTENCE.repeat(3)}${USER_SENTENCE}` });
check('עריכה קטנה → classification=style', diff8b?.classification === 'style', JSON.stringify(diff8b && { c: diff8b.classification, r: diff8b.changeRatio }));
const own8d = delta.assessDocOwnership({ docId: 'doc_own_3', currentText: `${AI_SENTENCE.repeat(3)}${USER_SENTENCE}` });
check('עריכה קלה בלבד → ineligible/mostly-ai',
  own8d?.eligible === false && own8d.reason === 'mostly-ai', JSON.stringify(own8d));

// ── 9. maybeCaptureFinishedDocument ──
console.log('\n[9] maybeCaptureFinishedDocument — לכידה, unchanged, throttled');
resetAll();
const FIN_TEXT = longHebrewText('שיקול הדעת השיפוטי');
const c9a = await ingest.maybeCaptureFinishedDocument({ docId: 'doc_fin_1', text: FIN_TEXT, title: 'עבודה מהעורך' });
check('לכידה מוצלחת', c9a?.captured === true && c9a.reason === 'ok', JSON.stringify(c9a));
const finDoc = samples.getSampleDocuments().find((d) => d.source === 'finished-doc');
check("source='finished-doc'", Boolean(finDoc), JSON.stringify(samples.getSampleDocuments().map((d) => d.source)));

const c9b = await ingest.maybeCaptureFinishedDocument({ docId: 'doc_fin_1', text: FIN_TEXT });
check("אותו תוכן → reason='unchanged'", c9b?.captured === false && c9b.reason === 'unchanged', JSON.stringify(c9b));

const c9c = await ingest.maybeCaptureFinishedDocument({ docId: 'doc_fin_1', text: `${FIN_TEXT}\n\n${USER_LONG}` });
check("תוכן שהשתנה בתוך 24 שעות → reason='throttled'", c9c?.captured === false && c9c.reason === 'throttled', JSON.stringify(c9c));

const c9d = await ingest.maybeCaptureFinishedDocument({ docId: 'doc_fin_2', text: 'קצר מדי.' });
check("טקסט קצר → reason='too-short'", c9d?.captured === false && c9d.reason === 'too-short', JSON.stringify(c9d));

resetAll({ consent: false });
const c9e = await ingest.maybeCaptureFinishedDocument({ docId: 'doc_fin_3', text: FIN_TEXT });
check("consent=false → reason='consent'", c9e?.captured === false && c9e.reason === 'consent', JSON.stringify(c9e));

resetAll({ engineEnabled: false });
const c9f = await ingest.maybeCaptureFinishedDocument({ docId: 'doc_fin_4', text: FIN_TEXT });
check("engine off → reason='engine-off'", c9f?.captured === false && c9f.reason === 'engine-off', JSON.stringify(c9f));

resetAll();
delta.snapshotGeneration({ docId: 'doc_fin_5', generatedText: FIN_TEXT });
const c9g = await ingest.maybeCaptureFinishedDocument({ docId: 'doc_fin_5', text: FIN_TEXT });
check("פלט AI בתולי → reason='ai-pristine'", c9g?.captured === false && c9g.reason === 'ai-pristine', JSON.stringify(c9g));

// ── 10. recordRevisionFeedback + normalizeStyleEngine round-trip ──
console.log('\n[10] revisionFeedbackNotes — clip 200, dedupe, cap 12');
resetAll();
check('רישום ראשון', ingest.recordRevisionFeedback('קצר מדי, תרחיב את הפסקה השנייה') === true);
check('כפילות נדחית', ingest.recordRevisionFeedback('קצר מדי, תרחיב את הפסקה השנייה') === false);
check('טקסט ריק נדחה', ingest.recordRevisionFeedback('   ') === false);
check('הערה אחת בפרופיל', engineNow().revisionFeedbackNotes.length === 1, JSON.stringify(engineNow().revisionFeedbackNotes));
const LONG_NOTE = 'א'.repeat(250);
check('רישום הערה ארוכה', ingest.recordRevisionFeedback(LONG_NOTE) === true);
const notesAfter = engineNow().revisionFeedbackNotes;
check('טקסט נחתך ל-200', notesAfter[notesAfter.length - 1].text.length === 200, String(notesAfter[notesAfter.length - 1].text.length));

resetAll({ consent: false });
check('consent=false → לא נרשם', ingest.recordRevisionFeedback('משוב כלשהו') === false);

// round-trip ישיר על normalizeStyleEngine
const roundTrip = normalizeStyleEngine({
  enabled: true,
  editCounters: { aiSuggestionAccepted: 7, aiSuggestionRejected: 3, aiSuggestionDismissed: 2 },
  revisionFeedbackNotes: Array.from({ length: 14 }, (_, i) => ({ text: `הערה ${i + 1} ${'ב'.repeat(300)}`, at: 1000 + i })),
});
check('שלושת המונים החדשים נשמרו',
  roundTrip.editCounters.aiSuggestionAccepted === 7
  && roundTrip.editCounters.aiSuggestionRejected === 3
  && roundTrip.editCounters.aiSuggestionDismissed === 2, JSON.stringify(roundTrip.editCounters));
check('הערות מוגבלות ל-12', roundTrip.revisionFeedbackNotes.length === 12, String(roundTrip.revisionFeedbackNotes.length));
check('נשמרות ה-12 האחרונות', roundTrip.revisionFeedbackNotes[0].text.startsWith('הערה 3'), roundTrip.revisionFeedbackNotes[0].text.slice(0, 12));
check('כל הערה חתוכה ל-200', roundTrip.revisionFeedbackNotes.every((n) => n.text.length <= 200));
check('at נשמר', roundTrip.revisionFeedbackNotes[0].at === 1002, String(roundTrip.revisionFeedbackNotes[0].at));

// ==========================================================================
// A2/A4-A8 — השכבה העמוקה: 8 סוגי דפוסים, structuralSignature, avoidedPhrases,
// הפרומפטים החדשים, וקטעים מייצגים. הכול דטרמיניסטי — אפס קריאות API
// (הפונקציות שדורשות ספק נבדקות במסלול ה-no-provider או מונעות ב-stub).
// ==========================================================================

const STRUCT_KEYS = ['opening', 'closing', 'thesisPlacement', 'sectionFlow', 'firstPersonUsage'];
const wordCount = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;

// ── 11. parsePatternExtractionResult — שלושת הסוגים החדשים ──
console.log('\n[11] parsePatternExtractionResult — citation/argument_move/transition');
const TYPES_JSON = JSON.stringify({
  patterns: [
    { label: 'מפנה בסוגריים בסוף המשפט', type: 'citation', weight: 0.8, evidence: '(רובינשטיין, 2019)' },
    { label: 'מודה בטענת הנגד ואז מפריך', type: 'argument_move', weight: 0.7, evidence: 'אכן, ניתן לטעון כי' },
    { label: 'חוזר על מונח מהפסקה הקודמת', type: 'transition', weight: 0.6, evidence: 'איזון זה' },
    { label: 'ביטוי חתימה קבוע', type: 'signature_phrase', weight: 0.9, evidence: 'דומה כי' },
    { label: 'דפוס עם סוג מומצא', type: 'vibe_check', weight: 0.5, evidence: 'משהו' },
  ],
  negativeSpace: ['שאלות רטוריות'],
});
const strict11 = parsePatternExtractionResult(TYPES_JSON, { lenientTypes: false });
const strictTypes11 = strict11.patterns.map((p) => p.type);
check('strict — citation נשמר', strictTypes11.includes('citation'), JSON.stringify(strictTypes11));
check('strict — argument_move נשמר', strictTypes11.includes('argument_move'), JSON.stringify(strictTypes11));
check('strict — transition נשמר', strictTypes11.includes('transition'), JSON.stringify(strictTypes11));
check('strict — סוג מומצא נזרק', strict11.patterns.length === 4 && !strictTypes11.includes('vibe_check'), JSON.stringify(strictTypes11));
const lenient11 = parsePatternExtractionResult(TYPES_JSON, { lenientTypes: true });
check('lenient — כל 5 הדפוסים נשמרים', lenient11.patterns.length === 5, String(lenient11.patterns.length));
check('lenient — הסוג המומצא ממופה ל-lexical_habit',
  lenient11.patterns.find((p) => p.label === 'דפוס עם סוג מומצא')?.type === 'lexical_habit',
  JSON.stringify(lenient11.patterns.map((p) => p.type)));
check('lenient — הסוגים החדשים לא הומרו',
  lenient11.patterns.filter((p) => ['citation', 'argument_move', 'transition'].includes(p.type)).length === 3,
  JSON.stringify(lenient11.patterns.map((p) => p.type)));

// ── 12. parsePatternExtractionResult — השדות העמוקים ──
console.log('\n[12] parsePatternExtractionResult — structuralSignature + avoidedPhrases');
const LONG_OPENING = `פותח ${'א'.repeat(300)}`;
const deepJson12 = JSON.stringify({
  patterns: [{ label: 'מפנה בסוף משפט', type: 'citation', weight: 0.5, evidence: '(כהן, 2020)' }],
  negativeSpace: ['סימני קריאה'],
  structuralSignature: {
    opening: LONG_OPENING,
    closing: '  מסיים בהשלכות מעשיות  ',
    thesisPlacement: 'תזה בסוף המבוא',
    sectionFlow: 'כותרות ממוספרות ופסקת מעבר',
    firstPersonUsage: 'סביל בלבד',
    bogusKey: 'לא אמור לשרוד',
  },
  avoidedPhrases: [
    ...Array.from({ length: 25 }, (_, i) => `ביטוי נמנע מספר ${i + 1}`),
  ],
});
const deep12 = parsePatternExtractionResult(deepJson12, { lenientTypes: true });
// hasMeta נוסף (12.8.26) כדי ששער ה-UI לא ידחה פלט "מטא בלבד" שהשירות דווקא קולט.
check('6 מפתחות עליונים',
  Object.keys(deep12).sort().join(',') === 'avoidedPhrases,hasMeta,negativeSpace,patterns,structuralSignature,topKeys',
  Object.keys(deep12).sort().join(','));
check('hasMeta=false כשאין בפלט מטא', deep12.hasMeta === false, String(deep12.hasMeta));
check('hasMeta=true בפלט מטא-בלבד',
  parsePatternExtractionResult('{"profileSummary":"כותב משפטי","style":{"defaultAudience":"מרצים"}}', { lenientTypes: true }).hasMeta === true);
// שישה פלטים אמיתיים שנדחו עד 12.8.26 ב"לא נקלט כלום" (נמדד מול ChatGPT/Claude בעברית).
const TOLERANT_PASTES = {
  'גרשיים חכמים': '{\u201cpatterns\u201d:[{\u201clabel\u201d:\u201ca\u201d,\u201dtype\u201d:\u201dlexical_habit\u201d,\u201dweight\u201d:0.7}]}',
  'פסיק עוקב': '{"patterns":[{"label":"a","type":"lexical_habit","weight":0.7},],}',
  'מפתח-על עוטף': '{"styleAnalysis":{"patterns":[{"label":"a","type":"lexical_habit","weight":0.7}]}}',
  'מערך כשורש': '[{"label":"a","type":"lexical_habit","weight":0.7}]',
  'weight חסר': '{"patterns":[{"label":"a","type":"lexical_habit"}]}',
  'שני אובייקטים בטקסט': 'סיכום {"note":"x"}\n\n{"patterns":[{"label":"a","type":"lexical_habit","weight":0.7}]}',
};
for (const [name, raw] of Object.entries(TOLERANT_PASTES)) {
  check(`הדבקה סלחנית — ${name}`,
    parsePatternExtractionResult(raw, { lenientTypes: true }).patterns.length === 1);
}
check('המסלול הקפדני לא התרחב — weight חסר עדיין מפיל דפוס',
  parsePatternExtractionResult('{"patterns":[{"label":"a","type":"lexical_habit"}]}').patterns.length === 0);
// שמות מפתח שאינם הסכימה שלנו: המודל תרגם לעברית / קינן בעומק / השתמש בשם מכולה אחר.
// זה היה מקור ההודעה "ה-JSON נקרא אבל אין בו אף שדה מוכר".
const ALIAS_PASTES = {
  'קינון בעומק 2': '{"analysis":{"styleProfile":{"patterns":[{"label":"a","type":"lexical_habit","weight":0.7}]}}}',
  'מפתחות בעברית': '{"דפוסים":[{"תיאור":"פותח פסקה בחזרה על מונח","סוג":"transition"}]}',
  'שם מכולה לא מוכר': '{"writingHabits":[{"name":"פותח במונח","type":"transition","weight":0.8}]}',
  'דפוסים כמחרוזות': '{"patterns":["פותח פסקה בחזרה על מונח","מסיים בהשלכות"]}',
};
for (const [name, raw] of Object.entries(ALIAS_PASTES)) {
  check(`alias/קינון — ${name}`,
    parsePatternExtractionResult(raw, { lenientTypes: true }).patterns.length >= 1);
}
check('חתימה מבנית תחת מפתח עברי נקלטת',
  parsePatternExtractionResult('{"חתימה מבנית":{"opening":"בהקשר היסטורי"}}', { lenientTypes: true })
    .structuralSignature.opening === 'בהקשר היסטורי');
check('מטא מקונן תחת userProfile מזוהה',
  parsePatternExtractionResult('{"userProfile":{"style":{"defaultAudience":"מרצים"}}}', { lenientTypes: true }).hasMeta === true);
check('JSON בלי שדות מוכרים עדיין נדחה',
  (() => {
    const r = parsePatternExtractionResult('{"foo":1,"bar":[1,2,3]}', { lenientTypes: true });
    return r.patterns.length === 0 && r.hasMeta === false && r.topKeys.join(',') === 'foo,bar';
  })());
check('הקצירה לא פועלת במסלול הקפדני',
  parsePatternExtractionResult('{"writingHabits":[{"name":"x","type":"transition","weight":0.8}]}').patterns.length === 0);
check('structuralSignature הוא בדיוק 5 מפתחות',
  Object.keys(deep12.structuralSignature).sort().join(',') === STRUCT_KEYS.slice().sort().join(','),
  Object.keys(deep12.structuralSignature).sort().join(','));
check('מפתח לא מוכר בתוך החתימה נזרק', !('bogusKey' in deep12.structuralSignature));
check('opening נחתך ל-200 תווים', deep12.structuralSignature.opening.length === 200, String(deep12.structuralSignature.opening.length));
check('closing עבר trim', deep12.structuralSignature.closing === 'מסיים בהשלכות מעשיות', JSON.stringify(deep12.structuralSignature.closing));
check('שאר המפתחות נקלטו',
  deep12.structuralSignature.thesisPlacement === 'תזה בסוף המבוא'
  && deep12.structuralSignature.sectionFlow === 'כותרות ממוספרות ופסקת מעבר'
  && deep12.structuralSignature.firstPersonUsage === 'סביל בלבד',
  JSON.stringify(deep12.structuralSignature));
check('avoidedPhrases מוגבל ל-20', deep12.avoidedPhrases.length === 20, String(deep12.avoidedPhrases.length));

const dupJson12 = JSON.stringify({
  patterns: [],
  avoidedPhrases: ['אין חולק כי', '  אין חולק כי  ', 'דומה כי', 'אין חולק כי', `${'ב'.repeat(120)}`],
});
const dup12 = parsePatternExtractionResult(dupJson12, { lenientTypes: true });
check('avoidedPhrases — dedupe אחרי trim', dup12.avoidedPhrases.filter((p) => p === 'אין חולק כי').length === 1, JSON.stringify(dup12.avoidedPhrases));
check('avoidedPhrases — 3 ייחודיים', dup12.avoidedPhrases.length === 3, JSON.stringify(dup12.avoidedPhrases.length));
check('ביטוי ארוך נחתך ל-80', dup12.avoidedPhrases.some((p) => p.length === 80), JSON.stringify(dup12.avoidedPhrases.map((p) => p.length)));

for (const [label, input] of [['null', null], ['undefined', undefined], ['ג\'יבריש', 'זה בכלל לא JSON, רק טקסט חופשי.'], ['מערך', '[1,2,3]']]) {
  const bad = parsePatternExtractionResult(input, { lenientTypes: true });
  check(`קלט ${label} → 4 מפתחות, חתימה ריקה ולא null`,
    bad && Array.isArray(bad.patterns) && Array.isArray(bad.negativeSpace) && Array.isArray(bad.avoidedPhrases)
    && bad.structuralSignature !== null && typeof bad.structuralSignature === 'object'
    && STRUCT_KEYS.every((k) => bad.structuralSignature[k] === ''),
    JSON.stringify(bad));
}

// ── 13. mergeStructuralSignature ──
console.log('\n[13] mergeStructuralSignature — קיפול פר-מפתח');
const m13a = mergeStructuralSignature(
  { opening: 'פותח בשאלה', closing: '', thesisPlacement: 'בסוף המבוא', sectionFlow: '', firstPersonUsage: '' },
  { opening: 'פותח בהקשר היסטורי', closing: 'מסיים בהסתייגות', thesisPlacement: 'מפוזרת', sectionFlow: 'כותרות ממוספרות', firstPersonUsage: '' },
);
check('קיים ולא-ריק מנצח', m13a.opening === 'פותח בשאלה' && m13a.thesisPlacement === 'בסוף המבוא', JSON.stringify(m13a));
check('קיים ריק → נלקח הנכנס', m13a.closing === 'מסיים בהסתייגות' && m13a.sectionFlow === 'כותרות ממוספרות', JSON.stringify(m13a));
check('שניהם ריקים → נשאר ריק', m13a.firstPersonUsage === '', JSON.stringify(m13a));
check('אובייקט טרי — הקלט לא זז', m13a !== null && typeof m13a === 'object');

const cands13 = [
  { opening: '', closing: 'סיום א', thesisPlacement: '', sectionFlow: '', firstPersonUsage: '' },
  { opening: 'פתיחה ב', closing: 'סיום ב', thesisPlacement: '', sectionFlow: 'שרשור ב', firstPersonUsage: '' },
  { opening: 'פתיחה ג', closing: 'סיום ג', thesisPlacement: 'תזה ג', sectionFlow: 'שרשור ג', firstPersonUsage: 'גוף ראשון ג' },
];
const folded13 = cands13.reduce((acc, c) => mergeStructuralSignature(acc, c), {});
check('קיפול על 3 מועמדים — הראשון הלא-ריק לכל מפתח',
  folded13.opening === 'פתיחה ב' && folded13.closing === 'סיום א' && folded13.thesisPlacement === 'תזה ג'
  && folded13.sectionFlow === 'שרשור ב' && folded13.firstPersonUsage === 'גוף ראשון ג',
  JSON.stringify(folded13));

let m13null = null;
let m13threw = false;
try { m13null = mergeStructuralSignature(null, null); } catch { m13threw = true; }
check('mergeStructuralSignature(null,null) לא זורק', !m13threw);
check('ומחזיר 5 מפתחות ריקים',
  Boolean(m13null) && Object.keys(m13null).sort().join(',') === STRUCT_KEYS.slice().sort().join(',')
  && STRUCT_KEYS.every((k) => m13null[k] === ''),
  JSON.stringify(m13null));
let m13junk = null;
try { m13junk = mergeStructuralSignature('לא אובייקט', 42); } catch { m13junk = null; }
check('קלט לא-אובייקט → 5 מפתחות ריקים', Boolean(m13junk) && STRUCT_KEYS.every((k) => m13junk[k] === ''), JSON.stringify(m13junk));

// ── 14. normalizeStyleEngine — round-trip של structuralSignature ──
console.log('\n[14] normalizeStyleEngine — structuralSignature שורד round-trip');
const rt14 = normalizeStyleEngine({
  enabled: true,
  structuralSignature: {
    opening: 'פותח בהגדרת המונח המרכזי',
    closing: 'ג'.repeat(320),
    thesisPlacement: 'תזה בפסקה הראשונה',
    sectionFlow: 'הכרזה מראש על המבנה',
    firstPersonUsage: '"העבודה תטען"',
    unknownKey: 'צריך ליפול',
    nested: { a: 1 },
  },
});
check('5 מפתחות בדיוק', Object.keys(rt14.structuralSignature).sort().join(',') === STRUCT_KEYS.slice().sort().join(','), Object.keys(rt14.structuralSignature).sort().join(','));
check('ערכים שרדו', rt14.structuralSignature.opening === 'פותח בהגדרת המונח המרכזי' && rt14.structuralSignature.firstPersonUsage === '"העבודה תטען"', JSON.stringify(rt14.structuralSignature));
check('ערך >200 נחתך ל-200', rt14.structuralSignature.closing.length === 200, String(rt14.structuralSignature.closing.length));
check('מפתחות לא מוכרים נופלים', !('unknownKey' in rt14.structuralSignature) && !('nested' in rt14.structuralSignature));
const rt14b = normalizeStyleEngine(rt14);
check('round-trip שני — זהה', JSON.stringify(rt14b.structuralSignature) === JSON.stringify(rt14.structuralSignature), JSON.stringify(rt14b.structuralSignature));
const rt14empty = normalizeStyleEngine({ enabled: true });
check('בלי השדה → 5 מפתחות ריקים (לא null)',
  rt14empty.structuralSignature !== null && STRUCT_KEYS.every((k) => rt14empty.structuralSignature[k] === ''),
  JSON.stringify(rt14empty.structuralSignature));

// ── 15. בוני הפרומפטים ──
console.log('\n[15] buildExternalPatternAnalysisPrompt / buildPatternExtractionPrompt');
const ALL_TYPE_NAMES = ['signature_phrase', 'structure', 'lexical_habit', 'punctuation', 'register', 'citation', 'argument_move', 'transition'];
const DEEP_KEYS = ['structuralSignature', 'avoidedPhrases', 'thesisPlacement', 'sectionFlow', 'firstPersonUsage'];
const METRICS_HEADER = 'מדדים שכבר נמדדו מהעבודות שלי';
const EXCERPTS_HEADER = 'קטעים מייצגים מהעבודות שלי:';

const ext15bare = buildExternalPatternAnalysisPrompt({ profile: { displayName: 'רותם' } });
check('חיצוני — כל 8 שמות הסוגים', ALL_TYPE_NAMES.every((t) => ext15bare.includes(t)),
  JSON.stringify(ALL_TYPE_NAMES.filter((t) => !ext15bare.includes(t))));
check('חיצוני — מפתחות הבלוק העמוק', DEEP_KEYS.every((k) => ext15bare.includes(k)),
  JSON.stringify(DEEP_KEYS.filter((k) => !ext15bare.includes(k))));
check('חיצוני בלי engine → אין כותרת מדדים', !ext15bare.includes(METRICS_HEADER));
check('חיצוני בלי excerpts → אין כותרת קטעים', !ext15bare.includes(EXCERPTS_HEADER));
check('חיצוני — הקשר ידוע מוזרק', ext15bare.includes('שם משתמש ידוע: רותם'));

const ext15metrics = buildExternalPatternAnalysisPrompt({
  profile: {},
  engine: { metrics: { avgSentenceWords: 23.4, avgCommasPerSentence: 1.7, avgParagraphWords: 96, parenthesesDensity: 2.2 } },
});
check('עם engine.metrics → כותרת המדדים מופיעה', ext15metrics.includes(METRICS_HEADER));
check('המספרים שנמדדו מופיעים', ext15metrics.includes('~23 מילים') && ext15metrics.includes('~1.7'), ext15metrics.slice(0, 200));
check('עדיין בלי כותרת קטעים', !ext15metrics.includes(EXCERPTS_HEADER));

const EXCERPT_15 = 'הדיון בסוגיה זו מחייב הבחנה בין הרובד הנורמטיבי לבין הרובד היישומי.';
const ext15exc = buildExternalPatternAnalysisPrompt({ profile: {}, excerpts: [EXCERPT_15, '  ', 'קטע שני מהעבודה.'] });
check('עם excerpts → כותרת הקטעים מופיעה', ext15exc.includes(EXCERPTS_HEADER));
check('טקסט הקטע עצמו מופיע', ext15exc.includes(EXCERPT_15) && ext15exc.includes('קטע שני מהעבודה.'));
check('עדיין בלי כותרת מדדים', !ext15exc.includes(METRICS_HEADER));

const int15plain = buildPatternExtractionPrompt([EXCERPT_15]);
const int15deep = buildPatternExtractionPrompt([EXCERPT_15], { deep: true });
check('פנימי רגיל — בלי מפתחות עומק', !int15plain.includes('structuralSignature') && !int15plain.includes('avoidedPhrases'));
check('פנימי deep:true — עם מפתחות העומק', DEEP_KEYS.every((k) => int15deep.includes(k)),
  JSON.stringify(DEEP_KEYS.filter((k) => !int15deep.includes(k))));
check('פנימי — 8 שמות הסוגים בשני הווריאנטים',
  ALL_TYPE_NAMES.every((t) => int15plain.includes(t) && int15deep.includes(t)));
check('פנימי — הקטע מוזרק בשניהם', int15plain.includes(EXCERPT_15) && int15deep.includes(EXCERPT_15));

// ── 16. buildDeepProfileExtractionPrompt ──
console.log('\n[16] buildDeepProfileExtractionPrompt — סכימת המטא בלבד');
const deepProfilePrompt = buildDeepProfileExtractionPrompt({
  profile: { displayName: 'רותם', institutionName: 'האוניברסיטה הפתוחה' },
  excerpts: [EXCERPT_15, 'עמוד שער: מגיש רותם, קורס דיני תקשורת.'],
});
check('כולל profileSummary', deepProfilePrompt.includes('"profileSummary"'));
check('כולל style', deepProfilePrompt.includes('"style"'));
check('כולל coverPageDefaults', deepProfilePrompt.includes('"coverPageDefaults"'));
check('כולל שדות מפתח של הסכימה',
  ['manualVocabulary', 'preferredConnectors', 'toneDescriptors', 'lecturerName', 'aiAssistanceDeclaration']
    .every((k) => deepProfilePrompt.includes(k)));
check('הקטעים מוזרקים', deepProfilePrompt.includes(EXCERPT_15) && deepProfilePrompt.includes('קורס דיני תקשורת'));
check('הקשר ידוע מוזרק', deepProfilePrompt.includes('מוסד/מרכז אקדמי ידוע: האוניברסיטה הפתוחה'));
check('לא מבקש patterns (זו עבודתו של הפרומפט האחר)', !deepProfilePrompt.includes('"patterns"'), deepProfilePrompt.slice(0, 120));
check('לא מבקש structuralSignature', !deepProfilePrompt.includes('structuralSignature'));
check('שער אנטי-הזיה קיים', deepProfilePrompt.includes('אל תמציא'));

// ── 17. extractQualitativePatterns עם stub (בלי ספק, בלי רשת) ──
console.log('\n[17] extractQualitativePatterns — invokeModel כ-stub');
const STUB_JSON = JSON.stringify({
  patterns: [
    { label: 'מפנה בסוגריים בסוף המשפט', type: 'citation', weight: 0.8, evidence: '(כהן, 2021)' },
    { label: 'מודה ואז מפריך', type: 'argument_move', weight: 0.6, evidence: 'אכן, ניתן לטעון' },
  ],
  negativeSpace: ['שאלות רטוריות'],
  structuralSignature: { opening: 'פותח בהגדרת מונח', closing: 'מסיים בהשלכות', thesisPlacement: '', sectionFlow: '', firstPersonUsage: '' },
  avoidedPhrases: ['אין חולק כי'],
});
let promptSeenPlain = '';
const stubPlain = async (p) => { promptSeenPlain = String(p || ''); return STUB_JSON; };
const res17a = await extractQualitativePatterns([EXCERPT_15], stubPlain);
check('מחזיר 4 מפתחות',
  Object.keys(res17a).sort().join(',') === 'avoidedPhrases,negativeSpace,patterns,structuralSignature',
  Object.keys(res17a).sort().join(','));
check('דפוסים נקלטו עם id יציב', res17a.patterns.length === 2 && res17a.patterns.every((p) => /^qp_[0-9a-f]{8}$/.test(p.id)),
  JSON.stringify(res17a.patterns.map((p) => p.id)));
check('structuralSignature הועבר הלאה', res17a.structuralSignature.opening === 'פותח בהגדרת מונח', JSON.stringify(res17a.structuralSignature));
check('avoidedPhrases הועבר הלאה', res17a.avoidedPhrases.join('|') === 'אין חולק כי', JSON.stringify(res17a.avoidedPhrases));
check('בלי deep — הפרומפט שהתקבל נקי ממפתחות העומק',
  Boolean(promptSeenPlain) && !promptSeenPlain.includes('structuralSignature') && !promptSeenPlain.includes('avoidedPhrases'));

let promptSeenDeep = '';
const stubDeep = async (p) => { promptSeenDeep = String(p || ''); return STUB_JSON; };
const res17b = await extractQualitativePatterns([EXCERPT_15], stubDeep, { deep: true });
check('deep:true — הפרומפט מכיל את מפתחות העומק', DEEP_KEYS.every((k) => promptSeenDeep.includes(k)),
  JSON.stringify(DEEP_KEYS.filter((k) => !promptSeenDeep.includes(k))));
check('deep:true — אותה תוצאה מפוענחת', res17b.patterns.length === 2 && res17b.structuralSignature.closing === 'מסיים בהשלכות');

const stubThrows = async () => { throw new Error('הספק נפל'); };
let res17c = null;
let threw17 = false;
try { res17c = await extractQualitativePatterns([EXCERPT_15], stubThrows); } catch { threw17 = true; }
check('stub שזורק — הפונקציה לא זורקת', !threw17);
check('ומחזירה מבנה ריק מלא',
  Boolean(res17c) && res17c.patterns.length === 0 && res17c.negativeSpace.length === 0
  && res17c.avoidedPhrases.length === 0 && STRUCT_KEYS.every((k) => res17c.structuralSignature[k] === ''),
  JSON.stringify(res17c));
const res17d = await extractQualitativePatterns([EXCERPT_15], null);
check('בלי invokeModel → מבנה ריק מלא',
  res17d.patterns.length === 0 && STRUCT_KEYS.every((k) => res17d.structuralSignature[k] === ''), JSON.stringify(res17d));
const res17e = await extractQualitativePatterns([EXCERPT_15], async () => 'לא JSON כלל');
check('פלט לא-JSON → מבנה ריק מלא', res17e.patterns.length === 0 && res17e.avoidedPhrases.length === 0, JSON.stringify(res17e));

// ── 18. getRepresentativeExcerpts ──
console.log('\n[18] getRepresentativeExcerpts — קורפוס ריק, מכסות, id שבור');
resetAll();
check('קורפוס ריק → []', Array.isArray(ingest.getRepresentativeExcerpts()) && ingest.getRepresentativeExcerpts().length === 0,
  JSON.stringify(ingest.getRepresentativeExcerpts()));

for (const seed of ['חופש הביטוי', 'הזכות לפרטיות', 'חופש העיסוק']) {
  // eslint-disable-next-line no-await-in-loop
  await ingest.ingestGradedSubmission({ title: `עבודה על ${seed}`, text: longHebrewText(seed) });
}
check('נקלטו 3 מסמכים', statsNow().docCount === 3, JSON.stringify(statsNow()));
const exc18 = ingest.getRepresentativeExcerpts();
check('קורפוס מלא → לא ריק', exc18.length > 0, String(exc18.length));
check('כל הקטעים מחרוזות לא-ריקות', exc18.every((t) => typeof t === 'string' && t.trim().length > 0));
check('ברירת מחדל ≤ 8', exc18.length <= 8, String(exc18.length));

const exc18max = ingest.getRepresentativeExcerpts({ max: 2 });
check('max:2 → לכל היותר 2', exc18max.length <= 2, String(exc18max.length));
const exc18chars = ingest.getRepresentativeExcerpts({ max: 8, maxChars: 900 });
check('maxChars:900 → סך התווים ≤ 900', exc18chars.join('').length <= 900, String(exc18chars.join('').length));
check('maxChars:900 → עדיין מחזיר משהו', exc18chars.length > 0, String(exc18chars.length));
const exc18tiny = ingest.getRepresentativeExcerpts({ max: 8, maxChars: 50 });
check('maxChars זעיר → קטע יחיד חתוך, לא ריק', exc18tiny.length === 1 && exc18tiny[0].length === 50,
  JSON.stringify(exc18tiny.map((t) => t.length)));

// representativeChunkIds שמצביע ל-id שלא קיים → נפילה חיננית ל-stride (לא [])
{
  const p18 = ai.getPersonalStyleProfile();
  ai.savePersonalStyleProfile({
    ...p18,
    styleEngine: { ...normalizeStyleEngine(p18?.styleEngine), representativeChunkIds: ['chunk_שאינו_קיים_1', 'chunk_שאינו_קיים_2'] },
  });
}
check('ה-id השבור אכן נשמר בפרופיל', engineNow().representativeChunkIds.length === 2, JSON.stringify(engineNow().representativeChunkIds));
const exc18bogus = ingest.getRepresentativeExcerpts({ max: 4 });
check('id שלא קיים → דרדור ל-stride (לא [])', exc18bogus.length > 0, String(exc18bogus.length));
check('והקטעים הם טקסט אמיתי מהקורפוס', exc18bogus.every((t) => t.includes('הרובד הנורמטיבי')), exc18bogus[0]?.slice(0, 40));

// ── 19. deriveStyleProfileFromSamples — המסלול בלי ספק ──
console.log('\n[19] deriveStyleProfileFromSamples — no-provider (מסלול חסר-מפתח)');
// ⚠️ ברירת המחדל של aiService מסמנת את **ollama כמוגדר בלי מפתח** (baseUrl לוקלי +
// model ⇒ isProviderConfiguredForUse=true), ולכן hasLocalProvider הוא true גם בסביבה
// נקייה לגמרי — וקריאה תמימה כאן הייתה יוצאת ל-localhost:11434. הבידוד: multiModel עם
// רשימת היתר של ספק חסר-מפתח בלבד ⇒ הבריכה ריקה. הקורפוס מרוקן קודם כדי שגם ה-listener
// של wordai-provider-config-changed (חילוץ עמוק אוטומטי) ייעצר על 'no-chunks'.
resetAll();
const cfg19Original = ai.getProviderConfig();
ai.saveProviderConfig({ ...cfg19Original, active: 'gemini', gemini: { ...(cfg19Original.gemini || {}), key: '' }, multiModelEnabled: true, activeProviders: ['gemini'] });
try {
  const availability19 = ai.getExternalAnalysisAvailability();
  check('תנאי הסביבה: אין ספק מוגדר', availability19?.hasLocalProvider === false, JSON.stringify(availability19));
  let res19 = null;
  let threw19 = false;
  try { res19 = await ingest.deriveStyleProfileFromSamples(); } catch (e) { threw19 = true; res19 = String(e?.message || e); }
  check('לא זורק', !threw19, String(res19));
  check("reason='no-provider'", res19?.reason === 'no-provider', JSON.stringify(res19));
  check('patch ריק', res19 && Object.keys(res19.patch || {}).length === 0, JSON.stringify(res19?.patch));
  check('filled ריק', Array.isArray(res19?.filled) && res19.filled.length === 0, JSON.stringify(res19?.filled));
  const res19b = await ingest.deriveStyleProfileFromSamples({ baseProfile: { displayName: 'רותם' } });
  check('גם עם baseProfile — no-op נקי', res19b?.reason === 'no-provider' && Object.keys(res19b.patch || {}).length === 0, JSON.stringify(res19b));
} finally {
  ai.saveProviderConfig(cfg19Original);
}

// ── 20. finishQualitativeMerge דרך המסלול החיצוני ──
console.log('\n[20] applyExternalPatternAnalyses — מיזוג חתימה + avoidedPhrases→blacklist');
resetAll();
const REMOVED_PHRASE = 'דומה כי אין צורך להכביר מילים';
const LEARNED_A = 'אין חולק כי';
const LEARNED_SHARED = 'ניתן להיווכח בנקל';
const KNOWN_CLICHE = 'בעידן המודרני';
check('הקלישאה שנבדקת קיימת ברשימה הקבועה', AI_CLICHE_BLACKLIST.includes(KNOWN_CLICHE));
{
  const p20 = ai.getPersonalStyleProfile();
  ai.savePersonalStyleProfile({
    ...p20,
    styleEngine: { ...normalizeStyleEngine(p20?.styleEngine), blacklist: { auto: [], user: [], removed: [REMOVED_PHRASE] } },
  });
}
const PASTE_A = JSON.stringify({
  patterns: [
    { label: 'מפנה בסוגריים בסוף המשפט', type: 'citation', weight: 0.85, evidence: '(רובינשטיין, 2019)' },
    { label: 'מודה בטענת הנגד ואז מפריך אותה', type: 'argument_move', weight: 0.7, evidence: 'אכן, ניתן לטעון כי' },
  ],
  negativeSpace: ['שאלות רטוריות'],
  structuralSignature: { opening: 'פותח בשאלה משפטית', closing: '', thesisPlacement: '', sectionFlow: '', firstPersonUsage: '' },
  avoidedPhrases: [LEARNED_A, LEARNED_SHARED],
});
const PASTE_B = JSON.stringify({
  patterns: [
    { label: 'חוזר על מונח מהפסקה הקודמת', type: 'transition', weight: 0.65, evidence: 'איזון זה' },
    { label: 'מפנה בסוגריים בסוף המשפט', type: 'citation', weight: 0.8, evidence: '(כהן, 2021)' },
  ],
  negativeSpace: ['סימני קריאה'],
  structuralSignature: { opening: 'פותח בהקשר היסטורי', closing: 'מסיים בהסתייגות', thesisPlacement: '', sectionFlow: '', firstPersonUsage: '' },
  avoidedPhrases: [LEARNED_SHARED, REMOVED_PHRASE],
});
const res20 = await ingest.applyExternalPatternAnalyses([PASTE_A, PASTE_B], { includeLocalLlm: false, applyMetaPatch: false });
check('ok', res20?.ok === true, JSON.stringify(res20?.error));
check('שתי הדבקות נספרו כבאטצ\'ים', res20?.externalBatches === 2 && res20?.totalBatches === 2, JSON.stringify({ e: res20?.externalBatches, t: res20?.totalBatches }));

const eng20 = engineNow();
check('structuralSignature — opening מההדבקה הראשונה (מנצח בקונפליקט)',
  eng20.structuralSignature.opening === 'פותח בשאלה משפטית', JSON.stringify(eng20.structuralSignature));
check('structuralSignature — closing מההדבקה השנייה (המפתח היה ריק)',
  eng20.structuralSignature.closing === 'מסיים בהסתייגות', JSON.stringify(eng20.structuralSignature));
check('מפתחות שלא נלמדו נשארו ריקים',
  eng20.structuralSignature.thesisPlacement === '' && eng20.structuralSignature.sectionFlow === '' && eng20.structuralSignature.firstPersonUsage === '',
  JSON.stringify(eng20.structuralSignature));

const auto20 = eng20.blacklist.auto;
check('blacklist.auto מכיל את הביטוי מהדבקה א', auto20.includes(LEARNED_A), JSON.stringify(auto20.slice(0, 5)));
check('blacklist.auto מכיל את הביטוי המשותף', auto20.includes(LEARNED_SHARED), JSON.stringify(auto20.slice(0, 5)));
check('הביטוי המשותף לא הוכפל', auto20.filter((p) => p === LEARNED_SHARED).length === 1, String(auto20.filter((p) => p === LEARNED_SHARED).length));
check('ביטוי ב-removed לא חוזר מהדלת האחורית', !auto20.includes(REMOVED_PHRASE), JSON.stringify(auto20));
check('הקלישאות הגנריות עדיין שם', auto20.includes(KNOWN_CLICHE), JSON.stringify(auto20.slice(-5)));
check('⚠️ הביטויים הנלמדים לפני הקלישאות (רק 20 הראשונים מוזרקים)',
  auto20.indexOf(LEARNED_A) < auto20.indexOf(KNOWN_CLICHE) && auto20.indexOf(LEARNED_SHARED) < auto20.indexOf(KNOWN_CLICHE),
  JSON.stringify({ a: auto20.indexOf(LEARNED_A), shared: auto20.indexOf(LEARNED_SHARED), cliche: auto20.indexOf(KNOWN_CLICHE) }));
check('שני הביטויים הנלמדים נכנסים ל-20 הראשונים',
  auto20.slice(0, 20).includes(LEARNED_A) && auto20.slice(0, 20).includes(LEARNED_SHARED),
  JSON.stringify(auto20.slice(0, 3)));
check('auto מתחת ל-cap 50', auto20.length <= 50, String(auto20.length));

check('extractionMeta.batches=2 (השדה שכן שורד)', eng20.extractionMeta?.batches === 2, JSON.stringify(eng20.extractionMeta));

// ✅ הבאג שתועד כאן קודם (רשימת-היתר של 6 מפתחות ב-normalizeStyleEngine שמחקה בשקט את
// שלושת המפתחות שכותב finishQualitativeMerge) — תוקן ב-styleProfileService.js:932-934.
// saveEngine מנרמל לפני *כל* שמירה, ולכן זו הבדיקה שהמפתחות שורדים באמת: הקריאה כאן
// היא דרך engineNow() → getPersonalStyleProfile() → normalizeStyleEngine, כלומר
// אחרי סבב שמירה+קריאה מלא ולא על האובייקט שנשאר בזיכרון.
check('extractionMeta.externalBatches=2 שורד שמירה', eng20.extractionMeta?.externalBatches === 2, JSON.stringify(eng20.extractionMeta));
check('extractionMeta.structuralKeysLearned=2 שורד שמירה (opening+closing מלאים)',
  eng20.extractionMeta?.structuralKeysLearned === 2, JSON.stringify(eng20.extractionMeta));
check('extractionMeta.avoidedPhrasesAdded=2 שורד שמירה (removed לא נספר)',
  eng20.extractionMeta?.avoidedPhrasesAdded === 2, JSON.stringify(eng20.extractionMeta));
// קריאה טרייה נוספת מהאחסון — מוודאת שזה לא ארטיפקט של אובייקט אחד ששרד בזיכרון.
{
  const reread20 = normalizeStyleEngine(ai.getPersonalStyleProfile()?.styleEngine);
  check('re-read מהפרופיל — שלושת המפתחות עדיין שם',
    reread20.extractionMeta?.externalBatches === 2
    && reread20.extractionMeta?.structuralKeysLearned === 2
    && reread20.extractionMeta?.avoidedPhrasesAdded === 2,
    JSON.stringify(reread20.extractionMeta));
  // ⚠️ crossValidated שינה משמעות: היה `batchCount >= 3` (כלומר "רצנו מספיק באטצ'ים"),
  // ועכשיו הוא "לפחות אשכול דפוסים אחד הופיע ב-≥2 באטצ'ים" — הסכמה אמיתית. שתי ההדבקות
  // כאן חולקות דפוס, ולכן true הוא הערך הנכון תחת הכלל החדש.
  check('גם שאר מפתחות ה-extractionMeta לא נפגעו',
    reread20.extractionMeta?.batches === 2 && reread20.extractionMeta?.llmBatchesFailed === 0
    && reread20.extractionMeta?.crossValidated === true
    && reread20.extractionMeta?.avoidedPhrasesRejected === 0,
    JSON.stringify(reread20.extractionMeta));
}

// clamp/נרמול ישיר על normalizeStyleEngine — יש בדיוק 5 מפתחות חתימה, ולכן 9 → 5.
const meta20clamp = normalizeStyleEngine({
  enabled: true,
  extractionMeta: { batches: 3, structuralKeysLearned: 9, avoidedPhrasesAdded: 4.6, externalBatches: -3 },
}).extractionMeta;
check('structuralKeysLearned נחסם ל-5 (הוזן 9)', meta20clamp.structuralKeysLearned === 5, String(meta20clamp.structuralKeysLearned));
check('avoidedPhrasesAdded מעוגל (4.6 → 5)', meta20clamp.avoidedPhrasesAdded === 5, String(meta20clamp.avoidedPhrasesAdded));
check('externalBatches שלילי → 0', meta20clamp.externalBatches === 0, String(meta20clamp.externalBatches));
const meta20junk = normalizeStyleEngine({
  enabled: true,
  extractionMeta: { batches: 1, structuralKeysLearned: 'הרבה', avoidedPhrasesAdded: null, externalBatches: NaN },
}).extractionMeta;
check('ערכי זבל → 0 ולא NaN',
  meta20junk.structuralKeysLearned === 0 && meta20junk.avoidedPhrasesAdded === 0 && meta20junk.externalBatches === 0,
  JSON.stringify(meta20junk));

// ── 21. buildStyleEngineInjectionBlock — סקשן "מבנה אופייני" ──
console.log('\n[21] buildStyleEngineInjectionBlock — מבנה אופייני');
const ENG_21 = normalizeStyleEngine({
  enabled: true,
  metrics: { avgSentenceWords: 24, avgCommasPerSentence: 1.9, avgParagraphWords: 95 },
  qualitativePatterns: [
    { id: 'qp_00000001', label: 'מפנה בסוגריים בסוף המשפט', type: 'citation', weight: 0.8 },
    { id: 'qp_00000002', label: 'מודה בטענת הנגד ואז מפריך', type: 'argument_move', weight: 0.7 },
  ],
  negativeSpace: ['שאלות רטוריות'],
  structuralSignature: {
    opening: 'פותח בהגדרת המונח המרכזי',
    closing: 'מסיים בהשלכות מעשיות',
    thesisPlacement: 'תזה בסוף המבוא',
    sectionFlow: 'כותרות ממוספרות עם פסקת מעבר',
    firstPersonUsage: 'סביל בלבד',
  },
});
const blk21 = buildStyleEngineInjectionBlock(ENG_21, { seed: 0 });
check('הבלוק נבנה', Boolean(blk21), String(blk21).slice(0, 40));
check('סקשן "מבנה אופייני:" מופיע', blk21.includes('מבנה אופייני:'), blk21);
check('ערך מהחתימה מופיע בפועל', blk21.includes('פותח בהגדרת המונח המרכזי'), blk21);
check('תווית עברית ולא שם המפתח', blk21.includes('פתיחה:') && !blk21.includes('opening'), blk21);

const blk21noStruct = buildStyleEngineInjectionBlock(ENG_21, { seed: 0, includeStructure: false });
check('includeStructure:false → אין סקשן מבנה', !blk21noStruct.includes('מבנה אופייני:'), blk21noStruct);
check('שאר הבלוק עדיין קיים', blk21noStruct.includes('== סגנון אישי (מנוע סגנון) =='));

const ENG_21_EMPTY_SIG = normalizeStyleEngine({ ...ENG_21, structuralSignature: {} });
const blk21empty = buildStyleEngineInjectionBlock(ENG_21_EMPTY_SIG, { seed: 0 });
check('חתימה ריקה לגמרי → אין סקשן מבנה', !blk21empty.includes('מבנה אופייני:'), blk21empty);

const LONG_SIG_ENG = normalizeStyleEngine({
  ...ENG_21,
  structuralSignature: Object.fromEntries(STRUCT_KEYS.map((k) => [k, `${k} ${'מילה '.repeat(30)}`.trim()])),
});
const blk21long = buildStyleEngineInjectionBlock(LONG_SIG_ENG, { seed: 0 });
check('ערכים ארוכים — סקשן המבנה עדיין נבנה', blk21long.includes('מבנה אופייני:'));
check('הבלוק כולו מתחת ל-350 מילים', wordCount(blk21) < 350, `${wordCount(blk21)} מילים`);
check('גם עם חתימה ארוכה — מתחת ל-350 מילים', wordCount(blk21long) < 350, `${wordCount(blk21long)} מילים`);
check('מנוע כבוי → בלוק ריק', buildStyleEngineInjectionBlock({ ...ENG_21, enabled: false }) === '');

// ── 22. applyExternalPatternAnalyses — הדבקה בלי דפוסים אך עם אות עמוק ──
console.log('\n[22] applyExternalPatternAnalyses — deep-only paste');

const DEEP_PHRASE_A = 'זהו נדבך מרכזי בטיעון';
const DEEP_PHRASE_B = 'המסקנה מתבקשת מאליה';
check('שני ביטויי הבדיקה אינם קלישאות מהרשימה הקבועה',
  !AI_CLICHE_BLACKLIST.includes(DEEP_PHRASE_A) && !AI_CLICHE_BLACKLIST.includes(DEEP_PHRASE_B));

// 22a — הדבקה אחת עם דפוסים, אחת בלי דפוסים בכלל אבל עם חתימה מבנית + ניסוחים נמנעים.
// הציפייה: האות העמוק של ההדבקה הדפוס-לית נקלט, אבל היא *לא* נספרת כבאטצ' (אחרת היא
// מדללת את משקל הקונצנזוס של הדפוסים שכן נמצאו).
resetAll();
const PASTE_PATTERNS_ONLY = JSON.stringify({
  patterns: [
    { label: 'מפנה בסוגריים בסוף המשפט', type: 'citation', weight: 0.8, evidence: '(לוי, 2018)' },
  ],
  negativeSpace: [],
  structuralSignature: { opening: '', closing: '', thesisPlacement: '', sectionFlow: '', firstPersonUsage: '' },
  avoidedPhrases: [],
});
const PASTE_DEEP_ONLY = JSON.stringify({
  patterns: [],
  negativeSpace: [],
  structuralSignature: {
    opening: 'פותח בתיאור המחלוקת',
    closing: '',
    thesisPlacement: 'תזה בפתח פרק הדיון',
    sectionFlow: '',
    firstPersonUsage: '',
  },
  avoidedPhrases: [DEEP_PHRASE_A, DEEP_PHRASE_B],
});
const res22a = await ingest.applyExternalPatternAnalyses([PASTE_PATTERNS_ONLY, PASTE_DEEP_ONLY], { includeLocalLlm: false, applyMetaPatch: false });
check('22a ok', res22a?.ok === true, JSON.stringify(res22a?.error));
check('22a — רק ההדבקה עם הדפוסים נספרה כבאטצ\'',
  res22a?.externalBatches === 1 && res22a?.totalBatches === 1,
  JSON.stringify({ e: res22a?.externalBatches, t: res22a?.totalBatches }));

const eng22a = engineNow();
check('22a — opening מההדבקה חסרת-הדפוסים נחת על המנוע',
  eng22a.structuralSignature.opening === 'פותח בתיאור המחלוקת', JSON.stringify(eng22a.structuralSignature));
check('22a — thesisPlacement מההדבקה חסרת-הדפוסים נחת גם הוא',
  eng22a.structuralSignature.thesisPlacement === 'תזה בפתח פרק הדיון', JSON.stringify(eng22a.structuralSignature));
check('22a — מפתחות שלא נלמדו נשארו ריקים',
  eng22a.structuralSignature.closing === '' && eng22a.structuralSignature.sectionFlow === '' && eng22a.structuralSignature.firstPersonUsage === '',
  JSON.stringify(eng22a.structuralSignature));
check('22a — שני הביטויים הנמנעים נכנסו ל-blacklist.auto',
  eng22a.blacklist.auto.includes(DEEP_PHRASE_A) && eng22a.blacklist.auto.includes(DEEP_PHRASE_B),
  JSON.stringify(eng22a.blacklist.auto.slice(0, 5)));
check('22a — הם לפני הקלישאות הגנריות', eng22a.blacklist.auto.indexOf(DEEP_PHRASE_A) < eng22a.blacklist.auto.indexOf(KNOWN_CLICHE),
  JSON.stringify({ a: eng22a.blacklist.auto.indexOf(DEEP_PHRASE_A), c: eng22a.blacklist.auto.indexOf(KNOWN_CLICHE) }));
check('⚠️ 22a — extractionMeta.batches=1 (לא דולל ל-2 ע"י ההדבקה חסרת-הדפוסים)',
  eng22a.extractionMeta?.batches === 1, JSON.stringify(eng22a.extractionMeta));
check('22a — externalBatches=1', eng22a.extractionMeta?.externalBatches === 1, JSON.stringify(eng22a.extractionMeta));
check('22a — structuralKeysLearned=2', eng22a.extractionMeta?.structuralKeysLearned === 2, JSON.stringify(eng22a.extractionMeta));
check('22a — avoidedPhrasesAdded=2', eng22a.extractionMeta?.avoidedPhrasesAdded === 2, JSON.stringify(eng22a.extractionMeta));
check('22a — הדפוס מההדבקה הראשונה אכן נקלט',
  eng22a.qualitativePatterns.some((p) => p.type === 'citation'), JSON.stringify(eng22a.qualitativePatterns.map((p) => p.type)));

// 22b — כל ההדבקות בלי דפוסים אך עם אות עמוק: המסלול רץ דרך foldDeepSignals+saveEngine
// בלבד, ולכן אסור לו לסמן qualitativePatternsStale=false / להטביע lastAnalysisAt כאילו
// הושלם ניתוח מלא.
resetAll();
const STAMP_22 = 1750000000000;
{
  const p22 = ai.getPersonalStyleProfile();
  ai.savePersonalStyleProfile({
    ...p22,
    styleEngine: {
      ...normalizeStyleEngine(p22?.styleEngine),
      lastAnalysisAt: STAMP_22,
      qualitativePatternsStale: true,
      blacklist: { auto: [], user: [], removed: [] },
    },
  });
}
const staleBefore22 = ai.getPersonalStyleProfile()?.styleEngine?.qualitativePatternsStale;
const lastAtBefore22 = engineNow().lastAnalysisAt;
check('22b — תנאי הפתיחה: stale=true, lastAnalysisAt מוטבע',
  staleBefore22 === true && lastAtBefore22 === STAMP_22, JSON.stringify({ staleBefore22, lastAtBefore22 }));

const PASTE_DEEP_ONLY_2 = JSON.stringify({
  patterns: [],
  structuralSignature: { opening: '', closing: 'מסיים בשאלה פתוחה', thesisPlacement: '', sectionFlow: 'פסקת מעבר בין פרקים', firstPersonUsage: '' },
  avoidedPhrases: [DEEP_PHRASE_B],
});
const res22b = await ingest.applyExternalPatternAnalyses([PASTE_DEEP_ONLY, PASTE_DEEP_ONLY_2], { includeLocalLlm: false, applyMetaPatch: false });
check('22b ok', res22b?.ok === true, JSON.stringify(res22b?.error));
check('22b — engine מוחזר ולא null', res22b?.engine !== null && typeof res22b?.engine === 'object', JSON.stringify(res22b?.engine === null));
check('22b — אפס באטצ\'ים', res22b?.externalBatches === 0 && res22b?.totalBatches === 0 && res22b?.crossValidated === false,
  JSON.stringify({ e: res22b?.externalBatches, t: res22b?.totalBatches, c: res22b?.crossValidated }));

const eng22b = engineNow();
check('22b — החתימה התעדכנה משתי ההדבקות',
  eng22b.structuralSignature.opening === 'פותח בתיאור המחלוקת'
  && eng22b.structuralSignature.thesisPlacement === 'תזה בפתח פרק הדיון'
  && eng22b.structuralSignature.closing === 'מסיים בשאלה פתוחה'
  && eng22b.structuralSignature.sectionFlow === 'פסקת מעבר בין פרקים',
  JSON.stringify(eng22b.structuralSignature));
check('22b — הביטויים הנמנעים נכנסו ל-blacklist.auto',
  eng22b.blacklist.auto.includes(DEEP_PHRASE_A) && eng22b.blacklist.auto.includes(DEEP_PHRASE_B),
  JSON.stringify(eng22b.blacklist.auto.slice(0, 5)));
check('22b — הביטוי החוזר לא הוכפל',
  eng22b.blacklist.auto.filter((p) => p === DEEP_PHRASE_B).length === 1,
  String(eng22b.blacklist.auto.filter((p) => p === DEEP_PHRASE_B).length));
check('⚠️ 22b — qualitativePatternsStale לא הופל ל-false',
  ai.getPersonalStyleProfile()?.styleEngine?.qualitativePatternsStale === true,
  JSON.stringify(ai.getPersonalStyleProfile()?.styleEngine?.qualitativePatternsStale));
check('⚠️ 22b — lastAnalysisAt לא הוטבע מחדש',
  eng22b.lastAnalysisAt === STAMP_22, `${STAMP_22} → ${eng22b.lastAnalysisAt}`);
check('22b — extractionMeta.batches נשאר 0 (לא רץ ניתוח)',
  Number(eng22b.extractionMeta?.batches || 0) === 0, JSON.stringify(eng22b.extractionMeta));

// 22c — הדבקה בלי דפוסים, בלי חתימה, בלי ניסוחים נמנעים ובלי מטא → early-fail כמו קודם.
resetAll();
const res22c = await ingest.applyExternalPatternAnalyses([
  JSON.stringify({ patterns: [], negativeSpace: [], structuralSignature: {}, avoidedPhrases: [] }),
], { includeLocalLlm: false, applyMetaPatch: false });
check('22c — ok:false', res22c?.ok === false, JSON.stringify(res22c));
check("22c — error='לא זוהה JSON תקין באף פלט'", res22c?.error === 'לא זוהה JSON תקין באף פלט', JSON.stringify(res22c?.error));
check('22c — המנוע לא נגע (חתימה ריקה, blacklist.auto ריק)',
  STRUCT_KEYS.every((k) => engineNow().structuralSignature[k] === '') && engineNow().blacklist.auto.length === 0,
  JSON.stringify({ sig: engineNow().structuralSignature, auto: engineNow().blacklist.auto.length }));

// ── סיכום ──
console.log(`\n=== ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''} ===`);
process.exit(failed ? 1 : 0);
