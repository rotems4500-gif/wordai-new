<div dir="rtl">

# תוכנית עבודה: מנוע סגנון אישי (Personal Style Engine)

מסמך זה מתאר את הארכיטקטורה והשלבים לבניית מנוע סגנון אישי — שכבה שבונה פרופיל כתיבה מדיד מהמסמכים שהמשתמש כבר הגיש, מזריקה אותו לכל כתיבת AI במערכת, שופטת את התוצאה בציון 0-100, ולומדת מהעריכות שהמשתמש עושה בפועל. המנוע **עוטף ומרחיב** תשתית קיימת (`workspaceLearningService`, `styleAuthenticityService`, נקודות ההזרקה ב-`aiService.js`), לא מחליף אותה.

## 1. רקע ומטרה

היום למערכת יש כבר לבנים רלוונטיות: `workspaceLearningService` אוסף פסיבית אוצר-מילים וביטויים, `styleAuthenticityService` נותן ציון "נשמע כמו AI / לא נשמע כמוך", ו-`buildPersonalStyleInstructions` מזריק הקשר סגנון לפרומפט. המנוע המוצע מאחד את הלבנים האלה לכדי לולאה סגורה: **כרייה → הזרקה → שיפוט → למידה**.

העיקרון המנחה המרכזי: **"השיבושים באים מהבן אדם"**. ה"אנושיות" שמבדילה טקסט אנושי מטקסט של מודל AI לא מגיעה מרשימת טריקים גנריים — מקף אקראי שמוזרק, משפט קצר מלאכותי, שאלה רטורית שתלושה מהמשתמש. היא מגיעה מהדפוסים האישיים האמיתיים של המשתמש עצמו: הביטויים שהוא חוזר עליהם, המבנים שהוא בונה, הדברים שהוא לעולם לא עושה. את אלה כורים מהמסמכים שלו, לא ממציאים.

מטרת-על משנית: **התחמקות מגלאי AI**. אבל זו תוצר לוואי של חיקוי סגנון אמין — לא מטרה בפני עצמה שמושגת בטריקים. ככל שהפלט קרוב יותר לטביעת האצבע האמיתית של המשתמש, כך הוא גם רחוק יותר מהמרכז הסטטיסטי שגלאים מזהים כ-AI.

## 2. החלטות מוצר (Product Decisions)

| נושא | החלטה |
|------|-------|
| אחסון פרופיל | Firestore כמו היום — sub-object בתוך blob `wordai_personal_style` שכבר מסונכרן דרך ה-whitelist ב-`cloudSyncManager.js:43-63` (`CLOUD_PROFILE_APP_SETTING_KEYS`). אין key חדש לסנכרון. |
| כימות סגנון | מדדים מספריים באחוזים המחושבים מקומית (חינם, ללא LLM) + שכבת דפוסים איכותניים ב-LLM call **אחד**. |
| RAG | ניקוד מקומי keyword/TF-IDF כברירת מחדל (חינם); toggle אופציונלי לבחירת chunks ב-LLM. |
| Controlled Chaos | משולב **בתוך** הכתיבה עצמה (רוטציית דפוסים בין בקשות + שליטת טמפרטורה), לא שלב נפרד שרץ אחרי היצירה. |
| שופט | ציון 0-100 (100 = חיקוי מושלם של המשתמש, 0 = AI מוחלט), היברידי (מדדים מקומיים + דוגמאות ב-LLM), rewrite אוטומטי בציון ≤70; ה-humanizer הקיים נשאר כ-fallback אחרון. |
| Delta tracking | תמיד פעיל, 100% מקומי; שינוי משתמש <20% → חוקי סגנון חדשים, >20% → gold standard chunk. |
| Blacklist | אוטומטי (קלישאות AI ידועות + "מה שהמשתמש לעולם לא עושה") + עריכה ידנית של המשתמש. |
| UI | סליידר יצירתיות + בורר עומק + toggle הפעלת סגנון בדף הבית; badge ודאות פרופיל. |
| מינימום מסמכים | אין. מעט מסמכים = ודאות נמוכה בלבד, לא חסימה. |
| אינטגרציה | **wrap ולא replace** — `styleProfileService` חדש מזין את נקודות ההזרקה הקיימות, לא מחליף אותן. |

## 3. הדוגמה החיה — פרופיל הסגנון של המשתמש (Live Example)

ניתוח אמיתי של 46 עבודות אקדמיות של המשתמש (רותם לב שפירו כהן) הפיק את הדפוסים הבאים. הם משמשים כ-reference ל*מה* בדיוק ש-`extractQualitativePatterns` צריך להפיק אוטומטית עבור כל משתמש — לא רשימה שמקודדת לתוך המנוע, אלא הדגמה של סוג הפלט הרצוי.

