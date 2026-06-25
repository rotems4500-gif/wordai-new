<div dir="rtl" align="right">

# תוכנית עבודה — תיקון לוגיקת ייצור הקוד ב-SPSS Studio

> **סטטוס:** אצווה A מומשה ונפרסה (sw v7) · אצוות B,C ממתינות
> **תאריך:** 2026-06-24
> **קבצים מרכזיים:** [`src/services/spssSyntaxService.js`](../src/services/spssSyntaxService.js) · [`src/SpssProjectStudio.jsx`](../src/SpssProjectStudio.jsx) · [`src/SpssSyntaxStudio.jsx`](../src/SpssSyntaxStudio.jsx)

---

## רקע

הסטודיו מייצר **SPSS command syntax** (לא Python) מתוך טקסט מטלה + מטא-דאטה של הנתונים. תלונה: חלק מהבלוקים "לא יוצאים" — נחסמים במקום לייצר syntax שמיש.

## שורה תחתונה (מבוסס ביקורת-קוד סטטית)

**הגורם הוא הגרדריילים שלנו, לא המודל.** Claude Sonnet 4.6 כותב SPSS תקין. שלוש שכבות הגנה דטרמיניסטיות, עם ידע SPSS חלקי, פוסלות פלט תקין. אין צורך להחליף מודל ואין צורך לבזבז מכסת AI — כל התיקונים ניתנים לבדיקה דטרמיניסטית.

נקודות חשובות:
- **הסטודיו החופשי (`SpssSyntaxStudio`) חסר retry ladder** — שם כל false-positive סופי.
- **שלב ה-sanitize רץ גם בניסיונות 2-3**, אז `skipMethodologyGuard` לא עוזר נגד פסילות sanitize — פקודה כמו `CODEBOOK` או keyword כמו `CONVERT` נהרגים בכל ניסיון.

---

## חמשת הכשלים

| # | כשל | קובץ | למה פוגע בעבודה אמיתית | חומרה |
|---|-----|------|----------------------|:-----:|
| 1 | `commentOutNonSpssTextLines` מכיר ~70 ראשי-פקודות | service ~58 | כל פקודה אחרת → קומנט → נהרגת. רץ בכל 3 הניסיונות | גבוהה |
| 2 | `detectMethodologyIssue` סותר את הפרומפט | service ~1163 | חוסם רגרסיה/מתאם על קטגוריאלי-מקודד — בדיוק מה שהפרומפט מורה לטפל בו עם dummy. עדיין `isNumeric` ולא `analysisRole` | גבוהה |
| 3 | שער t-test/ANOVA נוקשה | service ~1141 | דורש "לפי VAR" מפורש; "השווה בין גברים לנשים" נופל | גבוהה |
| 4 | allowlists חלקיים (`CONVERT` חסר) | service ~64 / ~98 | keywords תקפים מסומנים "משתנה מומצא" | בינונית |
| 5 | אין אכיפת סדר prep→שימוש | ProjectStudio ~374 | בלוק שצורך משתנה נגזר רץ לפני שנוצר → "invented variable" | בינונית |

---

## אצווה A — הרחבת גרדריילים · סיכון נמוך · ROI גבוה

### A1 · הרחב `SPSS_COMMAND_START_PATTERNS`
- **מיקום:** `spssSyntaxService.js` ~שורה 58
- **עכשיו:** רשימה חלקית; פקודה מחוצה לה הופכת לקומנט ב-`commentOutNonSpssTextLines`.
- **שינוי:** להוסיף ראשי-פקודות חסרים: `COMMENT`, `SET`, `SHOW`, `DISPLAY`, `CODEBOOK`, `MATRIX`/`END MATRIX`, `BEGIN PROGRAM`/`END PROGRAM`, `BEGIN DATA`/`END DATA`, `DEFINE`/`!ENDDEFINE`, `MRSETS`, `PRESERVE`/`RESTORE`, `ECHO`, `CSPLAN`/`CSDESCRIPTIVES`/`CSTABULATE`, `TSMODEL`/`TSAPPLY`, `APPLY DICTIONARY`, `DATA LIST`.
- **סיכון:** כמעט אפס — רק *מוסיף* פקודות מוכרות. פקודות מסוכנות עדיין נחסמות בנפרד דרך `findBlockedAnalysisOnlyCommandIssue`.
- **בדיקה:** מבחן דטרמיניסטי שמזין כל ראש-פקודה ומוודא שלא הופך לקומנט.

