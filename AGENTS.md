# AGENTS.md — WordFlow AI navigation map

מסמך ניווט לפרויקט. נכתב כדי שסוכן AI (וגם אתה, רותם) יתמצא מהר. עברית-first.
מעדכנים אותו כשהארכיטקטורה משתנה — לא כל קומיט.

> ⚠️ ה-`README.md` הישן מתאר Word Add-in מבוסס Office.js + vanilla JS. **זה לא נכון יותר.**
> היום זה אפליקציית **Tauri 2 desktop + React 19 + TipTap** (עברה מ-Electron ביוני 2026). סמוך על המסמך הזה, לא על README.
> אותו קוד frontend מגיש גם את **האתר/PWA** (Firebase hosting) — לא נוגעים בו בעבודת הדסקטופ.

---

## מה זה האפליקציה

מעבד תמלילים שולחני (Windows) עם AI מובנה לכתיבה אקדמית/משפטית בעברית.
עורך מבוסס TipTap (ProseMirror), סרגל AI צדדי עם סוכנים, חיפוש מקורות מאומתים,
בדיקת מקוריות (Copyleaks), ייצוא DOCX, וסנכרון ענן (Firebase).

- **Stack:** Tauri 2 (Rust, WebView2) · React 19 · Vite 8 · TipTap 3 · TailwindCSS 4 + daisyUI
- **AI providers:** Gemini (ברירת מחדל), OpenAI, Codex, Groq, Ollama, Perplexity, custom — דרך [src/services/aiService.js](src/services/aiService.js)
- **Cloud:** Firebase (auth + Firestore + Storage)
- **App id:** `com.wordai.assistant` · productName `WordFlow AI` · version ב-[package.json](package.json)

---

## הרצה ופקודות

```bash
npm run dev          # Vite dev server לאתר על https://localhost:3001 (HTTPS)
npm run desktop:dev  # tauri dev — vite (http) על 1420 + חלון Tauri
npm run build        # vite build -> dist/  (גם לאתר וגם כ-frontendDist של Tauri)
npm run desktop:build # tauri build — installer NSIS + exe -> src-tauri/target/release/bundle/
```

- **אתר**: Vite dev על **3001 HTTPS** (cert ב-[vite.config.js](vite.config.js)). build → `firebase deploy`.
- **דסקטופ (Tauri)**: dev על **1420 HTTP** (WebView2 דוחה self-signed; פורט נפרד מהאתר). config ב-[src-tauri/tauri.conf.json](src-tauri/tauri.conf.json).
- Release דסקטופ: bump version → build חתום (env `TAURI_SIGNING_PRIVATE_KEY` + `_PASSWORD`) → להעלות installer + `.sig` + `latest.json` ל-GitHub release → auto-update.
- מפתח חתימת updater: `~/.tauri/wordflow-updater.key` (סודי, לא בריפו). pubkey ב-tauri.conf.json.

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
- [localBibliographyService.js](src/services/localBibliographyService.js) — איסוף, איחוד ועיצוב מקומי של מקורות משלד המטלה עבור לחצן הביבליוגרפיה; אינו קורא לרשת ואינו ממציא מטא-דאטה חסר.
- [articleSourceValidation.js](src/services/articleSourceValidation.js) — אימות מקורות אמיתיים (anti-hallucination), נורמליזציה של URL/טקסט, ניתוח query.
- [browserRetrievalService.js](src/services/browserRetrievalService.js) — אחזור snapshot של עמוד דרך ה-Electron (desktop only).
- [copyleaksService.js](src/services/copyleaksService.js) — בדיקת מקוריות / AI-content.
- [cloudSyncManager.js](src/services/cloudSyncManager.js) — סנכרון ענן בין מכשירים.
- [workspaceV2Service.js](src/services/workspaceV2Service.js) — templates של workspaces (re-exported דרך aiService).
- [browserDocxExport.js](src/services/browserDocxExport.js) — ייצוא DOM → .docx בדפדפן.

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
- [docs/user-guide.md](docs/user-guide.md) — מדריך משתמש.
- [docs/api-keys-guide.md](docs/api-keys-guide.md) — חיבור מפתחות LLM.
- planning עדכני: `open-items.md`, `ux-audit-roadmap.md`, `tauri-migration-plan.md`, `autopilot-full-update.md`, `live-streaming-plan.md`, מסמכי SPSS.
- `docs/archive/` — **מסמכים היסטוריים מלפני המעבר ל-Tauri** (project-index, plan, project-plan, next-version-plan ועוד) — לא לסמוך עליהם.

---

## גוצ'אס / שים לב
- **קבצים ענקיים:** `main.jsx` (~8.7k) ו-`aiService.js` (~12k) הם monoliths. השתמש ב-Grep/offset, אל תקרא במלואם.
- **עברית RTL בכל מקום** — prompts, UI, regex. ה-regex ב-main.jsx מטפלים בעברית+אנגלית (ordinals, structural cues, quote chars `" “ ” ״`).
- **anti-hallucination הוא עיקרון מרכזי:** סוכני sources/holeFill אסור להם להמציא מקורות. ראה `articleSourceValidation.js`.
- **זבל בשורש הריפו:** הרבה `temp-*`, `release-*/`, `tmp-*.mjs`, `.exe`, `.pdf`. אלה ארטיפקטים/legacy — אל תתבסס עליהם.
- Caveman mode פעיל ב-session (plugin). קוד/קומיטים/PR — תמיד בעברית/אנגלית רגילה.

---

## Git
- branch ראשי: `main`. branch נוכחי: `fix/revert-regression`.
- repo: `github.com/rotems4500-gif/wordai-new`.
- קומיטים אחרונים בנושא release bumps + lecturer review apply flow.