1. **"ניתן לראות כי"** — ביטוי-חתימה, מופיע כמעט בכל עמוד. דרך לטעון טענה בלי לומר "אני חושב". *דוגמה:* "ניתן לראות כי המגמה הזו מתחזקת לאורך העשור."
2. **"באופן" + תואר** — "באופן משמעותי", "באופן מובהק", "באופן ישיר". לפעמים מופיע פעמיים באותו משפט. *דוגמה:* "הדבר השפיע באופן משמעותי, ובאופן ישיר, על התוצאה."
3. **פתיחת פסקה בהקשר לפני הנקודה** — כמעט אף פסקה לא נפתחת ישירות בטענה; תמיד רקע קצר ואז הטענה. *דוגמה:* "בעשורים האחרונים חלה עלייה בשימוש ב-X. עלייה זו מעלה שאלה מרכזית..."
4. **מבנה "מצד אחד... מצד שני / מאידך"** — חשיבה דיאלקטית, מופיע בכמעט כל עבודה. *דוגמה:* "מצד אחד קיים יתרון ברור; מאידך, המחיר החברתי גבוה."
5. **מילות קישור מועדפות** — "עם זאת" (לא "אולם"), "בנוסף" (לא "כמו כן"), "כפי ש...", "בכך" לסגירה, "כתוצאה מכך". בחירה עקבית ומזהה.
6. **נוסחת סגירת פסקה** — "הבנת X חיונית ל-Y" / "הבנת מנגנון זה חיונית כדי ל...". *דוגמה:* "הבנת מנגנון זה חיונית כדי לגבש מדיניות אפקטיבית."
7. **סוגריים תכופים** — לתרגום מונחים (Outsourcing), לפירוט, להפניות; 3-4 זוגות סוגריים בפסקה. *דוגמה:* "מיקור-חוץ (Outsourcing) הוא תופעה (רחבה) המשפיעה על..."
8. **שבירת רגיסטר מכוונת** — 90% אקדמי, ואז רגע אישי-פגיע בשפה יומיומית ("אודה ואומר", גילוי נאות), וחזרה מיידית לאקדמי. *דוגמה:* "...אודה ואומר שהנושא נגע בי אישית. מכל מקום, מבחינה תיאורטית..."
9. **משפטים ארוכים מרובי פסיקים** — 25-35 מילים למשפט, 4-6 פסיקים; חשיבה "במקשה אחת" בתוך משפט אחד.
10. **"מהווה" כפועל מקשר ברירת מחדל** — "מהווה הפרה", "מהווה דוגמא", "מהווים סכנה" (במקום "הוא" / "נחשב"). *דוגמה:* "התנהלות זו מהווה הפרה של העיקרון."

### השטח השלילי (Negative Space)

מה שהמשתמש *לעולם לא* עושה מאפיין אותו בדיוק כמו הדפוסים החיוביים, ולעיתים אף יותר — כי גלאי AI ומחקים גנריים דווקא *מוסיפים* את הדברים האלה:

* **אין שאלות רטוריות** בעבודות.
* **אין הומור.**
* **אין מטפורות יצירתיות.**
* **אין סימני קריאה (!).**
* **אין משפטים בני מילה אחת.**
* **אין "אנחנו"** — רק "אני" ברפלקציה אישית, או "ניתן" כמילת ריחוק אקדמית.

## 4. ארכיטקטורה — מודולים (Module Breakdown)

העיקרון: **wrap ולא replace**, עם פיצול אחסון לפי גודל. המדדים והדפוסים הם אובייקטים קטנים ונוסעים בתוך `wordai_personal_style` המסונכרן; ה-raw samples הגדולים (טקסט מלא של מסמכים ו-chunks) יושבים ב-store נפרד מקומי, כי מגבלת מסמך Firestore היא 1MB ואי אפשר לדחוס אליו קורפוס. כל השפעת הפרומפט ממשיכה לזרום דרך נקודת ה-choke היחידה `buildPersonalStyleInstructions` — לא נוצרת נקודת הזרקה מתחרה.

### קבצים חדשים

