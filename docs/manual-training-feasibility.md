# היתכנות — "אימון" ידני של המשתמש, כשהבסיס רץ באתר (2026-08-03)

מסמך היתכנות. השאלה: **האם המשתמש יכול לאמן בעצמו את המנוע המקומי, כשגרסת הבסיס
היא ה-web build של Firebase hosting.** כל טענה כאן נבדקה מול הקוד או מול מדידה
קיימת; כל מה שלא נבדק מסומן במפורש כהשערה.

---

## §0 תשובה קצרה

1. **fine-tune — לא.** והפוסל אינו החומרה אלא הקורפוס: **24 מסמכים / 22,001
   מילים** של המשתמש עצמו (`docs/nlg-handoff.md:706-713`). LoRA על קורפוס בגודל
   כזה **משנן ולא לומד סגנון**, ובמוצר עם שער `copiedRatio` ואינטגרציית
   Copyleaks זה כשל אקדמי ולא באג.
2. **"אימון" כאדפטציית פרופיל ממשוב המשתמש — כן, ורובו כבר בנוי.** ארבעה
   מנגנוני למידה קיימים בקוד; **שניים מהם ללא אף קורא ב-`src/`**, ואחד עם UI
   שקבור בתוך מודל בדיקת-מקוריות. הפער הוא חיווט, לא אלגוריתם.
3. **כמעט הכל רץ זהה באתר.** חמש מתוך שש שכבות הפרסונליזציה הן JS טהור בלי
   תלות ב-`window.desktopApp` (§3).
4. **הפער היחיד שהוא באמת בצורת-מודל הוא שכבת הניסוח** (`gemma3:4b`) — מסלול
   הכללים 32 מול מסלול הניסוח 59 (`docs/nlg-handoff.md:353-366`). ⚠️ וההנחה
   שהוא חסום באתר **הופרכה אמפירית** (§3.2).
5. **המלצה: D → A → C → B.** קודם baseline שמעולם לא נמדד, אחר כך UI, אחר כך
   ה-unlock הזול, ורק בסוף הסנכרון.

⚠️ **מה שאסור להבטיח:** שום מסך אימון לא יבטיח **עליית ציון סגנון**. ר' §2.3.

---

## §1 מה כבר קיים

| מנגנון | קובץ | API קיים | מחווט ל-UI? | רץ באתר? |
|---|---|---|---|---|
| יעדים מבניים (אורך משפט/פסיקים/שעבוד/פסקה) | `styleTargetsService.js` · `styleTargetsStore.js` | `addStyleTargetDoc` :139 · `removeStyleTargetDoc` :160 · `clearStyleTargets` :171 | **חלקית** — הקליטה מחווטת, התצוגה לא | ✓ JS טהור |
| תצוגת מצב היעדים | `styleTargetsStore.js:122` · `styleTargetsService.js:49,237` | `getStyleTargetsStatus` · `describeStyleTargets` · `STYLE_TARGET_LABELS` | **✗ אפס קוראים ב-`src/`** | ✓ |
| ייצוא/יבוא היעדים לענן | `styleTargetsStore.js:179,184` | `exportStyleTargets` · `importStyleTargets` | **✗ אפס קוראים בכלל** | ✓ |
| משוב על מסגרות משפט | `styleFrameProfileService.js:308` | `recordFrameFeedback(move, frameId, verdict)` | **✗ אפס קוראים ב-`src/`** | ✓ |
| משוב על פתיחים | `openerProfileService.js:194` | `recordOpenerFeedback({intent, slots, accepted})` | **✓ הלולאה היחידה שמוכחת** | ✓ |
| כיול הגלאי מדוגמאות מתויגות | `styleAuthenticityService.js:714-770` | `addAuthenticitySample` · `trainAuthenticityCalibration` · `removeAuthenticitySample` | **✓ אבל קבור** — בתוך `AuthenticityModal` | ✓ |
| תיוג מהעורך (bubble) | `DocumentEditor.jsx:190-191` → `:541` | `tagStyleSample` (`styleAuthenticityService.js:659`) | ✓ | ✓ |

### 1.1 היעדים המבניים — נקלטים, לא נראים

