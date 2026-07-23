# שלד מטלה — המסלול שעובד בלי מפתח API

מסמך ניווט לתת-המערכת. נכתב יולי 2026, אחרי הקומיטים `8fab943`, `76a3af9`, `1e63835`.

---

## למה זה קיים

משתמש שלא מכניס מפתח API קיבל עד היום אפליקציה חצי-מתה. שלוש חלופות נשקלו ונדחו:

| חלופה | למה נדחתה |
|---|---|
| Proxy עם המפתח של רותם | עלות פתוחה שגדלה עם כל משתמש |
| OAuth לספק (OpenRouter) | עדיין תלוי בחשבון חיצוני |
| מודל מקומי | 7.6GB RAM בלי GPU לא מריץ מודל עברי — ראה `hardware-local-llm-limit` |

הפתרון: **להפריד בין מה שדורש מודל ומה שלא.** מסתבר שרוב העבודה סביב כתיבה אקדמית
היא לא ייצור טקסט — היא מבנה, אחזור ראיות, וייחוס. כל אלה דטרמיניסטיים או מבוססי
embeddings מקומיים.

**מה שכן דורש מודל ואין עליו ויכוח: ניסוח פרוזה.** סטטיסטיקה לא כותבת עברית אקדמית
קוהרנטית, והמסמך הזה לא מתיימר אחרת.

---

## הארכיטקטורה הדו-שלבית

```
הנחיות מטלה + פרופיל סגנון + חומרי עזר
              ↓
   ┌──────── שלב 1 — מקומי, אפס API ────────┐
   │  פירוק ההנחיות לסעיפים (regex)          │
   │  אינדוקס החומרים (e5-small ב-WASM)      │
   │  התאמת ראיות לכל סעיף (cosine)          │
   │  פתיחים מהקורפוס האישי (n-gram)         │
   └────────────────┬────────────────────────┘
                    ↓
            פנקס הכנה — לכל יחידת עבודה:
            local / needs-ai / blocked + סיבה
                    ↓
   ┌──────── שלב 2 — AI, רק על השאריות ─────┐
   │  חיפוש מקורות לסעיף חסום  (טרם נבנה)   │
   │  כתיבת העבודה מהראיות                   │
   └─────────────────────────────────────────┘
```

**הכלל שמחזיק את הכול:** סעיף בלי ראיות מסומן `blocked`, **לא** `needs-ai`. מודל
שממציא מקור הוא בדיוק הכשל שהמסלול נועד למנוע, ולכן כתיבה שם לא מוצעת בממשק בכלל.
`blocked` פירושו "חסר קלט", `needs-ai` פירושו "אפשר להשלים בקריאה".

---

## הקבצים

### שירותים — שלב 1 (מקומי)

| קובץ | תפקיד |
|---|---|
| [materialChunkStore.js](../src/services/materialChunkStore.js) | קורפוס חומרי העזר: chunks + פרובננס (`sourceTitle`/`pageHint`/`sectionHint`/`charStart`) + וקטורי int8. IndexedDB, מפתח `wordai_material_chunks_v1`. |
| [assignmentSpecService.js](../src/services/assignmentSpecService.js) | `parseAssignmentSpec(text)` — סעיפים, intent, מכסות, מקורות, APA, תאריך. דטרמיניסטי לגמרי, מחזיר `confidence` + `warnings`. |
| [evidenceMatchService.js](../src/services/evidenceMatchService.js) | שיוך סעיף→ראיות דרך `selectChunks` הקיים, עם סף רלוונטיות וזיהוי פערים. |
| [styleOpenerService.js](../src/services/styleOpenerService.js) | כריית פתיחי פסקה מהקורפוס האישי, מסווגים לפי intent. |
| [assignmentPrepService.js](../src/services/assignmentPrepService.js) | פנקס ההכנה. אפס תלות ב-aiService — מחושב גם בלי ספק. |
| [gapSourceService.js](../src/services/gapSourceService.js) | **סגירת פער**: סעיף חסום → שאילתה דטרמיניסטית → `sourceRetrieval` → משיכת עמוד → נכנס לאותו אינדקס. נפילה לתקציר מסומן `strength:'abstract'`. |
| [pageTextFetch.js](../src/services/pageTextFetch.js) | משיכת טקסט עמוד דו-מסלולית: דסקטופ Rust / ווב `/api/fetch-page-text`. משותף עם `chatSourceCheck`. |
| [assignmentReviewService.js](../src/services/assignmentReviewService.js) | `reviewDraft` — סקירה דטרמיניסטית **באפס קריאות**. `applyFinishingPasses` — סגנון/אנטי-גלאי, רק לפי בחירה. |

