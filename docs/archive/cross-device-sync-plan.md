> ⚠ מסמך היסטורי (לפני המעבר ל-Tauri, יוני 2026) — לא משקף את הארכיטקטורה הנוכחית. ראה CLAUDE.md ו-docs/CODE-MAP.md.
# Cross-Device Sync — Design Doc

**Status:** Designed, not implemented.
**Owner:** WordAI core team.
**Scope:** Sync user profile, recent documents, workspaces, agent presets, and uploaded helper materials across devices (Windows desktop ↔ future macOS/web).

---

## 1. Goals

- Allow a user signing in on a second device to see the same recent docs, workspaces, agent presets, and project materials.
- Offline-first: app stays fully usable offline; sync resumes automatically when network returns.
- Last-write-wins for simple metadata; explicit conflict resolution for documents.
- Fully optional — single switch in Settings → "Sync across devices".

## 2. Non-Goals (v1)

- Real-time collaborative editing (Google-Docs style).
- Sync of API keys (security: keys stay local, encrypted in OS keychain).
- Multi-user sharing of workspaces.

---

## 3. Storage Model

### 3.1 What syncs

| Entity | Source today | Sync scope | Conflict policy |
| --- | --- | --- | --- |
| User profile (`profile.json`) | `localStorage` + Electron user-data dir | Full document | Last-write-wins |
| Workspaces (`workspaces[]`) | `localStorage` | Per-workspace document | Last-write-wins on metadata; document body uses 3-way merge |
| Recent docs index (`past-works/index.json`) | Local filesystem | Index only (titles, IDs, dates) | Union, dedup by `id` |
| Past doc bodies | Local files in `past-works/` | Stored in cloud blob; downloaded lazily | Per-revision; user picks on conflict |
| Helper materials (`project-materials/`) | Local filesystem | Stored in cloud blob; downloaded lazily | Append-only; renames create new |
| Agent presets / automation settings | `localStorage` | Full document | Last-write-wins |
| API keys | OS keychain | **Never synced** | N/A |

### 3.2 Cloud schema (logical)

```
users/{userId}/
  profile.json                         (single doc)
  workspaces/{workspaceId}.json        (one doc per workspace)
  recent-docs/index.json               (index)
  recent-docs/blobs/{docId}.bin        (encrypted body)
  materials/index.json                 (index)
  materials/blobs/{materialId}.bin     (encrypted body)
  presets.json
  meta.json                            (vector clock per entity)
```

All blobs encrypted client-side with a per-user data key derived from the auth token + user passphrase (zero-knowledge optional in v2).

---

## 4. Auth

- **Provider:** Auth0 / Firebase Auth / Clerk (TBD — pick the one with an OIDC desktop flow).
- **Flow:** PKCE in default browser → callback to `wordai://auth/callback` deep link → tokens stored in OS keychain (Electron `safeStorage`).
- **Refresh:** Silent refresh on app start; graceful fallback to local-only mode if refresh fails.
- **Sign-out:** Clears tokens + cached cloud state; local files untouched.

---

## 5. Sync Engine

### 5.1 Local layer

- New module `src/services/syncService.js`.
- Wraps the existing `workspaceLearningService` + `aiService` storage with a thin event bus that emits `entityChanged({ kind, id, updatedAt })` on every write.
- Each entity gets a `revision` (monotonic integer) + `lastSyncedRev` stored in a local SQLite (better-sqlite3 in Electron) called `sync.db`.

### 5.2 Outbox + inbox

- **Outbox queue:** durable queue of pending uploads (entity kind, id, blob ref, revision). Survives restarts.
- **Inbox poller:** every 60s (configurable), or on `online` event, asks server "give me changes since `cursor`". Applies in deterministic order: profile → workspaces → presets → recent-docs index → materials index. Blobs fetched lazily on first read.
- **Backoff:** exponential, capped at 5 min, per failing endpoint.

### 5.3 Conflict resolution

- **Metadata (profile, presets, workspace settings):** server stores `updatedAt` per field group; client and server compare; latest wins. No prompt.
- **Document bodies (recent docs):** if local and remote both changed since `lastSyncedRev`:
  1. Save remote as `{title} (from {device-name})`.
  2. Show toast: "Conflict on '{title}' — kept both versions."
  3. User can manually delete one from Recent Docs UI.
- **Materials:** append-only. A re-upload with the same filename gets a `(2)` suffix.

### 5.4 Offline behaviour

- All writes go to local store immediately and into outbox.
- UI shows a small "Synced • now" / "Offline — 3 pending" indicator in StartScreen footer.
- No write is ever lost due to lack of connectivity.

---

## 6. Settings UI

In `FileMenu.jsx` → Settings → new section "Sync":

- Toggle: **Enable cross-device sync** (off by default).
- When on:
  - Sign-in button (or signed-in email + sign-out).
  - "Last synced: 2m ago" + manual "Sync now" button.
  - Pending count: "3 items waiting to upload".
  - Conflict log: scrollable list of recent auto-resolved conflicts.
- Toggle: **Sync helper materials** (separate, off by default — they can be large).
- Button: **Reset sync state** (clears local sync.db, re-uploads everything; confirm dialog).

---

## 7. Migration

First-time enable on an existing install:

1. Auth.
2. Compute hash of every local entity.
3. Ask server: "do you have any of these IDs already?"
4. If server is empty: upload everything (show progress bar).
5. If server has data: download server entities first, mark local-only entities as "to upload", then sync.

No destructive operations during migration — both sides preserved until conflict UI resolves.

---

## 8. Security

- All blobs encrypted client-side (AES-GCM) with a per-user data key.
- Data key wrapped by a key derived from the auth token; optional user passphrase for zero-knowledge.
- API keys never leave the device; they live in OS keychain only.
- Server only sees encrypted blobs + minimal metadata (entity kind, revision, updatedAt, size).

---

## 9. Rollout

1. **Alpha:** internal toggle behind `localStorage.wordaiSyncAlpha = '1'`, no UI.
2. **Beta:** opt-in toggle in Settings, banner explaining "experimental".
3. **GA:** default off, prominent setup card on StartScreen for new users.

---

## 10. Open Questions

- Cloud provider choice (Firebase / Supabase / custom on Cloudflare R2)?
- Free tier limits for material blobs?
- macOS/web client timeline — does v1 ship desktop-only?
- Do we need per-workspace sync toggles, or all-or-nothing at user level?

---

## 11. Estimated Effort

- Auth + token handling: 3–4 days.
- Local sync.db + outbox/inbox: 4–5 days.
- Cloud schema + minimal server (or BaaS wiring): 3 days.
- Conflict UI + Settings panel: 2–3 days.
- Encryption layer: 2 days.
- QA + migration testing: 3 days.
- **Total:** ~3 weeks of focused engineering.