| קובץ | תפקיד | ~שורות |
|------|-------|-------:|
| `src/services/styleProfileService.js` | אורקסטרטור + בעל הסכמה. `buildStyleProfileV2()`, `getStyleEngineProfile()`, `saveStyleEngineProfile()`, `computeLocalMetrics(text)`, `extractQualitativePatterns(samples, invokeModel)`, `recomputeConfidence()`, `ingestDocument()`. | ~550 |
| `src/services/styleSampleStore.js` | אחסון raw samples ו-gold chunks. `readBlob`/`writeBlob` מעל key חדש `wordai_style_samples_v1` (מחקה את הדפוס של `projectService.js`). chunking, dedupe לפי hash, eviction (cap). | ~320 |
| `src/services/styleRetrievalService.js` | RAG. `selectChunks(requestText, {mode, k})` — keyword/TF-IDF מקומי כברירת מחדל (מיחזור לוגיקת `extractContextMatchTerms`) + בחירת LLM אופציונלית. re-rank לגיוון (MMR). | ~260 |
| `src/services/styleJudgeService.js` | שופט היברידי. `scoreStyleMatch(text, {profile, samples, invokeModel, mode})` → 0-100. חצי מקומי (השוואת שונות) + חצי LLM אופציונלי. `runStyleRewriteLoop()` שעוטף את מנגנון `runHumanizerLoop`. | ~300 |
| `src/services/styleDeltaService.js` | Delta tracking. `snapshotGeneration()`, `diffAfterEdit()`, מסווג סגנון/תוכן, צבירת counters, `synthesizeProfileUpdate()`. key `wordai_style_deltas_v1`. | ~360 |
| `src/components/StyleEngineControls.jsx` | cluster בקרים לדף הבית (יצירתיות / עומק / toggle / badge). | ~180 |
| `src/components/StyleProfilePanel.jsx` | משטח ניהול פרופיל: העלאת מסמכים, תצוגת מדדים, blacklist editor, ודאות, "נתח מחדש". | ~450 |

### קבצים שישתנו

| קובץ | שינוי |
|------|-------|
| `src/services/aiService.js` | הרחבת `buildPersonalStyleInstructions` (:5845) עם sub-block של המנוע (option חדש `styleEngineContext`); threading של `temperature` מ-`chatWithActiveProvider` / `streamWithActiveProvider` דרך `callClaudeApi` (:8038) / `callOpenAICompatible` (:7966) / Gemini; hook קריאה לשופט אחרי יצירת מסמך. |
| `src/services/workspaceLearningService.js` | חשיפת / מיחזור `analyzeTextSample` (:448) ו-`extractContextMatchTerms` (:1497) לשימוש המנוע. |
| `src/services/cloudSyncManager.js` | **אין צורך להוסיף key** — ה-sub-object `styleEngine` נוסע בתוך `wordai_personal_style` שכבר ב-whitelist. **לא** להוסיף את key ה-sample store (גדול מדי לסנכרון doc יחיד). |
| `src/main.jsx` | snapshot ב-`editor.commands.setContent(generated)` (:5846); trigger diff ב-`persistDocumentToCloud` (:6684) / autosave (:6878); העברת ערכי יצירתיות / עומק ליצירה. |
| `src/components/StartScreen.jsx` | mount ל-`StyleEngineControls` באזור שורות ה-toggle (:1778-1814), persist דרך `getAppMemory` / `saveAppMemory`. |
| `src/v3/api/client.js` / `request.js` | הצנרת ל-temperature כבר קיימת (:41, :32-86, default null) — רק לוודא forwarding תקין. |
| `package.json` | הוספת `diff-match-patch`. |

### היחס ל-`workspaceLearningService`

לא לשכפל. המנוע *קורא* את `learnedVocabulary`, `learnedPhrases`, `preferredConnectors`, `preferredSentenceOpeners` ו-`styleFingerprint` כ-seed ראשוני, ו*כותב back* superset תחת `profile.styleEngine`. הלמידה הפאסיבית ב-`learnFromDocumentDraft` ממשיכה לרוץ כרגיל; `ingestDocument` הוא הנתיב האקטיבי שמופעל מה-UI (העלאה מפורשת). שני הנתיבים חולקים את ה-primitive `analyzeTextSample` — אין שתי מימושים של אותה מדידה.

## 5. סכמות נתונים (Data Schemas)

### 5a — פרופיל v2 (`wordai_personal_style.styleEngine`)

