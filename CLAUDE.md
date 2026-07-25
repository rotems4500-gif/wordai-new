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
- Release דסקטופ: bump version (package.json **+** tauri.conf.json) → build חתום (env `TAURI_SIGNING_PRIVATE_KEY` + `_PASSWORD=""`) → לבנות `latest.json` ביד (tauri לא מייצר אותו) → להעלות installer + `latest.json` ל-GitHub release → auto-update.
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

### מנוע NLG עברי מקומי — כתיבה בלי אף קריאת API
ממלא את פער ה-PROSE בשלד. **כל משפט תוכן נושא chunk-id של הראיה שממנה נגזר** — אפס המצאות, וסעיף בלי ראיות נשאר חסום (`PREP_STATE.LOCAL_DRAFT` מול `BLOCKED`).

| קובץ | תפקיד |
|------|-------|
| [hebrewLexicon.data.js](src/services/hebrewLexicon.data.js) | 12,031 לממות מתויגות: `lemma→[pos,g,n,reg,root,binyan,plural,construct]` (נבנה ב-`tools/lexicon-build/` עם Gemini Flash) |
| [hebrewMorphRules.js](src/services/hebrewMorphRules.js) + [hebrewMorphService.js](src/services/hebrewMorphService.js) | נטייה גנרטיבית שורש+בניין בכתיב מלא. `conjugateSafe` מדפיס **רק** זוגות (שורש,בניין) שאושרו ב-`morphRules.data.js` — צורה מנוחשת אף פעם לא מגיעה למסך |
| [sentenceGrammar.data.js](src/services/sentenceGrammar.data.js) + [sentenceComposeService.js](src/services/sentenceComposeService.js) | 8 מהלכים רטוריים (טענה/ראיה/ציטוט/הסבר/ניגוד/הסתייגות/מעבר/סיכום), מסגרות בטוחות-מגדר |
| [proseComposeService.js](src/services/proseComposeService.js) | **הליבה**: `MOVE_PLANS` לפי intent, `composeSectionProseBest` (וריאנטים + בחירה בדטקטור), `PROSE_COMMANDS` (12 פקודות ב-4 קטגוריות — אין שפה חופשית) |
| [styleFrameProfileService.js](src/services/styleFrameProfileService.js) | כריית מסגרות מהעבודות הקודמות של המשתמש + משוב accept/reject |

**גוצ'אס של המנוע:**
- **סף z תלוי-שפה**: מקור עברי 4.5 (3.8 אם `cleanDigital` — לא עבר OCR), מקור לטיני 3.6. חוצה-שפה מדכא קוסינוס; סף אחיד הורג את כל המקרים האנגליים.
- מקורות `.pptx` שמישים **רק במהלך ציטוט** — תבליטי שקף אינם פרוזה.
- `ocrCorruptScore`: גרשיים באמצע מילה = שיבוש OCR, **אבל** תחילית בת אות אחת + פתיחת ציטוט (`ו"מאזני`) היא עברית תקינה — נדרשות ≥2 אותיות לפני הגרשיים.

### nlg-bench — הבדיקה הקבועה של המנוע
`tools/test-bench/nlg-bench/` · הרצה: `npm run bench:nlg`. דו-שכבתי **בכוונה, נגד קיבוע לבנצ'**:
1. **רגרסיה** — `run-scaffold-e2e.mjs` כמו שהוא. סרגל שלא זז.
2. **יכולת** — `cases/` (מטלות אמיתיות) × **וריאציות מוגרלות-בזרע** (`variations.mjs`: ניסוח מוחלף, סדר שאלות מעורבל) → 6 אינווריאנטות (`invariants.mjs`: אפס-ג'יבריש, עיגון≥40%, כנות-חסימה, כנות-מכסה, אי-כפילות, אפס-דליפת-תבנית) → `capabilityScore`. נרשם ב-`bench-history.jsonl`; ירידה >3 נק' = exit 1.

מטלה אמיתית חדשה ⇒ תיקיית `case` חדשה (assignment.txt + case.json). `compare-api.mjs` מריץ מודל API על **אותן ראיות בדיוק** ומודד באותם מדדים.

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
- **חומרה מגבילה מודל מקומי:** מכונת הפיתוח (7.6GB RAM, בלי GPU) לא מריצה LLM עברי. התפר ל-Ollama קיים ב-aiService אבל לא מופעל.
- **זבל בשורש הריפו:** הרבה `temp-*`, `release-*/`, `tmp-*.mjs`, `.exe`, `.pdf`. אלה ארטיפקטים/legacy — אל תתבסס עליהם.
- Caveman mode פעיל ב-session (plugin). קוד/קומיטים/PR — תמיד בעברית/אנגלית רגילה.

---

## Git
- branch ראשי: `main`.
- repo: `github.com/rotems4500-gif/wordai-new`.
- קומיטים אחרונים: מנוע ה-NLG המקומי, הבנצ' הקבוע, והשוואה מול API.