### שירותים — שלב 2 (AI) ומצב

| קובץ | תפקיד |
|---|---|
| [assignmentAiService.js](../src/services/assignmentAiService.js) | `draftSectionFromEvidence` (סעיף בודד), **`draftWholeWork`** (כל העבודה בקריאה אחת, מספור ראיות גלובלי), `buildBibliography` (דטרמיניסטי — המודל לא נוגע), `buildScaffoldContextBlock`. |
| [assignmentScaffoldStore.js](../src/services/assignmentScaffoldStore.js) | השלד הפעיל (spec + evidence). IndexedDB, שורד רענון. שלד אחד בכל רגע. |
| [assignmentScaffoldDoc.js](../src/services/assignmentScaffoldDoc.js) | spec→HTML, **`buildWholeWorkHtml`** (סעיפים+חסומים+ביבליוגרפיה, בסדר ה-spec), `findSectionAtCursor`, `countSectionWords`, `insertReplacingQuotaHint`. |

### ממשק

| קובץ | תפקיד |
|---|---|
| [AssignmentScaffoldStudio.jsx](../src/components/assignmentScaffold/AssignmentScaffoldStudio.jsx) | מסך מלא: הנחיות → שלד נערך → חומרים → ראיות → פנקס → פתיחה בעורך. |
| [EvidencePanel.jsx](../src/components/assignmentScaffold/EvidencePanel.jsx) | חלונית צד מעוגנת, עוקבת אחרי הכותרת שמעל הסמן. כולל **"חפש מקורות לסעיף הזה"** על סעיף חסום. |
| [WorkReviewDialog.jsx](../src/components/assignmentScaffold/WorkReviewDialog.jsx) | סבב התיקונים: ליקויים + בחירת ליטוש + **מחיר בקריאות לפני הלחיצה**. |

### חיווט

- `appMode === 'assignment-scaffold'` ב-[main.jsx](../src/main.jsx) + `aside` לפאנל (מקביל לחלונית ה-AI, כולל מסך מלא בנייד).
- טאב **"מטלה"** ב-[Ribbon.jsx](../src/Ribbon.jsx): פתיחת הסטודיו, הצג/הסתר פאנל, רענון ראיות, סיום מטלה.
- כפתור **"🧭 שלד מטלה"** ב-[StartScreen.jsx](../src/StartScreen.jsx).
- פקודות ב-`handleCommand`: `openAssignmentScaffold`, `toggleEvidencePanel`, `refreshAssignmentEvidence`, `finishAssignment`.

---

## מספרים שנמדדו (לא הוערכו)

**סף הרלוונטיות** — e5-small על קורפוס עברי אקדמי מתויג, 4 מסמכים, 8 שאילתות, 48 זוגות:

```
רלוונטי    — חציון 0.837, min 0.797
לא רלוונטי — חציון 0.772, max 0.833, p10 0.746
נבחר: floor=0.795, band=0.05  →  P=0.84  R=0.94  F1=0.889
```

ההתפלגויות **חופפות** — חיובי שגוי מזדמן הוא בלתי נמנע, לא באג. לכן ה-score מוצג
בפאנל. הניחוש המקורי (0.74) היה מתחת ל-p10 של הלא-רלוונטיים, כלומר קיבל כמעט הכול.

**עלות כתיבה** — נמדד ב-LAB: קריאה אחת לסעיף בודד; **קריאה אחת לעבודה שלמה** ב-`draftWholeWork`.

**מכסת מילים = כמות מקורות** (`tools/test-bench/quota-probe.mjs`) — אותה מכסה, אותו פרומפט:

```
1 קטע ראיות  →  98 מילים
4 קטעי ראיות → 217 מילים
```

המודל **לא כותב קצר** — הוא מסרב לרפד מעבר למה שהמקורות מאפשרים, וזה בדיוק חוק 3
שנתנו לו. לכן `reviewDraft` מתריע *"אין מספיק מקורות למכסה"* ולא *"הסעיף קצר"*:
הניסוח השני שולח את המשתמש לבקש הרחבה, והוא מקבל ריפוד.

**עלות הזרימה המלאה** (`e2e-assignment.mjs`, 3 סעיפים, אחד מהם חסום):
**2 קריאות מודל** — אחת לחיפוש המקור החסר, אחת לכתיבת כל העבודה.

---

## גוצ'אס — כל אחד מהם עלה זמן

