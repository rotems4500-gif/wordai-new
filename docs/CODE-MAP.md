# CODE-MAP.md — מפת קוד מלאה ל-WordFlow AI

> נוצר: 2026-07-12, גרסה 1.2.0. **מספרי שורות משוערים** — קבצים חיים ומשתנים כל הזמן.
> לפני שאתה נשען על שורה מדויקת (במיוחד במונוליטים) — **ודא עם Grep**, אל תסמוך על המסמך הזה עיוור.
> מטרת המסמך: שסוכן AI (או רותם) ימצא איפה כל דבר גר בלי לסרוק את המונוליטים שורה-שורה.
> למידע ארכיטקטוני/תפעולי (dev/build/release/state) ראה [CLAUDE.md](../CLAUDE.md) בשורש — זה כאן הוא אינדקס-קבצים, לא תחליף.

---

## מה זה

מעבד תמלילים שולחני (Tauri 2 + React 19 + TipTap) עם AI מובנה לכתיבה אקדמית/משפטית בעברית. אותו frontend מגיש גם את האתר/PWA (Firebase). ראה CLAUDE.md לפרטי stack/הרצה.

---

## src/ — קבצים ברמה עליונה

| קובץ | שורות | תפקיד |
|---|---:|---|
| [main.jsx](../src/main.jsx) | ~8925 | **מונוליט #1.** React entry + `App()` — מעטפת עורך, חיווט TipTap, מנוע structural-edit, UI ליצירה חיה. מפת סקשנים למטה. |
| [FileMenu.jsx](../src/FileMenu.jsx) | ~7582 | תפריט קבצים, Settings (כל הטאבים כולל GuideSettings tour בשורות 3322-3409), שמירה/פתיחה/ייצוא |
| [AiSidebar.jsx](../src/AiSidebar.jsx) | ~6967 | חלונית ה-AI הצדדית הימנית (chat, attachments, streaming, modes) |
| [StartScreen.jsx](../src/StartScreen.jsx) | ~2292 | מסך בית, ניהול workspaces, launcher למסמך חדש |
| [SpssProjectStudio.jsx](../src/SpssProjectStudio.jsx) | ~1798 | סטודיו workflow פרויקט SPSS |
| [SpssSyntaxStudio.jsx](../src/SpssSyntaxStudio.jsx) | ~1290 | סטודיו תחביר SPSS |
| [DocumentEditor.jsx](../src/DocumentEditor.jsx) | ~1244 | רכיב העורך TipTap |
| [ProfileOnboarding.jsx](../src/ProfileOnboarding.jsx) | ~1164 | onboarding ראשוני — קליטת סגנון + מפתחות API |
| [Ribbon.jsx](../src/Ribbon.jsx) | ~1003 | סרגל כלים עליון (dropdown "עזרה" בשורות ~503-540) |
| [OneAxisAirHockeyGame.jsx](../src/OneAxisAirHockeyGame.jsx) | ~762 | easter-egg game |
| [ChefModeDialog.jsx](../src/ChefModeDialog.jsx) | ~760 | "Chef Mode" — ראיון מונחה לבניית מסמך |
| [PresentationStudio.jsx](../src/PresentationStudio.jsx) | ~712 | סטודיו מצגות |
| [UserGuide.jsx](../src/UserGuide.jsx) | ~522 | קרוסלת מדריך 10 טאבים (מערכי data קשיחים 18-91, `SECTIONS` 360-372) |
| [desktopShim.js](../src/desktopShim.js) | ~335 | גשר Tauri — משחזר `window.desktopApp` |
| WordFlowAnimations.jsx | ~289 | אנימציות UI |
| FindReplace.jsx | ~282 | חיפוש/החלפה |
| CloudUnlockGate.jsx | ~252 | שער נעילת ענן |
| TopBar.jsx | ~249 | סרגל עליון |
| MagicWand.jsx | ~247 | ליטוש inline עם AI (bubble menu) |
| HelpModal.jsx | ~208 | `GUIDE_CONTENT` קשיח בשורות 6-195 — נושאי עזרה בעברית |
| PptxDraftStudio.jsx | ~203 | סטודיו טיוב PPTX |
| DocumentDraftStudio.jsx | ~198 | סטודיו טיוטת מסמך |
| SourceManager.jsx | ~150 | ניהול מקורות |
| WelcomeGate.jsx | ~150 | שער welcome |
| CommentsPanel.jsx | ~115 | פאנל תגובות |
| TrackChangesPanel.jsx | ~109 | פאנל מעקב שינויים |
| MobileToolbar.jsx | ~99 | סרגל כלים למובייל (מחליף Ribbon ב-≤640px) |
| theme.js | ~53 | הגדרות ערכת נושא |
| [agentConfig.js](../src/agentConfig.js) | ~48 | **`AGENTS_CONFIG`** — כל סוכני ה-AI: `fix`, `reviewFix`, `humanize`, `summary`, `academic`, `organize`, `textToTable` (inline/BubbleMenu) · `sources`, `holeFill`, `lecturer`, `continue`, `draft`, `chef` (chat) |
| useDelimitedListInput.js | ~31 | hook |
| delimitedListInput.js | ~18 | util |
| appVersion.js | ~7 | `APP_VERSION_LABEL` |