### A2 · `detectMethodologyIssue` → `analysisRole` במקום `isNumeric`
- **מיקום:** `spssSyntaxService.js` ~שורה 1163 (וכן בלוקי correlation/descriptive/outlier)
- **עכשיו:** חוסם אם משתנה מסומן non-numeric. קטגוריאלי-מקודד (`region` 1..5) הוא `isNumeric=false` → חוסם — סותר את הפרומפט שמורה לעשות dummy.
- **שינוי:** השער יבדוק `analysisRole`: `continuous`/`likert` → תקף; `categorical-code`/`categorical` → לא נחסם, מועבר ל-LLM עם הנחיית dummy/GLM הקיימת.
- **סיכון:** בינוני (מרכך שער). ה-LLM כבר מודרך; sanitize שומר על נכונות. לוודא שלא נפתחות בקשות באמת לא-תקפות.
- **בדיקה:** role-tests + מקרי-קצה (רגרסיה עם מנבא קטגוריאלי; מתאם עם פריט ליקרט).

### A4 · הרחב allowlists
- **מיקום:** `RESERVED_SLOT_TOKENS` ~64 · `GRAPH_ARGUMENT_KEYWORDS` ~98
- **שינוי:** להוסיף `CONVERT` (string RECODE) ושאר keywords שנלכדים בתוך slots ומסומנים בטעות.
- **סיכון:** נמוך.

---

## אצווה B — לוגיקה

### B3 · רכך שער t-test/ANOVA
- **מיקום:** `spssSyntaxService.js` ~שורה 1141; חילוץ קיבוץ ב-`extractExplicitGroupingTokens`
- **עכשיו:** דורש קישור מפורש "לפי VAR_n"; ניסוח-לפי-ערכים נופל.
- **שינוי:** לזהות ניסוח-לפי-ערכים ולמפות לעמודה, **או** להפוך לאזהרה רכה ולתת ל-LLM לבחור.
- **סיכון:** בינוני — לשמר הגנה מפני בקשות חסרות-קבוצה.

### B5 · אכוף סדר prep→שימוש
- **מיקום:** `SpssProjectStudio.jsx` · `onGenerateAllCode` ~שורה 374
- **עכשיו:** סומך על סדר ה-analyses מה-LLM. בלוק שצורך `age_group` לפני יצירתו → "invented variable".
- **שינוי:** מיון/בדיקת תלות — בלוקי prep שיוצרים שמות לפני בלוקים שצורכים אותם.
- **סיכון:** נמוך-בינוני.

---

## אצווה C — חוסן

### C6 · retry ladder לסטודיו החופשי
- **מיקום:** `SpssSyntaxStudio.jsx`
- **עכשיו:** אין ladder — כל false-positive סופי (מורגש הכי חזק).
- **שינוי:** retry/repair קל כמו ב-ProjectStudio, או לפחות הודעת-שגיאה ברורה יותר.
- **סיכון:** נמוך.

---

## סדר ביצוע מומלץ

1. **אצווה A** (A1 → A2 → A4) — צפויה לפתור את רוב "לא הכל יוצא".
2. עצירת-בדיקה: לראות אם A מספיק לפני שממשיכים.
3. **אצווה B** (B3, B5).
4. **אצווה C** (C6).

## הגדרת סיום (Definition of Done)

