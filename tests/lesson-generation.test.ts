import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { generateLesson } from '@/lib/server/generate-lesson.ts';
import { GenerationError } from '@/lib/server/generation-errors.ts';
import { buildLessonPrompt } from '@/lib/server/lesson-prompt.ts';
import { ensureLocalDirs } from '@/lib/server/local-paths.ts';
import { readTask } from '@/lib/server/task-store.ts';
import { buildTaskFile } from '@/lib/server/tasks.ts';
import { writeLessonOnce } from '@/lib/server/lesson-writer.ts';
import { storedTaskSchema } from '@/lib/server/task-schema.ts';

async function createStoredTaskFixture(options?: {
  outputPath?: string;
  generation?: Record<string, unknown>;
}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'generation-task-'));
  const { tasksDir } = await ensureLocalDirs(rootDir);
  const storedTask = storedTaskSchema.parse({
    schemaVersion: 3,
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
    output: { format: 'json', path: options?.outputPath ?? '.local/lessons/lesson.json' },
    instructions: {
      requiredSections: ['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage'],
    },
    generation: options?.generation ?? { status: 'pending', skillVersion: '3' },
  });
  await writeFile(join(tasksDir, 'lesson.json'), `${JSON.stringify(storedTask, null, 2)}\n`, 'utf8');
  return rootDir;
}

const getReadyStatus = async () => ({ status: 'ready' as const, version: 'codex-cli test' });

