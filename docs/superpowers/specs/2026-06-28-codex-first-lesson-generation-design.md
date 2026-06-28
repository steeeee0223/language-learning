# Codex-First Lesson Generation Design

## Summary

Add one-click lesson generation to the local-first language-learning app. The app will invoke the locally installed Codex runtime through the Codex TypeScript SDK, using the ChatGPT/Codex account of the person running that installation. Codex returns lesson MDX under a read-only sandbox; the application validates and writes the file.

This replaces the manual `codex "Generate the lesson MDX from ..."` handoff while preserving the existing `.local/tasks` and `.local/lessons` storage model.

## Goals

- Generate a complete lesson from an existing transcript and learning settings without leaving the app.
- Require every installation to use its own ChatGPT/Codex login and usage allowance.
- Provide a small, curated model selector rather than an unrestricted model catalog.
- Keep Codex read-only and retain file-system control in application code.
- Reduce output drift with a repository-scoped `generating-lesson` skill and application-side validation.
- Preserve failed tasks so generation can be retried without fetching the transcript again.

## Non-Goals

- Vercel AI Gateway or direct Anthropic, Google, or OpenAI Platform API integration.
- Shared application credentials or bundled Codex authentication state.
- Embedded browser OAuth, cloud deployment, cloud storage, or account management.
- Background jobs, cross-device synchronization, or recovery of in-flight work after the local server exits.
- Arbitrary model IDs, automatic overwrite, or regeneration of an existing lesson.
- Shell-based modification or network research by the generation agent. The SDK runtime may still perform read-only inspection while loading the repository skill.
- Active component unit tests, skill contract tests, API route tests, or broad testing of non-critical logic in this MVP. Deferred unit and API behavior may be recorded as skipped test descriptions.
- End-to-end automation; it is intentionally deferred to a later phase.

## Core Decisions

### Local Codex authentication

The application uses the current user's existing Codex login. Codex owns login persistence and token refresh. The application must not read, copy, serialize, expose, or relocate `auth.json`.

The recommended credential configuration is the user's normal `CODEX_HOME` (default `~/.codex`) with `cli_auth_credentials_store = "keyring"`. A project-local `CODEX_HOME` under `.local` is explicitly not used because it can duplicate plaintext credentials and makes accidental backup or distribution more likely.

The app exposes three readiness states:

- `ready`: Codex is installed and authenticated.
- `not-installed`: show installation guidance.
- `not-authenticated`: show a copyable `codex login` command and a **Check again** action.

Authentication is not launched or handled inside the browser in the MVP.

### Codex SDK boundary

All SDK interaction is isolated behind a `CodexLessonGenerator` interface. The production adapter uses `@openai/codex-sdk`; core orchestration and tests depend only on the interface.

Each generation uses an ephemeral thread with:

- repository root as the working directory so repo-scoped skills are discoverable;
- a read-only sandbox;
- network and web search disabled;
- no request for command execution or file modification;
- the chosen model preset;
- the task content as explicit input; and
- an explicit instruction to use `$generating-lesson`.

Codex returns the final MDX as text. Only application code may write lesson files.

Codex SDK is an agent runtime rather than a pure text-completion API. The enforceable security boundary is that the agent cannot write files or use the network. It may still choose read-only inspection tools while discovering the repository skill. Guaranteeing zero tool execution would require a different model API and is incompatible with the chosen ChatGPT/Codex subscription-authenticated path.

### Curated model presets

The browser submits a preset ID, never an arbitrary model ID. A server-only registry maps the presets:

- `auto`: omit the model override and use the current Codex recommendation.
- `fast`: a pinned, supported mini model.
- `best`: a pinned, supported high-quality model and the UI default.

Concrete model IDs live in one server module so they can be updated without changing UI code. A selected model that is unavailable to the current account produces a typed, retryable error. Generation metadata records both the preset and requested model ID.

## Repository Skill

Add a checked-in repository skill:

```text
.agents/skills/generating-lesson/
├── SKILL.md
└── references/
    ├── lesson-contract.md
    └── example-lesson.mdx
```

`SKILL.md` defines when the skill applies, requires explicit MDX-only output, and routes Codex to the contract and example. The contract defines:

- required section names and order;
- target-language rules;
- sentence-by-sentence translation behavior;
- CEFR vocabulary and grammar coverage;
- spoken-usage guidance;
- YouTube embed and heading placement;
- allowed MDX constructs; and
- prohibited preambles, code fences, scripts, and unrelated content.

The generation prompt invokes `$generating-lesson` explicitly. Implicit skill selection is not relied upon.

