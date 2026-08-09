# CLAUDE.md — WordFlow AI navigation map

מסמך ניווט לפרויקט. נכתב כדי שסוכן AI (וגם אתה, רותם) יתמצא מהר. עברית-first.
מעדכנים אותו כשהארכיטקטורה משתנה — לא כל קומיט.

> האפליקציה: **Tauri 2 desktop + React 19 + TipTap** (עברה מ-Electron ביוני 2026; לפני כן Word Add-in). ה-README מעודכן לזה גם הוא.
> אותו קוד frontend מגיש גם את **האתר/PWA** (Firebase hosting) — לא נוגעים בו בעבודת הדסקטופ.
> 🗺️ **תוכן עניינים מפורט של הקוד: [docs/CODE-MAP.md](docs/CODE-MAP.md)** — כולל מפות סקשנים עם מספרי שורות לשני המונוליטים (main.jsx, aiService.js). המסמך הזה נשאר המפה התמציתית.

---

## מה זה האפליקציה

מעבד תמלילים שולחני (Windows) עם AI מובנה לכתיבה אקדמית/משפטית בעברית.
עורך מבוסס TipTap (ProseMirror), סרגל AI צדדי עם סוכנים, חיפוש מקורות מאומתים,
בדיקת מקוריות (Copyleaks), ייצוא DOCX, וסנכרון ענן (Firebase).

- **Stack:** Tauri 2 (Rust, WebView2) · React 19 · Vite 8 · TipTap 3 · TailwindCSS 4 + daisyUI
- **AI providers:** Gemini (ברירת מחדל), OpenAI, Claude, Groq, Ollama, Perplexity, custom — דרך [src/services/aiService.js](src/services/aiService.js)
- **Cloud:** Firebase (auth + Firestore + Storage)
- **App id:** `com.wordai.assistant` · productName `WordFlow AI` · version ב-[package.json](package.json)

---

## הרצה ופקודות

```bash
npm run dev          # Vite dev server לאתר על https://localhost:3001 (HTTPS)
npm run desktop:dev  # tauri dev — vite (http) על 1420 + חלון Tauri
npm run build        # vite build -> dist/  (גם לאתר וגם כ-frontendDist של Tauri)
npm run desktop:build # tauri build — installer NSIS + exe -> src-tauri/target/release/bundle/
npm run bench:nlg    # בדיקת המנוע המקומי (רגרסיה + יכולת). exit≠0 = רגרסיה
```

בדיקות נוספות (Node ישיר, קוד אמיתי דרך bundle של vite.verify.config.mjs):
```bash
node tools/test-bench/run-scaffold-e2e.mjs         # שלד+אחזור+פרוזה, שער רגרסיה
node tools/test-bench/run-nlg-loop-round.mjs       # עבודה שלמה מקומית -> draft+metrics+evidence
node tools/test-bench/nlg-bench/compare-api.mjs    # מקומי מול API על אותן ראיות
```

- **אתר**: Vite dev על **3001 HTTPS** (cert ב-[vite.config.js](vite.config.js)). build → `firebase deploy`.
- **דסקטופ (Tauri)**: dev על **1420 HTTP** (WebView2 דוחה self-signed; פורט נפרד מהאתר). config ב-[src-tauri/tauri.conf.json](src-tauri/tauri.conf.json).
- Release דסקטופ: bump version (package.json **+** tauri.conf.json) → build חתום (env `TAURI_SIGNING_PRIVATE_KEY` + `_PASSWORD=""`) → **`npm run desktop:release`** → להעלות installer + `latest.json` ל-GitHub release → auto-update.
  - `desktop:release` ([scripts/make-latest-json.mjs](scripts/make-latest-json.mjs)) בונה את `latest.json` במקום כתיבה ביד, וחוסם את שלוש הטעויות שמפילות עדכון בשקט: חתימה במפתח v1 המת (משווה key-id מול ה-pubkey), base64 כפול של החתימה, ושם asset שלא תואם ל-`url`. גם מוודא ש-package.json ו-tauri.conf.json מסכימים על הגרסה.
