# Codex-First Lesson Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-click, locally authenticated Codex lesson generation that returns validated MDX and writes it safely to `.local/lessons`.

**Architecture:** Keep the existing task JSON as the canonical input. A server-only coordinator reads a validated task, invokes `@openai/codex-sdk` in a read-only/no-network thread, validates the returned MDX against a repo-scoped lesson skill, and atomically creates the lesson; the browser only submits a curated model preset and navigates to the completed lesson.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, TanStack Query, Zod 4, OpenAI Codex TypeScript SDK, unified/remark MDX parsing, Node test runner.

**Design spec:** `docs/superpowers/specs/2026-06-28-codex-first-lesson-generation-design.md`

---

## File Map

### Shared contracts

- `src/lib/contracts.ts`: Zod v4 schemas and inferred types for existing video/transcript/task inputs.
- `src/lib/generation-contracts.ts`: shared schemas for model presets, Codex status, generation requests/responses, and public error codes.
- `src/lib/lesson-sections.ts`: canonical English and Chinese lesson section labels.

### Server-only generation

- `src/lib/server/task-schema.ts`: stored task v2 and generation metadata schemas.
- `src/lib/server/task-store.ts`: safe task reads and atomic metadata updates.
- `src/lib/server/model-registry.ts`: server-only model IDs for the three UI presets.
- `src/lib/server/codex-status.ts`: local runtime and login readiness check through `codex login status`.
- `src/lib/server/lesson-prompt.ts`: deterministic prompt builder that explicitly invokes `$generating-lesson`.
- `src/lib/server/codex-lesson-generator.ts`: SDK adapter and conservative SDK error classification.
- `src/lib/server/lesson-validator.ts`: MDX parsing and lesson-contract validation.
- `src/lib/server/lesson-writer.ts`: no-overwrite atomic lesson creation.
- `src/lib/server/generate-lesson.ts`: per-task lock and end-to-end generation coordinator.

### Routes and UI

- `src/app/api/codex/status/route.ts`: readiness endpoint.
- `src/app/api/tasks/[slug]/generate/route.ts`: generation endpoint.
- `src/app/api/tasks/route.ts`: replace handwritten validation and return `taskSlug`.
- `src/app/get-started/codex-generation-step.tsx`: status, model selector, login guidance, generation action.
- `src/app/get-started/get-started-client.tsx`: connect task creation to generation step and remove the manual-command presentation.

### Repo skill and tests

- `.agents/skills/generating-lesson/SKILL.md`: explicitly invoked generation workflow.
- `.agents/skills/generating-lesson/references/lesson-contract.md`: exact lesson structure.
- `.agents/skills/generating-lesson/references/example-lesson.mdx`: canonical output example.
- `tests/contracts.test.ts`: active Zod contract tests.
- `tests/lesson-generation.test.ts`: active validator, writer, and coordinator tests.
- `tests/get-started-generation.test.ts`: skipped component/unit behavior descriptions.
- `tests/generating-lesson-skill.test.ts`: skipped skill-contract behavior descriptions.
- `tests/api-routes.test.ts`: retain existing tests and append skipped Codex/generation route descriptions.

## Task 1: Install dependencies and replace task request type guards with Zod v4

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/lib/contracts.ts`
- Modify: `src/app/api/tasks/route.ts`
- Create: `tests/contracts.test.ts`

- [ ] **Step 1: Install exact MVP dependencies**

Run:

```bash
pnpm add @openai/codex-sdk@0.142.3 zod@4.4.3 unified remark-parse remark-mdx mdast-util-to-string@4.0.0
pnpm add -D @types/mdast
```

Expected: `package.json` and `pnpm-lock.yaml` contain the new packages; install exits 0.

- [ ] **Step 2: Write failing Zod contract tests**

Create `tests/contracts.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { taskFileInputSchema } from '@/lib/contracts.ts';

const validTaskInput = {
  video: {
    url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    id: 'jNQXAC9IVRw',
    title: 'Me at the zoo',
  },
  transcript: {
    source: 'youtube-transcript.io',
    segments: [{ text: 'Hello.', start: 0, duration: 1 }],
  },
  learningSettings: {
    targetLanguage: 'zh',
    cefrLevels: ['A2', 'B1'],
  },
};

describe('taskFileInputSchema', () => {
  it('accepts the canonical task creation contract', () => {
    assert.deepEqual(taskFileInputSchema.parse(validTaskInput), validTaskInput);
  });

  it('rejects empty CEFR selections and malformed transcript segments', () => {
    const emptyLevels = structuredClone(validTaskInput);
    emptyLevels.learningSettings.cefrLevels = [];
    assert.equal(taskFileInputSchema.safeParse(emptyLevels).success, false);

    const invalidSegment = {
      ...validTaskInput,
      transcript: {
        ...validTaskInput.transcript,
        segments: [{ text: 'Hello.', start: 'zero', duration: 1 }],
      },
    };
    assert.equal(taskFileInputSchema.safeParse(invalidSegment).success, false);
  });

  it('rejects unknown object keys', () => {
    assert.equal(taskFileInputSchema.safeParse({ ...validTaskInput, apiKey: 'secret' }).success, false);
  });
});
```

- [ ] **Step 3: Run the contract test and verify it fails**

Run:

```bash
node --import tsx --test tests/contracts.test.ts
```

Expected: FAIL because `taskFileInputSchema` is not exported.

- [ ] **Step 4: Replace type-only contracts with Zod v4 schemas**

Replace `src/lib/contracts.ts` with:

```ts
import { z } from 'zod';

export const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const targetLanguages = ['zh', 'en'] as const;

export const cefrLevelSchema = z.enum(cefrLevels);
export const targetLanguageSchema = z.enum(targetLanguages);

export const transcriptSegmentSchema = z.strictObject({
  text: z.string().min(1),
  start: z.number().finite().nonnegative(),
  duration: z.number().finite().nonnegative(),
});

export const videoMetadataSchema = z.strictObject({
  url: z.url(),
  id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  title: z.string().min(1),
});

export const learningSettingsSchema = z.strictObject({
  targetLanguage: targetLanguageSchema,
  cefrLevels: z.array(cefrLevelSchema).min(1),
});

export const normalizedTranscriptSchema = z.strictObject({
  source: z.literal('youtube-transcript.io'),
  segments: z.array(transcriptSegmentSchema).min(1),
});

export const transcriptBundleSchema = z.strictObject({
  video: videoMetadataSchema,
  transcript: normalizedTranscriptSchema,
});

export const taskFileInputSchema = z.strictObject({
  video: videoMetadataSchema,
  transcript: normalizedTranscriptSchema,
  learningSettings: learningSettingsSchema,
});

export type CefrLevel = z.infer<typeof cefrLevelSchema>;
export type TargetLanguage = z.infer<typeof targetLanguageSchema>;
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type VideoMetadata = z.infer<typeof videoMetadataSchema>;
export type LearningSettings = z.infer<typeof learningSettingsSchema>;
export type NormalizedTranscript = z.infer<typeof normalizedTranscriptSchema>;
export type TranscriptBundle = z.infer<typeof transcriptBundleSchema>;
export type TaskFileInput = z.infer<typeof taskFileInputSchema>;
```

- [ ] **Step 5: Replace handwritten task route validation**

Replace `src/app/api/tasks/route.ts` with:

```ts
import { NextResponse } from 'next/server.js';