A skill reduces structural drift but cannot make model output deterministic. Consistency also depends on the pinned default model, deterministic validation, version metadata, and a stable example lesson.

## Data Contracts and Zod v4

Add Zod v4 as the single schema-validation library. All JSON or object-shape validation must be defined with Zod schemas and inferred TypeScript types. Handwritten record checks, property-by-property type guards, and duplicate TypeScript-only request types are not allowed.

Zod schemas cover at least:

- transcript segments and normalized transcripts;
- video metadata;
- learning settings and CEFR values;
- task creation input and stored task files;
- Codex readiness responses;
- generation requests and success responses;
- generation metadata; and
- typed public error payloads.

API routes use `safeParse` and map validation failures to the existing JSON error shape without exposing internal details.

Zod validates data shape. MDX syntax and lesson semantics are not object schemas: they are checked with the MDX parser and focused domain validators. Those validators must reuse parsed syntax trees or established parsers rather than reimplementing an MDX parser with regular expressions.

## Task and Generation Metadata

The existing task remains the canonical input. Its stored schema advances to a new version and contains stable generation fields:

```ts
type GenerationMetadata = {
  status: 'pending' | 'succeeded' | 'failed';
  modelPreset?: 'auto' | 'fast' | 'best';
  requestedModel?: string;
  codexVersion?: string;
  skillVersion?: string;
  startedAt?: string;
  completedAt?: string;
  errorCode?: string;
};
```

This shape is illustrative; the implementation source of truth is its Zod v4 schema. Secrets, access tokens, raw SDK errors, and full model traces are never stored in task JSON.

The skill includes an explicit version string. Successful and failed attempts record that version with the selected model and installed Codex version, making output differences diagnosable across installations.

## Server Components

### `codex-status`

Checks whether the Codex runtime is available and whether the SDK can establish an authenticated local session. It returns only the public readiness union. It does not inspect credential files.

### `model-registry`

Maps validated preset IDs to SDK model configuration. UI labels and descriptions may be shared, but concrete model IDs remain server-only.

### `lesson-prompt`

Builds a concise prompt from the stored task. It explicitly invokes `$generating-lesson`, identifies the target language and requested CEFR levels, includes the video metadata and transcript, and requires MDX-only output.

### `codex-lesson-generator`

Creates the read-only ephemeral SDK thread, applies a timeout, collects the final response, classifies known Codex failures, and returns an untrusted MDX string. It never writes files.

### `lesson-validator`

Parses the returned MDX using the project's MDX pipeline and verifies the lesson contract:

- non-empty, complete-looking content;
- no model preamble or outer Markdown code fence;
- `<YouTubeEmbed />` is the first body element with the expected video ID;
- exactly one H1 immediately follows the embed;
- every required section exists in the required order;
- every selected CEFR level appears in both vocabulary and grammar sections;
- prohibited script or unsafe executable constructs are absent; and
- the content can be rendered by the existing lesson pipeline.

The validator returns a typed domain result. It does not mutate or repair model output in the MVP; invalid output is rejected so the user can retry.

### `lesson-writer`

Writes only after validation. It uses a temporary sibling file followed by an atomic rename and refuses to overwrite an existing lesson. Path construction reuses the existing safe local-path boundary.

### Generation coordinator

Coordinates task loading, a per-task in-memory generation lock, metadata updates, model lookup, prompt construction, SDK invocation, validation, and atomic persistence. Concurrent requests for the same task return a conflict before invoking Codex.

## API Design

### `GET /api/codex/status`

Returns the Zod-defined readiness union. It is safe to call when the Get Started page loads and when the user presses **Check again**.

### `POST /api/tasks`

Retains its current responsibility: validate the transcript, video, and learning settings with Zod v4, then create the canonical local task. The response adds a stable task slug used by the generation route.

### `POST /api/tasks/[slug]/generate`

Accepts a Zod-validated body containing only `modelPreset`. The slug is checked with the existing safe path policy before the task is loaded.

Success returns the lesson slug and path. Errors use stable public codes:

- `CODEX_NOT_INSTALLED`
- `CODEX_NOT_AUTHENTICATED`
- `MODEL_UNAVAILABLE`
- `USAGE_LIMITED`
- `GENERATION_TIMEOUT`
- `GENERATION_INVALID`
- `GENERATION_IN_PROGRESS`
- `LESSON_EXISTS`
- `LESSON_WRITE_FAILED`

Raw SDK output and exception messages are logged locally only when useful and are not returned verbatim to the browser.

## UI Flow

The Get Started page becomes a three-step flow:

