## Task 4 Report

### What I implemented
- Added `/settings` as a dynamic app route in [src/app/settings/page.tsx](/Users/awen/Documents/ts-space/language-learning/src/app/settings/page.tsx) using the existing `LearningDocsLayout` and docs-page structure.
- Added [src/app/settings/settings-client.tsx](/Users/awen/Documents/ts-space/language-learning/src/app/settings/settings-client.tsx) with:
  - desktop settings loading through `window.languageLearningDesktop?.getSettings()`
  - data-root actions for `chooseDataRoot()` and `openDataRoot()`
  - Codex status polling through `/api/codex/status` and `codexStatusSchema`
  - fallback copy when the route is opened outside the Electron desktop runtime
- Updated [src/lib/layout.shared.tsx](/Users/awen/Documents/ts-space/language-learning/src/lib/layout.shared.tsx) to add a visible `Settings` navigation link at `/settings`.

### Tests/checks run and results
- Ran `git diff --check -- src/app/settings/page.tsx src/app/settings/settings-client.tsx src/lib/layout.shared.tsx`
- Result: passed with no whitespace or patch-format issues
- Did not run `typecheck` or `lint` per task constraint

### Files changed
- [src/app/settings/page.tsx](/Users/awen/Documents/ts-space/language-learning/src/app/settings/page.tsx)
- [src/app/settings/settings-client.tsx](/Users/awen/Documents/ts-space/language-learning/src/app/settings/settings-client.tsx)
- [src/lib/layout.shared.tsx](/Users/awen/Documents/ts-space/language-learning/src/lib/layout.shared.tsx)

### Self-review findings
- Kept edits within the three allowed files.
- Matched existing docs-page and button/layout patterns already used in the app.
- Adjusted the client component to avoid direct `window` access during render, which would otherwise break under Next server rendering.

### Issues/concerns
- No focused runtime test was available for this UI-only slice without stepping into broader app verification.
- The non-desktop fallback briefly renders before client hydration confirms Electron availability; that avoids SSR breakage and keeps the component safe.