import { taskFileInputSchema } from '@/lib/contracts';
import { getErrorMessage, jsonError } from '@/lib/server/http';
import { buildTaskFile } from '@/lib/server/tasks';

export async function POST(request: Request) {
  try {
    const parsed = taskFileInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError('Invalid task payload.');
    }

    return NextResponse.json(await buildTaskFile(parsed.data));
  } catch (error) {
    return jsonError(getErrorMessage(error));
  }
}
```

- [ ] **Step 6: Run focused and existing tests**

Run:

```bash
pnpm test
pnpm types:check
```

Expected: all existing tests and the new contract tests PASS; type check exits 0.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/contracts.ts src/app/api/tasks/route.ts tests/contracts.test.ts
git commit -m "refactor: validate task contracts with zod"
```

## Task 2: Add generation contracts and a safe stored-task v2 repository

**Files:**
- Create: `src/lib/generation-contracts.ts`
- Create: `src/lib/server/task-schema.ts`
- Create: `src/lib/server/task-store.ts`
- Modify: `src/lib/server/tasks.ts`
- Modify: `src/lib/server/lessons.ts`
- Modify: `src/app/api/tasks/route.ts`
- Modify: `tests/contracts.test.ts`
- Modify: `tests/local-domain.test.ts`
- Modify: `tests/api-routes.test.ts`

- [ ] **Step 1: Add failing stored-task schema tests**

Append to `tests/contracts.test.ts`:

```ts
import { storedTaskSchema } from '@/lib/server/task-schema.ts';

describe('storedTaskSchema', () => {
  it('requires schema version 2 and pending generation metadata', () => {
    const result = storedTaskSchema.safeParse({
      schemaVersion: 2,
      createdAt: '2026-06-28T00:00:00.000Z',
      video: validTaskInput.video,
      transcript: validTaskInput.transcript,
      learningSettings: validTaskInput.learningSettings,
      output: { format: 'mdx', path: '.local/lessons/lesson.mdx' },
      instructions: {
        requiredSections: ['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage'],
      },
      generation: { status: 'pending', skillVersion: '1' },
    });

    assert.equal(result.success, true);
  });
});
```

Update the existing `buildTaskFile` assertions in `tests/local-domain.test.ts` to expect `schemaVersion === 2`, `result.taskSlug`, `task.generation.status === 'pending'`, and required section IDs `['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage']`.

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm test
```

Expected: FAIL because stored task v2 and `taskSlug` do not exist.

- [ ] **Step 3: Define shared generation API schemas**

Create `src/lib/generation-contracts.ts`:

```ts
import { z } from 'zod';

export const modelPresets = ['auto', 'fast', 'best'] as const;
export const modelPresetSchema = z.enum(modelPresets);
export const localSlugSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

export const codexStatusSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ready'), version: z.string().min(1) }),
  z.strictObject({ status: z.literal('not-installed') }),
  z.strictObject({ status: z.literal('not-authenticated'), version: z.string().min(1) }),
]);

export const generateLessonRequestSchema = z.strictObject({
  modelPreset: modelPresetSchema,
});

export const taskCreationResponseSchema = z.strictObject({
  taskSlug: localSlugSchema,
  taskPath: z.string().startsWith('.local/tasks/'),
  outputPath: z.string().startsWith('.local/lessons/'),
});

export const generateLessonResponseSchema = z.strictObject({
  lessonSlug: localSlugSchema,
  lessonPath: z.string().startsWith('.local/lessons/'),
});

export const generationErrorCodes = [
  'CODEX_NOT_INSTALLED',
  'CODEX_NOT_AUTHENTICATED',
  'MODEL_UNAVAILABLE',
  'USAGE_LIMITED',
  'GENERATION_TIMEOUT',
  'GENERATION_INVALID',
  'GENERATION_FAILED',
  'GENERATION_IN_PROGRESS',
  'LESSON_EXISTS',
  'LESSON_WRITE_FAILED',
] as const;

export const generationErrorCodeSchema = z.enum(generationErrorCodes);
export const generationErrorResponseSchema = z.strictObject({
  error: z.string(),
  code: generationErrorCodeSchema,
});
export const apiErrorResponseSchema = z.strictObject({
  error: z.string(),
  code: generationErrorCodeSchema.optional(),
});

export type ModelPreset = z.infer<typeof modelPresetSchema>;
export type CodexStatus = z.infer<typeof codexStatusSchema>;
export type GenerationErrorCode = z.infer<typeof generationErrorCodeSchema>;
```

- [ ] **Step 4: Define stored task v2 with Zod v4**

Create `src/lib/server/task-schema.ts`:

```ts
import { z } from 'zod';

import { learningSettingsSchema, normalizedTranscriptSchema, videoMetadataSchema } from '@/lib/contracts';
import { generationErrorCodeSchema, modelPresetSchema } from '@/lib/generation-contracts';

export const TASK_SCHEMA_VERSION = 2 as const;
export const LESSON_SKILL_VERSION = '1' as const;
export const requiredLessonSections = ['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage'] as const;

export const generationMetadataSchema = z.strictObject({
  status: z.enum(['pending', 'succeeded', 'failed']),
  skillVersion: z.string().min(1),
  modelPreset: modelPresetSchema.optional(),
  requestedModel: z.string().min(1).optional(),
  codexVersion: z.string().min(1).optional(),
  startedAt: z.iso.datetime().optional(),
  completedAt: z.iso.datetime().optional(),
  errorCode: generationErrorCodeSchema.optional(),
});

export const storedTaskSchema = z.strictObject({
  schemaVersion: z.literal(TASK_SCHEMA_VERSION),
  createdAt: z.iso.datetime(),
  video: videoMetadataSchema,
  transcript: normalizedTranscriptSchema,
  learningSettings: learningSettingsSchema,
  output: z.strictObject({
    format: z.literal('mdx'),
    path: z.string().regex(/^\.local\/lessons\/[A-Za-z0-9][A-Za-z0-9_-]*\.mdx$/),
  }),
  instructions: z.strictObject({
    requiredSections: z.tuple([
      z.literal('metadata'),
      z.literal('translation'),
      z.literal('vocabulary'),
      z.literal('grammar'),
      z.literal('spokenUsage'),
    ]),
  }),
  generation: generationMetadataSchema,
});

export type StoredTask = z.infer<typeof storedTaskSchema>;
export type GenerationMetadata = z.infer<typeof generationMetadataSchema>;
```

- [ ] **Step 5: Add safe task reads and atomic task updates**

Create `src/lib/server/task-store.ts` with these public functions and no path accepted from browser input:

```ts
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { localSlugSchema } from '@/lib/generation-contracts';
import { ensureLocalDirs } from './local-paths';
import { generationMetadataSchema, storedTaskSchema, type GenerationMetadata, type StoredTask } from './task-schema';

function assertTaskSlug(slug: string) {
  localSlugSchema.parse(slug);
}

export async function readTask(slug: string, rootDir?: string): Promise<StoredTask> {
  assertTaskSlug(slug);
  const { tasksDir } = await ensureLocalDirs(rootDir);
  return storedTaskSchema.parse(JSON.parse(await readFile(join(tasksDir, `${slug}.json`), 'utf8')));
}