```json
{
  "styleEngine": {
    "schemaVersion": 2,
    "enabled": true,
    "confidence": { "score": 62, "docCount": 12, "wordCount": 41230, "level": "medium" },
    "metrics": {
      "avgSentenceWords": 24.3,
      "sentenceLengthCV": 0.41,
      "pctShortSentences": 18,
      "pctLongSentences": 34,
      "avgCommasPerSentence": 3.2,
      "parenthesesDensity": 4.1,
      "punctuationDensity": { "comma": 0.061, "semicolon": 0.002, "dash": 0.009, "colon": 0.004 },
      "connectorFrequency": { "עם זאת": 0.014, "בנוסף": 0.011, "בכך": 0.008 },
      "typeTokenRatio": 0.38,
      "avgParagraphWords": 96,
      "openerRepetitionRate": 0.22,
      "rhetoricalQuestionRate": 0.0,
      "exclamationRate": 0.0,
      "oneWordSentenceRate": 0.0,
      "registerShiftRate": 0.06,
      "sampledAt": 1731700000000
    },
    "qualitativePatterns": [
      { "id": "sig_phrase_1", "label": "ניתן לראות כי", "type": "signature_phrase", "weight": 0.9, "evidenceCount": 14 },
      { "id": "context_first", "label": "פתיחת פסקה בהקשר לפני הטענה", "type": "structure", "weight": 0.8 },
      { "id": "dialectic", "label": "מבנה מצד אחד...מצד שני", "type": "structure", "weight": 0.6 },
      { "id": "copula_mehave", "label": "מהווה כפועל מקשר ברירת מחדל", "type": "lexical_habit", "weight": 0.7 },
      { "id": "para_close", "label": "סגירת פסקה בנוסחת 'הבנת X חיונית ל-Y'", "type": "structure", "weight": 0.65 }
    ],
    "negativeSpace": [ "ללא שאלות רטוריות", "ללא הומור", "ללא סימני קריאה", "ללא משפטים בני מילה אחת" ],
    "blacklist": {
      "auto": ["במאמר מוסגר", "יש לציין כי", "בעידן המודרני", "חשוב להבין ש"],
      "user": [],
      "removed": []
    },
    "editCounters": {
      "shortenedSentence": 12,
      "removedConnector": 5,
      "replacedWord": { "מהווה": 3 },
      "addedParenthetical": 4,
      "totalEditsObserved": 41,
      "editsSinceSynthesis": 9
    },
    "goldChunkRefs": ["gc_a1", "gc_c9"],
    "lastAnalysisAt": 1731700000000,
    "lastSynthesisAt": 1731500000000
  }
}
```

### 5b — sample/chunk store (`wordai_style_samples_v1`)

```json
{
  "schemaVersion": 1,
  "updatedAt": 1731700000000,
  "documents": [
    { "id": "doc_12", "title": "עבודה בסוציולוגיה", "hash": "sha1:...", "wordCount": 2100, "addedAt": 1731000000000, "source": "upload" }
  ],
  "chunks": [
    {
      "id": "gc_a1",
      "docId": "doc_12",
      "text": "…קטע פסקה שלם בעברית…",
      "wordCount": 118,
      "isGold": true,
      "metricsLite": { "avgSentenceWords": 26, "commas": 4, "connectors": ["עם זאת"] },
      "terms": ["חברה", "מבנה", "כוח"],
      "addedAt": 1731000000000
    }
  ],
  "caps": { "maxChunks": 200, "maxChars": 600000 }
}
```

### 5c — delta store (`wordai_style_deltas_v1`)

```json
{
  "schemaVersion": 1,
  "pending": [
    { "id": "snap_88", "docId": "wsdoc_5", "generatedText": "…", "generatedAt": 1731700000000, "editedText": null, "diffedAt": null, "changeRatio": null, "classification": null }
  ],
  "aggregate": { "styleEdits": 33, "contentEdits": 61 }
}
```

## 6. Pipeline ניתוח (Analysis Pipeline)

**Trigger:** המשתמש מוסיף מסמכים ב-`StyleProfilePanel` → הקבצים עוברים חילוץ טקסט דרך `materialExtractBrowser` הקיים (docx/txt/xlsx/pptx/pdf/OCR).

### שלב 1 — מדדים מקומיים (חינם, `computeLocalMetrics`)

מרחיב את פלט `analyzeTextSample`. רשימת המדדים המדויקת (עברית-aware):
* `avgSentenceWords` + `sentenceLengthCV` (std/mean — זהו אות ה-burstiness, הלב של השאלה).
* `pctShortSentences` (<12 מילים), `pctLongSentences` (>28 מילים).
* `avgCommasPerSentence`, `parenthesesDensity` (ל-100 מילים), `punctuationDensity` לכל סימן.
* `connectorFrequency` מעל לקסיקון קישורים מנורמל לתדירות. **שים לב:** `COMMON_CONNECTORS` הקיים (`workspaceLearningService.js:338`) מכיל רק 11 ערכים וחסרות בו מילים מזהות קריטיות ("בכך", "כתוצאה מכך", "מאידך", "מצד אחד/שני", "כפי ש"). המנוע יגדיר לקסיקון מורחב `STYLE_CONNECTORS` (~30 ערכים) משלו, שמכיל את הקיים.
* `typeTokenRatio`, `openerRepetitionRate`.
* שיעורי negative-space: `rhetoricalQuestionRate` (עברית: `?` בשילוב האם / מילות שאלה), `exclamationRate`, `oneWordSentenceRate`, `registerShiftRate` (הוריסטיקה: regex למרקרים דיבוריים לכל פסקה).