- [x] A1 — כל ראש-פקודה SPSS נפוץ עובר בלי להפוך לקומנט (מבחן דטרמיניסטי)
- [x] A2 — רגרסיה/מתאם עם משתנה קטגוריאלי/`likert` לא נחסמים pre-flight (חוסם רק text/date/identifier)
- [x] A4 — `CONVERT` ושאר keywords לא מסומנים כמשתנה מומצא
- [x] B3 — "השווה בין גברים לנשים" מייצר t-test תקין (גם תוקן באג: `GROUP_COMPARISON_HINT_PATTERN` עם `\bבין\b` מעולם לא תפס עברית — עבר ל-lookaround Unicode)
- [x] B5 — בלוק נגזר תמיד רץ אחרי בלוק היצירה שלו (stable partition prep-first ב-`onGenerateAllCode`)
- [x] C6 — false-positive בסטודיו החופשי לא סופי (retry ladder כמו ב-ProjectStudio)
- [x] `node --check` נקי · `npm run build` ירוק
- [ ] אישור משתמש לפני `npm run firebase:deploy:hosting` + bump `public/sw.js` (sw → v13)

## אצווה D — SAV dictionary (חדש, מומש) · sw v13

הגדול: ה-SAV dictionary (`valueLabels`, declared `MISSING`) נקרא אך נזרק לפני המטא-דאטה.
- **D1** `spssDataIngest.js`: חילוץ `declaredMissing` (sav-reader `missing`: number/array/{min,max[,value]}) + `normalizeDeclaredMissing`. (`measure` לא נחשף ע"י הספרייה — subtype 11 = "todo".)
- **D2** `valueLabels`+`declaredMissing` עוברים `parseSpssSavDataset`→`buildTabularAnalysis`→`buildColumnProfile`. תאי declared-missing מסוננים מהסטטיסטיקה (סמנטיקת SPSS) ומגדילים `missingCount`.
- **D3** `deriveAnalysisRole`: משתנה נומרי עם value labels בכיסוי ≥0.8 → `categorical-code` (אמת ה-dictionary מנצחת היוריסטיקה; likert עדיין נתפס לפניו).
- **D4** `buildTokenizedMetadataLines` פולט `valueLabels=[1=זכר;…]`, `declaredMissing=[…]`, `suspectedUndeclaredMissing=[…]`.
- **D5** דגל דטרמיניסטי `suspectedMissingCodes` (קוד sentinel 98/99/-9 לא-מוגדר שיושב הרחק מהסולם, ≥2× ה-restMax). מוזן ל-3 prompts של קריאת פלט + generator + planner. 9/9 בדיקות עברו.

## אצווה E — output מובנה (חלקי) · spvOutputParser

`formatTableBlock` מציג כעת ספירות מפורשות (k תוויות, m ערכים בסדר קריאה) במקום רשימה שטוחה. שחזור grid מלא (row×col) נדחה — דורש .spv אמיתי לאימות, סיכון רגרסיה על הפרסר הבינארי שנבדק על קובץ אחד.

## אצווה F — assignment self-check (חדש, מומש)

`validateAssignmentProfile` (דטרמיניסטי, אפס AI): ממפה משתני כל ניתוח לעמודות אמיתיות ומסמן אי-התאמות method↔רמת-מדידה (מתאם על קטגוריאלי, t-test בלי קבוצה בינארית, מזהה ברגרסיה, משתנה לא-קיים). אזהרות מצורפות ל-`notes`. 6/6 בדיקות עברו.

## אצווה G — undeclared-missing מתוך טקסט ה-value-labels (חדש, מומש) · sw pending

**הגורם מס' 1 ל"פרק תיקונים" ארוך בקבצי סקרים אמיתיים.** נבדק מול `2022_SPSS (1).sav` (160 משתנים, 1585 שורות): **136/160 משתנים מקודדים missing רק בטקסט ה-value-label** ("888"/"999"/"Don't know"/"Refuse"), עם קודים ממופים-מחדש (98/99/100/101), ו-`declaredMissing=null` בכולם. ההיוריסטיקה הנומרית של D5 (`sentinel ≥ 2×restMax`) תפסה **1 מתוך 136** — קודים כמו 94/96/100/101 מנפחים את `restMax` ומשתיקים אותה. תוצאה: הקוד שיוצר לא פולט `MISSING VALUES`, וכל FREQUENCIES/ממוצע/מתאם בולע Don't-know/Refuse כאילו תשובות אמיתיות → תיקונים סדרתיים.

- **G1** `spssSyntaxService.js`: `MISSING_LABEL_PATTERNS` (EN+HE) + `labelMarksMissing` — קורא את **טקסט** המילון. שמרני בכוונה: רק סמני "אין תשובה שמישה" אוניברסליים (888/999/don't know/refuse/no answer/no response/remember/לא יודע/מסרב/אין תשובה), **לא** קטגוריות אנליטיות ("Didn't vote"/"Blank"/"Undecided").
- **G2** `buildColumnProfile`: `suspectedMissingCodes` = איחוד ההיוריסטיקה הנומרית עם הקודים שנגזרו מהטקסט (על כל מילון הערכים, גם אם המדגם לא פגע בהם). שאר הצנרת (D4/D5 prompts → `MISSING VALUES` ב-prep) כבר קיימת.
- **בדיקה דטרמיניסטית:** 136/160 מסומנים, **0 false-positives** על turnout/blank/undecided. `node --check` נקי · `npm run build` ירוק (16.7s).
- **תלוי-אישור:** deploy עם bump `public/sw.js`.

## אצווה H — לולאת תיקון משגיאת SPSS אמיתית (חדש, מומש) · sw pending

**הפער שג'ימיני זיהה נכון:** ה-retry ladder הקיים מתקן רק false-positive של ה-guardrail שלנו (`repairHint`), לא שגיאת runtime אמיתית של מנוע SPSS. `interpretSpssOutput` רק מסביר פלט; אין מסלול "הדבק Error # → קבל קוד מתוקן".

- **H1** `spssSyntaxService.js`: `parseSpssOutputErrors(output)` — פרסר דטרמיניסטי (אפס AI) לבלוקי `>Error #N in column C. Text: …` / `Command name:` / `>Warning #N`. מחזיר `{diagnostics, fatal, warnings, hasFatal, hasWarnings}`. עמיד גם בלי קידומת `>`. **17/17 בדיקות עברו** (Error #4285/#1/#34, Warning #206, mixed, ללא-prefix, טבלה נקייה, null).
- **H2** `repairSpssSyntaxFromError({analysis, priorSyntax, output, ...})` — מטקן syntax + טקסט שגיאה ל-VAR_n (אותו מודל פרטיות), `buildSpssRepairSystemPrompt` (תיקון מינימלי, Error vs Warning, Error #1 = נקודה חסרה בפקודה הקודמת), `sanitizeSpssSyntax` ב-mode prep. **האדם הוא הקומפיילר** — תיקון אחד לכל הדבקה, לא לולאה פנימית.
- **H3** `SpssSyntaxStudio.jsx`: כפתור "🛠 תקן קוד" במצב "פירוש פלט" (פעיל רק כשיש master syntax). הקוד המתוקן מוצג כהודעת צ'אט `kind:'repair'` עם monospace + "העתק קוד מתוקן" — לא-הרסני לבלוקים.
- **בדיקה:** parser דטרמיניסטי 17/17 · `node --check` נקי · `npm run build` ירוק (13.6s).
- **תלוי-אישור:** deploy עם bump `public/sw.js`.

## עקרונות עבודה

- אפס קריאות AI לבדיקה — הכל דטרמיניסטי (כמו role-tests).
- כל אצווה: edit → `node --check` → מבחן ממוקד → build → אישור → deploy.
- bump `public/sw.js` (כרגע v6) בכל deploy שמצריך רענון לקוח.

</div>
