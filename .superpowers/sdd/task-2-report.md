# Task 2 Report: Gate Vercel Web Requests

## What Changed

- Added the Electron Next server surface env in `electron/server.ts` by setting `APP_SURFACE: 'desktop'` in `createNextServerLaunchConfig(...)`.
- Added the Next.js request gate in `src/proxy.ts`:
  - reads the current surface with `getAppSurface()`
  - uses `shouldBlockWebRequest(...)` from `src/lib/app-surface.ts`
  - allows public assets and `/download`
  - returns `404` JSON for blocked `/api/*` requests on the web surface
  - redirects all other blocked web requests to `/download`
- Updated `tests/electron-server.test.ts` to assert `config.env.APP_SURFACE === 'desktop'` in both dev and production launch-config tests.

## Tests And Output Summary

RED verification command:

```bash
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
source "$NVM_DIR/nvm.sh"
nvm use 24.11.1 --silent
$NVM_BIN/pnpm --config.store-dir=/Users/awen/Documents/Codex/.pnpm-store test
```

RED result summary:

- Test suite failed in exactly 2 places:
  - `createNextServerLaunchConfig_DevMode_UsesDocumentedNvmPnpmCommand`
  - `createNextServerLaunchConfig_ProductionMode_UsesBundledServerEntry`
- Both failures were the expected assertion:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
+ actual - expected

+ undefined
- 'desktop'
```

GREEN verification commands:

```bash
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
source "$NVM_DIR/nvm.sh"
nvm use 24.11.1 --silent
$NVM_BIN/pnpm --config.store-dir=/Users/awen/Documents/Codex/.pnpm-store test
$NVM_BIN/pnpm --config.store-dir=/Users/awen/Documents/Codex/.pnpm-store typecheck
```

GREEN result summary:

- `test`: 111 passed, 0 failed
- `typecheck`: completed successfully after `fumadocs-mdx` and `next typegen`

## TDD RED/GREEN Evidence

- RED:
  - Added the new Electron env assertions first in `tests/electron-server.test.ts`.
  - Ran the full test suite before implementation.
  - Observed both new assertions fail because `config.env.APP_SURFACE` was `undefined`.
- GREEN:
  - Implemented `APP_SURFACE: 'desktop'` in `electron/server.ts`.
  - Added `src/proxy.ts` to consume the existing Task 1 helper for request gating.
  - Re-ran the full test suite and typecheck, both of which passed.

## Files Changed

- `electron/server.ts`
- `src/proxy.ts`
- `tests/electron-server.test.ts`
- `.superpowers/sdd/task-2-report.md`

## Self-Review

- The Electron-side change is deliberately minimal and only extends the env contract already produced by `createNextServerLaunchConfig(...)`.
- The new Next.js `proxy` is task-scoped and reuses the shared Task 1 gate helper instead of duplicating pathname policy.
- The behavior matches the brief exactly:
  - blocked web API requests return `404` JSON
  - blocked non-API web requests redirect to `/download`
  - desktop launches always identify themselves as `APP_SURFACE=desktop`
- No unrelated source files were changed or staged for this task.

## Concerns

- There is no dedicated proxy test in the current task scope; protection for the gate logic currently relies on the shared `src/lib/app-surface.ts` tests plus typecheck. If proxy behavior changes later, adding direct `src/proxy.ts` tests would improve regression coverage.