- **בדיקת עדכון היא אוטומטית** ([appUpdateService.js](src/services/appUpdateService.js)): 12 שניות אחרי הפתיחה ואז כל 6 שעות, toast עם "עדכן עכשיו", והשתקה של 3 ימים לגרסה שנדחתה. ההתקדמות מגיעה מ-`updater.rs` דרך אירוע `app-update-status`.
- **מפתח חתימת updater: `~/.tauri/wordflow-updater-v2.key`** (passwordless, סודי, לא בריפו). pubkey (id `671C5AB827A204A2`) ב-tauri.conf.json.
  - ⚠️ קיים גם `~/.tauri/wordflow-updater.key` ישן (v1) — **מת, אל תחתום איתו**. חתימה ב-v1 → ה-build מדפיס `Warn ... secret key does not match the public key` והעדכון יידחה אצל כל המשתמשים. build תקין = **בלי** האזהרה הזו. תמיד `-v2.key`.
  - `latest.json`: השדה `signature` = **תוכן קובץ ה-`.sig` כמו שהוא** (כבר base64 — decode אחד נותן `untrusted comment...`). לא לקודד שוב. ה-`url` חייב להתאים בדיוק לשם ה-asset שהועלה (קונבנציה: `WordFlow-AI_<ver>_x64-setup.exe` עם מקף).

---

## מבנה — איפה נמצא מה

### `src/` — Frontend (React)
המערכת היא בעצם **אפליקציה אחת גדולה** ב-[src/main.jsx](src/main.jsx). שאר ה-jsx הם רכיבים שהיא מרכיבה.

| קובץ | שורות | תפקיד |
|------|------:|-------|
| [src/main.jsx](src/main.jsx) | ~8.7k | **הליבה.** רכיב `App()` (שורה ~3147), state גלובלי, routing, edit-targeting logic, החלת הצעות AI על העורך. נקודת mount בתחתית. |
| [src/services/aiService.js](src/services/aiService.js) | ~12k | **מנוע ה-AI.** ניהול providers, מודלים, streaming, העברת קבצים, sidebar modes, suggestion batches. exports רבים. |
| [src/services/workspaceLearningService.js](src/services/workspaceLearningService.js) | ~4.9k | יצירת מסמך מ-prompt, רוויזיה לפי feedback, document review action-plan, למידת סגנון, instruction files. |
| [src/FileMenu.jsx](src/FileMenu.jsx) | ~6.9k | תפריט קבצים, פתיחה/שמירה/ייצוא. |
| [src/AiSidebar.jsx](src/AiSidebar.jsx) | ~6.8k | חלונית ה-AI הצדדית (chat, attachments, modes, streaming). |
| [src/StartScreen.jsx](src/StartScreen.jsx) | ~2.2k | מסך בית, ניהול workspaces, יצירת מסמכים. |
| [src/Ribbon.jsx](src/Ribbon.jsx) / [src/TopBar.jsx](src/TopBar.jsx) | | סרגל כלים עליון, עיצוב, תפריטים. |
| [src/DocumentEditor.jsx](src/DocumentEditor.jsx) | | רכיב העורך TipTap. |
| [src/MagicWand.jsx](src/MagicWand.jsx) | | ליטוש inline עם AI (bubble menu). |
| [src/SpssSyntaxStudio.jsx](src/SpssSyntaxStudio.jsx) + [services/spssSyntaxService.js](src/services/spssSyntaxService.js) | | סטודיו תחביר SPSS. |
| [src/ProfileOnboarding.jsx](src/ProfileOnboarding.jsx) | | onboarding ראשוני, קליטת סגנון + מפתחות API. |
| [src/ChefModeDialog.jsx](src/ChefModeDialog.jsx) | | "Chef Mode" — בניית מסמך עוצמתי דרך שאלות. |
| [src/PresentationStudio.jsx](src/PresentationStudio.jsx) / [src/OneAxisAirHockeyGame.jsx](src/OneAxisAirHockeyGame.jsx) / [src/WordFlowAnimations.jsx](src/WordFlowAnimations.jsx) | | מצגות, easter-egg game, אנימציות UI. |