### src/components/
- `AddSynonymDialog.jsx` ~137, `AuthenticityModal.jsx` ~155, `EditorContextMenu.jsx` ~242, `Ruler.jsx` ~237
- `components/ui/`: `Button` ~76, `Input` ~84, `Modal` ~134, `index.js`

### src/extensions/ — TipTap custom nodes/marks
`AiSuggestionMark` 108, `CommentMark` 49, `CrossReferenceNode` 109, `FindHighlight` 46, `MathNode` 80, `PageBreak` 30, `PageNumberField` 61, `Pagination` 192, `TocNode` 61, `TrackChange` 224

### src/presentation/
`SlideRenderer.jsx` 951, `deckModel.js` 260, `slideBackgrounds.jsx` 226, `deckThemes.js` 61, `PresentMode.jsx` 58
`themes/`: `family-light` 128, `family-cyber`/`darklux`/`organic` 87 כ"א, `family-brutal` 50, `family-retro` 38, `family-tech` 36, `core.js` 115, `decorations.jsx` 248, `_schema.js` 53, `index.js` 61

### src/firebase/
`config.js` 50 (Firebase config keys), `services.js` 357 (auth Google popup + שמירת מסמכים בענן)

---

## מפת סקשנים — src/main.jsx (~8925 שורות, מונוליט #1)

**ודא Grep לפני הישענות מלאה — main.jsx משתנה תדיר.**

| טווח | תוכן |
|---|---|
| 1-147 | imports + קבועים (edit-target constants, regex) |
| 148-1650 | **מנוע resolution לעריכה מבנית**: `buildStableEditTargetId` (150), `collectHeadingSections` (428), `buildSidebarDocumentSnapshot` (488), `resolveStructuralEditTargets` (854, מאומת), `mergeOverlappingReviewPlanEdits` (1313), `resolveReviewActionPlanEdits` (1384), `buildEditTargetFromState` (1543), `isEditTargetStillSafe` (1556) |
| 1652-2011 | `StartScreenTransitionOverlay` |
| 2012-3235 | UI ליצירה חיה + storage: `buildLiveGenerationShell` (2147), `parseAssignmentBriefBlocks` (2209), `buildStartScreenGenerationInspector` (2371), `extractSidebarReviewSuggestionsFromText` (2704), `normalizeDocumentExportHtml` (3039), `readDocumentStorageValue` (3124), `persistAutosaveSnapshot` (3169), `getRecentAgentLogs` (3229) |
| 3236-9652 | `function App()` (מאומת ב-3236) — ~6400 שורות: init עורך, state, handlers; `openHelp` handler ~6927; רינדור `HelpModal` ~9543 |
| 9653 | `export` |

---

## מפת סקשנים — src/services/aiService.js (~10812 שורות, מונוליט #2)

**ודא Grep לפני הישענות מלאה.**