**שלושה שנתפסו רק בריצת הקצה-לקצה** — כל שלב עבר את ההרנס שלו, והם ישבו בתפרים:

- **מכסת ההיקף הכולל נלקחה מסעיף.** `"היקף כולל: 700 מילים"` לא מתאים ל-regex
  (הוא מצפה למספר צמוד ל"היקף"), הסריקה המשיכה ותפסה `"עד 250 מילים"` של הסעיף
  האחרון. ההיקף של כל העבודה נקבע לפי סעיף בודד, ומשם התפזרו מכסות שגויות.
  התיקון: `extractGlobalWordQuota` מעדיף שורה עם ניסוח גלובלי מפורש.
- **שאילתת הפער איבדה את נושא הסעיף.** מכסת המילים (`250`) נכנסה לשאילתה בעוד
  `"רשתות חברתיות"` — המונח היחיד שמבחין את הסעיף — נדחק מעבר ל-`maxTerms` ע"י
  מילים כלליות מנושא המטלה. התוצאה: מקור גנרי שנפל בסף הרלוונטיות, והסעיף נשאר
  חסום. התיקון: מונחי ההנחיה קודמים לנושא המטלה, ואסימון עם ספרה נזרק.
- **המודל מחזיר `<p>` למרות שהתבקש פרוזה** — התגיות עברו escape והוצגו כטקסט
  `&lt;p&gt;` במסמך. `stripModelHtml` מנקה לפני ההרכבה.


- **PDF "עם טקסט" יכול להיות ג'יבריש מוחלט.** קידוד ToUnicode שבור מוציא
  `)Ntur: nttxnt ETNn` — עובר את מבחן הסרוק (יש המון תווים) ומרעיל את האינדקס
  הסמנטי. נמדד: 8 מתוך 15 מקורות קורס עבריים. הגלאי: `pureTokenRatio < 0.5`
  (תקינים 0.71–0.95, שבורים 0.12–0.25) → ניתוב ל-OCR כמו סרוק.
- **קוסינוס אבסולוטי של e5 חסר משמעות.** הכל נדחס ל-0.75–0.90; קטע "ממוצע"
  (hub) מנצח כל שאילתה. הניקוד: ניכוי צנטרואיד + סף רובסטי median+MAD (ראה
  evidenceMatchService, כיול v2).
- **`intent:'print'` בכל `page.render` של pdfjs.** ברירת המחדל תלויה ב-rAF —
  שלא נורה בטאב מוסתר (OCR נתקע לנצח) ולא קיים ב-Node (קריסה). נשך ארבע פעמים.
- **`\b` לא עובד בעברית.** אות עברית אינה `\w`, ולכן `/\bנתח\b/` לעולם לא מתאים.
  זה השתיק את כל זיהוי ה-intent בשקט. תת-מחרוזת לעברית, `\b` רק ללטינית.
- **`chatWithActiveProvider` חוטף קריאות אקדמיות לצינור אחזור המקורות.**
  `skipAutomation` + `skipMultiModel` לא מספיקים — חובה `forceSuppressResearchRouting: true`.
  בלעדיו פרומפט שמזכיר APA/מקורות מחזיר רשימת קישורים במקום טקסט. מתועד גם ב-`SINGLE-CALL-LOCK.md`
  כניתוב מכוון, ולכן העקיפה כאן דורשת הצדקה: המקורות **כבר אותרו ואומתו בשלב 1**.
- **`extractMaterialTextFromBytes` מחזיר `{ok, text, error}`, לא מחרוזת.** שימוש ישיר
  נותן `"[object Object]"` — מילה אחת שנזרקת בחיתוך, וה-ingest "מצליח" עם 0 קטעים.
- **`embedTexts` קורא ל-`onProgress({done,total})`** — אובייקט אחד. ומטמיע אצווה
  מוגבלת בכל קריאה, ולכן צריך לולאה עד `remaining === 0`.
- **`selectChunks` מצפה ל-`vectorById: Map<string, Float32Array>`** — לא base64. ומחזיר
  chunks **בלי ציונים**, ולכן סף רלוונטיות חייב לדרג מחדש בעצמו.
- **בלי סף, `selectChunks` תמיד מחזיר k קטעים** — MMR בוחר לפי גיוון כשכל הציונים 0.
  "אין חומר תומך" חייב להיות זיהוי מפורש.
- **פרובננס:** chunk שפותח בכותרת שלו מקבל מסריקה-אחורה את הכותרת *הקודמת*. לבדוק את
  השורה הראשונה של ה-chunk לפני שסורקים אחורה.