אגרגציה על פני מסמכים משוקללת לפי word count. **חובה לשמור התפלגות (ממוצע + CV/std) לכל מדד**, לא רק ממוצע — כי השופט (סעיף 8) משווה שונות ולא מרכז.

### שלב 2 — LLM call יחיד לדפוסים איכותניים (`extractQualitativePatterns`)

call **אחד** מעל ~6 קטעים מייצגים (~4-5k מילים תקציב). סקיצת הפרומפט:

```
אתה מנתח סגנון כתיבה. לפניך קטעים אמיתיים מכתיבה של אדם אחד.
המשימה: לזהות את הדפוסים האישיים החוזרים שלו — לא כללי כתיבה טובה,
אלא ההרגלים הספציפיים שמזהים דווקא אותו.

לכל דפוס החזר:
- label: תיאור קצר בעברית
- type: signature_phrase | structure | lexical_habit | punctuation | register
- weight: 0-1 (עד כמה הדפוס דומיננטי אצלו)
- ציטוט ראיה אחד מהטקסט

בנוסף, זהה negativeSpace — מה הכותב הזה לעולם *לא* עושה
(שאלות רטוריות? הומור? סימני קריאה? משפטים קצרים?).

החזר JSON בלבד:
{ "patterns": [ ... ], "negativeSpace": [ ... ] }
```

### שלב 3 — גזירת Blacklist אוטומטית

איחוד של: (א) לקסיקון קלישאות AI עברי סטטי — מיחזור רשימת הקלישאות מ-`styleAuthenticityService`; (ב) היפוך הרגלי המשתמש — מילות קישור / ביטויים גנריים בתדירות גבוהה בטקסטים "רגילים" שדווקא המשתמש הזה נמנע מהם. נכתב ל-`blacklist.auto`.

### שלב 4 — ודאות

`recomputeConfidence()`: score כפונקציה של `docCount`, `wordCount` ויציבות המדדים (כמה קטן ה-CV של המדדים בין מסמכים). buckets: `low` (<3 מסמכים), `medium` (3-15), `high` (>15). **אין מינימום חוסם.**

### אינקרמנטלי (`ingestDocument`)

מסמך חדש → הוספה ל-sample store; עדכון מדדים רץ (ממוצע / שונות משוקללים — **בלי** recompute מלא של הקורפוס); סימון `qualitativePatternsStale=true`. ה-LLM call לדפוסים רץ מחדש רק בכפתור "נתח מחדש" מפורש, או אוטומטית כל K=5 מסמכים — כדי לרסן עלות.

## 7. עיצוב ההזרקה (Injection Design)

**Hook:** הרחבת `buildPersonalStyleInstructions`. sub-block של `styleEngine` שנפלט כאשר `options.styleEngineContext` קיים, במיחזור פילוסופיית ה-block הרזה `emphasizeVoice` הקיים.

**Payload לכל בקשה** (עברית, תקציב ~900-1400 טוקנים):

1. **N chunks אמיתיים (3-5)** מ-`selectChunks`: ניקוד keyword/TF-IDF מול הבקשה, ואז **re-rank לגיוון (MMR)** — אחרי בחירת ה-chunk הכי רלוונטי, קנוס מועמדים שה-`metricsLite` שלהם קרוב לנבחרים, כדי להעדיף אורכי משפט / קישורים שונים. המטרה: להראות את השונות של המשתמש, לא את הממוצע. לכלול לפחות chunk אחד gold. תווית: `דוגמאות אמיתיות לכתיבה שלו (חקה קצב, אורך, מעברים — אל תעתיק תוכן)`.
2. **תת-קבוצת דפוסים ברוטציה:** בחירת 4-6 מ-`qualitativePatterns` לכל בקשה, weighted-random לפי weight, seeded ע"י counter מסתובב → שונות בין-בקשות (ה-chaos בתוך הכתיבה). **תמיד** לכלול את דפוס ביטוי-החתימה הראשון.
3. **Blacklist:** מיזוג `auto` + `user` פחות `removed`, cap ~20 פריטים.
4. **כללי negative-space:** כולם (רשימה קצרה), בתבנית `כללי "לעולם לא": ...`.
5. **עוגני מדד תמציתיים:** `קצב אופייני ~24 מילים/משפט עם שונות גבוהה — ערבב אורכים, אל תאחיד`.