| טווח | תוכן |
|---|---|
| 1-66 | imports |
| 67-730 | ברירות מחדל config + ספריית workspace/agent: `DEFAULT_PROVIDER_CONFIG` (67), `DEFAULT_WORKSPACES_LIBRARY` (519), `SKILL_LIBRARY` (665), `DEFAULT_SKILLS_CONFIG` (732), `getDefaultRoleAgents` (742) |
| 895-1620 | הגדרות מתמשכות + provider getters: `syncPersistedAppSettings` (988), `hydrateAppSettingsFromDisk` (1093), `normalizeProviderModelName` (1148) |
| 1904-2575 | automation/routing של workspace: `getWorkspaceAutomation` (1904), `resolveWorkspaceRouting` (1938), `createNewWorkspace` (2146), `switchToWorkspace` (2216), `getOrderedRoleAgents` (2409). **הערה**: `WORKSPACE_AUTOMATION_QUARANTINED = true` בשורה 356 (מאומת) — automation מבוטל בכוונה, bypass מאולץ |
| 2635-3290 | provider config: `getProviderConfig` (2714), `hydrateProviderConfigFromDisk` (2855), `getConfiguredProviderChoices` (2958) |
| 3291-4108 | source grounding: `buildSourceGroundingPrompt` (3291), `extractVerifiedSourceQuery` (3461) |
| 4109-5765 | תכנון multi-agent: `buildDeterministicSourceRetrievalPlan` (4728), `buildHeuristicAgentPlan` (4962), `buildAutopilotTaskProfile` (5121), `buildStagePrompt` (5436), `planWithManagerIfNeeded` (5519) |
| 5766-7018 | הקשר אקדמי, ייבוא syllabus |
| 7019-8158 | provider primitives: `getApiKey` (7019), `rememberConversationTurn` (7531), `getLatestAgentRunSummary` (7707), `callOpenAICompatible` (7922), `callClaudeApi` (7994) |
| 8159-10493 | **`chatWithActiveProvider`** (8159, מאומת) — מנוע dispatch מרכזי, ~2300 שורות |
| 10494-11470 | inline-edit + chat entries: `callAiAgent` (10499, מאומת), `applyAiSuggestionToRange` (10782), `applyInlineAi` (10879), `chatWithRoleAgent` (10889), `chefModeGenerateQuestion` (10974), `chefModeInterview` (11083), `streamWithActiveProvider` (11327) |
| 11472+ | רשימת מודלים |

---

## src/services/ — שאר השירותים (56 קבצים, מקובצים)

### SPSS
| קובץ | שורות | תפקיד |
|---|---:|---|
| `spssSyntaxService.js` | 3787 | ליבת יצירת תחביר SPSS |
| `spssChartRenderer.js` | 337 | **חדש** — רינדור גרפים SPSS |
| `spssDataIngest.js` | 181 | קליטת נתוני SPSS |
| `spssFindingsMerge.js` | 122 | מיזוג ממצאים |
| `spvOutputParser.js` | 137 | פענוח פלטי `.spv` |

### sourceRetrieval/ — תת-מערכת אחזור מקורות
`pipeline.js` 384, `candidates.js` 166, `urlVerifier.js` 128, `lock.js` 174, `validate.js` 73, `cache.js` 70, `format.js` 64, `index.js` 30, `telemetry.js` 13
`providers/`: `geminiGrounded.js` 70, `perplexitySearch.js` 77, `serpApiScholar.js` 77

### מקורות / anti-hallucination
`articleSourceValidation.js` 493 (אימות מקורות אמיתיים — עקרון מרכזי, לא ממציאים מקורות), `chatSourceCheck.js` 226, `sourceIntent.js` 47, `sourceQueryBuilder.js` 66, `browserRetrievalService.js` 34

### synonyms
`synonymsService.js` 396, `communitySynonymsService.js` 282, `synonymsValidationService.js` 209, `stylesRegistry.js` 80, `synonymsLexicon.data.js` (generated)

### cloud
`cloudCrypto.js` 230, `cloudCryptoSession.js` 169, `cloudSyncManager.js` 345, `workspaceV2Service.js` 507

### export/docs
`browserDocxExport.js` 852, `pptxExport.js` 374, `presentationService.js` 221, `pptxDraftService.js` 256, `documentDraftService.js` 195, `documentLayout.js` 77, `fontEmbed.js` 66, `chartService.js` 267, `imageService.js` 235

