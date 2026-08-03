# tools/style-reference-build

כלי **אופליין, חד-פעמי** לבניית נכס-ייחוס האוכלוסייה (`src/services/styleReferenceCorpus.data.js`)
של מנוע הסגנון (Style Engine). לא רץ בזמן ריצה של האפליקציה ולא מחובר ל-build — מריצים ידנית
כשרוצים לרענן את הנכס מקורפוס טקסטים אמיתי.

## מה זה עושה

**שני שלבים.** `prepare-corpus.mjs` מכין את התיקייה (מסמך אחד לקובץ) מחומרי הגלם
שכבר קיימים במכונה, ו-`build.mjs` מחשב ממנה את הנכס:

```bash
node tools/style-reference-build/prepare-corpus.mjs                    # → %TEMP%/wordai-style-ref-corpus
node tools/style-reference-build/build.mjs --corpus "<אותה תיקייה>"    # → src/services/styleReferenceCorpus.data.js
```

`prepare-corpus.mjs`:

1. מפצל את הבלובים מרובי-המסמכים של `tools/detector-train/samples/human-global/`
   (מופרדי `===`) למסמכים בודדים.
2. מחלץ טקסט מהקורפוס האקדמי (`314999533`, מחברים אחרים — **לא** עבודות המשתמש),
   כולל שחזור שורות ופסקאות מ-PDF (`itemsToLines` + הוריסטיקת שורה-קצרה).
3. מפעיל שערי איכות: כפילויות, רציפות-פרוזה, מרק-שברים, עברית, PDF משובש.
4. כותב `_corpus-manifest.json` עם ההרכב — `build.mjs` מכניס אותו ל-`meta.composition`.

⚠️ הרכב הקורפוס והשערים אינם שרירותיים — כל אחד מהם נמדד על הקורפוס האמיתי.
הנימוקים מלאים בהערת הכותרת של `prepare-corpus.mjs`; אל תשנו ספים בלי למדוד מחדש.

`build.mjs`:

1. קורא את כל קבצי ה-`.txt` בתיקיית קורפוס שסופקה (`--corpus <dir>`).
2. מריץ על כל קובץ `computeLocalMetrics` (`lib.mjs` — פורט טהור, בלי תלויות, של הפונקציה
   ב-`src/services/styleProfileService.js:125-270`).
3. מאגרג mean/std לכל מדד על פני כל המסמכים (`aggregateReferenceDistribution`).
4. כורה n-grams נפוצים (bigrams/trigrams) על פני הקורפוס כולו ומחשב `freqPer100Words`
   (`mineNgrams`) — ספירת רצפים, סינון n-grams שכולם stopwords, **שער פיזור בין
   מסמכים** (`minDocFraction=0.1`), top-30.
5. כותב מחדש את `src/services/styleReferenceCorpus.data.js` עם `meta.builtFrom='corpus'`.

## מצב נוכחי — קורפוס אמיתי (4.8.2026)

`styleReferenceCorpus.data.js` נבנה מ-**96 מסמכים**: 48 אקדמיים (128k מילים, מחברים
אחרים מקורפוס `314999533`) + 48 ערכי ויקיפדיה עברית (37k מילים). ההרכב המלא, השערים
והדחיות נמצאים ב-`meta.composition` בתוך הנכס עצמו.

`meta.builtFrom='corpus'` הוא מה שמפעיל בפועל את ניגוד-האוכלוסייה — `isRealReference`
ב-`styleReferenceService.js` שומר על שלושה מסלולים שהיו no-op עם ה-bootstrap:
שקלול-z ב-`scoreStyleMatchLocal`, סינון עוגנים (`zPop≥0.8`) ב-`buildStyleEngineInjectionBlock`,
ודירוג נדירות ב-`mineSignatureNgrams`.