### `src/agentConfig.js` — **קרא את זה קודם כל לגבי AI**
[src/agentConfig.js](src/agentConfig.js) — `AGENTS_CONFIG`: כל סוכני ה-AI עם `label`, `route` (provider), `systemCtx` (system prompt בעברית), `inline` (BubbleMenu מול chat).
סוכנים: `fix`, `reviewFix`, `humanize`, `summary`, `academic`, `organize`, `textToTable` (inline) · `sources`, `holeFill`, `lecturer`, `continue`, `draft`, `chef` (chat).

### `src/services/` — שירותים נוספים
- [projectService.js](src/services/projectService.js) — פרויקטים (schema v2): קיבוץ מסמכים, הוראות, זיכרון, **roadmap** (milestones/tasks/progress). blob `wordai_projects_v1`.
- [projectRoadmapService.js](src/services/projectRoadmapService.js) — שכבת AI ל-Project Hub: יצירת מתווה (JSON+fallback תבנית), הנחיה לשלב, "מה הצעד הבא", בדיקה מול הנחיות.
- `src/components/projectHub/` — **Project Hub** מסך-מלא (`appMode==='project-hub'` ב-main.jsx): ProjectHubStudio + roadmap timeline + יועץ + מסמכים-לפי-שלב.
- [articleSourceValidation.js](src/services/articleSourceValidation.js) — אימות מקורות אמיתיים (anti-hallucination), נורמליזציה של URL/טקסט, ניתוח query.
- [browserRetrievalService.js](src/services/browserRetrievalService.js) — אחזור snapshot של עמוד דרך אפליקציית הדסקטופ (desktop only).
- [copyleaksService.js](src/services/copyleaksService.js) — בדיקת מקוריות / AI-content.
- [cloudSyncManager.js](src/services/cloudSyncManager.js) — סנכרון ענן בין מכשירים.
- [workspaceV2Service.js](src/services/workspaceV2Service.js) — templates של workspaces (re-exported דרך aiService).
- [browserDocxExport.js](src/services/browserDocxExport.js) — ייצוא DOM → .docx בדפדפן.
- **שלד מטלה (המסלול בלי מפתח API)** — `materialChunkStore` · `assignmentSpecService` · `evidenceMatchService` · `styleOpenerService` · `assignmentPrepService` · `assignmentAiService` · `assignmentScaffoldStore/Doc` + `src/components/assignmentScaffold/`. שלב 1 מקומי (e5 ב-WASM), שלב 2 משלים רק את השאריות. 📄 **[docs/assignment-scaffold.md](docs/assignment-scaffold.md)**
- **חומרי קורס בענן** — [courseMaterialCloud.js](src/services/courseMaterialCloud.js): הקובץ **המקורי** עולה ל-Storage (`users/{uid}/course-materials/...`) ומטא ל-Firestore (`users/{uid}/courseMaterials`) — הכללים הקיימים ל-`users/{uid}/**` מכסים, אין פריסת rules. `storagePath` נשמר על רשומת החומר ⇒ `readMaterialBytes` מושך מהענן ⇒ אבחון רטרואקטיבי עובד גם בדפדפן ובמכשיר אחר. ⚠️ הגשר ל-firebase נטען תמיד ב-import דינמי כדי שה-harness ב-Node לא יגרור את ה-SDK.
- **הפרדה בין קורסים** — [courseStore.js](src/services/courseStore.js) (ישות קורס: שם/מרצה/סמסטר/סילבוס/הנחיות, `wordai_courses_v1` מסונכרן ענן, bootstrap ממחרוזות legacy) + [activeCourseService.js](src/services/activeCourseService.js) (רזולוציה: override ב-sessionStorage → פרויקט; **`matchesCourseFilter` — סינון רך**: legacy בלי שיוך נכלל, רק קורס-אחר מוחרג — ⚠️ בניגוד ל-exact-match של projectId ב-getMaterialChunks שמרוקן הכול). מסונן: ראיות RAG, אוטו-קונטקסט, היסטוריה, לקחי מרצים; סגנון ולקסיקון גלובליים בכוונה. UI: CourseManagerPanel, בורר ב-TopBar, chips ב-StartScreen. בדיקה: `WORDAI_VERIFY_ENTRY=courses`.
- **למידה ממשובי מרצים** — [lecturerProfileStore.js](src/services/lecturerProfileStore.js) (פרופיל פר-מרצה + לקחים גלובליים, IndexedDB, מסונכרן ענן בסכמה v5) · [docxFeedbackExtract.js](src/services/docxFeedbackExtract.js) (הערות Word + track-changes מ-OOXML, JSZip+DOMParser) · [feedbackDiffService.js](src/services/feedbackDiffService.js) (diff הגשה↔מוחזר) · [feedbackScanService.js](src/services/feedbackScanService.js) (סריקת אצווה של כמה עבודות + **אבחון רטרואקטיבי** של חומרים קיימים — דורש בייטים מקוריים: `readMaterialBytes`; רשומת דפדפן שומרת טקסט בלבד ומדווחת `text-only`) · [lecturerRulesService.js](src/services/lecturerRulesService.js) (זיקוק אירועים→לקחים; שער אנטי-הזיה: לקח בלי ציטוט event נזרק) · `extractPdfAnnotations` ב-materialExtractBrowser. UI: `LecturerProfilePanel` + `GradedReturnWizard` (מ-FileMenu→הגדרות→מה המנוע למד). הזרקה: `buildLecturerRulesBlock` ב-buildProjectContextBlock / buildScaffoldContextBlock / doc-gen / סוכן lecturer; בדיקות דטרמיניסטיות ב-reviewDraft (`lecturerRules` ב-opts). בדיקה: `WORDAI_VERIFY_ENTRY=lprof` → `lecturer-learning-unit.mjs`.