export async function updateTaskGeneration(
  slug: string,
  generation: GenerationMetadata,
  rootDir?: string,
): Promise<StoredTask> {
  const current = await readTask(slug, rootDir);
  const next = storedTaskSchema.parse({ ...current, generation: generationMetadataSchema.parse(generation) });
  const { tasksDir } = await ensureLocalDirs(rootDir);
  const finalPath = join(tasksDir, `${slug}.json`);
  const tempPath = join(tasksDir, `.${slug}.${process.pid}.${Date.now()}.tmp`);
  try {
    await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(tempPath, finalPath);
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
  return next;
}
```

- [ ] **Step 6: Upgrade task creation to schema v2**

Modify `src/lib/server/tasks.ts` so `BuildTaskFileResult` includes `taskSlug`, the stored object is parsed with `storedTaskSchema`, and generation starts pending:

```ts
const task = storedTaskSchema.parse({
  schemaVersion: TASK_SCHEMA_VERSION,
  createdAt: now.toISOString(),
  video: input.video,
  transcript: input.transcript,
  learningSettings: input.learningSettings,
  output: { format: 'mdx', path: outputPath },
  instructions: { requiredSections: requiredLessonSections },
  generation: { status: 'pending', skillVersion: LESSON_SKILL_VERSION },
});

return {
  taskSlug: basename,
  taskPath,
  outputPath,
};
```

Delete the old `requiredSections`, `escapeMdxAttribute`, and `buildMdxRequirements` definitions from `tasks.ts`; stored task v2 accepts only the Zod-defined instruction fields above.

In `src/app/api/tasks/route.ts`, parse the `buildTaskFile(parsed.data)` result with `taskCreationResponseSchema` before returning it. In `src/lib/server/lessons.ts`, replace the handwritten `createdAt` property checks in `readGeneratedAt` with `storedTaskSchema.safeParse(JSON.parse(...))`; return `parsed.data.createdAt` only on success. Update the existing task assertions in `tests/local-domain.test.ts` and `tests/api-routes.test.ts` to assert `taskSlug` and remove `suggestedCommand` expectations.

- [ ] **Step 7: Run tests and commit**

Run:

```bash
pnpm test
pnpm types:check
```

Expected: PASS.

```bash
git add src/lib/generation-contracts.ts src/lib/server/task-schema.ts src/lib/server/task-store.ts src/lib/server/tasks.ts src/lib/server/lessons.ts src/app/api/tasks/route.ts tests/contracts.test.ts tests/local-domain.test.ts tests/api-routes.test.ts
git commit -m "feat: add versioned generation task storage"
```

## Task 3: Add canonical lesson labels, repository skill, and prompt builder

**Files:**
- Create: `src/lib/lesson-sections.ts`
- Create: `.agents/skills/generating-lesson/SKILL.md`
- Create: `.agents/skills/generating-lesson/references/lesson-contract.md`
- Create: `.agents/skills/generating-lesson/references/example-lesson.mdx`
- Create: `src/lib/server/lesson-prompt.ts`

- [ ] **Step 1: Define exact localized section labels**

Create `src/lib/lesson-sections.ts`:

```ts
import type { TargetLanguage } from '@/lib/contracts';

export const lessonSectionLabels = {
  en: {
    metadata: 'Video information',
    translation: 'Sentence-by-sentence translation',
    vocabulary: 'Vocabulary by CEFR level',
    grammar: 'Grammar by CEFR level',
    spokenUsage: 'Spoken usage',
  },
  zh: {
    metadata: '影片資訊',
    translation: '逐句翻譯',
    vocabulary: 'CEFR 分級詞彙',
    grammar: 'CEFR 分級文法',
    spokenUsage: '口語用法',
  },
} as const satisfies Record<TargetLanguage, Record<string, string>>;
```

- [ ] **Step 2: Create the repository skill**

Create `.agents/skills/generating-lesson/SKILL.md`:

```markdown
---
name: generating-lesson
description: Generate one complete language-learning lesson as MDX from a video transcript, target language, and CEFR levels. Use only when the prompt explicitly requests lesson MDX.
---

# Generate a language lesson

1. Read `references/lesson-contract.md` completely.
2. Read `references/example-lesson.mdx` before drafting.
3. Treat the transcript and learning settings in the prompt as the only lesson source.
4. Follow the requested target language and include every requested CEFR level.
5. Return only the final MDX. Do not add an introduction, explanation, or Markdown code fence.
6. Do not execute commands, browse the web, or edit files.
```

- [ ] **Step 3: Create the exact lesson contract**

Create `.agents/skills/generating-lesson/references/lesson-contract.md` with this normative structure:

```markdown
# Lesson contract — version 1

The first body node must be a self-closing `<YouTubeEmbed videoId="..." title="..." />`.
The next node must be the document's only level-one heading, containing the translated video title.

Use these level-two headings in this exact order.

For `en`: `Video information`, `Sentence-by-sentence translation`, `Vocabulary by CEFR level`, `Grammar by CEFR level`, `Spoken usage`.

For `zh`: `影片資訊`, `逐句翻譯`, `CEFR 分級詞彙`, `CEFR 分級文法`, `口語用法`.

Under vocabulary and grammar, add one level-three heading for every requested CEFR level, in the same order as the prompt. Do not add unrequested levels.

All headings, labels, explanations, notes, and metadata labels use the target language. Transcript quotations, proper nouns, URLs, video IDs, and code-like values may remain in their source language.

Translate every transcript segment in order. Preserve enough of the source sentence to make each translation traceable.

Use GitHub Flavored Markdown and static MDX only. Allowed JSX is `<YouTubeEmbed>` and simple table elements. Do not use JavaScript expressions, imports, exports, `<script>`, event handlers, code fences, or raw executable HTML.

Return final MDX only.
```

- [ ] **Step 4: Add a compact canonical example**

Create `.agents/skills/generating-lesson/references/example-lesson.mdx`:

```mdx
<YouTubeEmbed videoId="jNQXAC9IVRw" title="Me at the zoo" />

# Me at the Zoo

## Video information

- Source: YouTube
- Topic: Visiting a zoo

## Sentence-by-sentence translation

| Source | Translation |
| --- | --- |
| Here we are at the zoo. | Here we are at the zoo. |
| The elephants are behind me. | The elephants are behind me. |

## Vocabulary by CEFR level

### A2

- **zoo** — a place where people can see animals

### B1

- **behind** — at or toward the back of something

## Grammar by CEFR level

### A2

- **Here we are** introduces the speaker's current location.

### B1

- **Behind me** is a prepositional phrase describing position.

## Spoken usage

“Here we are” is common when announcing that someone has arrived somewhere.
```

- [ ] **Step 5: Build the generation prompt**

Create `src/lib/server/lesson-prompt.ts`:

```ts
import type { StoredTask } from './task-schema';

export function buildLessonPrompt(task: StoredTask) {
  const transcript = task.transcript.segments
    .map((segment, index) => `${index + 1}. [${segment.start.toFixed(2)}s] ${segment.text}`)
    .join('\n');

  return [
    'Use $generating-lesson to produce the final lesson.',
    'Return MDX only. Do not run commands, browse, or modify files.',
    `Target language: ${task.learningSettings.targetLanguage}`,
    `CEFR levels in required order: ${task.learningSettings.cefrLevels.join(', ')}`,
    `Video URL: ${task.video.url}`,
    `Video ID: ${task.video.id}`,
    `Video title: ${task.video.title}`,
    '',
    'Transcript:',
    transcript,
  ].join('\n');
}
```

- [ ] **Step 6: Type-check and commit**

Run `pnpm types:check`.

Expected: PASS.

```bash
git add .agents/skills/generating-lesson src/lib/lesson-sections.ts src/lib/server/lesson-prompt.ts
git commit -m "feat: add canonical lesson generation skill"
```

## Task 4: Add curated model registry and Codex readiness detection

**Files:**
- Create: `src/lib/server/model-registry.ts`
- Create: `src/lib/server/codex-status.ts`

- [ ] **Step 1: Add the server-only model registry**

Create `src/lib/server/model-registry.ts`:

```ts
import type { ModelPreset } from '@/lib/generation-contracts';

const models = {
  auto: undefined,
  fast: 'gpt-5.4-mini',
  best: 'gpt-5.5',
} as const satisfies Record<ModelPreset, string | undefined>;

export function resolveModelPreset(preset: ModelPreset) {
  return models[preset];
}
```

- [ ] **Step 2: Implement a login check that never reads credentials**

Create `src/lib/server/codex-status.ts`:

```ts
import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { CodexStatus } from '@/lib/generation-contracts';

const execFileAsync = promisify(execFile);

async function localCodexPath() {
  const filename = process.platform === 'win32' ? 'codex.cmd' : 'codex';
  const candidate = join(process.cwd(), 'node_modules', '.bin', filename);
  try {
    await access(candidate);
    return candidate;
  } catch {
    return 'codex';
  }
}

export async function getCodexStatus(): Promise<CodexStatus> {
  const executable = await localCodexPath();
  let version: string;
  try {
    const result = await execFileAsync(executable, ['--version'], { timeout: 5_000 });
    version = result.stdout.trim();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { status: 'not-installed' };
    }
    return { status: 'not-installed' };
  }

  try {
    await execFileAsync(executable, ['login', 'status'], { timeout: 5_000 });
    return { status: 'ready', version };
  } catch {
    return { status: 'not-authenticated', version };
  }
}
```

- [ ] **Step 3: Type-check and commit**

Run `pnpm types:check`.

Expected: PASS.

```bash
git add src/lib/server/model-registry.ts src/lib/server/codex-status.ts
git commit -m "feat: detect local Codex readiness"
```

## Task 5: Implement the read-only Codex SDK adapter and typed failures

**Files:**
- Create: `src/lib/server/generation-errors.ts`
- Create: `src/lib/server/codex-lesson-generator.ts`
- Modify: `next.config.mjs`

- [ ] **Step 1: Add typed public generation errors**

Create `src/lib/server/generation-errors.ts`:

```ts
import type { GenerationErrorCode } from '@/lib/generation-contracts';