⚠️ **מגבלה ידועה:** רוב המסמכים האקדמיים מגיעים מחילוץ PDF, והמשתמש נמדד על טקסט
נקי מהעורך. `avgParagraphWords` ו-`oneWordSentenceRate` עדיין מושפעים מתנאי-המדידה
ולא רק מהסגנון (ר' אותה אזהרה על `@paraSents` ב-CLAUDE.md). שחזור הפסקאות והשערים
מצמצמים את הפער אך לא מבטלים אותו.

## איך משיגים קורפוס עברי אקדמי (public domain / חופשי לשימוש)

כמה מקורות מומלצים לטקסטים עבריים איכותיים ופורמליים, ברישיון פתוח:

- **ויקיפדיה בעברית** (CC BY-SA) — dump מלא זמין ב-https://dumps.wikimedia.org/hewiki/ .
  לכוונן ל"אקדמי", אפשר לסנן קטגוריות כמו מדע, היסטוריה, פילוסופיה, משפטים, ולהוציא רק
  את פסקאות הגוף (לא תבניות/טבלאות/הפניות). כלים כמו `wikiextractor` עוזרים לחלץ טקסט נקי.
- **פרויקט בן-יהודה** (https://benyehuda.org) — טקסטים עבריים ברשות הציבור (יצירות שפג
  זכות היוצרים עליהן), כולל מאמרים עיוניים ולא רק ספרות יפה. יש להעדיף טקסטים עיוניים/
  מסאיים על פני שירה/פרוזה, כי הרגיסטר שונה מכתיבה אקדמית.
- **טקסטים ממשלתיים/ציבוריים** — פרסומים רשמיים, דוחות ועדות, מסמכי מדיניות (למשל
  אתרי משרדי ממשלה, הכנסת, מבקר המדינה) — בדרך כלל רגיסטר פורמלי קרוב לכתיבה אקדמית-
  משפטית. יש לוודא רישיון שימוש (רוב הפרסומים הממשלתיים בישראל פתוחים לשימוש ציבורי,
  אך כדאי לבדוק לכל מקור).
- **עבודות אקדמיות פתוחות** — תקצירים/מבואות של עבודות בגישה פתוחה (open access) מריפוזיטוריז
  אוניברסיטאיים, אם הרישיון מתיר שימוש כזה.

**הכנת הקורפוס:** לכל מסמך — לשמור כקובץ `.txt` נפרד (UTF-8), טקסט נקי (בלי HTML/wiki markup),
בתיקייה אחת. מומלץ 50-200 מסמכים לפחות לאגרגציה סבירה (יותר = std אמין יותר). כדאי לגוון
ז'אנרים/מקורות כדי לא להטות את ההתפלגות למקור בודד.

## הרצה

```bash
node tools/style-reference-build/build.mjs --corpus /path/to/corpus-dir
```

בלי `--corpus`, הכלי מדפיס הסבר ויוצא בלי לגעת בשום קובץ:

```bash
node tools/style-reference-build/build.mjs
```

פלט אופציונלי לקובץ אחר (לבדיקה, בלי לדרוס את הנכס האמיתי):

```bash
node tools/style-reference-build/build.mjs --corpus /path/to/corpus-dir --out /tmp/preview.data.js
```

## מבנה הפלט

זהה למבנה `STYLE_REFERENCE` המתועד ב-`src/services/styleReferenceService.js`:

```js
export const STYLE_REFERENCE = {
  meta: { version: 1, source, builtFrom: 'corpus', updatedAt },
  global: { avgSentenceWords: { mean, std }, ... },
  genres: {},        // לא מאוכלס עדיין ע"י הכלי — הרחבה עתידית
  ngramFreq: { 'ניתן לראות': 0.09, ... },
};
```

`src/services/styleReferenceService.js` צורך את הקובץ הזה בטעינה עצלה (`loadStyleReference()`)
ומספק עזרי גישה (`getReferenceDistribution`, `getReferenceNgramFreq`) — אין צורך לגעת בו כשמריצים
את הכלי הזה מחדש, רק בנכס עצמו.

## הערות

- **genres ריק בכוונה** — `aggregateReferenceDistribution` מחשב כרגע רק global. פילוח לפי ז'אנר
  (ראו `GENRES` ב-`styleProfileService.js`) ידרוש תיוג המסמכים בקורפוס לפי ז'אנר ואגרגציה נפרדת
  לכל קבוצה עם מספיק מסמכים — לא ממומש בגרסה הנוכחית של הכלי.
- **mineNgrams בסיסי בכוונה** — ספירת רצפי מילים גולמית עם סינון stopwords-בלבד, לא ניתוח
  תחבירי. תוצאות טובות דורשות קורפוס בגודל סביר (אחרת ה-n-grams התדירים ביותר עלולים להיות
  רועשים/ספציפיים למסמך בודד).
- אם `computeLocalMetrics` ב-`src/services/styleProfileService.js` משתנה (מדד חדש/שינוי לוגיקה),
  יש לעדכן את הפורט כאן (`lib.mjs`) בהתאם, כדי לשמור על התאמה בין הפרופיל האישי (Phase 1) לבין
  נכס-הייחוס.