### מנוע NLG עברי מקומי — כתיבה בלי אף קריאת API
ממלא את פער ה-PROSE בשלד. **כל משפט תוכן נושא chunk-id של הראיה שממנה נגזר** — אפס המצאות, וסעיף בלי ראיות נשאר חסום (`PREP_STATE.LOCAL_DRAFT` מול `BLOCKED`).

| קובץ | תפקיד |
|------|-------|
| [hebrewLexicon.data.js](src/services/hebrewLexicon.data.js) | 12,031 לממות מתויגות: `lemma→[pos,g,n,reg,root,binyan,plural,construct]` (נבנה ב-`tools/lexicon-build/` עם Gemini Flash) |
| [hebrewMorphRules.js](src/services/hebrewMorphRules.js) + [hebrewMorphService.js](src/services/hebrewMorphService.js) | נטייה גנרטיבית שורש+בניין בכתיב מלא. `conjugateSafe` מדפיס **רק** זוגות (שורש,בניין) שאושרו ב-`morphRules.data.js` — צורה מנוחשת אף פעם לא מגיעה למסך |
| [sentenceGrammar.data.js](src/services/sentenceGrammar.data.js) + [sentenceComposeService.js](src/services/sentenceComposeService.js) | 8 מהלכים רטוריים (טענה/ראיה/ציטוט/הסבר/ניגוד/הסתייגות/מעבר/סיכום), מסגרות בטוחות-מגדר |
| [proseComposeService.js](src/services/proseComposeService.js) | **הליבה**: `MOVE_PLANS` לפי intent, `composeSectionProseBest` (וריאנטים + בחירה בדטקטור), `PROSE_COMMANDS` (12 פקודות ב-4 קטגוריות — אין שפה חופשית) |
| [styleFrameProfileService.js](src/services/styleFrameProfileService.js) | כריית מסגרות מהעבודות הקודמות של המשתמש + משוב accept/reject |
| [styleTargetsService.js](src/services/styleTargetsService.js) + [styleTargetsStore.js](src/services/styleTargetsStore.js) | **פרסונליזציה מבנית**: גוזר מהכתיבה של המשתמש יעדי אורך-משפט/פסיקים/פסקה + **משמורות פסיק נלמדות**, ושומר **רשומות מדידה ולא טקסטים** (מסתנכרן לענן בלי שהעבודות עוזבות את המכשיר) |
| [styleFitService.js](src/services/styleFitService.js) | אכיפה דטרמיניסטית של היעדים על הפרוזה. **בלי מודל** — ולכן זו השכבה היחידה שרצה זהה באתר ובאפליקציה |