⚠️ **תיקון להנחה נפוצה:** `addStyleTargetDoc` **כן** מחווט. הוא נקרא משני
מקומות בקליטת הסגנון: `styleIngestService.js:396` (העלאת קובץ) ו-`:433`
(`ingestText`, הדבקה), והסרה ב-`:1155`. כלומר **הפרופיל כבר נבנה אצל כל משתמש
שהעלה ≥3 עבודות** — רק שאין מסך שמראה זאת.

מה שנשען עליו בפועל: `AssignmentScaffoldStudio.jsx:479` מעביר
`styleTargets: getStyleTargets()` להלחנה. אין דרך למשתמש לדעת שזה קרה.

- `MIN_TARGET_DOCS = 3` (`styleTargetsService.js:60`) — מתחת לזה מוחזר `null`,
  **וזה מסלול תקין**: פרופיל משני מסמכים "נראה אישי בלי להיות"
  (`styleTargetsStore.js:113-115`).
- אגרגציה בחציון ולא בממוצע — מסמך אחד בקורפוס נותן 7.50 משפטים לפסקה מול
  2.0-3.5 בשאר, וממוצע היה נגרר אחריו (`styleTargetsService.js:31-33`).
- **נשמרות רשומות מדידה ולא טקסטים** (`styleTargetsStore.js:8-12`) — עשרה
  מספרים למסמך. זו הצהרת פרטיות שאפשר להציג למשתמש כמו שהיא.

### 1.2 לולאת הפתיחים — היחידה שסגורה מקצה לקצה

`EvidencePanel.jsx` הוא הקורא היחיד: `:109` רענון = `accepted:false`, `:117`
"עוד כמו זה" = `accepted:true`, `:134` הוספה לעורך = `accepted:true`.
המשקלים: `FEEDBACK_ACCEPT=2`, `FEEDBACK_REJECT=-1`, רצפה 0 — אין משקל שלילי
(`openerProfileService.js:26-27,208`).

### 1.3 כיול הגלאי — UI קיים, אבל במקום הלא נכון

`AuthenticityModal.jsx:214-248`: textarea + "✍️ זה אני" / "🤖 זה AI", ורשימת
דוגמאות עם מחיקה. האימון מופעל אוטומטית ב-≥2 מכל מחלקה
(`styleAuthenticityService.js:740-742`). האלגוריתם: ממוצע סיגנל לכל מחלקה,
משקל ∝ |mean_ai − mean_me|, סף = נקודת האמצע (`:757-758`).

⚠️ המודל נפתח כ"בדיקת מקוריות" (`main.jsx:9900`), והכיול מוסתר מאחורי כפתור
"שפר דיוק (כיול)" (`AuthenticityModal.jsx:208-210`). משתמש שרוצה **לאמן** לא
מחפש שם.

---

## §2 מה נמדד ונפסל — גדרות

### 2.1 fine-tune / LoRA — סגור

`docs/nlg-handoff.md:703-715`. הפוסל הוא 22 אלף המילים, לא ה-VRAM. החומרה
משנית (VRAM 4096MiB · Python רק stub של חנות Windows · אין nvcc · Turing sm_75
בלי bf16/FA2) — גם מכונה חזקה לא הייתה פותרת קורפוס בגודל הזה.

⚠️ **ולציין מפורשות:** 24 המסמכים הם **העבודות של המשתמש עצמו**, לא דאטהסט.
זה גם הגג הריאלי — משתמש אקדמי טיפוסי לא יגיע ל-200 עבודות.

**ציר האימון הריאלי:** מודל קטן מעל **תכונות קפואות** (`styleFingerprintService`,
AUC 0.945 — `tools/test-bench/style-anchors.json:5`), לא כוונון LLM.

### 2.2 ⚠️ כריית מסגרות — מכובה בכוונה, וזו גדר קשיחה

`styleFrameProfileService.js:226-239` — הערה נעולה עם המדידה:

| תצורה | ציון סגנון |
|---|---|
| **בלי כרייה** | **24/100** |
| עם כרייה | 16/100 |
| + סינון אוצר-מילים | 12/100 |

ובנוסף כשל תוכן: **הכותרת של עבודה קודמת של המשתמש נכרתה כמסגרת** (נגמרת בפסיק,
חוזרת בטיוטה ובסופית) והוזרקה כפתיח משפט לעבודה בנושא אחר.
`mineFramesFromCorpus` נשמרת לאבחון אבל `minedCount = 0` קשיח (`:240`).