- **סף אחד לשתי מטרות זה באג.** סינון פסקאות ל*הצעה* פסל גם את ספירת ה*חזרות*, ומחק
  כוונות שלמות מאינדקס הפתיחים. פסקה קצרה היא ראיה מלאה להרגל.
- **המודל מחזיר לפעמים HTML מוכן ולפעמים פרוזה גולמית** — לעטוף ב-`<p>` רק בתנאי.
- **service worker מגיש מודולים ישנים ב-dev.** עריכה שמוסיפה export נותנת
  "does not provide an export named X" גם אחרי `rm -rf node_modules/.vite`.
  ריפוי: `getRegistrations().unregister()` + `caches.delete()` לכל המפתחות, ואז reload.
  אבחון: `curl localhost:3001/src/...` מראה שהשרת דווקא תקין.
- **`vite build` לא תופס `ReferenceError`** על משתנה שנמחק. רק ריצה בדפדפן תופסת.

---

## איך בודקים

**`node tools/test-bench/run-scaffold-e2e.mjs` — ה-eval של צינור השלד המקומי (0 API).**
מריץ קליטה→הטמעה→אחזור→מסמך על קורפוס הקורס האמיתי, עם מקרי תשובה-ידועה + בקרות
שליליות (סעיפים שאסור למצוא להם ראיות). OCR ב-Node (cache ב-`.scaffolde2e-scratch/`),
הטמעה ~22ms/קטע. exit 0 = כל המקרים עוברים. הוא זה שגילה ש-8/15 מקורות עברית הם
ג'יבריש קידוד (ראה גוצ'אס) ושהאחזור לפניו עמד על 2/7.

**`node tools/test-bench/run-e2e-assignment.mjs` — הבדיקה שסוגרת את הלולאה.**
מריצה את כל השרשרת מול ספקים אמיתיים ובודקת 30 טענות. כל שלב יש לו הרנס משלו,
אבל רק זו תופסת את התפרים. שלושת הבאגים שהיא מצאה בריצה הראשונה מתועדים בגוצ'אס.

הרנסים ממוקדים: `run-gap-harness` (סגירת פער), `run-whole-work-harness` (קריאה אחת),
`run-review-unit` (סקירה, 0 רשת), `run-quota-probe` (ניסוי המכסה).


**מול ספק אמיתי (מפתחות DPAPI של האפליקציה):**

```bash
node tools/test-bench/run-assignment-harness.mjs
```

בונה `WORDAI_VERIFY_ENTRY=assign` ומריץ את [assignment-ai-harness.mjs](../tools/test-bench/assignment-ai-harness.mjs).
בודק: הפניות בכל טענה, אפס מספרים מומצאים, סימון `[דרוש מקור נוסף]`, סירוב לסעיף בלי ראיות,
וספירת קריאות API בפועל.

**לוגיקה מקומית ב-node** (הייבוא בריפו חסר סיומות; Vite פותר, node לא):

```js
// loader קטן שמוסיף .js + globalThis.window = {...} — ראה scratchpad
node --import "data:text/javascript,import{register}from'node:module';..." test.mjs
```

**ממשק:** `preview_start` עם `wordflow-dev-http` (`.claude/launch.json`, `VITE_NO_HTTPS=1`).
**screenshot נתקע** באפליקציה הזו — לאמת עם `get_page_text` + `javascript_tool`.
הדבקה ל-textarea של React דורשת native value setter + `input` event; העלאת קבצים
אפשרית ע"י `DataTransfer` + `DragEvent('drop')` על אזור הגרירה.

⚠️ בדפדפן התצוגה `onnxruntime-web` נכשל (`no available backend found`), ולכן שם רץ
רק מסלול ה-fallback הלקסיקלי. מסלול e5 נבדק ב-node בלבד.

---

## מה נבנה ומה לא

**נבנה ואומת:** כל שלב 1; פנקס ההכנה; כתיבת סעיף מעוגנת (נבדקה מול Gemini);
הקשר השלד לחלונית ה-AI; הסטודיו; פאנל הראיות; טאב הסרגל.

**לא נבנה:**
- **חיפוש מקורות לסעיף חסום** — הפער העיקרי. התוכנית: שאילתה נגזרת מהסעיף → `sourceRetrieval`
  → משיכת טקסט העמוד (דסקטופ דרך `browserRetrievalService`, ווב דרך proxy) → נפילה לתקציר
  **מסומן כראיה חלשה** → הכנסה ל-`materialChunkStore` → הסעיף יוצא ממצב חסום.
