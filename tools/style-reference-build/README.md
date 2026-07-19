# tools/style-reference-build

כלי **אופליין, חד-פעמי** לבניית נכס-ייחוס האוכלוסייה (`src/services/styleReferenceCorpus.data.js`)
של מנוע הסגנון (Style Engine). לא רץ בזמן ריצה של האפליקציה ולא מחובר ל-build — מריצים ידנית
כשרוצים לרענן את הנכס מקורפוס טקסטים אמיתי.

## מה זה עושה

1. קורא את כל קבצי ה-`.txt` בתיקיית קורפוס שסופקה (`--corpus <dir>`).
2. מריץ על כל קובץ `computeLocalMetrics` (`lib.mjs` — פורט טהור, בלי תלויות, של הפונקציה
   ב-`src/services/styleProfileService.js:125-270`).
3. מאגרג mean/std לכל מדד על פני כל המסמכים (`aggregateReferenceDistribution`).
4. כורה n-grams נפוצים (bigrams/trigrams) על פני הקורפוס כולו ומחשב `freqPer100Words`
   (`mineNgrams`) — כריה בסיסית: ספירת רצפים, סינון n-grams שכולם stopwords, top-30.
5. כותב מחדש את `src/services/styleReferenceCorpus.data.js` עם `meta.builtFrom='corpus'`.

## מצב נוכחי — bootstrap ידני

עד שהכלי הזה רץ בפועל על קורפוס אמיתי, `styleReferenceCorpus.data.js` מכיל **seed ידני**
(`meta.builtFrom='bootstrap'`) — הערכות מושכלות למדדי סגנון בכתיבה אקדמית עברית טיפוסית,
לא ערכים מחושבים. זה מספיק כדי שהמנוע יעבוד (z-score מול אוכלוסייה משוערת), אבל הדיוק
האמיתי דורש הרצה על קורפוס.

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