### שלד מטלה — המסלול בלי מפתח API → [docs/assignment-scaffold.md](assignment-scaffold.md)
שלב 1 מקומי: `materialChunkStore.js` 487 (קורפוס חומרי עזר + פרובננס + וקטורים), `assignmentSpecService.js` 432 (פרסר הנחיות דטרמיניסטי), `evidenceMatchService.js` 262 (סעיף→ראיות + סף רלוונטיות), `styleOpenerService.js` 214 (פתיחים מהקורפוס האישי), `assignmentPrepService.js` 184 (פנקס local/needs-ai/blocked).
שלב 2 + מצב: `assignmentAiService.js` 178 (טיוטה מעוגנת + הקשר לסיידבר), `assignmentScaffoldStore.js` 118, `assignmentScaffoldDoc.js` 151.
ממשק: `components/assignmentScaffold/AssignmentScaffoldStudio.jsx` 512, `EvidencePanel.jsx` 228. טאב "מטלה" ב-Ribbon.

### שונות
`copyleaksService.js` 567 (מקוריות/AI-content), `styleAuthenticityService.js` 420 (מזהה AI מקומי), `humanizerLoopService.js` 160, `materialExtractBrowser.js` 133 (חילוץ docx/txt/xlsx/pptx/pdf/OCR בדפדפן), `httpTransport.js` 90, `webProxyService.js` 62, `uiFeedback.js` 202, `documentUpload.js` 113, `chatScope.js` 61

---

## src/v3/ — כתיבה מחדש נקייה (מאחורי feature flag)

`flags.js` 45
`api/`: `request` 130, `streaming` 123, `errors` 97, `client` 94, `responseShape` 94, `ledger` 82, `retryPolicy` 32, `modelLimits` 28
`orchestration/`: `runScope` 96, `retrievalGate` 66
`workspaces/`: `store` 158, `model` 93, `contextEnforcer` 58

---

## src-tauri/ — Desktop backend (Rust)

| קובץ | שורות | תפקיד |
|---|---:|---|
| `lib.rs` | 127 | bootstrap, רישום plugins, `migrate_from_electron`, `take_pending_open_file` |
| `proxy.rs` | 491 | `proxy_http_request` — HTTP proxy + CORS allowlist |
| `fs_ops.rs` | 167 | קבצים: app-data scoped + נתיב חופשי |
| `oauth.rs` | 164 | OAuth flow |
| `secure.rs` | 124 | `read/save_secure_file` — הצפנת DPAPI |
| `updater.rs` | 65 | `check_for_update`/`install_update` |
| `dialog_ops.rs` | 60 | דיאלוגי פתיחה/שמירה native |

גם: `tauri.conf.json`, `capabilities/default.json`

---

## functions/

`index.js` 332 — Firebase Cloud Functions

---

## tools/

### test-bench/ — LAB (מריץ קוד אמיתי של האפליקציה)
`server.mjs` 421, `lab-entry.mjs` 944, `index.html` 820, `v3-api-unit.mjs` 465, `source-pipeline-harness.mjs` 345, `v3-workspaces-integration.mjs` 288, `source-retrieval-unit.mjs` 191 + live/smoke tests
הרצה: `node server.mjs`

### synonyms-build/
`build.mjs` 417, `gen-wordlist.mjs` 241, `validate-community.mjs` 245, `lexicon.json` (generated)

### detector-train/
`train.mjs` 134, `extractor.mjs` 160

גם: `gemini-article-check.html`, `SINGLE-CALL-LOCK.md`

---

## scripts/

- `gemini-article-check-server.mjs` 1251
- `news-site-article-retrieval-smoke.mjs` 373 — `npm run smoke:article-retrieval`
- `sync-storage-to-local.mjs` 197 — `npm run sync:storage`
- `patch-agent-*.cjs`

---

## npm scripts (package.json)

| פקודה | תפקיד |
|---|---|
| `dev` | Vite dev server, `:3001` HTTPS |
| `build` | `vite build` → `dist/` |
| `preview` | תצוגה מקדימה של build |
| `desktop:dev` | `tauri dev` — vite HTTP על `:1420` + חלון Tauri |
| `desktop:build` | `tauri build` — installer NSIS + exe |
| `firebase:*` | deploys שונים ל-Firebase |
| `smoke:article-retrieval` | מריץ את `news-site-article-retrieval-smoke.mjs` |
| `sync:storage` | מריץ את `sync-storage-to-local.mjs` |