**Guard נגד הזרקה כפולה:** כאשר `styleEngineContext` פעיל, לדכא שדות חופפים מה-block הישן (vocab / connectors / openers) באמצעות flag `styleEngineActive`. לכבד את ה-`suppressPersonalStyle` הקיים.

## 8. שופט + לולאת תיקון (Judge & Rewrite)

`scoreStyleMatch(text, {profile, samples, invokeModel, mode})` → 0-100.

* **חצי מקומי (תמיד, חינם):** מיחזור `styleAuthenticityService.scoreTextAuthenticity` עם **היפוך פולריות** של אות `personalMismatch` (:199-210) והעשרתו — השוואת התפלגות המדדים של הטקסט מול `profile.metrics`, בדגש על **CV / שונות** ולא רק ממוצעים (טקסט AI אחיד מדי → burstiness נמוך → קנס). `localMatch = 100 - weightedDistance(...)`, כאשר המרחק מדגיש `sentenceLengthCV`, סטיית תדירות קישורים, חזרת openers, והפרות negative-space (כל `?` / `!` כשהפרופיל אוסר → קנס קשה).
* **חצי LLM (מותנה):** `scoreStyleMatchLLM` — call אחד שמשווה מול 2-3 chunks גולמיים: `החזר ציון 0-100 עד כמה זה נשמע כמו אותו כותב, ונמק בקצרה`. רץ רק כאשר: (א) הציון המקומי בטווח האפור 55-80, או (ב) המשתמש ב-tier "מעמיק". אחרת מקומי-בלבד — חוסך עלות.
* **ציון סופי:** `mode='local'` → מקומי בלבד; אחרת `0.5*local + 0.5*llm` כאשר LLM רץ, אחרת מקומי.

**לולאת rewrite (≤70 → אוטומטי):** מיחזור מנגנון `runHumanizerLoop` בכיוון מטרה חדש — במקום prompts לתיקון מרקרי-AI, prompt לתיקון-סגנון שנבנה מהאותות ה*ספציפיים* שנכשלו (למשל "אורכי משפט אחידים → גוון", "חסר ביטוי-חתימה X", "השתמשת בביטוי מ-blacklist Y"). החתימה: `runStyleRewriteLoop({text, invokeModel, target:71, maxPasses:2, buildRepairPrompt})`.

**רצף חשוב:** style-rewrite קודם; ה-humanizer הקיים נשאר מחובר כ-**fallback אחרון בלבד**, ורץ רק אם ה-style rewrite עדיין נכשל (השופט <70). זאת כדי למנוע מצב שבו השניים "נלחמים" זה בזה — ה-humanizer מכניס טריקים גנריים שהשופט הסגנוני דוחה.

## 9. Delta Tracking

**נקודות snapshot:**
* whole-doc — ב-`main.jsx:5846`, `editor.commands.setContent(generated)` → קריאה ל-`styleDeltaService.snapshotGeneration({docId, generatedText})`.
* targeted edits — ה-mark `aiSuggestion` כבר שומר `originalText` / `originalSlice` / `originalHtml` (`AiSuggestionMark.js`, מוחל ב-`aiService.js:10886-10937`); להזין accept/reject ישירות למסווג.

**ספריית diff:** `diff-match-patch` (ולא jsdiff). נימוק: diff ברמת תו עם `diff_cleanupSemantic`, מטפל היטב ב-Unicode / RTL עברית, קטן (~50KB), ובלי הנחות locale. jsdiff מפצל עברית וגרשיים גרוע.

**Trigger diff:** ב-`persistDocumentToCloud` / autosave — אם קיים snapshot ממתין למסמך → `diffAfterEdit(snapshot, currentText)`.
**אזהרת תלות:** ה-autosave לענן רץ רק כאשר `cloudUser && cloudSyncState.autosaveEnabled` (`main.jsx:6878`) — משתמש לא-מחובר לא יפעיל אותו לעולם. לכן ה-trigger חייב להתחבר גם ל-debounce המקומי של `lastEditorContentActivityAt` (או לכתיבת ה-autosave המקומי, `DOCUMENT_STORAGE_KEYS.autosave` ב-`main.jsx:3085`), כך ש-delta tracking עובד גם offline וללא חשבון.

