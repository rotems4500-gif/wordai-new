# Multi-Agent Review Report

Date: 2026-04-28
Scope: Application-wide review after onboarding/provider flow changes.

## Release blockers to fix now

1. Provider activation mismatch during onboarding quick setup
   - Source: Bug Reviewer, Lead Developer
   - Problem: Quick provider setup can save an API key without ensuring the active runtime/provider selection matches the provider the user just configured.
   - Risk: Users complete setup successfully but generation still fails or routes through the wrong provider.
   - Target area: `src/FileMenu.jsx`, `src/services/aiService.js`

2. Onboarding submission data is collected but not fully used downstream
   - Source: Bug Reviewer
   - Problem: Fields related to submission or cover-page context are collected in onboarding but do not consistently affect generated instructions/prompts.
   - Risk: Users invest time entering profile data that has no effect on output quality.
   - Target area: `src/services/aiService.js`, `src/services/workspaceLearningService.js`

3. Close vs dismiss behavior is conflated in onboarding persistence
   - Source: Bug Reviewer, UX Architect, Lead Developer
   - Problem: A normal close action can be persisted as a permanent dismissal.
   - Risk: First-run guidance can disappear permanently even when the user only wanted to postpone it.
   - Target area: `src/FileMenu.jsx`, `src/main.jsx`

4. Electron proxy and secret-handling exposure
   - Source: Security Reviewer, Challenger
   - Problem: Proxy allowlisting and secret handling in the renderer are too permissive.
   - Risk: Security exposure, unsafe request routing, and plaintext secret access from renderer state.
   - Target area: `electron/main.cjs`, `electron/preload.cjs`, provider persistence flow

## Improvements for next version

### Architecture

- Split `src/FileMenu.jsx` into smaller ownership-based modules: onboarding, provider settings, updates, and workspace settings.
- Split `src/services/aiService.js` into provider routing, persistence, prompt assembly, and profile/style utilities.
- Define one clear storage contract for global app settings, workspace settings, document state, drafts, and secrets.
- Replace boolean-driven routing/open-state logic with explicit flow controllers for onboarding, start screen, and updates.

### UX and Product

- Simplify first-run onboarding into a shorter resume-first flow with a strong “skip for now” path.
- Reduce StartScreen density and expose one clear primary action above the fold.
- Make personal style impact visible in the editor/chat experience instead of burying it in setup.
- Unify provider setup into one obvious path and hide advanced provider/agent controls by default.
- Replace theatrical loading and redundant progress surfaces with one calm, trustworthy progress model.

### UI Design

- Unify the visual language across StartScreen, onboarding, settings, and AI sidebar.
- Normalize CTA hierarchy so each screen has one unmistakable primary action.
- Reduce card nesting, gradients, blur, and competing accent treatments.
- Default the AI sidebar to a lighter chat-first view; move provider/agent/skill controls into advanced sections.

### Security

- Move secrets out of renderer-readable storage wherever possible.
- Audit URL templates and telemetry/search integrations for accidental key exposure.
- Enforce HTTPS-only upstream requests except explicit local-development cases.

### Testing

- Add smoke coverage for first-run onboarding, provider setup, external analysis processing, and generation routing.
- Add regression tests around provider alias mapping and onboarding auto-open conditions.
- Add Electron integration coverage for provider config persistence and update flow basics.

## Agent findings by source

### Lead Developer

- Risky provider routing and persistence ownership.
- Mega-modules increase regression risk.
- Update flow and onboarding ownership are split across multiple surfaces.

### UX Architect

- StartScreen is overloaded.
- Onboarding close behavior is misleading.
- Provider flow is fragmented.
- Editor transition surfaces too much state/noise.

### Bug Reviewer

- Quick setup does not always activate the correct provider/runtime.
- Submission-related fields are not fully wired into prompt construction.
- Close behavior can incorrectly persist permanent dismissal.

### Security Reviewer

- Proxy allowlist is too weak.
- Renderer has too much access to secrets.
- Some integrations risk exposing keys through URL patterns.

### Code Reviewer

- Possible false positives or negatives in onboarding auto-open heuristics.
- Personal tab access path may be unclear after the onboarding shift.
- Autosave and explicit save CTA messaging are inconsistent.

### Test Writer

- Critical onboarding/provider flows lack test infrastructure and regression coverage.

### Challenger

- Product scope is too broad too early.
- Orchestration is brittle.
- Secret handling is below the expected trust bar.

### Product Brainstorm

- Optimize for first useful result within minutes.
- Prefer resume-first flows over forced setup.
- Make user style/profile benefits tangible and visible.

### ui-designer

- Major surfaces feel visually inconsistent.
- StartScreen and sidebar are overloaded.
- Onboarding feels heavier than the product needs.
- CTA hierarchy is inconsistent.

### Technical Feasibility

- Provider/persistence reliability is the highest-value near-term refactor.
- Storage unification is feasible but should be staged.
- FileMenu/aiService decomposition should follow a storage ownership cleanup, not precede it.

## Recommended execution order

1. Fix the three release-critical product bugs and the most tractable security issue.
2. Rebuild and run a targeted bug review on the changed files.
3. Ship the release only after the provider/onboarding fixes are verified.
4. Use this document as the backlog seed for the next version planning pass.