const statusByCode: Record<GenerationErrorCode, number> = {
  CODEX_NOT_INSTALLED: 503,
  CODEX_NOT_AUTHENTICATED: 401,
  MODEL_UNAVAILABLE: 400,
  USAGE_LIMITED: 429,
  GENERATION_TIMEOUT: 504,
  GENERATION_INVALID: 422,
  GENERATION_FAILED: 502,
  GENERATION_IN_PROGRESS: 409,
  LESSON_EXISTS: 409,
  LESSON_WRITE_FAILED: 500,
};

export class GenerationError extends Error {
  constructor(
    public readonly code: GenerationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }

  get status() {
    return statusByCode[this.code];
  }
}
```

- [ ] **Step 2: Add the SDK interface and production adapter**

Create `src/lib/server/codex-lesson-generator.ts`:

```ts
import { Codex } from '@openai/codex-sdk';

import { GenerationError } from './generation-errors';

export type CodexGenerationInput = {
  prompt: string;
  model?: string;
  signal: AbortSignal;
};

export interface CodexLessonGenerator {
  generate(input: CodexGenerationInput): Promise<string>;
}

function classifyCodexFailure(error: unknown, signal: AbortSignal) {
  if (signal.aborted) {
    return new GenerationError('GENERATION_TIMEOUT', 'Lesson generation timed out.', { cause: error });
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/unable to locate Codex CLI|ENOENT/i.test(message)) {
    return new GenerationError('CODEX_NOT_INSTALLED', 'The local Codex runtime is unavailable.', { cause: error });
  }
  if (/not logged in|authentication|unauthorized|\b401\b/i.test(message)) {
    return new GenerationError('CODEX_NOT_AUTHENTICATED', 'Sign in to Codex and try again.', { cause: error });
  }
  if (/model.+(?:not found|not available|unsupported)/i.test(message)) {
    return new GenerationError('MODEL_UNAVAILABLE', 'The selected model is unavailable for this account.', { cause: error });
  }
  if (/rate limit|usage limit|quota|too many requests/i.test(message)) {
    return new GenerationError('USAGE_LIMITED', 'Codex usage is currently limited. Try again later.', { cause: error });
  }
  return new GenerationError('GENERATION_FAILED', 'Codex could not generate the lesson.', { cause: error });
}

export class OpenAICodexLessonGenerator implements CodexLessonGenerator {
  private readonly codex = new Codex({
    config: {
      history: { persistence: 'none' },
      web_search: 'disabled',
    },
  });

  async generate(input: CodexGenerationInput) {
    try {
      const thread = this.codex.startThread({
        workingDirectory: process.cwd(),
        model: input.model,
        sandboxMode: 'read-only',
        networkAccessEnabled: false,
        webSearchMode: 'disabled',
        approvalPolicy: 'never',
      });
      const result = await thread.run(input.prompt, { signal: input.signal });
      return result.finalResponse;
    } catch (error) {
      throw classifyCodexFailure(error, input.signal);
    }
  }
}
```

Keep the SDK and its native CLI package external to the Next.js server bundle. Update `next.config.mjs`:

```js
const config = {
  reactStrictMode: true,
  serverExternalPackages: ['@openai/codex-sdk', '@openai/codex'],
};
```

- [ ] **Step 3: Type-check and commit**

Run `pnpm types:check`.

Expected: PASS against `@openai/codex-sdk@0.142.3` (`sandboxMode`, `networkAccessEnabled`, `webSearchMode`, `approvalPolicy`, and `signal` are supported).

```bash
git add src/lib/server/generation-errors.ts src/lib/server/codex-lesson-generator.ts next.config.mjs
git commit -m "feat: add read-only Codex lesson adapter"
```

## Task 6: Validate generated MDX with the parser and lesson contract

**Files:**
- Modify: `src/lib/lesson-mdx-options.ts`
- Create: `src/lib/server/lesson-validator.ts`
- Create: `tests/fixtures/valid-generated-lesson.mdx`
- Create: `tests/lesson-generation.test.ts`

- [ ] **Step 1: Add failing validator tests**

Create `tests/fixtures/valid-generated-lesson.mdx`:

```mdx
<YouTubeEmbed videoId="jNQXAC9IVRw" title="Me at the zoo" />

# 我在動物園

## 影片資訊

- 來源：YouTube
- 主題：參觀動物園

## 逐句翻譯

| 原文 | 翻譯 |
| --- | --- |
| Here we are at the zoo. | 我們現在在動物園。 |
| The elephants are behind me. | 大象就在我身後。 |

## CEFR 分級詞彙

### A2

- **zoo**：動物園

### B1

- **behind**：位於某物後方

## CEFR 分級文法

### A2

- **Here we are** 用來表示已抵達目前的位置。

### B1

- **Behind me** 是描述位置的介系詞片語。

## 口語用法

抵達某處時，口語常用 “Here we are”。
```

Create `tests/lesson-generation.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { validateLessonMdx } from '@/lib/server/lesson-validator.ts';