**מסווג סגנון-מול-תוכן (חוקים קונקרטיים):**
* החלפת מילה בנרדפת / סידור מחדש / שינוי פיסוק / פיצול-מיזוג משפט עם overlap גבוה (Jaccard ≥ 0.6) → **עריכת סגנון**.
* הכנסה / מחיקה של ≥N מילות תוכן עם overlap נמוך, או שינוי מספרים / שמות → **עריכת תוכן**.
* counters ספציפיים: פיצול משפט → `shortenedSentence++`; הסרת קישור מוכר → `removedConnector++`; החלפת "מהווה" → `replacedWord['מהווה']++`; הוספת סוגריים → `addedParenthetical++`.

**כלל 20%:** `changeRatio = levenshtein/originalLength`.
* `<0.20` → אות סגנון: צבירת counters; חציית סף (למשל `shortenedSentence≥10`) → חוק סגנון מועמד.
* `>0.20` → gold standard: שמירת `editedText` כ-gold chunk.

**Trigger סינתזה:** `synthesizeProfileUpdate()` — ידני ("עדכן פרופיל מהעריכות שלי") או אוטומטי כל `editsSinceSynthesis≥15`. ממיר counters ל-deltas של metrics / patterns / blacklist; call LLM אופציונלי **יחיד** לניסוח 1-3 חוקים חדשים. נדיר בכוונה → עלות נמוכה.

## 10. שבירת החזרתיות המכנית — תשובה מהותית (Breaking Mechanical Regularity)

השאלה שנשארה פתוחה למודל החזק: "איך נמנעים מחזרתיות וחוקיות שמאפיינות מודלי AI, מעבר ל-jittering פשוט?". התשובה, ב-6 עקרונות:

1. **עיגון בדוגמאות ולא בהוראות** — מודלים מחקים טקסט קונקרטי הרבה יותר טוב מאשר ציות לחוקים מופשטים. ה-chunks הם המנוף הראשי; הדפוסים המילוליים משניים ומחזקים בלבד.
2. **להראות את השונות, לא את הממוצע** — retrieval שבוחר דוגמאות מגוונות סגנונית (פסקה ארוכה, פסקה קצרה, פסקה עם שבירת רגיסטר) גורם למודל לחקות את ה*טווח*. חשיפה לדוגמאות "ממוצעות" בלבד מייצרת חיקוי אחיד — בדיוק הבעיה שאנחנו מנסים לפתור.
3. **השופט מודד התפלגות, לא ממוצע** — החזרתיות המכנית היא ביסודה בעיית שונות (variance) נמוכה. השוואת stdev / היסטוגרמת אורכי-משפט מול הפרופיל, וכיוון ה-rewrite ספציפית להעלאת השונות, תוקפים את השורש ולא את הסימפטום.
4. **שבירת self-conditioning** — מודל אוטורגרסיבי ממשיך את הקצב של עצמו (מה שכבר כתב מכתיב את ההמשך). רוטציית תת-קבוצת הדפוסים בין בקשות, ובשלב מתקדם יצירה מקטעית עם הנחיות משתנות לכל סקשן, שוברת את הלולאה הזו.
5. **דה-רגולריזציה ממוקדת גבולות** — החזרתיות מתרכזת בפתיחות ובסגירות של פסקאות (המקום שבו AI הכי צפוי). לתקוף שם קודם נותן את התשואה הגבוהה ביותר.
6. **הודאה כנה במגבלה** — אין העלמה מוחלטת של "טביעת האצבע" ברמת פרומפט בלבד. המטרה הריאלית: לרדת מתחת לסף הגלאים, ולהשתמש בלולאת הלמידה מהעריכות (Delta) כמתקן ארוך-טווח שמקרב את הפרופיל למציאות לאורך זמן.

## 11. שלבי מימוש (Implementation Phases)

6 שלבים, כל אחד shippable עצמאית ומאחורי ה-toggle הראשי.

### שלב 1: מדדים מקומיים + הזרקה + סליידר יצירתיות + threading טמפרטורה
1. `computeLocalMetrics(text)` ב-`styleProfileService.js` מעל `analyzeTextSample`.
2. הרחבת `buildPersonalStyleInstructions` (:5845) עם sub-block `styleEngineContext` — עוגני מדד + negative-space בלבד (בלי chunks עדיין).
3. threading של `temperature` מ-`chatWithActiveProvider` / `streamWithActiveProvider` דרך `callClaudeApi` / `callOpenAICompatible` / Gemini.
4. `StyleEngineControls.jsx` — סליידר יצירתיות שממפה ל-temperature; mount ב-`StartScreen.jsx:1778-1814`.
   *(ערך נראה מיידי בלי stores חדשים; משתמש בנתונים ש-`workspaceLearning` כבר אוסף.)*

