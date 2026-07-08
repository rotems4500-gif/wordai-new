# Workspace System Rework — Work Plan (CORRECTED 2026-07-05)

> **Correction notice.** The first version of this plan was written from a read-only *scan* that
> substantially mischaracterized the current code. Before touching anything I verified the real
> state empirically (ran `tools/test-bench/v3-workspaces-integration.mjs` — **20/20 green** — and
> read the actual call sites). Findings below **override** the original scan and the original 6-stage plan.

---

## Ground truth (verified, not scanned)

| Original plan stage | Scan claim | **Reality (verified)** | Status |
|---|---|---|---|
| Stage 0 — test harness | "needs building" | `v3-workspaces-integration.mjs` already exists, covers round-trip / mutation / cloud-no-clobber / kill-switch + chatRun. 20/20 pass. | **DONE** |
| Stage 2 — truth flip (V3 authoritative) | "stuck at Stage 4a, legacy = source of truth" | `flags.js:19` `workspacesTruth:true` **default since 2026-07-03**. `aiService.js:920-953` reads/writes via V3 primitives, projects to legacy. Round-trip lossless. | **DONE (live)** |
| Stage 3 — cloud clobber / self-switching | "build pointer protection" | `mergeWorkspacesV3PreservingLocalPointer` (`aiService.js:1024`) already preserves local `activeWorkspaceId` + bypass on cloud apply. Harness test [4] green. | **DONE (pointer part)** |
| Stage 4 — management UI | "no workspace UI at all" | `StartScreen.jsx` already has a live switcher: `workspacesList` (537), `handleWorkspaceChange`→`switchToWorkspace` (1111-1140), list from `getWorkspacesLibrary()`, refresh on `wordai-workspace-changed` (868). Plus full V2 template picker + detail modal (2184-2331). | **PARTIAL — switch/list done; CRUD missing** |

The stale `store.js:3-8` comment (still describing "Stage 4a") is what misled the scan. Reality is Stage 4b+.

---

## What is ACTUALLY still open (the real remaining work)

### Gap A — Policy enforcement is dead code *(highest value, self-contained)*
`src/v3/workspaces/contextEnforcer.js` is fully written (`buildEnforcedContext`, `resolvePolicy`, memory-isolation handling) but has **zero call sites** (grep confirms only the definition). Declared workspace isolation — no chat-history bleed, `memoryIsolation` guardrail, materials gating — is **not enforced anywhere**. Document/chat context still flows to prompts unfiltered.
- **Work:** call `buildEnforcedContext()` at the prompt-assembly choke points (`workspaceLearningService.js` doc-gen `generateDocumentFromPrompt:3954` + revision `:4362`; chat send path in `aiService.js` / `AiSidebar.jsx`). Wire `WORKSPACE_V2_GLOBAL_GUARDRAILS` (`workspaceV2Service.js:134`) → `contextPolicy`.
- **Test:** extend harness — workspace with `memoryIsolation` ⇒ assembled prompt carries no chat messages.
- Additive, guardable, no product decision. Aligned with the app's core anti-contamination principle.

### Gap B — Cloud merge is whole-blob, not per-workspace *(real, medium value)*
`mergeWorkspacesV3PreservingLocalPointer` (`aiService.js:1024`) keeps the local pointer but replaces the entire `workspaces` map with the incoming cloud blob. Two devices editing **different** workspaces → last sync wins the whole map, silently losing the other's edit.
- **Work:** add per-workspace `updatedAt` to the model (`model.js` — currently only blob-level `updatedAt`), bump `WORKSPACES_V3_SCHEMA_VERSION` 3→4 with in-place upgrader; change the merge to entry-by-entry newest-wins; tombstone (`deletedAt`) for deletes so a stale device can't resurrect a deleted workspace.
- **Test:** harness two-device conflict — both edits survive.

### Gap C — Workspace CRUD UI *(real, medium value, has product choices)*
Switcher exists, but there's **no create / rename / delete / duplicate** for user workspaces in `StartScreen.jsx` (only delete-recent-doc and delete-material handlers exist). Custom workspaces currently have no in-UI creation path — the dropdown is effectively the ~8 built-in defaults.
- **Work:** small manager surface (create from default/clone, rename, delete→reset-for-built-ins, duplicate, edit sharedGoal/workflowMode/agents). Reuse `getWorkspacesLibrary` / `saveWorkspacesLibrary` / `switchToWorkspace`. Surface unused `buildWorkspaceRoutingSummary` (`aiService.js:4072`).
- Product decisions already pre-approved by Rotem: switcher in TopBar + StartScreen, delete-built-in = reset-to-default, active-workspace device-local (already true), styling per settings-skin pattern.

### Not worth doing
- Stage 1 naming split (Workspace vs PipelineTemplate) — pure churn across a 11.5k-line file for cosmetic clarity; skip unless it blocks something.
- Stage 6 material-metadata dedup — minor; fold into Gap-C work if touching that file.

---

## STATUS 2026-07-05 — all three gaps addressed (harness 32/32 green, prod build clean)

- **Gap A — DONE.** `contextEnforcer` wired at `chatWithActiveProvider` entry via `applyWorkspaceContextEnforcement` (`aiService.js`), behind `contextEnforcement` flag (`flags.js`). Opt-in per-workspace (`contextPolicy`/`guardrails.memoryIsolation`); dormant for all current workspaces → zero behavior change until a policy is set. Decoupled from `WORKSPACE_AUTOMATION_QUARANTINED`. Harness [7] proves isolation strips chat history, pass-through preserved, kill-switch works.
- **Gap B — DONE.** Per-workspace merge: `mergeWorkspaceMaps` + `workspaceEffectiveTimestamp` + tombstones (`model.js`); content-sensitive `updatedAt` stamping via `workspaceContentSignature` in `saveWorkspacesLibrary`; `getWorkspacesLibrary` hides tombstones but preserves them in storage; `mergeWorkspacesV3PreservingLocalPointer` now merges entry-by-entry. Harness [8] proves concurrent 2-device edits both survive + deletions don't resurrect.
- **Gap C — UI was ALREADY BUILT in `FileMenu.jsx`** (create `createAndSwitchWorkspace` 4613, delete `handleDeleteWorkspace` 4635, edit/rename `openEditWorkspace` 4659, preview, deep-edit, `savedWorkspaces` list). The scan + my StartScreen check both missed it — it lives in Settings (FileMenu), not StartScreen. My duplicate `WorkspaceManager.jsx` was reverted. **Real fix delivered:** the existing `deleteWorkspace` did key-removal (`delete library[id]`) which would resurrect deletions under the new Gap-B merge — changed to write a tombstone. Now FileMenu's existing delete UI is merge-safe.

## Recommended order
**A (enforcement) → B (per-workspace merge) → C (CRUD UI).** A is the biggest correctness win and fully self-contained; B protects multi-device users; C is polish. Each ships independently and is verifiable in the existing harness / Capability LAB.

## Key references
- Harness: `tools/test-bench/v3-workspaces-integration.mjs` — run via `WORDAI_VERIFY_ENTRY=ws npx vite build --config vite.verify.config.mjs` then `node <scratch>/verify/out-sf/sf.mjs`.
- Memory: `project-workspace-system-map.md` (needs the same correction applied), `project-v3-rebuild.md`, `project-regression-sweep-2026-07.md`.
- Persistence gotcha: any new storage key MUST be added to `PERSISTED_APP_SETTINGS_KEYS` (`aiService.js:885+`) **and** `CLOUD_PROFILE_APP_SETTING_KEYS` (`cloudSyncManager.js:43+`).