const task = {
  video: { id: 'jNQXAC9IVRw' },
  learningSettings: { targetLanguage: 'zh' as const, cefrLevels: ['A2', 'B1'] as const },
};

describe('validateLessonMdx', () => {
  it('accepts the canonical generated lesson', async () => {
    const content = await readFile('tests/fixtures/valid-generated-lesson.mdx', 'utf8');
    await assert.doesNotReject(() => validateLessonMdx(content, task));
  });

  it('rejects missing levels, code fences, and executable MDX', async () => {
    const content = await readFile('tests/fixtures/valid-generated-lesson.mdx', 'utf8');
    await assert.rejects(() => validateLessonMdx(content.replace('### B1', '### C1'), task), /B1/);
    await assert.rejects(() => validateLessonMdx(`\`\`\`mdx\n${content}\n\`\`\``, task), /code fence/);
    await assert.rejects(() => validateLessonMdx(`${content}\n\n{globalThis.process.exit()}`, task), /rejected/);
  });

  it('rejects an incorrect embed or required section order', async () => {
    const content = await readFile('tests/fixtures/valid-generated-lesson.mdx', 'utf8');
    await assert.rejects(() => validateLessonMdx(content.replace('jNQXAC9IVRw', 'abcdefghijk'), task), /videoId/);
    const swapped = content
      .replace('## 逐句翻譯', '## __TEMP__')
      .replace('## 口語用法', '## 逐句翻譯')
      .replace('## __TEMP__', '## 口語用法');
    await assert.rejects(
      () => validateLessonMdx(swapped, task),
      /section order/,
    );
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run `pnpm test`.

Expected: FAIL because `validateLessonMdx` does not exist.

- [ ] **Step 3: Export the existing generated-MDX safety plugin**

In `src/lib/lesson-mdx-options.ts`, add `'html'` to `rejectedNodeTypes`, then change `function validateGeneratedMdx()` to:

```ts
export function validateGeneratedMdx() {
```

Do not duplicate the JSX allowlist or expression rejection logic.

- [ ] **Step 4: Implement parser-backed lesson validation**

Create `src/lib/server/lesson-validator.ts`. Use `unified().use(remarkParse).use(remarkMdx).use(remarkGfm)` and run the exported `validateGeneratedMdx` plugin. Then inspect the parsed `Root` using `mdast-util-to-string`:

```ts
import type { Root, RootContent } from 'mdast';
import { toString } from 'mdast-util-to-string';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import type { CefrLevel, TargetLanguage } from '@/lib/contracts';
import { validateGeneratedMdx } from '@/lib/lesson-mdx-options';
import { lessonSectionLabels } from '@/lib/lesson-sections';
import { GenerationError } from './generation-errors';

type ValidationTask = {
  video: { id: string };
  learningSettings: { targetLanguage: TargetLanguage; cefrLevels: readonly CefrLevel[] };
};

function invalid(message: string): never {
  throw new GenerationError('GENERATION_INVALID', `Generated lesson is invalid: ${message}`);
}

function headingText(node: RootContent | undefined, depth: number) {
  return node?.type === 'heading' && node.depth === depth ? toString(node).trim() : null;
}

function attribute(node: RootContent, name: string) {
  if (node.type !== 'mdxJsxFlowElement') return null;
  const value = node.attributes.find(
    (item) => item.type === 'mdxJsxAttribute' && item.name === name && typeof item.value === 'string',
  );
  return value && typeof value.value === 'string' ? value.value : null;
}

function sectionNodes(children: RootContent[], headingIndex: number) {
  const end = children.findIndex((node, index) => index > headingIndex && headingText(node, 2) !== null);
  return children.slice(headingIndex + 1, end === -1 ? children.length : end);
}

export async function validateLessonMdx(content: string, task: ValidationTask) {
  if (!content.trim()) invalid('content is empty');
  if (/^```|```$/m.test(content)) invalid('outer code fence is not allowed');

  const processor = unified().use(remarkParse).use(remarkMdx).use(remarkGfm).use(validateGeneratedMdx);
  const tree = processor.parse(content) as Root;
  await processor.run(tree);
  const children = tree.children;

  const embed = children[0];
  if (embed?.type !== 'mdxJsxFlowElement' || embed.name !== 'YouTubeEmbed') invalid('YouTubeEmbed must be first');
  if (attribute(embed, 'videoId') !== task.video.id) invalid('YouTubeEmbed videoId does not match the task');
  if (headingText(children[1]!, 1) === null) invalid('one H1 must immediately follow YouTubeEmbed');
  if (children.filter((node) => headingText(node, 1) !== null).length !== 1) invalid('exactly one H1 is required');

  const labels = Object.values(lessonSectionLabels[task.learningSettings.targetLanguage]);
  const h2 = children.map((node, index) => ({ index, text: headingText(node, 2) })).filter((item) => item.text !== null);
  if (JSON.stringify(h2.map((item) => item.text)) !== JSON.stringify(labels)) invalid('required section order is incorrect');

  for (const label of [lessonSectionLabels[task.learningSettings.targetLanguage].vocabulary, lessonSectionLabels[task.learningSettings.targetLanguage].grammar]) {
    const section = h2.find((item) => item.text === label);
    if (!section) invalid(`${label} section is missing`);
    const levels = sectionNodes(children, section.index).map((node) => headingText(node, 3)).filter(Boolean);
    if (JSON.stringify(levels) !== JSON.stringify(task.learningSettings.cefrLevels)) {
      invalid(`${label} must contain exactly ${task.learningSettings.cefrLevels.join(', ')} in order`);
    }
  }

  return content;
}
```

During implementation, preserve these exact checks but adjust narrow AST typings if the installed `remark-mdx` types require it; do not replace parser checks with regex-based schema parsing.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
pnpm test
pnpm types:check
```

Expected: PASS.

```bash
git add src/lib/lesson-mdx-options.ts src/lib/server/lesson-validator.ts tests/fixtures/valid-generated-lesson.mdx tests/lesson-generation.test.ts
git commit -m "feat: validate generated lesson mdx"
```

## Task 7: Add no-overwrite writer and generation coordinator

**Files:**
- Create: `src/lib/server/lesson-writer.ts`
- Create: `src/lib/server/generate-lesson.ts`
- Modify: `tests/lesson-generation.test.ts`

- [ ] **Step 1: Add failing writer and coordinator tests**

Append tests that use `mkdtemp` and a fake generator:

```ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generateLesson } from '@/lib/server/generate-lesson.ts';
import { ensureLocalDirs } from '@/lib/server/local-paths.ts';
import { writeLessonOnce } from '@/lib/server/lesson-writer.ts';
import { storedTaskSchema } from '@/lib/server/task-schema.ts';

async function createStoredTaskFixture() {
  const rootDir = await mkdtemp(join(tmpdir(), 'generation-task-'));
  const { tasksDir } = await ensureLocalDirs(rootDir);
  const task = storedTaskSchema.parse({
    schemaVersion: 2,
    createdAt: '2026-06-28T00:00:00.000Z',
    video: {
      url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      id: 'jNQXAC9IVRw',
      title: 'Me at the zoo',
    },
    transcript: {
      source: 'youtube-transcript.io',
      segments: [{ text: 'Here we are at the zoo.', start: 0, duration: 1 }],
    },
    learningSettings: { targetLanguage: 'zh', cefrLevels: ['A2', 'B1'] },
    output: { format: 'mdx', path: '.local/lessons/lesson.mdx' },
    instructions: {
      requiredSections: ['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage'],
    },
    generation: { status: 'pending', skillVersion: '1' },
  });
  await writeFile(join(tasksDir, 'lesson.json'), `${JSON.stringify(task, null, 2)}\n`, 'utf8');
  return rootDir;
}

const getReadyStatus = async () => ({ status: 'ready' as const, version: 'codex-cli test' });

it('atomically creates a lesson and refuses overwrite', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'lesson-writer-'));
  await writeLessonOnce({ rootDir, slug: 'lesson', content: '# First' });
  await assert.rejects(() => writeLessonOnce({ rootDir, slug: 'lesson', content: '# Second' }), /already exists/);
  assert.equal(await readFile(join(rootDir, '.local/lessons/lesson.mdx'), 'utf8'), '# First');
});