### שלב 2: Sample store + העלאת מסמכים + LLM patterns + confidence
1. `styleSampleStore.js` מעל `wordai_style_samples_v1` (chunking, dedupe, cap).
2. `StyleProfilePanel.jsx` — העלאת מסמכים דרך `materialExtractBrowser`, `ingestDocument`.
3. `extractQualitativePatterns` — ה-LLM call היחיד + כתיבת `qualitativePatterns` / `negativeSpace`.
4. `recomputeConfidence()` + badge ודאות.

### שלב 3: RAG retrieval
1. `styleRetrievalService.selectChunks` — keyword/TF-IDF מקומי (מיחזור `extractContextMatchTerms`).
2. re-rank MMR לגיוון.
3. חיבור ה-chunks ל-payload ההזרקה (סעיף 7, פריט 1).
   *(הקפיצה הגדולה ב"נשמע כמוני".)*

### שלב 4: שופט + auto-rewrite + blacklist + editor
1. `styleJudgeService.scoreStyleMatch` (חצי מקומי + חצי LLM מגודר).
2. `runStyleRewriteLoop` עם `buildRepairPrompt`; hook אחרי יצירת מסמך ב-`aiService`.
3. גזירת `blacklist.auto` (סעיף 6, שלב 3).
4. blacklist editor ב-`StyleProfilePanel`.

### שלב 5: Delta tracking
1. `styleDeltaService` — `snapshotGeneration` ב-`main.jsx:5846`; diff ב-`persistDocumentToCloud` / autosave.
2. `diff-match-patch` + `diff_cleanupSemantic`.
3. מסווג סגנון/תוכן + counters + כלל 20%.
4. כפתור "עדכן פרופיל מהעריכות שלי" → `synthesizeProfileUpdate`.

### שלב 6: טמפרטורה per-section + auto-synthesis + ליטוש
1. יצירה מקטעית (multi-call sectioning) עם טמפרטורה / הנחיות משתנות לכל סקשן.
2. auto-synthesis כל `editsSinceSynthesis≥15`.
3. ליטוש UX, כיול ספים.

**הערת ביצוע:** המימוש בפועל יבוצע ע"י סוכני Opus 4.8 עם prompt מפורט לכל שלב; המודל הראשי מתזמר ומאשר.

## 12. סיכונים ושאלות פתוחות (Risks & Open Questions)

1. **מגבלת מסמך Firestore 1MB** — פתרון: raw text מחוץ ל-blob המסונכרן; לוודא ש-`styleEngine` sub-object נשאר הרבה מתחת (הערכה ~10-30KB — cap על `qualitativePatterns` ~30 ועל `blacklist` ~50). סנכרון ה-sample-store לענן (אם יופעל בעתיד) חייב subcollection של docs לכל chunk, לא doc יחיד.
2. **איכות diff בעברית** — RTL + ניקוד + גרש/גרשיים עלולים לבלבל tokenizers; `diff-match-patch` ברמת תו + `cleanupSemantic` הכי בטוח, אבל הוריסטיקות קיבוץ-מילים דורשות בדיקה על עריכות עברית אמיתיות. לשמור את המסווג שמרני; counters advisory (לא לשנות מדדים אוטומטית בלי סף + אישור).
3. **עלות טוקנים לכל יצירה** — ההזרקה מוסיפה ~900-1400 טוקנים; LLM retrieval + LLM judge + rewrite עלולים לשלש קריאות. מיטיגציה: ברירות מחדל מקומיות, חצאי-LLM מגודרים לטווח אפור / tier מעמיק, extraction batched / incremental.
4. **הזרקה כפולה עם מערכות קיימות** — block המנוע + block `emphasizeVoice` / אקדמי + הוראות workspace עלולים לסתור. חובה flag `styleEngineActive` שמדכא שדות חופפים (סעיף 7). לוודא אינטראקציה עם ה-humanize agent: אם השופט כבר שכתב לסגנון, הרצת ה-humanizer של גלאי-AI אחריו עלולה להילחם בו — לתזמן ברצף (style-rewrite קודם, humanizer רק fallback כשהשופט עדיין <70).
5. **גלאי AI הם מטרה נעה** — לא סיכון קוד אלא הערת מוצר: סף השופט וה-blacklist ידרשו כיול מחדש תקופתי; `trainAuthenticityCalibration` כבר תומך בכיול מדגמים מתויגים ויש למחזר אותו.
6. **Cold start** — "אין מינימום מסמכים" מחייב שה-badge יתקשר בבירור ודאות נמוכה בהתחלה, כדי שהפלט לא יזכה לאמון-יתר לפני שהפרופיל בשל.

</div>
