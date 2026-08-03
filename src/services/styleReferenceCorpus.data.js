// styleReferenceCorpus.data.js — נכס-ייחוס אוכלוסייה למנוע הסגנון (Style Engine).
//
// קובץ זה נוצר אוטומטית ע"י tools/style-reference-build/build.mjs — לא לערוך ידנית.
// לרענון: node tools/style-reference-build/prepare-corpus.mjs && node tools/style-reference-build/build.mjs --corpus <תיקיית קורפוס>
//
// הרכב הקורפוס שממנו נבנה הקובץ הזה:
//   • academic: 48 מסמכים (128422 מילים) — מקורות אקדמיים (314999533, מחברים אחרים)
//   • wiki: 48 מסמכים (37028 מילים) — ויקיפדיה עברית — ערכים עיוניים
//   ✗ הוחרג: wikisource — רגיסטר ארכאי/רבני, מחצית המסמכים בלי פיסוק סופי כלל
//   ✗ הוחרג: wikitalk (דפי שיחה) — רגיסטר לא-אקדמי, מנפח std ומכבה את ניגוד-האוכלוסייה
//   ✗ הוחרג: עבודות המשתמש עצמו (עבודות סופיות + טיוטות) — אוכלוסייה = אחרים
//   ✗ הוחרג: מקורות לא-עבריים, PDF משובש, טקסט לא-פרוזאי (<3 סימני סיום ל-100 מילים) וחילוץ שנשבר לשברים (>0.25 משפטי מילה-שתיים)
//   ✗ הוחרג: כפילויות — אותו מסמך שהועתק תחת שם אחר (נמדד לפי טביעת אצבע של הטקסט)
//
// meta.builtFrom='corpus' הוא מה שמפעיל את ניגוד-האוכלוסייה בפועל (isRealReference
// ב-styleReferenceService.js): שקלול z ב-scoreStyleMatchLocal, סינון עוגנים
// ב-buildStyleEngineInjectionBlock, ודירוג נדירות ב-mineSignatureNgrams.
//
// מבנה: ראו src/services/styleReferenceService.js לחוזה הטעינה/גישה.
export const STYLE_REFERENCE = {
  "meta": {
    "version": 1,
    "source": "נבנה מקורפוס: 96 מסמכים — academic 48, wiki 48",
    "builtFrom": "corpus",
    "docCount": 96,
    "updatedAt": "2026-08-03T22:08:11.814Z",
    "composition": {
      "preparedAt": "2026-08-03T22:08:10.372Z",
      "totalDocs": 96,
      "academicCorpusFound": true,
      "sources": [
        {
          "name": "academic",
          "label": "מקורות אקדמיים (314999533, מחברים אחרים)",
          "docs": 48,
          "words": 128422,
          "poolSize": 48
        },
        {
          "name": "wiki",
          "label": "ויקיפדיה עברית — ערכים עיוניים",
          "docs": 48,
          "words": 37028,
          "poolSize": 675
        }
      ],
      "excluded": [
        "wikisource — רגיסטר ארכאי/רבני, מחצית המסמכים בלי פיסוק סופי כלל",
        "wikitalk (דפי שיחה) — רגיסטר לא-אקדמי, מנפח std ומכבה את ניגוד-האוכלוסייה",
        "עבודות המשתמש עצמו (עבודות סופיות + טיוטות) — אוכלוסייה = אחרים",
        "מקורות לא-עבריים, PDF משובש, טקסט לא-פרוזאי (<3 סימני סיום ל-100 מילים) וחילוץ שנשבר לשברים (>0.25 משפטי מילה-שתיים)",
        "כפילויות — אותו מסמך שהועתק תחת שם אחר (נמדד לפי טביעת אצבע של הטקסט)"
      ],
      "academicRejects": {
        "tooShort": 66,
        "notHebrew": 50,
        "garbled": 3,
        "notProse": 3,
        "fragmented": 7,
        "duplicate": 14
      },
      "filters": {
        "wikiMinWords": 300,
        "wikiMaxWords": 6000,
        "academicMinWords": 250,
        "minHebrewRatio": 0.7,
        "academicMinHebrewRatio": 0.6,
        "minPureTokenRatio": 0.5,
        "minTerminalsPer100": 3,
        "maxOneWordSentenceRate": 0.25,
        "sampleSeed": 20260804
      }
    }
  },
  "global": {
    "avgSentenceWords": {
      "mean": 17.1063,
      "std": 4.0715
    },
    "sentenceLengthCV": {
      "mean": 0.6899,
      "std": 0.2547
    },
    "avgCommasPerSentence": {
      "mean": 1.0788,
      "std": 0.553
    },
    "parenthesesDensity": {
      "mean": 1.3477,
      "std": 1.0892
    },
    "typeTokenRatio": {
      "mean": 0.6814,
      "std": 0.0596
    },
    "avgParagraphWords": {
      "mean": 56.1797,
      "std": 49.6704
    },
    "openerRepetitionRate": {
      "mean": 0.1116,
      "std": 0.0867
    },
    "pctShortSentences": {
      "mean": 35.8438,
      "std": 16.4832
    },
    "pctLongSentences": {
      "mean": 12.5104,
      "std": 8.4063
    },
    "oneWordSentenceRate": {
      "mean": 0.0518,
      "std": 0.0675
    },
    "rhetoricalQuestionRate": {
      "mean": 0.0433,
      "std": 0.0905
    },
    "exclamationRate": {
      "mean": 0.006,
      "std": 0.0171
    },
    "registerShiftRate": {
      "mean": 0.1162,
      "std": 0.1873
    }
  },
  "genres": {},
  "ngramFreq": {
    "על ידי": 0.1351,
    "ראש הממשלה": 0.1076,
    "על פי": 0.0743,
    "חופש הביטוי": 0.0515,
    "בית המשפט": 0.0392,
    "בין היתר": 0.0292,
    "על אף": 0.0263,
    "כמו כן": 0.0251,
    "מסוג זה": 0.024,
    "של דבר": 0.0222,
    "בדרך כלל": 0.0211,
    "מדינת ישראל": 0.0205,
    "ארצות הברית": 0.0199,
    "בסופו של": 0.0199,
    "ברשתות החברתיות": 0.0187,
    "אלא גם": 0.0181,
    "בסופו של דבר": 0.0181,
    "יחד עם": 0.0175,
    "לידי ביטוי": 0.017,
    "על בסיס": 0.017,
    "כך למשל": 0.0164,
    "לאחר מכן": 0.0146,
    "על רקע": 0.014,
    "להשפיע על": 0.014,
    "אל מול": 0.014,
    "בשנים האחרונות": 0.0135,
    "לעומת זאת": 0.0135,
    "עד כמה": 0.0129,
    "על מנת": 0.0123,
    "לשמור על": 0.0123
  }
};