it('does not write invalid generated output', async () => {
  const rootDir = await createStoredTaskFixture();
  await assert.rejects(
    () => generateLesson({ slug: 'lesson', modelPreset: 'best', rootDir }, {
      generator: { generate: async () => '# invalid' },
      getStatus: getReadyStatus,
    }),
    /invalid/i,
  );
  await assert.rejects(() => readFile(join(rootDir, '.local/lessons/lesson.mdx'), 'utf8'), /ENOENT/);
});

it('rejects an existing lesson before spending a model call', async () => {
  const rootDir = await createStoredTaskFixture();
  const { lessonsDir } = await ensureLocalDirs(rootDir);
  await writeFile(join(lessonsDir, 'lesson.mdx'), '# Existing', 'utf8');
  let calls = 0;
  await assert.rejects(
    () => generateLesson({ slug: 'lesson', modelPreset: 'best', rootDir }, {
      generator: { generate: async () => { calls += 1; return '# replacement'; } },
      getStatus: getReadyStatus,
    }),
    /already exists/,
  );
  assert.equal(calls, 0);
});

it('rejects concurrent generation before a second model call', async () => {
  const rootDir = await createStoredTaskFixture();
  const validLesson = await readFile('tests/fixtures/valid-generated-lesson.mdx', 'utf8');
  let calls = 0;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const generator = { generate: async () => { calls += 1; await blocked; return validLesson; } };
  const first = generateLesson({ slug: 'lesson', modelPreset: 'best', rootDir }, { generator, getStatus: getReadyStatus });
  await assert.rejects(
    () => generateLesson({ slug: 'lesson', modelPreset: 'best', rootDir }, { generator, getStatus: getReadyStatus }),
    /already being generated/,
  );
  release();
  await first;
  assert.equal(calls, 1);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run `pnpm test`.

Expected: FAIL because writer and coordinator modules do not exist.

- [ ] **Step 3: Implement atomic no-overwrite lesson creation**

Create `src/lib/server/lesson-writer.ts`:

```ts
import { access, link, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { localSlugSchema } from '@/lib/generation-contracts';
import { ensureLocalDirs } from './local-paths';
import { GenerationError } from './generation-errors';

export async function lessonExists(input: { rootDir?: string; slug: string }) {
  if (!localSlugSchema.safeParse(input.slug).success) return false;
  const { lessonsDir } = await ensureLocalDirs(input.rootDir);
  try {
    await access(join(lessonsDir, `${input.slug}.mdx`));
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw new GenerationError('LESSON_WRITE_FAILED', 'The lesson path could not be checked.', { cause: error });
  }
}

export async function writeLessonOnce(input: { rootDir?: string; slug: string; content: string }) {
  if (!localSlugSchema.safeParse(input.slug).success) {
    throw new GenerationError('LESSON_WRITE_FAILED', 'Invalid lesson slug.');
  }
  const { lessonsDir } = await ensureLocalDirs(input.rootDir);
  const finalPath = join(lessonsDir, `${input.slug}.mdx`);
  const tempPath = join(lessonsDir, `.${input.slug}.${process.pid}.${Date.now()}.tmp`);
  try {
    await writeFile(tempPath, input.content, { encoding: 'utf8', flag: 'wx' });
    await link(tempPath, finalPath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      throw new GenerationError('LESSON_EXISTS', 'A lesson already exists for this task.', { cause: error });
    }
    throw new GenerationError('LESSON_WRITE_FAILED', 'The lesson could not be saved.', { cause: error });
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
  return { lessonSlug: input.slug, lessonPath: `.local/lessons/${input.slug}.mdx` };
}
```

- [ ] **Step 4: Implement the coordinator with dependency injection**

Create `src/lib/server/generate-lesson.ts`:

```ts
import { resolve } from 'node:path';

import type { ModelPreset } from '@/lib/generation-contracts';
import { OpenAICodexLessonGenerator, type CodexLessonGenerator } from './codex-lesson-generator';
import { getCodexStatus } from './codex-status';
import { GenerationError } from './generation-errors';
import { buildLessonPrompt } from './lesson-prompt';
import { validateLessonMdx } from './lesson-validator';
import { lessonExists, writeLessonOnce } from './lesson-writer';
import { resolveModelPreset } from './model-registry';
import { readTask, updateTaskGeneration } from './task-store';
import type { StoredTask } from './task-schema';

type GenerateLessonInput = {
  slug: string;
  modelPreset: ModelPreset;
  rootDir?: string;
  signal?: AbortSignal;
};
type GenerateLessonDependencies = {
  generator?: CodexLessonGenerator;
  getStatus?: typeof getCodexStatus;
  timeoutMs?: number;
};

const activeTasks = new Set<string>();

export async function generateLesson(
  input: GenerateLessonInput,
  dependencies: GenerateLessonDependencies = {},
): Promise<{ lessonSlug: string; lessonPath: string }> {
  const dataRoot = resolve(input.rootDir ?? process.env.LOCAL_DATA_ROOT ?? process.cwd());
  const lockKey = `${dataRoot}:${input.slug}`;
  if (activeTasks.has(lockKey)) {
    throw new GenerationError('GENERATION_IN_PROGRESS', 'This task is already being generated.');
  }

  activeTasks.add(lockKey);
  let task: StoredTask | undefined;
  let startedAt: string | undefined;
  let codexVersion: string | undefined;
  const requestedModel = resolveModelPreset(input.modelPreset);

  try {
    task = await readTask(input.slug, input.rootDir);
    startedAt = new Date().toISOString();
    if (await lessonExists({ rootDir: input.rootDir, slug: input.slug })) {
      throw new GenerationError('LESSON_EXISTS', 'A lesson already exists for this task.');
    }
    const status = await (dependencies.getStatus ?? getCodexStatus)();
    if (status.status === 'not-installed') {
      throw new GenerationError('CODEX_NOT_INSTALLED', 'The local Codex runtime is unavailable.');
    }
    if (status.status === 'not-authenticated') {
      throw new GenerationError('CODEX_NOT_AUTHENTICATED', 'Sign in to Codex and try again.');
    }
    codexVersion = status.version;
    await updateTaskGeneration(input.slug, {
      status: 'pending',
      skillVersion: task.generation.skillVersion,
      modelPreset: input.modelPreset,
      requestedModel,
      codexVersion,
      startedAt,
    }, input.rootDir);

    const generator = dependencies.generator ?? new OpenAICodexLessonGenerator();
    const timeoutSignal = AbortSignal.timeout(dependencies.timeoutMs ?? 180_000);
    const content = await generator.generate({
      prompt: buildLessonPrompt(task),
      model: requestedModel,
      signal: input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal,
    });
    await validateLessonMdx(content, task);
    const result = await writeLessonOnce({ rootDir: input.rootDir, slug: input.slug, content });
    await updateTaskGeneration(input.slug, {
      status: 'succeeded',
      skillVersion: task.generation.skillVersion,
      modelPreset: input.modelPreset,
      requestedModel,
      codexVersion,
      startedAt,
      completedAt: new Date().toISOString(),
    }, input.rootDir);
    return result;
  } catch (cause) {
    const error = cause instanceof GenerationError
      ? cause
      : new GenerationError('GENERATION_FAILED', 'Codex could not generate the lesson.', { cause });
    if (task && startedAt) {
      await updateTaskGeneration(input.slug, {
        status: 'failed',
        skillVersion: task.generation.skillVersion,
        modelPreset: input.modelPreset,
        requestedModel,
        codexVersion,
        startedAt,
        completedAt: new Date().toISOString(),
        errorCode: error.code,
      }, input.rootDir).catch(() => undefined);
    }
    throw error;
  } finally {
    activeTasks.delete(lockKey);
  }
}
```

Do not store raw output or raw exception messages in the task JSON.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
pnpm test
pnpm types:check
```

Expected: PASS; fake generation makes no live Codex call.

```bash
git add src/lib/server/lesson-writer.ts src/lib/server/generate-lesson.ts tests/lesson-generation.test.ts
git commit -m "feat: coordinate safe lesson generation"
```

## Task 8: Expose Codex status and generation routes

**Files:**
- Modify: `src/lib/server/http.ts`
- Create: `src/app/api/codex/status/route.ts`
- Create: `src/app/api/tasks/[slug]/generate/route.ts`

- [ ] **Step 1: Extend JSON errors without breaking existing callers**

Change `jsonError` in `src/lib/server/http.ts` to:

```ts
export function jsonError(message: string, status = 400, code?: string) {
  return NextResponse.json(code ? { error: message, code } : { error: message }, { status });
}
```

- [ ] **Step 2: Add the status route**

Create `src/app/api/codex/status/route.ts`:

```ts
import { NextResponse } from 'next/server';

import { codexStatusSchema } from '@/lib/generation-contracts';
import { getCodexStatus } from '@/lib/server/codex-status';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(codexStatusSchema.parse(await getCodexStatus()));
}
```

- [ ] **Step 3: Add the task generation route**

Create `src/app/api/tasks/[slug]/generate/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { generateLessonRequestSchema, generateLessonResponseSchema, localSlugSchema } from '@/lib/generation-contracts';
import { generateLesson } from '@/lib/server/generate-lesson';
import { GenerationError } from '@/lib/server/generation-errors';
import { jsonError } from '@/lib/server/http';

const paramsSchema = z.strictObject({ slug: localSlugSchema });

type RouteContext = { params: Promise<unknown> };

export const runtime = 'nodejs';

export async function POST(request: Request, context: RouteContext) {
  try {
    const params = paramsSchema.safeParse(await context.params);
    const body = generateLessonRequestSchema.safeParse(await request.json().catch(() => null));
    if (!params.success || !body.success) return jsonError('Invalid generation request.');

    return NextResponse.json(generateLessonResponseSchema.parse(await generateLesson({
      slug: params.data.slug,
      modelPreset: body.data.modelPreset,
      signal: request.signal,
    })));
  } catch (error) {
    if (error instanceof GenerationError) return jsonError(error.message, error.status, error.code);
    return jsonError('Lesson generation failed.', 500, 'GENERATION_FAILED');
  }
}
```

- [ ] **Step 4: Type-check and manually probe validation only**

Run:

```bash
pnpm types:check
pnpm test
```

Expected: PASS. Do not send a live generation request yet.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/http.ts src/app/api/codex/status/route.ts src/app/api/tasks/'[slug]'/generate/route.ts
git commit -m "feat: expose local Codex generation routes"
```

## Task 9: Add the three-step generation UI

**Files:**
- Create: `src/app/get-started/codex-generation-step.tsx`
- Modify: `src/app/get-started/get-started-client.tsx`

- [ ] **Step 1: Create the focused generation step component**

Create `src/app/get-started/codex-generation-step.tsx`:

```tsx
'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ZodType } from 'zod';

import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  apiErrorResponseSchema,
  codexStatusSchema,
  generateLessonResponseSchema,
  type ModelPreset,
} from '@/lib/generation-contracts';

type CodexGenerationStepProps = { taskSlug: string | null };

async function readJson<T>(response: Response, schema: ZodType<T>): Promise<T> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = apiErrorResponseSchema.safeParse(payload);
    throw new Error(error.success ? error.data.error : 'Request failed.');
  }
  return schema.parse(payload);
}

const modelOptions: Array<{ value: ModelPreset; label: string; description: string }> = [
  { value: 'auto', label: 'Auto', description: 'Use the current Codex default.' },
  { value: 'fast', label: 'Fast', description: 'Faster generation for shorter lessons.' },
  { value: 'best', label: 'Best quality', description: 'More consistent lesson quality.' },
];

export function CodexGenerationStep({ taskSlug }: CodexGenerationStepProps) {
  const router = useRouter();
  const [modelPreset, setModelPreset] = useState<ModelPreset>('best');
  const statusQuery = useQuery({
    queryKey: ['codex-status'],
    queryFn: async () => readJson(await fetch('/api/codex/status'), codexStatusSchema),
  });
  const generation = useMutation({
    mutationFn: async () => {
      if (!taskSlug) throw new Error('Prepare a lesson task first.');
      return readJson(await fetch(`/api/tasks/${taskSlug}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelPreset }),
      }), generateLessonResponseSchema);
    },
    onSuccess: ({ lessonSlug }) => router.push(`/lessons/${lessonSlug}`),
  });
  const status = statusQuery.data?.status;

  return (
    <section className="rounded-md border bg-card p-5 text-card-foreground">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-violet-700 text-white">
          <Sparkles className="size-4" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold text-foreground">3. Generate lesson</h2>
      </div>

      <div className="mt-5 flex items-center gap-3 text-sm">
        <span>Codex: {statusQuery.isPending ? 'Checking…' : status ?? 'Unavailable'}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => statusQuery.refetch()}>
          <RefreshCw data-icon="inline-start" aria-hidden /> Check again
        </Button>
      </div>

      {status === 'not-authenticated' ? (
        <div className="mt-4 rounded-md bg-muted p-4 text-sm">
          <p>Sign in with your own ChatGPT/Codex account, then check again.</p>
          <div className="mt-3 flex items-center gap-2">
            <code>pnpm exec codex login</code>
            <Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard.writeText('pnpm exec codex login')}>
              <Copy data-icon="inline-start" aria-hidden /> Copy
            </Button>
          </div>
        </div>
      ) : null}

      {status === 'not-installed' ? (
        <p className="mt-4 rounded-md bg-muted p-4 text-sm">Run <code>pnpm install</code> to install the local Codex runtime.</p>
      ) : null}

      <FieldSet className="mt-5">
        <FieldLegend variant="label">Model</FieldLegend>
        <RadioGroup value={modelPreset} onValueChange={(value) => setModelPreset(value as ModelPreset)}>
          {modelOptions.map((option) => (
            <Field key={option.value} orientation="horizontal" className="rounded-md border p-3">
              <RadioGroupItem id={`model-${option.value}`} value={option.value} />
              <FieldLabel htmlFor={`model-${option.value}`}>
                <span>{option.label}</span>
                <span className="block font-normal text-muted-foreground">{option.description}</span>
              </FieldLabel>
            </Field>
          ))}
        </RadioGroup>
      </FieldSet>

      <p className="mt-4 text-sm text-muted-foreground">
        The transcript is processed through your own signed-in Codex account and usage allowance.
      </p>
      <Button
        className="mt-5 w-fit"
        size="lg"
        type="button"
        disabled={!taskSlug || status !== 'ready' || generation.isPending}
        onClick={() => generation.mutate()}
      >
        {generation.isPending ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <Sparkles data-icon="inline-start" aria-hidden />}
        {generation.isPending ? 'Generating lesson…' : 'Generate Lesson'}
      </Button>
      {generation.error ? <p className="mt-4 text-sm text-destructive">{generation.error.message}</p> : null}
    </section>
  );
}
```

- [ ] **Step 2: Connect task creation to step three**

In `src/app/get-started/get-started-client.tsx`:

1. Remove handwritten `TranscriptResponse` and `TaskResponse`; infer them from `transcriptBundleSchema` and `taskCreationResponseSchema`.
2. Import and render `<CodexGenerationStep taskSlug={taskMutation.data?.taskSlug ?? null} />` after the settings section.
3. Change the step-two button label from **Create Local Task** to **Prepare Lesson**.
4. Replace the black manual-command panel with a neutral `Task ready` panel showing only `taskPath` and `outputPath`.
5. Reset `taskMutation` when a new transcript is requested and whenever target language or selected CEFR levels change, so generation cannot use stale settings.
6. Keep transcript and task mutations separate; step three starts only after task creation succeeds.

Replace the generic cast in `postJson` with Zod response parsing:

```ts
import type { ZodType } from 'zod';
import { transcriptBundleSchema } from '@/lib/contracts';
import { apiErrorResponseSchema, taskCreationResponseSchema } from '@/lib/generation-contracts';