**גוצ'אס של המנוע:**
- **סף z תלוי-שפה**: מקור עברי 4.5 (3.8 אם `cleanDigital` — לא עבר OCR), מקור לטיני 3.6. חוצה-שפה מדכא קוסינוס; סף אחיד הורג את כל המקרים האנגליים.
- מקורות `.pptx` שמישים **רק במהלך ציטוט** — תבליטי שקף אינם פרוזה.
- `ocrCorruptScore`: גרשיים באמצע מילה = שיבוש OCR, **אבל** תחילית בת אות אחת + פתיחת ציטוט (`ו"מאזני`) היא עברית תקינה — נדרשות ≥2 אותיות לפני הגרשיים.
- ⚠️ **לא כל תכונה של מדד הסגנון כשירה כיעד ייצור.** `@paraSents` הגולמי מודד את מחלץ ה-docx (בכל 23 מסמכי המשתמש `\n\n`==`\n`, ו"פסקה" כוללת כותרות וביבליוגרפיה) — 1.79 גולמי מול **חציון 2.54 / ממוצע 3.59 בפסקאות פרוזה בלבד** (23 מסמכים, 27.7.26; הנאכף הוא החציון — הממוצע נגרר אחרי מסמך יחיד ב-7.67); `@typeTokenRatio` תלוי-אורך; `@sentLenSd` נגזרת. שלושתן למדידה בלבד. ר' ההערה בראש `styleTargetsService`.
- ⚠️ **קיצור המשפט לכיוון היעד מוריד את ציון הסגנון** (A/B: 40→38 בפיצול, 22.9→19.9 מילים). המדד הוא 1,000 תכונות n-גרם מול 6 מבניות, כלומר 99.4% בחירת מילים — ואכיפה מבנית לא מנצחת אותו. הפיצול נשאר בקוד מכובה, עם הטבלה.
- ⚠️ `nlg-bench/run.mjs` **יורש** את `WORDAI_REWRITE` מהמעטפת ואינו קובע אותו. עד 27.7 זה לא נרשם בהיסטוריה, ומעטפת נקייה נתנה 87 מול 99 — **הבדל סביבה שנראה בדיוק כמו נסיגה**. מאז התצורה נרשמת ב-`bench-history` וההשוואה נעשית רק מול אותה תצורה.