**הגדר לכל פיצ'ר "למד עוד ממני":** כל מנגנון שמזריק **ליטרלים** מהקורפוס לפלט
חייב (א) לעבור מדידה מול 24/100, (ב) לסנן מילות תוכן. משוב על **מסגרות קיימות**
(`recordFrameFeedback`) אינו כרייה ואינו נופל תחת הגדר הזו.

### 2.3 ⚠️ אכיפה מבנית אינה מזיזה את ציון הסגנון

A/B על אותו טקסט בסיס (34 משפטים), `docs/nlg-handoff.md:259-270`:

| תצורה | סגנון | אורך משפט | פסיק/משפט |
|---|---|---|---|
| בסיס | 40 | 22.94 | 0.441 |
| **פיצול בלבד** | **38** | 19.86 | 0.429 |
| פסיקים בלבד | 41 | 22.94 | 0.500 |
| שניהם | 38 | 19.86 | 0.457 |

קירוב אורך המשפט **ליעד** הוריד 2 נקודות. ההסבר: המדד הוא 1,000 תכונות n-גרם
מול 6 מבניות — **99.4% בחירת מילים ומורפולוגיה** (`docs/nlg-handoff.md:274-277`).
הרווח הכולל מהפרסונליזציה המבנית נמדד ב-**41/44 מול בסיס 40/43** — בתוך
רזולוציית המדידה של ±3 (`docs/nlg-handoff.md:255-258`, `:100`).

**המסקנה למוצר:** מסך אימון מוכר "התאמה למי שאתה", **לא "ציון גבוה יותר"**.
כל טקסט UI שמבטיח שיפור מדיד יתגלה כשקר במדידה הראשונה.

### 2.4 `blendLambda ≤ 0.8` — תקרה מכוונת

`openerProfileService.js:226`: `Math.min(0.8, distinctDocs / 10)`. הנוסחה
`score = globalBase · (1 + λ·personalBoost)` (`:10-11`). התקרה מונעת מקורפוס
גדול למחוק לגמרי את הדקדוק הגלובלי — שהוא גם פותר cold-start. **אין להעלות
אותה בלי מדידה.** אותה נוסחה ואותה תקרה במסגרות
(`styleFrameProfileService.js:13-14`).

הרגל נספר לפי **מסמכים ולא מופעים**, מינימום 2 מסמכים
(`styleFrameProfileService.js:26,219`) — חזרה בין מסמכים היא הרגל, הופעה בודדת
היא מקרה.

### 2.5 מודלים בדפדפן — מסננת, לא פסק דין

| מסלול | תוצאה | מקור |
|---|---|---|
| Qwen2.5-1.5B (WebGPU/ONNX) | **2/18**, משכפל את הקלט, עברית משובשת | `docs/nlg-handoff.md:374,633,640` |
| Chrome Prompt API מובנה | `availability()` = `downloadable`, אבל עם `languages:['he']` = **`unavailable`** | `docs/nlg-handoff.md:375` |
| DictaLM-3.0-1.7B (Apache 2.0, ~1.1GB Q4) | פרוב **12/18** — אבל בסבב מלא **14/56**, סגנון **28** מול 59 | `docs/nlg-handoff.md:311-352` |

⚠️ **התיקון החשוב:** האמירה "אין מודל עברי בגודל דפדפן" **שגויה** — DictaLM-3.0
קיים, פתוח ובגודל הנכון. מה שנכשל הוא היכולת להחזיק **ארבעה אילוצים בו-זמנית**
(ראיה + משפט קודם + פתיחים אסורים + נושא), לא הרישוי ולא הגודל
(`docs/nlg-handoff.md:344-352`). **פרוב אינו סבב.**

---

## §3 האתר מול הדסקטופ

### 3.1 מה רץ איפה

