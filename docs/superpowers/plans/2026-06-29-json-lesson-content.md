# JSON Lesson Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace generated lesson MDX with task-normalized Zod JSON and render the resulting typed content through a React `Lesson` component.

**Architecture:** A single Zod schema defines the persisted lesson contract. A task-aware parser catches JSON and schema failures, replaces model-authored source metadata with trusted task values, and writes normalized `.json` files. Lesson discovery, page rendering, table-of-contents generation, and export consume `LessonContent` rather than Markdown.

**Tech Stack:** TypeScript 6, Zod 4, React 19, Next.js 16 App Router, Node test runner, pnpm 11 under nvm Node.js 24.11.1.

---

## Runtime command convention

Run every Node or package-manager command through the repository-required runtime:

```bash
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
source "$NVM_DIR/nvm.sh"
nvm use 24.11.1 --silent
```

Invoke pnpm only as `$NVM_BIN/pnpm`. Use `$NVM_BIN/node --import tsx --test <test-file>` for targeted Node test runs.

## File structure

**Create:**

- `src/lib/lesson-content.ts` — Zod contract, inferred lesson types, fallbacks, task-aware parsing, timestamp formatting, and plain-text serialization.
- `src/components/lesson.tsx` — deterministic lesson presentation from `LessonContent`.
- `tests/lesson-content.test.ts` — active schema, fallback, normalization, and serialization tests.
- `tests/lesson-rendering.test.ts` — skipped rendering specifications only.
- `tests/fixtures/valid-generated-lesson.json` — canonical valid model response fixture.
- `.agents/skills/generating-lesson/references/example-lesson.json` — canonical skill example.

**Modify:**

- `src/lib/server/task-schema.ts` — bump task/skill versions and declare JSON output.
- `src/lib/server/tasks.ts` — create `.json` output paths.
- `src/lib/server/generate-lesson.ts` — normalize raw model output instead of validating MDX.
- `src/lib/server/lesson-writer.ts` — atomically persist `.json`.
- `src/lib/server/generation-error-log.ts` — store raw attempts as `generated.json`.
- `src/lib/server/lessons.ts` — JSON-only discovery and typed reads.
- `src/lib/generation-contracts.ts` — keep API paths aligned with JSON lessons.
- `src/lib/lesson-sections.ts` — retain localized labels and add deterministic heading IDs/TOC generation.
- `src/app/lessons/[slug]/page.tsx` — render `<Lesson>` and structured TOC.
- `src/app/api/exports/notion/route.ts` — export deterministic plain text.
- `.agents/skills/generating-lesson/SKILL.md` — JSON-only generation workflow.
- `.agents/skills/generating-lesson/references/lesson-contract.md` — semantic JSON contract.
- `tests/local-domain.test.ts` — JSON task and lesson-domain expectations.
- `tests/lesson-generation.test.ts` — JSON generation, fallback, persistence, and diagnostics.
- `tests/lesson-toc.test.ts` — replace active generated-MDX tests with skipped rendering specifications in the new rendering test file.
- `package.json` and `pnpm-lock.yaml` — remove dependencies used only by generated lesson MDX after verifying documentation MDX does not import them directly.

**Delete:**

- `src/lib/lesson-mdx.tsx`
- `src/lib/lesson-mdx-options.ts`
- `src/lib/lesson-toc.ts`
- `src/lib/server/lesson-validator.ts`
- `tests/generating-lesson-skill.test.ts`
- `tests/lesson-toc.test.ts`
- `tests/fixtures/valid-generated-lesson.mdx`
- `.agents/skills/generating-lesson/references/example-lesson.mdx`

`src/components/mdx.tsx` stays because documentation pages import it. Remove only its lesson-specific `YouTubeEmbed`, `th`, and `td` registrations if no documentation content relies on them; preserve the generic Fumadocs component merge.

### Task 1: Define the Zod lesson contract

**Files:**

- Create: `tests/lesson-content.test.ts`
- Create: `src/lib/lesson-content.ts`

- [ ] **Step 1: Write failing schema and fallback tests**