async function postJson<T>(url: string, body: unknown, schema: ZodType<T>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const parsedError = apiErrorResponseSchema.safeParse(payload);
    throw new Error(parsedError.success ? parsedError.data.error : 'Request failed.');
  }
  return schema.parse(payload);
}
```

Call it with `transcriptBundleSchema` for `/api/transcripts` and `taskCreationResponseSchema` for `/api/tasks`. Success and error payloads are parsed with Zod-defined schemas.

Use these state handlers so a prepared task cannot outlive changed settings:

```ts
function selectTargetLanguage(value: LearningSettings['targetLanguage']) {
  setTargetLanguage(value);
  taskMutation.reset();
}

function toggleLevel(level: CefrLevel) {
  taskMutation.reset();
  setSelectedLevels((current) =>
    current.includes(level) ? current.filter((item) => item !== level) : [...current, level],
  );
}
```

Wire the target-language `RadioGroup` to `selectTargetLanguage(value as LearningSettings['targetLanguage'])`. `submitUrl` already resets `taskMutation` before fetching another transcript.

- [ ] **Step 3: Run static verification**

Run:

```bash
pnpm lint
pnpm types:check
pnpm test
```

Expected: all commands PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/get-started/codex-generation-step.tsx src/app/get-started/get-started-client.tsx
git commit -m "feat: add one-click lesson generation ui"
```