| שכבה | קובץ | תלות חיצונית | אתר |
|---|---|---|---|
| מדד הסגנון | `styleFingerprintService.js` | **אפס imports** | ✓ זהה |
| אכיפת יעדים | `styleFitService.js` | **אפס imports** | ✓ זהה |
| יעדים מבניים | `styleTargetsService.js:37-43` | `styleFingerprint` + `styleFit` | ✓ זהה |
| אחסון היעדים | `styleTargetsStore.js:20-27` | IndexedDB + fallback ל-localStorage | ✓ זהה |
| פרופיל פתיחים | `openerProfileService.js:17-20` | `styleSampleStore` + IDB | ✓ זהה |
| פרופיל מסגרות | `styleFrameProfileService.js:18-19` | `styleSampleStore` + IDB | ✓ זהה |
| גלאי + כיול | `styleAuthenticityService.js:8-11` | `aiService` (פרופיל) | ✓ זהה |
| **הטמעות e5 (WASM)** | `retrievalEmbeddingService` | `onnxruntime-web` | ⚠️ **מדורדר** |
| **שכבת הניסוח** | `localRewriteService.js:28` | Ollama ב-`http://127.0.0.1:11434` | ⚠️ מגודר (§3.2) |

⚠️ ההטמעות: בדפדפן `onnxruntime-web` נכשל ב-`no available backend found`, ושם
רץ **רק ה-fallback הלקסיקלי** (`docs/assignment-scaffold.md:214-215`). זה נוגע
ל**אחזור** הראיות, לא לאימון הסגנון — אבל הוא מוריד את איכות הראיות שהמנוע
מקבל, ולכן הוא רקע חשוב לכל טענת שיפור באתר.

### 3.2 ⚠️ הפרכת ההנחה על mixed-content

`rewriteBackendService.js:112-115` מגדר את Ollama לדסקטופ בלבד, עם הנימוק בקוד:
"באתר (https) הקריאה ל-http://127.0.0.1 היא mixed-content והדפדפן חוסם אותה".

**זה שגוי, ונמדד מדף https אמיתי** (`docs/nlg-handoff.md:281-309`):

- תקן Secure Contexts מגדיר loopback כ-potentially trustworthy; Chromium פוטר
  אותו מחסימת mixed-content.
- `fetch('http://127.0.0.1:11434/api/tags')` נכשל ב-**CORS**, לא ב-mixed-content
  (no-cors החזיר opaque = הבקשה יצאה והגיעה).
- עם `OLLAMA_ORIGINS=<origin האתר>` — **אותו דף https קיבל 200 והריץ יצירה
  עברית ב-gemma3:4b.**

מבחינת הקוד זה זול במיוחד: `localRewriteService` משתמש ב-`fetch` רגיל
(`:193`, `:436`), בלי `window.desktopApp` ובלי ה-proxy של Rust. **החסם היחיד
הוא התנאי ב-`rewriteBackendService.js:115`.**

⚠️ סייג: הפטור הוא Chromium ו-Firefox; **Safari חוסם** loopback מדף https —
שם הדרגה נשארת `none`, וזו דרדור שחייב להיות **גלוי** (`reason` כבר נשמר
ומוצג — `rewriteBackendService.js:20-22`).

---

## §4 האופציות

### A — מסך "המאמן האישי" (מומלץ)

**מה:** מסך אחד שמרכז את ארבעת מנגנוני הלמידה שכבר קיימים.

- **A1 — כרטיס היעדים המבניים.** `getStyleTargetsStatus` + `describeStyleTargets`
  + `STYLE_TARGET_LABELS` (כולם קיימים, אפס קוראים) → כמה מסמכים נמדדו, מה
  היעדים, הוספה/הסרה/איפוס. להצהיר במפורש: **נשמרות מדידות, לא טקסטים**
  (`styleTargetsStore.js:8-12`). בלי `MIN_TARGET_DOCS` מוצג המשתמש לא מבין למה
  "לא קרה כלום" אחרי שתי עבודות.
- **A2 — חילוץ כיול הגלאי** מ-`AuthenticityModal.jsx:214-248` לרכיב משותף,
  שיוצג גם כאן וגם שם. אותו state, שתי נקודות כניסה.
- **A3 — אגודלים על משפטים בטיוטה** → **הקורא הראשון של** `recordFrameFeedback`.
  משוב על מסגרות **קיימות** בלבד — לא כרייה (§2.2).
- **A4 — פאנל "מה המערכת למדה ממך":** `getOpenerProfileStatus` (מסמכים ·
  מילות-סלוט · λ) + `getFrameProfileStatus` + מצב היעדים. שקיפות, לא הבטחה.

