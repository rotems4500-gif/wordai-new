# WordFlow AI

**🌐 Website / PWA: [wordai-website.web.app](https://wordai-website.web.app)**

A desktop word processor for Windows with built-in AI, purpose-built for **academic and legal writing in Hebrew** (RTL-first, fully bilingual Hebrew/English). The editor is a rich TipTap/ProseMirror surface; an AI side panel runs a fleet of specialized agents for drafting, rewriting, source-grounded research, originality checking, and DOCX export — all without copy-pasting between your document and a chat window.

The same React frontend ships two ways:
- **Desktop app** — Tauri 2 (Rust + WebView2), auto-updating NSIS installer for Windows.
- **Website / PWA** — served from Firebase Hosting at **[wordai-website.web.app](https://wordai-website.web.app)**.

> ℹ️ This app was previously a Microsoft Word Office.js add-in, then an Electron desktop app. It migrated to **Tauri 2** in June 2026. The architecture map lives in [CLAUDE.md](CLAUDE.md) — trust that over older docs.

---

## ✨ What it does

- **AI side panel with specialized agents** — fix, humanize, summarize, academic rewrite, organize, text-to-table (inline), plus chat agents for source-finding, hole-filling, lecturer review, draft generation, and "Chef Mode" guided document building. See [src/agentConfig.js](src/agentConfig.js).
- **Source-grounded research (anti-hallucination)** — the `sources` / `holeFill` agents are forbidden from inventing references; real sources are validated and normalized via [src/services/articleSourceValidation.js](src/services/articleSourceValidation.js).
- **Originality & AI-content checks** — Copyleaks integration, plus a local "sounds like AI / not like you" style scorer ([styleAuthenticityService.js](src/services/styleAuthenticityService.js)).
- **Study-material context** — load local files (PDF/DOCX/TXT/XLSX/PPTX, OCR) and inject selected ones into AI context.
- **DOCX export** — DOM → `.docx` in the browser ([browserDocxExport.js](src/services/browserDocxExport.js)).
- **SPSS syntax studio, presentation studio, comments / track-changes / find-replace** — full editing suite.
- **Cloud sync** — Firebase auth + Firestore + Storage, cross-device.
- **Multiple AI providers** — Gemini (default), OpenAI, Claude, Groq, Ollama, Perplexity, custom — via [src/services/aiService.js](src/services/aiService.js). API keys are stored locally, encrypted with Windows DPAPI.

## 🧱 Stack

Tauri 2 (Rust, WebView2) · React 19 · Vite 8 · TipTap 3 · TailwindCSS 4 + daisyUI · Firebase

## 🚀 Run & build

```bash
npm install

npm run dev           # Vite dev server for the website on https://localhost:3001 (HTTPS)
npm run desktop:dev   # tauri dev — Vite (http) on :1420 + Tauri window
npm run build         # vite build -> dist/  (website + Tauri frontendDist)
npm run desktop:build # tauri build — NSIS installer + exe -> src-tauri/target/release/bundle/
```

- **Website**: Vite dev on `:3001` (HTTPS, self-signed cert in [vite.config.js](vite.config.js)). Deploy with `firebase deploy`.
- **Desktop**: Vite dev on `:1420` (HTTP — WebView2 rejects self-signed certs, so a separate port). Config in [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json).

## 🔄 Desktop auto-update

Release flow: bump version in [package.json](package.json) → signed `tauri build` (env `TAURI_SIGNING_PRIVATE_KEY` + `_PASSWORD`) → upload installer + `.sig` + `latest.json` to the GitHub Release. Installed apps check the feed and update on quit. The updater signing key (`~/.tauri/wordflow-updater.key`) is secret and not in the repo; the public key lives in `tauri.conf.json`.

## 🔐 API keys

Keys are entered in-app (Settings / onboarding) and stored locally in `ai-provider-config.json` under the app's userData, encrypted with DPAPI — never hardcoded. First-time guide: [docs/api-keys-guide.md](docs/api-keys-guide.md).

## 📚 More docs

- [CLAUDE.md](CLAUDE.md) — up-to-date architecture & navigation map (Hebrew).
- [docs/](docs/) — user guide, API-keys guide, planning notes.

---
*App id `com.wordai.assistant` · productName **WordFlow AI**. Version in [package.json](package.json).*