1. Fetch transcript.
2. Choose target language and CEFR levels.
3. Generate lesson.

Step three contains:

- Codex readiness status;
- setup guidance or `codex login` guidance when not ready;
- the curated model selector;
- a short notice that the transcript is sent through the user's own Codex account;
- **Generate Lesson**; and
- coarse progress states: Preparing and Generating lesson.

The MVP uses a single request rather than a streaming or background-job protocol. The client cannot observe server-side validation and atomic saving as separate live phases, so the UI must not claim that it can. On success, the browser navigates to `/lessons/[slug]`.

On failure, the task remains available and the UI presents a targeted action: check installation, log in, select another model, or retry. A failed attempt never creates a partial lesson. An existing valid lesson is never overwritten.

## Security and Privacy

- No shared AI key exists in source, environment templates, or local task files.
- Each installation authenticates independently through Codex.
- The app never reads or moves Codex credential files.
- Codex runs read-only and application code owns all writes.
- Model output is untrusted until parsed and validated.
- Task slugs and output paths retain strict traversal protection.
- The UI states that transcript content leaves the machine for Codex processing.
- Only minimum generation metadata is persisted; authentication and full traces are excluded.

## Error and Recovery Behavior

- Task creation succeeds before generation begins, so transcript work is recoverable.
- A timeout or client disconnect attempts to cancel the SDK operation when supported; regardless, no file is written without a validated final result.
- Only one generation per task runs within the local server process.
- A server restart clears in-memory locks. The stored metadata may show an interrupted attempt; the next request may mark it failed and retry because no lesson exists.
- Model-unavailable and usage-limit failures are retryable with user action.
- Invalid MDX is retained only in local diagnostic logs when enabled, not as a lesson file.

## MVP Testing Strategy

Testing is deliberately narrow. The MVP adds focused service-level tests only for logic where a regression could waste user quota, write an unsafe file, or accept an unusable lesson:

- Zod schemas accept the supported contract and reject malformed generation inputs or task files.
- The lesson validator accepts one canonical fixture and rejects representative unsafe or structurally incomplete MDX.
- The generation coordinator, using a fake `CodexLessonGenerator`, does not write invalid output and prevents duplicate concurrent generation.
- The lesson writer refuses overwrite and leaves no final lesson when atomic persistence fails.

Deferred unit-test and API-route behavior is recorded as executable mechanism documentation. Relevant test files may contain suites with precise `describe` and `it.skip("expected behavior")` descriptions, but no placeholder assertions, fake passing bodies, fixtures, mocks, or implementation. These skipped descriptions cover intended component states, skill contract rules, non-critical service behavior, Codex status responses, generation-route validation, typed errors, conflicts, and success responses so future work has a concrete testing backlog next to the code.

Browser end-to-end test skeletons are not added in the MVP. Those require broader environment decisions and will be designed when their implementation phase begins. Normal test commands never invoke Codex or consume account usage.

Real-account verification is a documented manual checklist, not an automated test:

1. Start signed out and confirm the app requests `codex login`.
2. Sign in with a personal ChatGPT/Codex account and recheck readiness.
3. Generate one fixture lesson with the default preset.
4. Confirm required sections render and the lesson appears in the list.
5. Confirm restarting the app does not require another login.

Automated browser end-to-end testing is deferred until after the MVP flow stabilizes.

## Documentation and Setup

Update the README and environment guidance to state:

- Codex is a local prerequisite.
- Each user must run `codex login` with their own account.
- ChatGPT/Codex plan usage belongs to that signed-in user.
- The project does not provide or consume a shared API key.
- Credentials remain in the normal user-level Codex store.
- The repository skill is loaded from `.agents/skills/generating-lesson`.

No new AI credential is added to `.env.example`.

## Acceptance Criteria

- A user with a local Codex installation and valid ChatGPT login can create a task and generate a lesson without running the old suggested command manually.
- Restarting the app reuses the normal Codex login without project-local credential copying.
- Another user must authenticate with their own Codex account and cannot consume the original developer's plan usage.
- The model selector exposes only Auto, Fast, and Best quality presets, with Best quality selected by default.
- Codex cannot write to the repository during generation.
- Only MDX that passes the contract and existing rendering pipeline reaches `.local/lessons`.
- Failed generation leaves a reusable task and no partial lesson.
- The generation prompt explicitly invokes the checked-in `$generating-lesson` skill.
- All object and API schema validation uses Zod v4.
- Deferred unit and API behavior is documented with explicit `it.skip` descriptions and is visibly reported as skipped by the test runner.
- The standard test suite never invokes a live model or consumes Codex usage.