| | |
|---|---|
| **עלות** | ~2-3 ימי עבודה |
| **באתר** | ✓ מלא — כל ארבעת המנגנונים JS טהור |
| **סיכון** | נמוך. UI בלבד; אין שינוי בלוגיקת ההלחנה |
| **תלות** | D (בלי baseline אין מה לטעון) |
| **מדידה** | `npm run bench:nlg` חייב להישאר ירוק (שינוי UI בלבד ⇒ אמור להיות זהה) |

### B — סנכרון ענן של פרופיל היעדים

**מה:** חיווט `exportStyleTargets`/`importStyleTargets` (`styleTargetsStore.js:179,184`)
ל-`cloudSyncManager`. `importStyleTargets` כבר ממומש כך שהצד עם **יותר** מסמכים
מנצח — סנכרון אינו מוחק עבודה (`:183-192`).

⚠️ **מכשול שנמצא בבדיקה:** ה-snapshot של הסנכרון קורא **localStorage בלבד**
(`cloudSyncManager.js:97-105`, מפתחות ב-`:43-62`), בעוד שהיעדים יושבים
ב-IndexedDB. לכן זה לא "להוסיף מפתח לרשימה" אלא **מסלול אסינכרוני חדש**
ב-`getLocalProfilePayload` (`:118`).

⚠️ ולעומת זאת — **כיול הגלאי כבר מסתנכרן היום**: `authenticityCalibration` יושב
בתוך `wordai_personal_style` (`styleAuthenticityService.js:735`), שנמצא ברשימת
הסנכרון (`cloudSyncManager.js:48`). אף אחד לא תכנן את זה כפיצ'ר, וכדאי לדעת
שזה כבר קורה.

| | |
|---|---|
| **עלות** | ~יום |
| **באתר** | ✓ |
| **סיכון** | בינוני — merge שגוי מוחק פרופיל. חובה merge לפי `docId` (איחוד רשומות), לא החלפת blob |
| **תלות** | A (בלי מסך, אין מה לסנכרן שהמשתמש רואה) |
| **מדידה** | הרצה על שתי מכונות: 3 מסמכים כאן + 3 שם ⇒ `docCount === 6` |

### C — probe של Ollama גם באתר

**מה:** תיקון ההנחה המופרכת ב-`rewriteBackendService.js:112-115`. probe דו-שלבי:
קודם `no-cors` זול (opaque = משהו מאזין), ורק אז probe אמיתי — כדי שלא ייווצר
timeout של 4 שניות לפני כל בנייה כשאין שרת.

| | |
|---|---|
| **עלות** | ~חצי יום |
| **באתר** | ✓ זו כל המטרה |
| **סיכון** | נמוך-בינוני. Safari חוסם ⇒ **דרדור חייב להיות גלוי**, לא שקט |
| **תלות** | אין |
| **מדידה** | `describeRewriteBackend()` מציג `ollama` בדפדפן עם `OLLAMA_ORIGINS` מוגדר; זמן בנייה לא גדל כשאין שרת |

⚠️ **זה unlock ולא אימון.** הוא מביא לאתר את הפער 32→59 שמוכר במדידה — אבל רק
למי שכבר התקין את הדסקטופ. הוא לא מוסיף שום יכולת למידה.

### D — הרצת שלב 0 של תוכנית הפתיחים (ה-baseline שמעולם לא רץ)

**מה:** `docs/opener-training-plan.md:9-17` — "הרנס כבר קיים ולא רץ אף פעם.
בלי מספר בסיס אין 'אימון'." הסטטוס (`:78`, `:95`): ה-harness רץ (24 עבודות, 329
מועמדים, 53 לתיוג), ה-labeler נוצר — **ממתין לתיוג ידני של רותם**. אחריו
`score-openers.mjs` → baseline.

`tools/test-bench/run-openers-labelset.mjs` · `make-labeler.mjs` ·
`score-openers.mjs` — כולם קיימים.

| | |
|---|---|
| **עלות** | ~יום (רובו תיוג ידני, לא קוד) |
| **באתר** | לא רלוונטי — offline harness |
| **סיכון** | אפס |
| **תלות** | אין |
| **מדידה** | זו **עצמה** המדידה. precision/recall ב-`lab-results/openers-baseline.json` |