- **כתיבת עבודה שלמה בקריאה אחת** — ההחלטה שהתקבלה: קריאה-לסעיף היא פעולה ממוקדת בפאנל,
  אבל ברירת המחדל לעבודה שלמה חייבת להיות **קריאה אחת** שמקבלת את כל הסעיפים, כל אחד עם
  בלוק הראיות הממוספר שלו. כך נשמר העיגון מבנית, בלי לשלם על N קריאות ובלי לאבד
  קוהרנטיות ומעברים. תואם את `tools/SINGLE-CALL-LOCK.md`.
- **ביבליוגרפיה אוטומטית** מהפרובננס, ו**מעברים** בין סעיפים.
- **סבב תיקונים** ובחירת מנוע סגנון/אנטי-גלאי לפני אישור סופי.
- השלמה באצווה של כל פריטי `needs-ai` — נכתבה והוסרה בכוונה עד שאפשר לאמת מול ספק חי.

**מגבלה ידועה:** העיגון מחזיק היטב על מספרים וציטוטים, אבל **מסגור הקשרי קל מחליק
פנימה** לפעמים (הרצה אחת הוסיפה "מטלת שיפוט חזותית פשוטה" בלי הפניה, כשהראיות לא
תיארו זאת). לא למכור את זה כ"אפס הזיות".

---

## מנוע הכתיבה המקומי (NLG) — יולי 2026

הרחבה: **גוף הסעיף כבר לא NEEDS_AI תמיד.** כשיש ראיות, הפנקס מסמן `LOCAL_DRAFT`
וכפתור "📝 טיוטה מקומית (ללא AI)" בסטודיו כותב את כל העבודה מקומית.

**הצנרת (NLG קלאסי):**
1. **תכנון** — `MOVE_PLANS` ב-[proseComposeService.js](../src/services/proseComposeService.js):
   רצף מהלכים רטוריים לכל intent (claim→evidence→explain→contrast→wrap), מודע-מכסה.
2. **מימוש משפט** — [sentenceComposeService.js](../src/services/sentenceComposeService.js)
   על [sentenceGrammar.data.js](../src/services/sentenceGrammar.data.js) (seed ידני v1):
   מסגרות פסוקיות/אימפרסונליות **בטוחות-מגדר** — אף מילת מסגרת לא צריכה הסכמה עם התוכן.
3. **תוכן** — `pickCoreSentence`: משפט-הליבה מכל chunk ראיה (ניקוד: מונחי חובה,
   אורך, יחס עברית). כל משפט תוכן נושא `evidenceId`. משפטי מטא — על הראיות שהוצגו בלבד.
4. **איכות** — `composeSectionProseBest`: 3 וריאנטים, הדטקטור המקומי
   (`scoreTextAuthenticity`, מוזרק — LEAF) בוחר את הכי-אנושי.

**שכבות הידע (נבנות ב-Flash אופליין, דפוס synonyms-build):**
- `tools/lexicon-build` → [hebrewLexicon.data.js](../src/services/hebrewLexicon.data.js):
  לקסיקון מתויג (POS/מין/מספר/משלב/שורש/בניין/ריבוי/נסמך), יעד 20k לממות.
  גישה: [hebrewLexemeService.js](../src/services/hebrewLexemeService.js) (כולל הזנת
  `mergeExternalWordlist` של hebrewLexiconService).
- [hebrewMorphRules.js](../src/services/hebrewMorphRules.js): נטייה גנרטיבית שורש+בניין,
  כתיב מלא. Tier 1 שלמים+ל"א; Tier 2 ל"ה/פ"נ/ע"ו-ע"י/פ"י/שורקות-התפעל; Tier 3 → null.
- `tools/morph-build` → `morphRules.data.js`: שופט-Flash מאשר כל (שורש,בניין);
  [hebrewMorphService.js](../src/services/hebrewMorphService.js) `conjugateSafe` מחזיר
  צורה **רק** לזוג מאושר — אף צורה מנוחשת לא מודפסת.

**אימות:** תרחיש 4 ב-scaffold-e2e — עיגון ≥40% חפיפת מילות-תוכן מול ה-chunk,
אי-כפילות, כנות מכסה ([דרוש מקור נוסף]). `validate.mjs` בכל כלי בנייה (שער 90-98%).

**גבולות כנים:** משפטי התוכן קרובים למקור בכוונה (פרפרזה-קלה, לא כתיבה חופשית);
סעיף בלי ראיות נשאר חסום; המחולל לא ממציא עובדות — זה הפיצ'ר.
