import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { generateLesson } from '@/lib/server/generate-lesson';
import { GenerationError } from '@/lib/server/generation-errors';
import { buildLessonPrompt } from '@/lib/server/lesson-prompt';
import { ensureLocalDirs } from '@/lib/server/local-paths';
import { resolveModelPreset } from '@/lib/server/model-registry';
import type { LessonAiProvider } from '@/lib/server/ai-provider';
import { storySchema } from '@/lib/schemas/story-schema';
import { readTask } from '@/lib/server/task-store';
import { writeLessonOnce } from '@/lib/server/lesson-writer';
import { storedTaskSchema } from '@/lib/schemas/task-schema';

async function createStoredTaskFixture(options?: {
  generation?: Record<string, unknown>;
  modelPreset?: 'auto' | 'fast' | 'best';
}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'generation-task-'));
  const { storiesDir, tasksDir } = await ensureLocalDirs(rootDir);
  const story = storySchema.parse({
    schemaVersion: 1,
    id: 'jNQXAC9IVRw',
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
  });
  const storedTask = storedTaskSchema.parse({
    schemaVersion: 4,
    id: 'lesson',
    storyId: story.id,
    createdAt: '2026-06-28T00:00:00.000Z',
    learningSettings: { targetLanguage: 'zh', cefrLevels: ['A2', 'B1'] },
    modelPreset: options?.modelPreset ?? 'best',
    output: { format: 'json', path: '.local/lessons/lesson.json' },
    instructions: {
      requiredSections: ['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage'],
    },
    generation: options?.generation ?? { status: 'pending', skillVersion: '4' },
  });
  await writeFile(join(storiesDir, `${story.id}.json`), `${JSON.stringify(story, null, 2)}\n`, 'utf8');
  await writeFile(join(tasksDir, 'lesson.json'), `${JSON.stringify(storedTask, null, 2)}\n`, 'utf8');
  return { rootDir, task: storedTask, story };
}

const getReadyStatus = async () => ({ status: 'ready' as const, version: 'codex-cli test' });

describe('buildLessonPrompt', () => {
  it('requires complete translated and pedagogical content while allowing skill references to be read', async () => {
    const { task, story } = await createStoredTaskFixture();
    const prompt = buildLessonPrompt({ task, story });

    assert.match(prompt, /read-only commands.*skill references/i);
    assert.match(prompt, /translate every transcript segment/i);
    assert.match(prompt, /at least one vocabulary and grammar item.*requested CEFR level/i);
    assert.match(prompt, /at least one spoken-usage item/i);
    assert.doesNotMatch(prompt, /Do not browse, run commands, or modify files/);
  });
});