Create tests that establish the public API and verify valid parsing, unknown-key stripping, field catches, and whole-object fallback:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createFallbackLesson,
  lessonSchema,
  parseLessonValue,
} from '@/lib/lesson-content.ts';

const fallback = createFallbackLesson({
  video: { id: 'jNQXAC9IVRw', title: 'Me at the zoo' },
  targetLanguage: 'zh',
  cefrLevels: ['A2', 'B1'],
  transcriptSource: 'youtube-transcript.io',
  transcripts: [{ time: '00:00', source: 'Here we are.', translation: 'Here we are.' }],
});

describe('lessonSchema', () => {
  it('parses valid content and strips unknown keys', () => {
    const result = lessonSchema.parse({
      ...fallback,
      unknown: 'removed',
      video: { ...fallback.video, unknown: 'removed' },
    });

    assert.equal('unknown' in result, false);
    assert.equal('unknown' in result.video, false);
  });

  it('catches malformed nested fields without discarding valid siblings', () => {
    const result = parseLessonValue(
      { ...fallback, video: { ...fallback.video, translatedTitle: 42 }, spokenUsage: false },
      fallback,
    );

    assert.equal(result.video.translatedTitle, fallback.video.translatedTitle);
    assert.deepEqual(result.spokenUsage, []);
    assert.deepEqual(result.transcripts, fallback.transcripts);
  });

  it('returns the supplied fallback for an invalid document value', () => {
    assert.deepEqual(parseLessonValue(null, fallback), fallback);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
$NVM_BIN/node --import tsx --test tests/lesson-content.test.ts
```

Expected: FAIL because `@/lib/lesson-content.ts` does not exist.

- [ ] **Step 3: Implement the schema and fallback factory**

Use `z.object`, which strips unknown keys, and `z.partialRecord`, because Zod 4's `z.record(z.enum(...), ...)` requires every enum key:

```ts
import { z } from 'zod';

import {
  cefrLevelSchema,
  targetLanguageSchema,
  type CefrLevel,
  type TargetLanguage,
} from '@/lib/contracts';

const text = z.string().catch('');
const blankExample = { source: '', translation: '' };
const blankVocab = { source: '', translation: '', usage: '' };
const blankGrammar = { title: '', explanation: '', examples: [] };
const blankSpokenUsage = { title: '', explanation: '', examples: [] };
const exampleSchema = z.object({ source: text, translation: text }).catch(blankExample);
const vocabItemSchema = z.object({ source: text, translation: text, usage: text }).catch(blankVocab);
const grammarItemSchema = z.object({
  title: text,
  explanation: text,
  examples: z.array(exampleSchema).catch([]),
}).catch(blankGrammar);
const spokenUsageItemSchema = z.object({
  title: text,
  explanation: text,
  examples: z.array(exampleSchema).catch([]),
}).catch(blankSpokenUsage);

export const lessonSchema = z.object({
  schemaVersion: z.literal(1).catch(1),
  video: z.object({ id: text, title: text, translatedTitle: text }),
  lesson: z.object({
    targetLanguage: targetLanguageSchema,
    cefrLevels: z.array(cefrLevelSchema).catch([]),
    transcriptSource: text,
    focus: text,
  }),
  transcripts: z.array(z.object({ time: text, source: text, translation: text })).catch([]),
  vocabs: z.partialRecord(cefrLevelSchema, z.array(vocabItemSchema).catch([])).catch({}),
  grammars: z.partialRecord(cefrLevelSchema, z.array(grammarItemSchema).catch([])).catch({}),
  spokenUsage: z.array(spokenUsageItemSchema).catch([]),
});

export type LessonContent = z.infer<typeof lessonSchema>;

export function parseLessonValue(value: unknown, fallback: LessonContent) {
  const parsed = lessonSchema.catch(fallback).parse(value);
  return lessonSchema.parse({
    ...parsed,
    video: {
      id: parsed.video.id || fallback.video.id,
      title: parsed.video.title || fallback.video.title,
      translatedTitle: parsed.video.translatedTitle || fallback.video.translatedTitle,
    },
    lesson: {
      targetLanguage: parsed.lesson.targetLanguage,
      cefrLevels: parsed.lesson.cefrLevels.length > 0
        ? parsed.lesson.cefrLevels
        : fallback.lesson.cefrLevels,
      transcriptSource: parsed.lesson.transcriptSource || fallback.lesson.transcriptSource,
      focus: parsed.lesson.focus,
    },
    transcripts: parsed.transcripts.length > 0 ? parsed.transcripts : fallback.transcripts,
  });
}

export function createFallbackLesson(input: {
  video: { id: string; title: string };
  targetLanguage: TargetLanguage;
  cefrLevels: CefrLevel[];
  transcriptSource: string;
  transcripts: LessonContent['transcripts'];
}): LessonContent {
  return {
    schemaVersion: 1,
    video: { ...input.video, translatedTitle: input.video.title },
    lesson: {
      targetLanguage: input.targetLanguage,
      cefrLevels: input.cefrLevels,
      transcriptSource: input.transcriptSource,
      focus: '',
    },
    transcripts: input.transcripts,
    vocabs: {},
    grammars: {},
    spokenUsage: [],
  };
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run the targeted test. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lesson-content.ts tests/lesson-content.test.ts
git commit -m "feat: define JSON lesson schema"
```

### Task 2: Add raw JSON parsing and trusted task normalization

**Files:**

- Modify: `tests/lesson-content.test.ts`
- Modify: `src/lib/lesson-content.ts`

- [ ] **Step 1: Write failing parser tests**

Add tests for malformed JSON and a model response that attempts to change trusted fields. Assert that task transcript segments are all retained by index, model translations are preserved where present, missing translations use source text, unexpected CEFR levels are removed, and requested levels are canonicalized.

```ts
it('catches malformed JSON with a task-derived lesson', () => {
  const result = parseGeneratedLesson('{not json', storedTask);
  assert.equal(result.video.id, storedTask.video.id);
  assert.equal(result.transcripts[0]?.source, storedTask.transcript.segments[0]?.text);
  assert.equal(result.transcripts[0]?.translation, storedTask.transcript.segments[0]?.text);
});

it('overwrites model-authored metadata and transcript source fields', () => {
  const result = parseGeneratedLesson(JSON.stringify({
    ...validResponse,
    video: { id: 'abcdefghijk', title: 'Injected', translatedTitle: '翻譯標題' },
    lesson: { ...validResponse.lesson, targetLanguage: 'en', cefrLevels: ['C2'] },
    transcripts: [{ time: '99:99', source: 'Injected', translation: '我們到了。' }],
    vocabs: { A2: [], C2: [{ source: 'x', translation: 'x', usage: 'x' }] },
  }), storedTask);

  assert.deepEqual(result.video, {
    id: 'jNQXAC9IVRw',
    title: 'Me at the zoo',
    translatedTitle: '翻譯標題',
  });
  assert.deepEqual(result.lesson.cefrLevels, ['A2', 'B1']);
  assert.equal(result.lesson.targetLanguage, 'zh');
  assert.equal(result.transcripts[0]?.source, 'Here we are at the zoo.');
  assert.equal(result.transcripts[0]?.translation, '我們到了。');
  assert.equal('C2' in result.vocabs, false);
});
```

- [ ] **Step 2: Run and verify RED**

Expected: FAIL because `parseGeneratedLesson` is absent.

- [ ] **Step 3: Implement task-aware normalization**

Add `formatTimestamp(seconds)` and `parseGeneratedLesson(raw, task)`. Wrap `JSON.parse` in `try/catch`, pass either its value or the fallback into `parseLessonValue`, then return a new object whose trusted fields come from `StoredTask`. Build transcripts from `task.transcript.segments`, using the parsed translation at the same index when it is a non-empty string. Copy only requested CEFR keys from parsed vocabulary and grammar records. Use `orderCefrLevels` for deterministic ordering.

- [ ] **Step 4: Run and verify GREEN**

Run the targeted test. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lesson-content.ts tests/lesson-content.test.ts
git commit -m "feat: normalize generated lesson JSON"
```

### Task 3: Change task contracts to JSON

**Files:**

- Modify: `tests/local-domain.test.ts`
- Modify: `tests/lesson-generation.test.ts`
- Modify: `src/lib/server/task-schema.ts`
- Modify: `src/lib/server/tasks.ts`

- [ ] **Step 1: Change tests to expect JSON task output**

Update fixtures to use:

```ts
schemaVersion: 3,
output: { format: 'json', path: '.local/lessons/lesson.json' },
generation: { status: 'pending', skillVersion: '3' },
```

Assert `buildTaskFile(...).outputPath` ends in `.json` and the stored task contains `format: 'json'`.

- [ ] **Step 2: Run both tests and verify RED**

```bash
$NVM_BIN/node --import tsx --test tests/local-domain.test.ts tests/lesson-generation.test.ts
```

Expected: FAIL on version, format, and output path assertions.

- [ ] **Step 3: Implement task schema version 3**

Set `TASK_SCHEMA_VERSION = 3`, `LESSON_SKILL_VERSION = '3'`, change the output format literal to `json`, and change the path regex to `.json`. Update `buildTaskFile` to construct `.local/lessons/<slug>.json`.

- [ ] **Step 4: Run tests and verify the contract failures are resolved**

Generation tests that still import the MDX validator may continue to fail; the task-contract assertions must pass before continuing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/task-schema.ts src/lib/server/tasks.ts tests/local-domain.test.ts tests/lesson-generation.test.ts
git commit -m "feat: declare JSON lesson task output"
```

### Task 4: Normalize JSON in the generation pipeline

**Files:**

- Create: `tests/fixtures/valid-generated-lesson.json`
- Modify: `tests/lesson-generation.test.ts`
- Modify: `src/lib/server/generate-lesson.ts`
- Delete: `src/lib/server/lesson-validator.ts`
- Delete: `tests/fixtures/valid-generated-lesson.mdx`

- [ ] **Step 1: Replace MDX validator tests with generation fallback tests**

Delete the `validateLessonMdx` test group and its helper content. Add a canonical JSON fixture and tests proving:

```ts
it('publishes a fallback JSON lesson when the model returns invalid JSON', async () => {
  const result = await generateLesson(input, {
    generator: { generate: async () => '# not JSON' },
    getStatus: getReadyStatus,
  });
  const stored = lessonSchema.parse(JSON.parse(
    await readFile(join(rootDir, '.local/lessons/lesson.json'), 'utf8'),
  ));

  assert.equal(result.lessonPath, '.local/lessons/lesson.json');
  assert.equal(stored.video.id, 'jNQXAC9IVRw');
  assert.equal(stored.transcripts[0]?.translation, 'Here we are at the zoo.');
});

it('repairs malformed sections while retaining valid generated sections', async () => {
  const raw = JSON.stringify({ ...validLesson, spokenUsage: false });
  // Assert valid vocabulary survives and spokenUsage becomes [].
});
```

- [ ] **Step 2: Run and verify RED**

Expected: FAIL because generation still validates MDX and writes `.mdx`.

- [ ] **Step 3: Implement JSON normalization**

Replace `validateLessonMdx(content, task)` with:

```ts
const lesson = parseGeneratedLesson(content, task);
const normalizedContent = `${JSON.stringify(lesson, null, 2)}\n`;
const result = await writeLessonOnce({
  rootDir: dataRoot,
  slug: input.slug,
  content: normalizedContent,
});
```

Set the expected task output path to `.json`. Keep `generatedContent` as the raw model response for diagnostics. Delete the generated-MDX validator.

- [ ] **Step 4: Run and verify GREEN**

Run `tests/lesson-generation.test.ts`. Expected: new fallback tests PASS; remaining persistence path assertions are addressed in Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/generate-lesson.ts src/lib/server/lesson-validator.ts tests/lesson-generation.test.ts tests/fixtures
git commit -m "feat: publish normalized lesson JSON"
```

### Task 5: Persist lessons and diagnostics as JSON

**Files:**

- Modify: `tests/lesson-generation.test.ts`
- Modify: `src/lib/server/lesson-writer.ts`
- Modify: `src/lib/server/generation-error-log.ts`

- [ ] **Step 1: Write failing JSON persistence expectations**

Change atomic persistence, existing-file, symlink, and diagnostics tests from `.mdx`/`generated.mdx` to `.json`/`generated.json`. Preserve tests for no overwrite, dangling symlinks, redirected storage, concurrent generation, and failure before model output.

- [ ] **Step 2: Run and verify RED**

Expected: FAIL on old file extensions and diagnostic paths.

- [ ] **Step 3: Change persistence extensions**

In `lessonExists`, `writeLessonOnce`, and the returned `lessonPath`, use `${slug}.json`. In `writeGenerationErrorLog`, save raw output as `generated.json` and expose that path in `error.json`.

- [ ] **Step 4: Run and verify GREEN**

Run `tests/lesson-generation.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/lesson-writer.ts src/lib/server/generation-error-log.ts tests/lesson-generation.test.ts
git commit -m "feat: persist lesson generation as JSON"
```

### Task 6: Make lesson discovery and reads JSON-only

**Files:**

- Modify: `tests/local-domain.test.ts`
- Modify: `src/lib/server/lessons.ts`

- [ ] **Step 1: Write failing JSON-only domain tests**

Create valid JSON lessons in the temporary lesson directory. Assert:

- only `.json` files appear;
- `.md` and `.mdx` files are ignored;
- title comes from `content.video.translatedTitle`, with the date prefix behavior retained;
- `readLesson().content` is a `LessonContent` object;
- malformed stored JSON rejects rather than executing or compiling content;
- a `.json` symlink is rejected with `O_NOFOLLOW`;
- invalid slugs and deterministic sorting retain current behavior.

- [ ] **Step 2: Run and verify RED**

Expected: FAIL because `lessons.ts` still discovers Markdown and returns strings.

- [ ] **Step 3: Implement JSON-only reads**

Replace `LESSON_EXTENSIONS` with a single `.json` filename rule. Parse file text using `JSON.parse` and `lessonSchema.parse`. Remove heading extraction and `removeLessonHeading`. Return:

```ts
type LessonDetail = LessonListItem & { content: LessonContent };
```

Calculate titles from `translatedTitle`, applying the existing date prefix only once. Preserve `realpath`, child-path, `O_NOFOLLOW`, regular-file, and deterministic-sort safeguards.

- [ ] **Step 4: Run and verify GREEN**

Run `tests/local-domain.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/lessons.ts tests/local-domain.test.ts
git commit -m "feat: read JSON lessons only"
```

### Task 7: Define skipped rendering specifications and build `<Lesson>`

**Files:**

- Create: `tests/lesson-rendering.test.ts`
- Create: `src/components/lesson.tsx`
- Modify: `src/lib/lesson-sections.ts`
- Delete: `tests/lesson-toc.test.ts`
- Delete: `src/lib/lesson-toc.ts`
- Delete: `src/lib/lesson-mdx.tsx`
- Delete: `src/lib/lesson-mdx-options.ts`

- [ ] **Step 1: Add skipped rendering cases only**

Per the approved testing constraint, do not add active rendering assertions. Add named skipped cases that document the intended behavior:

```ts
import { describe, it } from 'node:test';

describe('Lesson rendering', () => {
  it.skip('renders localized sections in canonical CEFR order');
  it.skip('renders localized no-content states for empty pedagogical sections');
  it.skip('renders generated strings as escaped text rather than markup');
  it.skip('builds a table of contents with IDs matching rendered headings');
});
```

- [ ] **Step 2: Confirm the skipped suite loads**

Run the rendering test. Expected: four SKIP results and no failures.

- [ ] **Step 3: Implement localized section metadata and TOC**

Keep `orderCefrLevels` and localized section labels. Add stable IDs such as `lesson-information`, `translation`, `a2-vocabulary`, `a2-grammar`, and `spoken-usage`. Export `createLessonToc(content): TOCItemType[]` using the same IDs and visible localized titles as the component.

- [ ] **Step 4: Implement the component**

Build `Lesson({ content }: { content: LessonContent })` with semantic `section`, `h2`, `h3`, `table`, `thead`, `tbody`, `th`, and `td` elements. Render `YouTubeEmbed` from trusted content. Iterate only `orderCefrLevels(content.lesson.cefrLevels)`. Render the localized empty-state string when a requested level has no vocabulary/grammar entries or spoken usage is empty. Render all generated values as normal React children; do not use `dangerouslySetInnerHTML`.

- [ ] **Step 5: Remove lesson MDX compilation files and old active TOC tests**

Delete the generated-lesson MDX component/options/TOC files and their active test. Preserve `src/components/mdx.tsx` for documentation pages.

- [ ] **Step 6: Run the skipped suite and typecheck**

```bash
$NVM_BIN/node --import tsx --test tests/lesson-rendering.test.ts
$NVM_BIN/pnpm types:check
```

Expected: rendering cases SKIP; typecheck PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/lesson.tsx src/lib/lesson-sections.ts tests/lesson-rendering.test.ts tests/lesson-toc.test.ts src/lib/lesson-toc.ts src/lib/lesson-mdx.tsx src/lib/lesson-mdx-options.ts
git commit -m "feat: render structured lesson content"
```

### Task 8: Wire structured content into the lesson page and exports

**Files:**

- Modify: `src/app/lessons/[slug]/page.tsx`
- Modify: `src/app/api/exports/notion/route.ts`
- Modify: `src/lib/lesson-content.ts`
- Modify: `tests/lesson-content.test.ts`

- [ ] **Step 1: Write a failing plain-text serializer test**

Assert `lessonToPlainText(validLesson)` contains the translated title, every transcript source/translation pair, vocabulary, grammar, and spoken-usage content in canonical level order, with no `[object Object]`.

- [ ] **Step 2: Run and verify RED**

Expected: FAIL because `lessonToPlainText` is absent.

- [ ] **Step 3: Implement deterministic plain-text serialization**

Build lines from structured fields and requested CEFR levels. Join with `\n`; do not serialize arbitrary JSON for Notion.

- [ ] **Step 4: Update page and Notion route**

In the lesson page, replace `LessonMdx` and Markdown TOC calls with:

```tsx
const toc = createLessonToc(lesson.content);
// ...
<DocsBody>
  <Lesson content={lesson.content} />
</DocsBody>
```

In the Notion route, pass `lessonToPlainText(lesson.content).slice(0, 1900)` as the paragraph content.

- [ ] **Step 5: Run tests and typecheck**

Expected: lesson-content tests and `types:check` PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/lessons/[slug]/page.tsx src/app/api/exports/notion/route.ts src/lib/lesson-content.ts tests/lesson-content.test.ts
git commit -m "feat: consume structured lessons in pages and exports"
```

### Task 9: Update the skill and prompt without adding tests

**Files:**

- Modify: `.agents/skills/generating-lesson/SKILL.md`
- Modify: `.agents/skills/generating-lesson/references/lesson-contract.md`
- Create: `.agents/skills/generating-lesson/references/example-lesson.json`
- Delete: `.agents/skills/generating-lesson/references/example-lesson.mdx`
- Modify: `src/lib/server/lesson-prompt.ts`
- Delete: `tests/generating-lesson-skill.test.ts`
- Modify: `tests/lesson-generation.test.ts` only to remove the prompt-specific test group

- [ ] **Step 1: Remove obsolete skill and prompt tests**

Delete `tests/generating-lesson-skill.test.ts` and remove `describe('buildLessonPrompt', ...)`. Do not add replacement skill or prompt tests.

- [ ] **Step 2: Rewrite the canonical contract and example**

Make the skill read `lesson-contract.md` and `example-lesson.json`, require exactly one raw JSON object, forbid Markdown/code fences/commands/browsing/file edits, and require every transcript translation plus requested CEFR content. The contract must document the exact schema keys from `LessonContent` without prescribing presentation headings or tables.

- [ ] **Step 3: Update the runtime prompt**

Change the prompt opening to:

```ts
'Use $generating-lesson to produce one lesson JSON object.',
'Return JSON only. Do not use Markdown or a code fence. Do not run commands, browse, or modify files.',
```

Keep the untrusted-data warning and supplied task input.

- [ ] **Step 4: Run the active test suite**

Run `$NVM_BIN/pnpm test`. Expected: PASS with the rendering specifications reported as skipped and no skill/prompt tests present.

- [ ] **Step 5: Commit**

```bash
git add .agents/skills/generating-lesson src/lib/server/lesson-prompt.ts tests/generating-lesson-skill.test.ts tests/lesson-generation.test.ts
git commit -m "feat: request lesson JSON from Codex"
```

### Task 10: Migrate current local lesson examples

**Files:**

- Replace ignored local files under `.local/lessons/` with `.json` files for the same slugs.

- [ ] **Step 1: Convert each current local lesson semantically**

Convert these four files before deleting their sources:

```text
.local/lessons/2026-06-26-vh9knIiyeI4.md
.local/lessons/2026-06-27-bSKZxNFK_sE.mdx
.local/lessons/2026-06-27-sample.mdx
.local/lessons/2026-06-28-VfsJP3AGXZE.mdx
```

For each lesson, preserve its video metadata, translated title, lesson focus, every transcript row, CEFR vocabulary rows, grammar subsections, examples, and spoken-usage subsections in the corresponding JSON fields. Use the matching task file for trusted metadata. The sample without a task must carry complete valid metadata in its JSON file.

- [ ] **Step 2: Validate every migrated JSON file with production Zod**

Run a temporary TypeScript validation command that reads every `.local/lessons/*.json`, applies `lessonSchema.parse(JSON.parse(text))`, and prints each validated filename. Expected: four validated filenames and no errors.

- [ ] **Step 3: Remove the old local MD/MDX files**

After validation succeeds, delete the four source files so runtime discovery cannot mask migration errors.

- [ ] **Step 4: Run the local application domain test**

Run `tests/local-domain.test.ts`. Expected: PASS. Because `.local/` is ignored, this task intentionally creates no Git commit.

### Task 11: Remove obsolete generated-MDX dependencies and verify the full change

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/components/mdx.tsx` only if lesson-only registrations are now unused

- [ ] **Step 1: Confirm dependency ownership**

Use `rg` to confirm whether each direct package is still imported outside deleted lesson files. Preserve dependencies required by Fumadocs documentation and `src/components/mdx.tsx`. Remove only direct dependencies with no remaining import or configuration use.

- [ ] **Step 2: Update dependencies through repository pnpm**

Use `$NVM_BIN/pnpm remove <confirmed-unused-packages>` for confirmed unused direct dependencies. Do not use Corepack or bare `pnpm`.

- [ ] **Step 3: Run formatting and static checks**

Run:

```bash
$NVM_BIN/pnpm lint
$NVM_BIN/pnpm types:check
$NVM_BIN/pnpm test
$NVM_BIN/pnpm build
```

Expected: all commands exit 0; rendering specifications are the only skipped tests.

- [ ] **Step 4: Check the final diff**

Run `git diff --check` and `git status --short`. Confirm there are no generated `.md`, `.mdx`, `generated.mdx`, MDX-validator imports, or `.local/lessons` runtime extension fallbacks remaining.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/mdx.tsx
git commit -m "chore: remove generated lesson MDX pipeline"
```

## Final verification checklist

- [ ] New tasks declare `.json` output and skill version 3.
- [ ] Invalid model JSON still publishes a valid fallback lesson.
- [ ] Trusted task metadata and transcript source text cannot be overridden by model output.
- [ ] Stored lessons are normalized, indented JSON with trailing newlines.
- [ ] Lesson discovery accepts `.json` only.
- [ ] The lesson page does not compile generated Markdown or MDX.
- [ ] Notion export uses deterministic structured plain text.
- [ ] Skill and prompt request JSON only; no skill/prompt test exists.
- [ ] Rendering tests exist only as skipped cases.
- [ ] Current local lesson examples and the canonical skill example are JSON.
- [ ] Full lint, typecheck, test, and production build pass under Node.js 24.11.1 and pnpm 11.0.8.
