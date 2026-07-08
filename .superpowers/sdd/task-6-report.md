# Task 6 Report: Introduce The Codex Provider Boundary

## What I implemented

- Added [`src/lib/server/ai-provider.ts`](/Users/awen/Documents/ts-space/language-learning/src/lib/server/ai-provider.ts) with the `AiProviderId` and `LessonAiProvider` contract that combines status and generation behind one boundary.
- Added [`src/lib/server/codex-ai-provider.ts`](/Users/awen/Documents/ts-space/language-learning/src/lib/server/codex-ai-provider.ts) with `createCodexAiProvider()`, backed by `OpenAICodexLessonGenerator` and `getCodexStatus`.
- Updated [`src/lib/server/generate-lesson.ts`](/Users/awen/Documents/ts-space/language-learning/src/lib/server/generate-lesson.ts) to consume a `provider?: LessonAiProvider` dependency and to default to `createCodexAiProvider()` for production usage.
- Preserved the existing `generator` and `getStatus` test seam by adapting those optional dependencies into a temporary legacy provider only when they are supplied.
- Updated [`src/app/api/codex/status/route.ts`](/Users/awen/Documents/ts-space/language-learning/src/app/api/codex/status/route.ts) to fetch status through `createCodexAiProvider()` while preserving the existing `codexStatusSchema` parse and `jsonError('Codex status check failed.', 500)` handling.
- Added [`tests/ai-provider.test.ts`](/Users/awen/Documents/ts-space/language-learning/tests/ai-provider.test.ts) to cover the provider contract and concrete Codex provider factory.

## Focused test command

```bash
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
source "$NVM_DIR/nvm.sh"
nvm use 24.11.1 --silent
$NVM_BIN/pnpm --config.store-dir=/Users/awen/Documents/Codex/.pnpm-store exec node --import tsx --test tests/lesson-generation.test.ts tests/api-routes.test.ts tests/ai-provider.test.ts
```

## Focused test output

```text
✔ POST /api/tasks writes a normalized task and returns only its ID
✔ POST /api/tasks strictly rejects embedded source material
✔ POST /api/tasks maps a missing story to a safe client error
✔ POST /api/stories creates then reuses a transcript-free story response
✔ POST /api/stories rejects a non-URL before fetching a transcript
✔ POST /api/stories rejects malformed JSON as an invalid payload
✔ POST /api/stories rejects a non-YouTube URL with a safe client error
✔ POST /api/stories hides transcript provider failure details
✔ POST /api/stories classifies an invalid provider result as a safe upstream failure
✔ POST /api/stories classifies a mismatched provider video as a safe upstream failure
✔ POST /api/stories reports missing transcript configuration as unavailable
✔ POST /api/stories hides unexpected storage failure details
✔ GET /api/lessons lists JSON lessons and detail returns structured content
✔ POST /api/tasks/[slug]/generate accepts only an empty request body
✔ buildLessonPrompt
✔ lesson persistence and generation coordination
✔ LessonAiProvider keeps generation and status behind one boundary
✔ createCodexAiProvider exposes the codex provider boundary
ℹ tests 32
ℹ pass 32
ℹ fail 0
```

## TDD RED/GREEN evidence

### RED

First provider-contract run after tightening the test to require the real provider module:

```bash
$NVM_BIN/pnpm --config.store-dir=/Users/awen/Documents/Codex/.pnpm-store exec node --import tsx --test tests/ai-provider.test.ts
```

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@/lib' imported from /Users/awen/Documents/ts-space/language-learning/tests/ai-provider.test.ts
✖ tests/ai-provider.test.ts
ℹ pass 0
ℹ fail 1
```

This confirmed the test was now reaching for the missing provider boundary instead of only checking erased TypeScript types.

### GREEN

After adding the provider files and wiring them in:

```text
✔ LessonAiProvider keeps generation and status behind one boundary
✔ createCodexAiProvider exposes the codex provider boundary
ℹ pass 2
ℹ fail 0
```

Then the full focused command passed with `32` tests green.

## Files changed

- [`src/lib/server/ai-provider.ts`](/Users/awen/Documents/ts-space/language-learning/src/lib/server/ai-provider.ts)
- [`src/lib/server/codex-ai-provider.ts`](/Users/awen/Documents/ts-space/language-learning/src/lib/server/codex-ai-provider.ts)
- [`src/lib/server/generate-lesson.ts`](/Users/awen/Documents/ts-space/language-learning/src/lib/server/generate-lesson.ts)
- [`src/app/api/codex/status/route.ts`](/Users/awen/Documents/ts-space/language-learning/src/app/api/codex/status/route.ts)
- [`tests/ai-provider.test.ts`](/Users/awen/Documents/ts-space/language-learning/tests/ai-provider.test.ts)

## Self-review findings

- Corrected one issue found during self-review: `generateLesson()` initially always fell back through the legacy adapter, which would have bypassed the new default provider boundary. I changed the fallback so the real `createCodexAiProvider()` is used by default and the legacy adapter is only used when existing test dependencies (`generator` or `getStatus`) are explicitly provided.
- No further issues found in the owned-file diff after rerunning the focused test command.

## Issues / concerns

- The RED failure surfaced as an alias/module-resolution error from the missing provider module path, not as a direct missing-file message for a specific exported symbol. That still served the purpose of proving the provider boundary was absent before implementation.
- I did not run `typecheck` or `lint`, per task instructions.

## Task 6 Fix

- Finding addressed: added a focused regression around `generateLesson()` provider selection so the default path proves it calls `createCodexAiProvider()` when no legacy seams are supplied, and proves the legacy adapter path is used only when `generator`/`getStatus` are explicitly supplied.
- Files changed: `src/lib/server/generate-lesson.ts`, `tests/lesson-generation.test.ts`
- Command run: `export NVM_DIR="${NVM_DIR:-$HOME/.nvm}" && source "$NVM_DIR/nvm.sh" && nvm use 24.11.1 --silent && $NVM_BIN/pnpm --config.store-dir=/Users/awen/Documents/Codex/.pnpm-store exec node --import tsx --test tests/lesson-generation.test.ts tests/api-routes.test.ts tests/ai-provider.test.ts`
- Exact result: `33` tests passed, `0` failed (`tests 33`, `pass 33`, `fail 0`, `duration_ms 808.59475`).