describe('buildLessonPrompt', () => {
  it('requires complete translated and pedagogical content while allowing skill references to be read', async () => {
    const rootDir = await createStoredTaskFixture();
    const prompt = buildLessonPrompt(await readTask('lesson', rootDir));

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
    const rootDir = await createStoredTaskFixture();
    const expected = await readFile('tests/fixtures/valid-generated-lesson.json', 'utf8');
    const rawResponse = JSON.stringify(JSON.parse(expected));

    await generateLesson(
      { slug: 'lesson', modelPreset: 'best', rootDir },
      {
        generator: { generate: async () => rawResponse },
        getStatus: getReadyStatus,
      },
    );

    assert.equal(await readFile(join(rootDir, '.local/lessons/lesson.json'), 'utf8'), expected);
  });

  it('rejects invalid JSON without publishing a fallback lesson', async () => {
    const rootDir = await createStoredTaskFixture();
    const rawResponse = '# invalid';

    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', modelPreset: 'best', rootDir },
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
    const rootDir = await createStoredTaskFixture();
    const generated = JSON.parse(
      await readFile('tests/fixtures/valid-generated-lesson.json', 'utf8'),
    );
    generated.vocabs = {};
    generated.grammars = {};
    generated.spokenUsage = [];

    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', modelPreset: 'best', rootDir },
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
    const rootDir = await createStoredTaskFixture();
    const generated = JSON.parse(
      await readFile('tests/fixtures/valid-generated-lesson.json', 'utf8'),
    );
    generated.video = false;
    generated.vocabs.A2.push(false);
    generated.spokenUsage = false;

    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', modelPreset: 'best', rootDir },
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
    const rootDir = await createStoredTaskFixture();

    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', modelPreset: 'best', rootDir },
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
    const rootDir = await createStoredTaskFixture();
    const { lessonsDir } = await ensureLocalDirs(rootDir);
    const fixture = await readFile('tests/fixtures/valid-generated-lesson.json', 'utf8');
    const rawResponse = JSON.stringify(JSON.parse(fixture));
    let diagnosticsPath = '';

    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', modelPreset: 'best', rootDir },
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
    const rootDir = await createStoredTaskFixture();
    const { lessonsDir } = await ensureLocalDirs(rootDir);
    await writeFile(join(lessonsDir, 'lesson.json'), '# Existing', 'utf8');
    let calls = 0;
    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', modelPreset: 'best', rootDir },
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
      modelPreset: 'best',
      requestedModel: 'gpt-5.5',
      codexVersion: 'codex-cli test',
      startedAt: '2026-06-28T00:01:00.000Z',
      completedAt: '2026-06-28T00:02:00.000Z',
    };
    const rootDir = await createStoredTaskFixture({ generation });
    const { lessonsDir } = await ensureLocalDirs(rootDir);
    await writeFile(join(lessonsDir, 'lesson.json'), '# Existing', 'utf8');

    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', modelPreset: 'best', rootDir },
          { generator: { generate: async () => '# replacement' }, getStatus: getReadyStatus },
        ),
      /already exists/,
    );

    assert.deepEqual((await readTask('lesson', rootDir)).generation, generation);
  });

  it('treats lesson publication as successful when success metadata cannot be persisted', async () => {
    const rootDir = await createStoredTaskFixture();
    const validLesson = await readFile('tests/fixtures/valid-generated-lesson.json', 'utf8');
    const updates: string[] = [];

    const result = await generateLesson(
      { slug: 'lesson', modelPreset: 'best', rootDir },
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
    const rootDir = await createStoredTaskFixture();
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
      { slug: 'lesson', modelPreset: 'best', rootDir },
      { generator, getStatus: getReadyStatus },
    );
    await started;
    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', modelPreset: 'best', rootDir },
          { generator, getStatus: getReadyStatus },
        ),
      /already being generated/,
    );
    release();
    await first;
    assert.equal(calls, 1);
  });

  it('does not overwrite a task while its lesson is being generated', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'lesson-preparation-lock-'));
    const now = new Date('2026-06-28T00:00:00.000Z');
    const input = {
      rootDir,
      now,
      video: {
        url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
        id: 'jNQXAC9IVRw',
        title: 'Me at the zoo',
      },
      transcript: {
        source: 'youtube-transcript.io' as const,
        segments: [{ text: 'Here we are at the zoo.', start: 0, duration: 1 }],
      },
      learningSettings: {
        targetLanguage: 'zh' as const,
        cefrLevels: ['A2' as const, 'B1' as const],
      },
    };
    const prepared = await buildTaskFile(input);
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
    const first = generateLesson(
      { slug: prepared.taskSlug, modelPreset: 'best', rootDir },
      {
        generator: {
          generate: async () => {
            calls += 1;
            generationStarted();
            await blocked;
            return validLesson;
          },
        },
        getStatus: getReadyStatus,
      },
    );
    await started;

    try {
      await assert.rejects(
        () =>
          buildTaskFile({
            ...input,
            learningSettings: { targetLanguage: 'en', cefrLevels: ['B2'] },
          }),
        /currently being generated/,
      );
      assert.deepEqual((await readTask(prepared.taskSlug, rootDir)).learningSettings, {
        targetLanguage: 'zh',
        cefrLevels: ['A2', 'B1'],
      });
    } finally {
      release();
      await first;
    }

    assert.equal(calls, 1);
  });

  it('shares a generation lock across real and symlinked root paths', async (context) => {
    const rootDir = await createStoredTaskFixture();
    const aliasRoot = `${rootDir}-alias`;
    try {
      await symlink(rootDir, aliasRoot, 'dir');
    } catch (error) {
      if (
        process.platform === 'win32' &&
        error instanceof Error &&
        'code' in error &&
        (error.code === 'EPERM' || error.code === 'EACCES')
      ) {
        context.skip('directory symlinks require additional Windows privileges');
        return;
      }
      throw error;
    }

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
      { slug: 'lesson', modelPreset: 'best', rootDir },
      { generator, getStatus: getReadyStatus },
    );
    await started;
    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', modelPreset: 'best', rootDir: aliasRoot },
          { generator, getStatus: getReadyStatus },
        ),
      /already being generated/,
    );
    release();
    await first;
    assert.equal(calls, 1);
  });

  it('enforces the generation deadline when a generator ignores its signal', async () => {
    const rootDir = await createStoredTaskFixture();
    const validLesson = await readFile('tests/fixtures/valid-generated-lesson.json', 'utf8');

    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', modelPreset: 'best', rootDir },
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

  it('rejects a redirected local storage directory before writing outside the root', async (context) => {
    const rootDir = await mkdtemp(join(tmpdir(), 'lesson-contained-root-'));
    const externalDir = await mkdtemp(join(tmpdir(), 'lesson-external-root-'));
    try {
      await symlink(externalDir, join(rootDir, '.local'), 'dir');
    } catch (error) {
      if (
        process.platform === 'win32' &&
        error instanceof Error &&
        'code' in error &&
        (error.code === 'EPERM' || error.code === 'EACCES')
      ) {
        context.skip('directory symlinks require additional Windows privileges');
        return;
      }
      throw error;
    }

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

  it('treats a dangling final lesson symlink as an existing lesson', async (context) => {
    const rootDir = await createStoredTaskFixture();
    const { lessonsDir } = await ensureLocalDirs(rootDir);
    try {
      await symlink(join(rootDir, 'missing-lesson.json'), join(lessonsDir, 'lesson.json'), 'file');
    } catch (error) {
      if (
        process.platform === 'win32' &&
        error instanceof Error &&
        'code' in error &&
        (error.code === 'EPERM' || error.code === 'EACCES')
      ) {
        context.skip('file symlinks require additional Windows privileges');
        return;
      }
      throw error;
    }
    let calls = 0;

    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', modelPreset: 'best', rootDir },
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

  it('rejects a task whose declared output path does not match its slug', async () => {
    const rootDir = await createStoredTaskFixture({
      outputPath: '.local/lessons/a-different-lesson.json',
    });
    let calls = 0;

    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', modelPreset: 'best', rootDir },
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
      (error: unknown) => {
        assert.ok(error instanceof GenerationError);
        assert.equal(error.code, 'GENERATION_INVALID');
        return true;
      },
    );
    assert.equal(calls, 0);
  });
});