Stack: React 19.2 · TipTap 3.22 · Tauri 2.11 · Firebase 12 · framer-motion 12 · Tailwind 4 + daisyUI

---

## מפת מערכת העזרה — שלוש חזיתות עצמאיות וקשיחות

**חשוב: כשמעדכנים תוכן עזרה — חובה לעדכן את כל שלוש החזיתות, הן לא מסונכרנות אוטומטית.**

1. **Ribbon dropdown "עזרה"** ([Ribbon.jsx](../src/Ribbon.jsx) שורות 503-540) → `onCommand('openHelp', id)` → main.jsx ~6927 → [HelpModal.jsx](../src/HelpModal.jsx) `GUIDE_CONTENT` (נושאים: `checkUpdates`, `guideUser`→קרוסלת UserGuide, `studios`, `guideAPIKeys`, `tsDocs`, `tsAPI`, `shortcuts`, `about`)
2. **Settings → טאב "מדריך"** — `GuideSettings` ב-[FileMenu.jsx](../src/FileMenu.jsx) שורות 3322-3409 — סיור נפרד בן 6 צעדים
3. **[docs/user-guide.md](user-guide.md)** — markdown סטטי, **לא** מוצג באפליקציה, תוכן כפול

---

## איפה נשמר state / config

- **Provider config + API keys**: `ai-provider-config.json` ב-userData, מוצפן DPAPI (`save_secure_file`); hydration ב-aiService (`hydrateProviderConfigFromDisk`)
- **App settings**: `app-settings.json` ב-userData, מוצפן DPAPI
- **חומרי לימוד מקומיים**: `project-materials/` + `index.json` ב-userData
- **localStorage**: מעט מאוד
- userData בפועל (Tauri): `%APPDATA%/com.wordai.assistant/`

(פירוט מלא ב-CLAUDE.md)

---

## docs/

| קובץ | תפקיד |
|---|---|
| `user-guide.md` | מדריך משתמש — עדכני |
| `api-keys-guide.md` | חיבור מפתחות LLM |
| `open-items.md` | פריטים פתוחים |
| `tauri-migration-plan.md` | תוכנית מיגרציית Tauri |
| `ux-audit-roadmap.md` | מפת דרכים UX |
| `spss-*.md` | תיעוד SPSS |
| `settings-chat-audit-remediation-plan.md` | תוכנית תיקון הגדרות/צ'אט |
| `recent-bugs-team-manager-plan.md` | תוכנית ניהול באגים |
| `flow-send-to-delivery-examples.md` | דוגמאות flow |
| `integration-plan.md` | תוכנית אינטגרציה |
| `live-streaming-plan.md` | תוכנית streaming חי |
| `autopilot-full-update.md` | עדכון AutoPilot |
| `CODE-MAP.md` | **המסמך הזה** |

### docs/archive/ — תיעוד היסטורי טרום-Tauri (לא לסמוך עליו כעדכני)
`project-index.md`, `plan.md`, `project-plan.md`, `ai-word-processor-plan.md`, `next-version-plan.md`, `new-user-onboarding-plan.md`, `cross-device-sync-plan.md`, `multi-agent-review-report.md`, `dashboard-prototype-archive.md`

---

## legacy/זבל בשורש הריפו — אל תתבסס

`_injector.js`, `run-grid.js`, `temp-scholar.js`, `test_gemini.js`, `tmp-gemini-p0-*.mjs`, `temp.txt`, `output_lines.txt`, `draft-ui.html`, `preview-onboarding.html`, `before_tailwind.css`, `*.exe.blockmap` (שאריות Electron), `legacy-reference/` (Office add-in ישן), קבצי `.cmd` של release (פונקציונליים — לא לזרוק)

Untracked scratch (לא ב-git בהכרח): `temp-docx-inspect*/`, `temp-ocr-cache*/`, `ocr-data/`, `PAST-DOC/`, `past-works/`, zips/PDFs בעברית בשורש

---

*מסמך זה משלים את [CLAUDE.md](../CLAUDE.md) — שם המידע התפעולי/ארכיטקטוני, כאן אינדקס-קבצים ומפות סקשנים.*