### nlg-bench — הבדיקה הקבועה של המנוע
`tools/test-bench/nlg-bench/` · הרצה: `npm run bench:nlg`. דו-שכבתי **בכוונה, נגד קיבוע לבנצ'**:
1. **רגרסיה** — `run-scaffold-e2e.mjs` כמו שהוא. סרגל שלא זז.
2. **יכולת** — `cases/` (מטלות אמיתיות) × **וריאציות מוגרלות-בזרע** (`variations.mjs`: ניסוח מוחלף, סדר שאלות מעורבל) → 6 אינווריאנטות (`invariants.mjs`: אפס-ג'יבריש, עיגון≥40%, כנות-חסימה, כנות-מכסה, אי-כפילות, אפס-דליפת-תבנית) → `capabilityScore`. נרשם ב-`bench-history.jsonl`; ירידה >3 נק' = exit 1.

מטלה אמיתית חדשה ⇒ תיקיית `case` חדשה (assignment.txt + case.json). ⚠️ **חובה `courseSubdir` ב-case.json** — בלעדיו ההרנס נופל לרשימת קבצים קשיחה וה-case סורק את הקורפוס של מישהו אחר. ⚠️ **נתיבים יחסיים בלבד** (`corpusRel` יחסי לשולחן העבודה, `courseSubdir` יחסי לו): עד 27.7.26 היה שם נתיב מוחלט עם שם המשתמש, ובמעבר לשתי מכונות זה נתן בנצ' אדום שנראה כמו נסיגת קוד בזמן שהקורפוס פשוט ישב תחת בית אחר. עקיפה: `WORDAI_BENCH_CORPUS`. cases קיימים: `media-law-2026` (94) · `mill-2026` (89). `compare-api.mjs` מריץ מודל API על **אותן ראיות בדיוק** ומודד באותם מדדים.

### `src/addin/` — תוסף Word (Office.js taskpane)
entry שני של vite (`taskpane.html` בשורש — חייב להישאר שם בגלל `base:'./'`), מתארח על אותו Firebase hosting (`/taskpane.html`), sideload דרך manifest.
- [wordBridge.js](src/addin/wordBridge.js) — **כל** ה-`Word.run` כאן ורק כאן (קריאת snapshot/selection, הכנסות tracked עם תיקון RTL, `applyRoutingBatch`). שכבת ה-React רצה גם בדפדפן רגיל.
- [wordRouting.js](src/addin/wordRouting.js) — "החלה חכמה": LLM ממפה תשובת צ'אט ליעדים (`body.search` ייחודי → כותרת/פסקה → דילוג). יעד דו-משמעי מדולג, לא מנוחש.
- [addinAgents.js](src/addin/addinAgents.js) — whitelist מ-`AGENTS_CONFIG`; מכבד `taskpaneSkipApply`/`taskpaneSystemCtx` (fix מחזיר אבחון לצ'אט, sources לא מוחל אוטומטית).
- **הסיידבר = `AiSidebar` האמיתי של האפליקציה** (מורכב ב-[AddinApp.jsx](src/addin/AddinApp.jsx) עם props מגשר Word): [wordEditBridge.js](src/addin/wordEditBridge.js) מממש את חוזה onApplyEdit/onApplyEditBatch — target.text → רזולוציה (בחירה נוכחית → search ייחודי ≤255 → prefix+suffix expandTo עם אימות) → החלפה כ-track change; `{ok, message, partial, unresolved}` בחזרה.
- **חשבון וסנכרון**: email+password ישירות בחלונית; Google דרך Office Dialog (`auth-dialog.html` — entry שלישי של vite, `messageParent` → `cloudSignInWithGoogleIdToken`). אחרי auth רץ אותו bootstrap כמו באפליקציה: `handleCloudAuthSuccess` + `initCloudSyncListeners` ⇒ סגנון אישי/קורסים/הגדרות מסתנכרנים. מפתחות API נשארים מקומיים (`ai_provider_config` ב-localStorage).
- manifest: `manifest.template.xml` + `scripts/make-manifest.mjs` (`npm run addin:manifest[:dev]`; prod נכשל אם יש בו localhost). dev: `npm run dev` + `npm run addin:start` (sideload ל-Word desktop). אייקונים ב-`public/addin/`.
- ⚠️ `aiService.js` חייב להישאר בלי import של TipTap — החלת הצעות על העורך גרה ב-[aiSuggestionApply.js](src/services/aiSuggestionApply.js) (חולץ במיוחד כדי שה-taskpane לא יגרור ProseMirror). שער: `grep -i prosemirror` על chunks של taskpane אחרי build.

### `src/firebase/`
- [config.js](src/firebase/config.js) — Firebase config keys.
- [services.js](src/firebase/services.js) — auth (Google popup), שמירת מסמכים בענן.

### `src-tauri/` — Desktop backend (Tauri/Rust)
Rust מינימלי בכוונה. כל הלוגיקה הספציפית (המרות docx, index.json) ב-JS shim.
- [src-tauri/src/lib.rs](src-tauri/src/lib.rs) — entry: רישום plugins (single-instance, dialog, updater) + פקודות, מיגרציה מ-Electron, לכידת קובץ-פתיחה מ-argv.
- [src-tauri/src/proxy.rs](src-tauri/src/proxy.rs) — `proxy_http_request` (reqwest + allowlist, עוקף CORS) + abort.
- [src-tauri/src/fs_ops.rs](src-tauri/src/fs_ops.rs) — קבצים: app-data scoped + נתיב חופשי.
- [src-tauri/src/secure.rs](src-tauri/src/secure.rs) — `read/save_secure_file`: הצפנת DPAPI ל-config/settings (מקביל ל-safeStorage).
- [src-tauri/src/dialog_ops.rs](src-tauri/src/dialog_ops.rs) — דיאלוגי פתיחה/שמירה native.
- [src-tauri/src/updater.rs](src-tauri/src/updater.rs) — `check_for_update`/`install_update`.

**הגשר**: [src/desktopShim.js](src/desktopShim.js) משחזר את `window.desktopApp` מעל הפקודות (invoke), נטען ראשון ב-main.jsx רק תחת `window.__TAURI_INTERNALS__`. כך כל הקוד הקיים שקורא `window.desktopApp.*` עובד ללא שינוי. המרות docx (mammoth/buildDocxBlob) וחילוץ טקסט ([src/services/materialExtractBrowser.js](src/services/materialExtractBrowser.js): docx/txt/xlsx/pptx/pdf/OCR) רצים ב-JS. `parseSpssSavData` לא ב-shim — יש fallback בדפדפן ([spssDataIngest.js](src/services/spssDataIngest.js)).
⚠️ ה-HTML של mammoth עובר [normalizeImportedFootnotes](src/services/footnoteHtml.js) לפני שהוא מגיע לעורך (וגם בנקודת הייבוא המרכזית ב-main.jsx — הפונקציה idempotent). בלי זה הערות השוליים של Word מגיעות כ-`<sup><a href="#footnote-N">` + `<ol>` מנותק בסוף, ו-TipTap מוחק אותן. כל נתיב ייבוא HTML חדש חייב לעבור שם.

---

## איפה נשמר state / config
- **Provider config + API keys:** `ai-provider-config.json` ב-userData, **מוצפן DPAPI** (`save_secure_file`). hydration ב-aiService (`hydrateProviderConfigFromDisk`).
- **App settings:** `app-settings.json` ב-userData, מוצפן DPAPI.
- **חומרי לימוד מקומיים:** `project-materials/` + `index.json` ב-userData (וגם `public/project-materials/` לסנכרון מ-Firebase Storage דרך `npm run sync:storage`).
- **localStorage:** מעט מאוד (`wordflow:pwa-install-state`, `wordflow_style_overrides`).
- userData בפועל (Tauri): `%APPDATA%/com.wordai.assistant/`. מיגרציה חד-פעמית מתיקיית Electron הישנה (`word-ai-assistant`) מעתיקה את `project-materials` בלבד; מפתחות API מוזנים מחדש (הצפנת Electron אינה תואמת).

---

## תיעוד קיים ב-`docs/`
- [docs/CODE-MAP.md](docs/CODE-MAP.md) — **תוכן עניינים מלא של הקוד** (קבצים, שורות, מפות סקשנים למונוליטים, מפת מערכת העזרה).
- [docs/assignment-scaffold.md](docs/assignment-scaffold.md) — **שלד מטלה**: הארכיטקטורה הדו-שלבית, ספי הרלוונטיות שנמדדו, גוצ'אס (`\b` בעברית, חטיפת ניתוב), ואיך בודקים ב-LAB.
- [docs/nlg-handoff.md](docs/nlg-handoff.md) — **המצב הנוכחי של המנוע המקומי**: המספרים המאומתים, שכבת הניסוח המקומית (gemma3:4b) וארבעת שעריה, תיקון מדידת הסגנון (⚠️ ציונים היסטוריים לפני התיקון חסרי ערך), מה נפסל במדידה, ואיך מריצים.
- [tools/test-bench/nlg-bench/README.md](tools/test-bench/nlg-bench/README.md) — **הבדיקה הקבועה של המנוע המקומי**: העיצוב הדו-שכבתי, האינווריאנטות, הציון.
- [docs/user-guide.md](docs/user-guide.md) — מדריך משתמש.
- [docs/api-keys-guide.md](docs/api-keys-guide.md) — חיבור מפתחות LLM.
- planning עדכני: `open-items.md`, `ux-audit-roadmap.md`, `tauri-migration-plan.md`, `autopilot-full-update.md`, `live-streaming-plan.md`, מסמכי SPSS.
- `docs/archive/` — **מסמכים היסטוריים מלפני המעבר ל-Tauri** (project-index, plan, project-plan, next-version-plan ועוד) — לא לסמוך עליהם.

---

## גוצ'אס / שים לב
- **קבצים ענקיים:** `main.jsx` (~8.7k) ו-`aiService.js` (~12k) הם monoliths. השתמש ב-Grep/offset, אל תקרא במלואם.
- **עברית RTL בכל מקום** — prompts, UI, regex. ה-regex ב-main.jsx מטפלים בעברית+אנגלית (ordinals, structural cues, quote chars `" “ ” ״`).
- **anti-hallucination הוא עיקרון מרכזי:** סוכני sources/holeFill אסור להם להמציא מקורות. ראה `articleSourceValidation.js`. במנוע המקומי זה נאכף מבנית: אין ראיה ⇒ הסעיף חסום, לא ממולא.
- **חומרה (מכונת פיתוח, נמדד 26.7.26):** 16GB RAM (5.9 פנוי) · i7-10750H (6c/12t) · GTX 1650, 4096MiB עם **~3.9GB פנויים** (התיעוד אמר 3.2 — היה פסימי), Turing sm_75. Ollama 0.32.1. מה נכנס: מודל 4B ב-Q4 כולו ב-VRAM (2.88GB); `bge-m3` תופס 664MB ורץ 100% GPU.
  - ⚠️ **ההתאמה האוטומטית של אולמה טוענת 46% בלבד מ-gemma3:4b ל-GPU** ומשאירה 2.3GB VRAM ריקים. `num_gpu: 99` מפורש ⇒ 100% GPU, 6.0s→4.4s לקריאה. מיושם ב-`localRewriteService` עם דרדור למכונות קטנות. **תמיד לבדוק את יחס `size_vram/size` ב-`/api/ps` לפני שמסיקים שהמודל איטי.**
  - מקביליות **לא עוזרת**: `OLLAMA_NUM_PARALLEL=4` + flash-attn + KV ב-q8_0 נתנו ×1.18 בלבד. 64% מזמן הקריאה הוא עיבוד פרומפט (170 tok/s prefill מול 41 tok/s יצירה) — ה-1650 רווי.
  - **אימון (fine-tune) לא אפשרי כאן, והפוסל אינו החומרה** — קורפוס המשתמש הוא **24 מסמכים / 22,001 מילים**. LoRA על זה משנן ולא לומד סגנון, ובמוצר עם שער `copiedRatio` ואינטגרציית Copyleaks זה כשל אקדמי. (בנוסף: אין python אמיתי במכונה — רק ה-stub של חנות Windows — אין nvcc, ו-Turing בלי bf16/FA2.) ציר האימון הריאלי הוא מודל קטן מעל **תכונות קפואות** (`styleFingerprintService`, AUC 0.945), לא כוונון LLM. מספרים מלאים ב-[docs/nlg-handoff.md](docs/nlg-handoff.md).
  - התפר ל-Ollama ב-aiService בנוי במלואו (chat/streaming/ניתוב `@ollama`) — חסר רק `ollama pull` של מודל שיחה.
- **זבל בשורש הריפו:** הרבה `temp-*`, `release-*/`, `tmp-*.mjs`, `.exe`, `.pdf`. אלה ארטיפקטים/legacy — אל תתבסס עליהם.
- Caveman mode פעיל ב-session (plugin). קוד/קומיטים/PR — תמיד בעברית/אנגלית רגילה.

---

## Git
- branch ראשי: `main`.
- repo: `github.com/rotems4500-gif/wordai-new`.
- קומיטים אחרונים: מנוע ה-NLG המקומי, הבנצ' הקבוע, והשוואה מול API.