## Task 10: Record deferred unit/API suites with `it.skip`

**Files:**
- Create: `tests/get-started-generation.test.ts`
- Create: `tests/generating-lesson-skill.test.ts`
- Modify: `tests/api-routes.test.ts`

- [ ] **Step 1: Record deferred component behavior**

Create `tests/get-started-generation.test.ts` with no imports beyond `node:test` and no test bodies:

```ts
import { describe, it } from 'node:test';

describe('CodexGenerationStep', () => {
  it.skip('shows installation guidance when the local Codex runtime is unavailable');
  it.skip('shows a copyable login command when Codex is not authenticated');
  it.skip('defaults to Best quality and submits only the curated preset ID');
  it.skip('disables generation until both a task and ready Codex status exist');
  it.skip('shows generation progress and navigates to the completed lesson');
  it.skip('shows a targeted recovery message for every public generation error code');
});
```

- [ ] **Step 2: Record deferred skill contract behavior**

Create `tests/generating-lesson-skill.test.ts`:

```ts
import { describe, it } from 'node:test';

describe('generating-lesson skill contract', () => {
  it.skip('declares the stable skill name and lesson-only trigger description');
  it.skip('requires the contract and canonical example to be read before generation');
  it.skip('keeps localized headings synchronized with lessonSectionLabels');
  it.skip('keeps the example lesson valid against the production lesson validator');
});
```

- [ ] **Step 3: Record deferred API behavior**

Append to `tests/api-routes.test.ts` and update its `node:test` import to include `describe` and `it`:

```ts
describe('Codex generation API', () => {
  it.skip('GET /api/codex/status returns each Zod-defined readiness state');
  it.skip('POST /api/tasks/[slug]/generate rejects invalid slugs and model presets');
  it.skip('POST /api/tasks/[slug]/generate maps every GenerationError to its stable status and code');
  it.skip('POST /api/tasks/[slug]/generate returns the validated lesson slug and path');
  it.skip('POST /api/tasks/[slug]/generate never exposes raw SDK errors');
});
```

- [ ] **Step 4: Verify skipped tests are visible**

Run `pnpm test`.

Expected: active tests PASS and the new descriptions are reported as skipped; no Codex request occurs.

- [ ] **Step 5: Commit**

```bash
git add tests/get-started-generation.test.ts tests/generating-lesson-skill.test.ts tests/api-routes.test.ts
git commit -m "test: document deferred generation coverage"
```

## Task 11: Document setup and perform full MVP verification

**Files:**
- Modify: `README.md`
- Modify: `.env.example` only if wording needs clarification; do not add an AI key.

- [ ] **Step 1: Update the README workflow and prerequisites**

Replace the manual Codex command step with:

1. Install project dependencies.
2. Run `pnpm exec codex login` and choose ChatGPT sign-in.
3. Start the app, fetch a transcript, choose settings, prepare the task, select a model preset, and generate.
4. Explain that each installation uses its own ChatGPT/Codex account and usage allowance.
5. Explain that credentials remain in the normal user-level Codex credential store; `.local` contains only tasks and lessons.
6. State that no `OPENAI_API_KEY` or Gateway key is used.

- [ ] **Step 2: Run all non-live verification**

Run:

```bash
pnpm test
pnpm lint
pnpm types:check
pnpm build
```

Expected: every command exits 0; tests show the documented deferred suites as skipped; no live Codex usage occurs.

- [ ] **Step 3: Perform one explicit manual account smoke test**

Only after confirming the user wants to spend one Codex request:

```bash
pnpm exec codex login status
pnpm dev
```

In the browser:

1. Confirm signed-out guidance if applicable, then run `pnpm exec codex login` in a terminal.
2. Press **Check again** and confirm Ready.
3. Generate one short fixture lesson with Best quality.
4. Confirm the resulting page renders all required sections and `.local/lessons/<slug>.mdx` exists.
5. Restart `pnpm dev`, press **Check again**, and confirm login is reused.
6. Confirm no credentials or tokens exist under `.local`.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md .env.example
git commit -m "docs: explain local Codex lesson generation"
```

- [ ] **Step 5: Inspect the final branch**

Run:

```bash
git status --short
git log --oneline --decorate -12
```

Expected: clean worktree and focused commits matching Tasks 1–11.