describe('lesson persistence and generation coordination', () => {
  it('atomically creates a lesson and refuses overwrite', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'lesson-writer-'));
    await writeLessonOnce({ rootDir, slug: 'lesson', content: '# First' });
    await assert.rejects(
      () => writeLessonOnce({ rootDir, slug: 'lesson', content: '# Second' }),
      /already exists/,
    );
    assert.equal(await readFile(join(rootDir, '.local/lessons/lesson.json'), 'utf8'), '# First');
  });

  it('publishes generated JSON in the canonical serialized form', async () => {
    const { rootDir } = await createStoredTaskFixture({ modelPreset: 'fast' });
    const expected = await readFile('tests/fixtures/valid-generated-lesson.json', 'utf8');
    const rawResponse = JSON.stringify(JSON.parse(expected));

    await generateLesson(
      { slug: 'lesson', rootDir },
      {
        generator: {
          generate: async ({ model }) => {
            assert.equal(model, resolveModelPreset('fast'));
            return rawResponse;
          },
        },
        getStatus: getReadyStatus,
      },
    );

    assert.equal(await readFile(join(rootDir, '.local/lessons/lesson.json'), 'utf8'), expected);
  });

  it('uses the default provider factory only when legacy seams are not supplied', async () => {
    const validLesson = await readFile('tests/fixtures/valid-generated-lesson.json', 'utf8');
    const defaultRun = await createStoredTaskFixture({ modelPreset: 'best' });
    const defaultCalls: string[] = [];
    const defaultProvider: LessonAiProvider = {
      id: 'codex',
      getStatus: async () => {
        defaultCalls.push('status');
        return getReadyStatus();
      },
      generate: async ({ model }) => {
        defaultCalls.push(`generate:${model}`);
        return validLesson;
      },
    };

    await generateLesson(
      { slug: 'lesson', rootDir: defaultRun.rootDir },
      { createProvider: () => defaultProvider },
    );

    assert.deepEqual(defaultCalls, ['status', `generate:${resolveModelPreset('best')}`]);

    const legacyRun = await createStoredTaskFixture({ modelPreset: 'fast' });
    const legacyCalls: string[] = [];
    let factoryCalls = 0;

    await generateLesson(
      { slug: 'lesson', rootDir: legacyRun.rootDir },
      {
        createProvider: () => {
          factoryCalls += 1;
          return defaultProvider;
        },
        generator: {
          generate: async ({ model }) => {
            legacyCalls.push(`generate:${model}`);
            return validLesson;
          },
        },
        getStatus: async () => {
          legacyCalls.push('status');
          return getReadyStatus();
        },
      },
    );

    assert.equal(factoryCalls, 0);
    assert.deepEqual(legacyCalls, ['status', `generate:${resolveModelPreset('fast')}`]);
  });

  it('rejects invalid JSON without publishing a fallback lesson', async () => {
    const { rootDir } = await createStoredTaskFixture();
    const rawResponse = '# invalid';

    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', rootDir },
          {
            generator: { generate: async () => rawResponse },
            getStatus: getReadyStatus,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GenerationError);
        assert.equal(error.code, 'GENERATION_INVALID');
        assert.match(error.diagnosticsPath ?? '', /^\.local\/errors\/lesson\/[^/]+\/error\.json$/);
        return true;
      },
    );

    await assert.rejects(
      () => readFile(join(rootDir, '.local/lessons/lesson.json'), 'utf8'),
      /ENOENT/,
    );
    const attempts = await readdir(join(rootDir, '.local/errors/lesson'));
    assert.equal(attempts.length, 1);
    assert.equal(
      await readFile(join(rootDir, '.local/errors/lesson', attempts[0]!, 'generated.json'), 'utf8'),
      rawResponse,
    );
    const generation = (await readTask('lesson', rootDir)).generation;
    assert.equal(generation.status, 'failed');
    assert.equal(generation.errorCode, 'GENERATION_INVALID');
  });

  it('rejects syntactically valid lessons with empty required teaching sections', async () => {
    const { rootDir } = await createStoredTaskFixture();
    const generated = JSON.parse(
      await readFile('tests/fixtures/valid-generated-lesson.json', 'utf8'),
    );
    generated.vocabs = {};
    generated.grammars = {};
    generated.spokenUsage = [];

    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', rootDir },
          {
            generator: { generate: async () => JSON.stringify(generated) },
            getStatus: getReadyStatus,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GenerationError);
        assert.equal(error.code, 'GENERATION_INVALID');
        return true;
      },
    );
    await assert.rejects(
      () => readFile(join(rootDir, '.local/lessons/lesson.json'), 'utf8'),
      /ENOENT/,
    );
  });

  it('rejects malformed generated sections instead of repairing them', async () => {
    const { rootDir } = await createStoredTaskFixture();
    const generated = JSON.parse(
      await readFile('tests/fixtures/valid-generated-lesson.json', 'utf8'),
    );
    generated.video = false;
    generated.vocabs.A2.push(false);
    generated.spokenUsage = false;

    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', rootDir },
          {
            generator: { generate: async () => JSON.stringify(generated) },
            getStatus: getReadyStatus,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GenerationError);
        assert.equal(error.code, 'GENERATION_INVALID');
        return true;
      },
    );
  });

  it('writes error details when generation fails before returning content', async () => {
    const { rootDir } = await createStoredTaskFixture();

    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', rootDir },
          {
            generator: {
              generate: async () => {
                throw new Error('SDK transport failed');
              },
            },
            getStatus: getReadyStatus,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GenerationError);
        assert.equal(error.code, 'GENERATION_FAILED');
        assert.equal(error.diagnosticsPath, '.local/errors/lesson.json');
        return true;
      },
    );

    const details = JSON.parse(await readFile(join(rootDir, '.local/errors/lesson.json'), 'utf8'));
    assert.equal(details.stage, 'generation');
    assert.equal(details.error.cause.message, 'SDK transport failed');
    assert.equal('generatedOutputPath' in details, false);
    await assert.rejects(
      () => readFile(join(rootDir, '.local/errors/lesson/generated.json'), 'utf8'),
      /ENOENT/,
    );
  });

  it('preserves the raw model response when publication loses a write race', async () => {
    const { rootDir } = await createStoredTaskFixture();
    const { lessonsDir } = await ensureLocalDirs(rootDir);
    const fixture = await readFile('tests/fixtures/valid-generated-lesson.json', 'utf8');
    const rawResponse = JSON.stringify(JSON.parse(fixture));
    let diagnosticsPath = '';

    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', rootDir },
          {
            generator: {
              generate: async () => {
                await writeFile(join(lessonsDir, 'lesson.json'), '# Won the race', 'utf8');
                return rawResponse;
              },
            },
            getStatus: getReadyStatus,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GenerationError);
        assert.equal(error.code, 'LESSON_EXISTS');
        diagnosticsPath = error.diagnosticsPath ?? '';
        assert.match(diagnosticsPath, /^\.local\/errors\/lesson\/[^/]+\/error\.json$/);
        return true;
      },
    );

    const details = JSON.parse(await readFile(join(rootDir, diagnosticsPath), 'utf8'));
    assert.equal(details.stage, 'write');
    assert.match(
      details.generatedOutputPath,
      /^\.local\/errors\/lesson\/[^/]+\/generated\.json$/,
    );
    assert.equal(
      await readFile(join(rootDir, details.generatedOutputPath), 'utf8'),
      rawResponse,
    );
    assert.notEqual(rawResponse, fixture);
  });

  it('rejects an existing lesson before spending a model call', async () => {
    const { rootDir } = await createStoredTaskFixture();
    const { lessonsDir } = await ensureLocalDirs(rootDir);
    await writeFile(join(lessonsDir, 'lesson.json'), '# Existing', 'utf8');
    let calls = 0;
    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', rootDir },
          {
            generator: {
              generate: async () => {
                calls += 1;
                return '# replacement';
              },
            },
            getStatus: getReadyStatus,
          },
        ),
      /already exists/,
    );
    assert.equal(calls, 0);
  });

  it('preserves prior generation metadata when a lesson already exists', async () => {
    const generation = {
      status: 'succeeded',
      skillVersion: '1',
      requestedModel: 'gpt-5.5',
      codexVersion: 'codex-cli test',
      startedAt: '2026-06-28T00:01:00.000Z',
      completedAt: '2026-06-28T00:02:00.000Z',
    };
    const { rootDir } = await createStoredTaskFixture({ generation });
    const { lessonsDir } = await ensureLocalDirs(rootDir);
    await writeFile(join(lessonsDir, 'lesson.json'), '# Existing', 'utf8');

    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', rootDir },
          { generator: { generate: async () => '# replacement' }, getStatus: getReadyStatus },
        ),
      /already exists/,
    );

    assert.deepEqual((await readTask('lesson', rootDir)).generation, generation);
  });

  it('treats lesson publication as successful when success metadata cannot be persisted', async () => {
    const { rootDir } = await createStoredTaskFixture();
    const validLesson = await readFile('tests/fixtures/valid-generated-lesson.json', 'utf8');
    const updates: string[] = [];

    const result = await generateLesson(
      { slug: 'lesson', rootDir },
      {
        generator: { generate: async () => validLesson },
        getStatus: getReadyStatus,
        updateGeneration: (slug, generation) => {
          updates.push(generation.status);
          if (generation.status === 'succeeded') throw new Error('metadata unavailable');
          return readTask(slug, rootDir);
        },
      },
    );

    assert.deepEqual(result, {
      lessonSlug: 'lesson',
      lessonPath: '.local/lessons/lesson.json',
    });
    assert.equal(
      await readFile(join(rootDir, '.local/lessons/lesson.json'), 'utf8'),
      validLesson,
    );
    assert.deepEqual(updates, ['pending', 'succeeded']);
  });

  it('rejects concurrent generation before a second model call', async () => {
    const { rootDir } = await createStoredTaskFixture();
    const validLesson = await readFile('tests/fixtures/valid-generated-lesson.json', 'utf8');
    let calls = 0;
    let release!: () => void;
    let generationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      generationStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const generator = {
      generate: async () => {
        calls += 1;
        generationStarted();
        await blocked;
        return validLesson;
      },
    };
    const first = generateLesson(
      { slug: 'lesson', rootDir },
      { generator, getStatus: getReadyStatus },
    );
    await started;
    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', rootDir },
          { generator, getStatus: getReadyStatus },
        ),
      /already being generated/,
    );
    release();
    await first;
    assert.equal(calls, 1);
  });

  it('shares a generation lock across real and symlinked root paths', async () => {
    const { rootDir } = await createStoredTaskFixture();
    const aliasRoot = `${rootDir}-alias`;
    await symlink(rootDir, aliasRoot, process.platform === 'win32' ? 'junction' : 'dir');

    const validLesson = await readFile('tests/fixtures/valid-generated-lesson.json', 'utf8');
    let calls = 0;
    let release!: () => void;
    let generationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      generationStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const generator = {
      generate: async () => {
        calls += 1;
        if (calls === 1) {
          generationStarted();
          await blocked;
        }
        return validLesson;
      },
    };

    const first = generateLesson(
      { slug: 'lesson', rootDir },
      { generator, getStatus: getReadyStatus },
    );
    await started;
    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', rootDir: aliasRoot },
          { generator, getStatus: getReadyStatus },
        ),
      /already being generated/,
    );
    release();
    await first;
    assert.equal(calls, 1);
  });

  it('enforces the generation deadline when a generator ignores its signal', async () => {
    const { rootDir } = await createStoredTaskFixture();
    const validLesson = await readFile('tests/fixtures/valid-generated-lesson.json', 'utf8');

    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', rootDir },
          {
            generator: {
              generate: async () => {
                await new Promise((resolve) => setTimeout(resolve, 40));
                return validLesson;
              },
            },
            getStatus: getReadyStatus,
            timeoutMs: 5,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GenerationError);
        assert.equal(error.code, 'GENERATION_TIMEOUT');
        return true;
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    await assert.rejects(
      () => readFile(join(rootDir, '.local/lessons/lesson.json'), 'utf8'),
      /ENOENT/,
    );
  });

  it('rejects a redirected local storage directory before writing outside the root', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'lesson-contained-root-'));
    const externalDir = await mkdtemp(join(tmpdir(), 'lesson-external-root-'));
    await symlink(
      externalDir,
      join(rootDir, '.local'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await assert.rejects(
      () => writeLessonOnce({ rootDir, slug: 'lesson', content: '# Escaped' }),
      (error: unknown) => {
        assert.ok(error instanceof GenerationError);
        assert.equal(error.code, 'LESSON_WRITE_FAILED');
        return true;
      },
    );
    await assert.rejects(
      () => readFile(join(externalDir, 'lessons/lesson.json'), 'utf8'),
      /ENOENT/,
    );
  });

  it('treats a dangling final lesson symlink as an existing lesson', async () => {
    const { rootDir } = await createStoredTaskFixture();
    const { lessonsDir } = await ensureLocalDirs(rootDir);
    await symlink(
      join(rootDir, 'missing-lesson.json'),
      join(lessonsDir, 'lesson.json'),
      process.platform === 'win32' ? 'junction' : 'file',
    );
    let calls = 0;

    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', rootDir },
          {
            generator: {
              generate: async () => {
                calls += 1;
                return '# replacement';
              },
            },
            getStatus: getReadyStatus,
          },
        ),
      /already exists/,
    );
    assert.equal(calls, 0);
  });
});