**זהו התנאי המוקדם לכל טענת שיפור ב-A ו-B.** בלי מספר בסיס, "האגודלים עובדים"
היא אמונה.

### E — fine-tune / מודל בדפדפן — נדחה

מתועד כאן כדי שלא ייפתח מחדש. fine-tune: §2.1. מודל דפדפן: §2.5. שניהם ייפתחו
מחדש רק כשישתנה קלט מדיד — קורפוס בסדר גודל אחר, או מודל 1.5-2B שמחזיק ארבעה
אילוצים בו-זמנית.

---

## §5 השוואה

| | עלות | באתר | סיכון | תלות | מוסיף למידה? |
|---|---|---|---|---|---|
| **A** מסך המאמן | 2-3 ימים | ✓ מלא | נמוך | D | ✓✓ (מפעיל 2 מנגנונים מתים) |
| **B** סנכרון ענן | ~יום | ✓ | בינוני | A | ✗ (שימור) |
| **C** probe Ollama | ~חצי יום | ✓ | נמוך-בינוני | — | ✗ (unlock) |
| **D** baseline | ~יום | — | אפס | — | ✗ (מדידה) |
| **E** fine-tune | — | — | — | — | נדחה |

---

## §6 המלצה

**D → A → C → B.**

- **D** ראשון כי הוא חינם, בלי תלויות, והוא הופך את A ממדיד ללא-מדיד.
- **A** אחריו כי הוא הערך הגדול ביותר ליחידת עבודה: הוא לא בונה מנגנון חדש אלא
  **מדליק שניים שכבר קיימים ומתים** (`recordFrameFeedback`, תצוגת היעדים).
- **C** אחר כך — זול, ומביא את הפער האמיתי (32→59) לאתר.
- **B** אחרון — הוא שימור ולא יכולת, ובלי A אין למשתמש מה לשמר.

### לא לעשות

1. ❌ **לא לחבר מחדש את `mineFramesFromCorpus`** לפרופיל בלי מדידה שמראה שיפור
   מול 24/100 (§2.2).
2. ❌ **לא להבטיח עליית ציון** בשום טקסט UI (§2.3).
3. ❌ **לא להעלות את `blendLambda` מעל 0.8** ולא להוריד את `MIN_TARGET_DOCS`
   מתחת ל-3 — שניהם מכוילים במדידה (§2.4, `styleTargetsService.js:59-60`).
4. ❌ **לא לשמור טקסטים** בפרופיל היעדים. רשומות מדידה בלבד — זו גם הצהרת
   הפרטיות שמאפשרת סנכרון.
5. ❌ **לא לדרדר בשקט** ל-`none` באתר (Safari) — `reason` קיים, להציג אותו.
6. ❌ **לא לפתוח את fine-tune מחדש** בלי שינוי בסדר גודל הקורפוס.

---

## §7 שלב הביצוע — נקודות עגינה

| אופציה | קובץ | שורה | הפעולה |
|---|---|---|---|
| **A1** | `src/components/PersonalTrainerPanel.jsx` | חדש | כרטיס יעדים — צורך `getStyleTargetsStatus`, `describeStyleTargets`, `STYLE_TARGET_LABELS` |
| **A1** | `src/FileMenu.jsx` | `:4426` | להרכיב ליד `<StyleProfilePanel embedded />` בתוך סקשן "🖋️ מנוע הסגנון האישי" |
| **A1** | `src/FileMenu.jsx` | `:8301` · `:584` · `:572` | הטאב `personal` (`PersonalStyleSettings`, מוגדר ב-`:4136`) — כולל מילות החיפוש |
| **A1** | `src/services/styleTargetsStore.js` | `:29` | להאזין ל-`STYLE_TARGETS_UPDATED_EVENT` כדי שהכרטיס יתעדכן חי |
| **A2** | `src/components/AuthenticityModal.jsx` | `:214-248` | לחלץ את בלוק הכיול לרכיב משותף; להשאיר נקודת כניסה גם שם |
| **A2** | `src/services/styleAuthenticityService.js` | `:714-770` | ה-API לא משתנה — `getAuthenticityCalibration` / `add` / `train` / `remove` |
| **A3** | `src/components/assignmentScaffold/EvidencePanel.jsx` | `:107-136` | להרחיב את דפוס האגודלים הקיים ממשפטים-פתיחים למשפטי טיוטה |
| **A3** | `src/services/styleFrameProfileService.js` | `:308` | הקורא הראשון של `recordFrameFeedback(move, frameId, 'accept'\|'reject')` |
| **A3** | `src/services/proseComposeService.js` | — | דורש שה-`frameId` יגיע לפלט. **לא נבדק במסמך הזה** — לאמת לפני הערכת עלות |
| **A4** | `src/services/openerProfileService.js` | `:217-228` | `getOpenerProfileStatus` — `distinctDocs`, `personalWords`, `blendLambda` |
| **A4** | `src/services/styleFrameProfileService.js` | `:318` | `getFrameProfileStatus` |
| **B** | `src/services/cloudSyncManager.js` | `:97-105` · `:118` | ה-snapshot קורא localStorage בלבד — נדרש מסלול async ל-IDB |
| **B** | `src/services/styleTargetsStore.js` | `:179-192` | `exportStyleTargets` / `importStyleTargets`; המיזוג לפי `docId` (`:144-146`) |
| **C** | `src/services/rewriteBackendService.js` | `:112-115` | להחליף את התנאי `pref === 'auto' && isDesktopApp()` ב-probe דו-שלבי |
| **C** | `src/services/localRewriteService.js` | `:193` · `:436` | `fetch` רגיל — אין מה לשנות; הגידור כולו למעלה |
| **C** | `src/components/assignmentScaffold/AssignmentScaffoldStudio.jsx` | `:421` · `:433` | `ensureRewriteBackend` + `describeRewriteBackend` כבר מוצגים — הדרגה החדשה תופיע מעצמה |
| **D** | `tools/test-bench/run-openers-labelset.mjs` → `make-labeler.mjs` → `score-openers.mjs` | — | לפי `docs/opener-training-plan.md:9-17` |

---

## §8 מקורות

- `src/services/styleTargetsService.js` — יעדים, חציון, `MIN_TARGET_DOCS`,
  ⚠️ שלוש התכונות הפסולות כיעד (`:13-29`)
- `src/services/styleTargetsStore.js` — רשומות ולא טקסטים, export/import
- `src/services/styleFrameProfileService.js:226-239` — ⚠️ גדר כריית המסגרות
- `src/services/openerProfileService.js` — הלולאה המוכחת, `blendLambda`
- `src/services/styleAuthenticityService.js:659,714-770` — תיוג + כיול
- `src/components/AuthenticityModal.jsx:214-248` · `src/DocumentEditor.jsx:190-191,541`
- `src/services/rewriteBackendService.js:112-115` — ההנחה שהופרכה
- `src/services/cloudSyncManager.js:43-62,97-105` — מה מסתנכרן ואיך
- `docs/nlg-handoff.md` — `:255-277` פרסונליזציה וה-A/B · `:281-309` loopback ·
  `:311-352` DictaLM · `:353-366` 32 מול 59 · `:623-679` נפסל · `:704-715`
  fine-tune
- `docs/assignment-scaffold.md:214-215` — ⚠️ e5 מדורדר באתר
- `docs/opener-training-plan.md:9-17,78,95` — שלב 0 והסטטוס
- `CLAUDE.md` — סעיף החומרה

✅ **הוכרע (4.8.26) — לא הייתה סתירה:** 2.54 ו-3.59 הם **חציון וממוצע של אותה
מדידה** (23 מסמכים, קורפוס 27.7.26, שניהם נכנסו בקומיט אחד — 6918d31). הרצה
חוזרת של `tools/test-bench/style-targets.mjs` נתנה חציון **2.538 ±0.538** מול
ממוצע 3.14 בהגדרה התפעולית ו-3.587 לפני `stripNonAuthorial` — כלומר 3.59.
הממוצע נגרר אחרי מסמך יחיד ב-7.67 ("מטלה מנהל ציבורי 2"), וזו בדיוק הסיבה
שהשירות גוזר חציון. **הנאכף הוא החציון**, והמנוע ב-2.62 בתוך הפיזור. שלושת
המקומות עודכנו לנסח את המספר עם המסייג שלו.
