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
import { validateLessonMdx } from '@/lib/server/lesson-validator.ts';
import { writeLessonOnce } from '@/lib/server/lesson-writer.ts';
import { storedTaskSchema } from '@/lib/server/task-schema.ts';

const task = {
  video: { id: 'jNQXAC9IVRw' },
  learningSettings: { targetLanguage: 'zh' as const, cefrLevels: ['A2', 'B1'] as const },
};

function isGenerationInvalid(error: unknown) {
  assert.ok(error instanceof GenerationError);
  assert.equal(error.code, 'GENERATION_INVALID');
  return true;
}

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

const canonicalLevelLesson = `<YouTubeEmbed videoId="jNQXAC9IVRw" title="Me at the zoo" />

# 我在動物園

## 課程資訊

| 欄位 | 內容 |
| --- | --- |
| 影片 | Me at the zoo |

## 逐句翻譯

| 原文 | 繁體中文 |
| --- | --- |
| Here we are at the zoo. | 我們在動物園。 |

## A1 詞彙

| 英文 | 繁體中文 | 用法說明 |
| --- | --- | --- |
| zoo | 動物園 | 名詞 |

## A1 文法

### 1. Here we are

用來表示抵達某處。

## A2 詞彙

| 英文 | 繁體中文 | 用法說明 |
| --- | --- | --- |
| behind | 後方 | 位置詞 |

## A2 文法

### 1. behind me

用來描述相對位置。

## 口語用法

### 抵達時的說法

口語常說「Here we are」。
`;

describe('buildLessonPrompt', () => {
  it('delegates the output contract to the generating-lesson skill', async () => {
    const rootDir = await createStoredTaskFixture();
    const prompt = buildLessonPrompt(await readTask('lesson', rootDir));

    assert.match(prompt, /^Use \$generating-lesson/);
    assert.match(prompt, /Target language: zh/);
    assert.match(prompt, /CEFR levels: A2, B1/);
    assert.doesNotMatch(prompt, /Mandatory output contract|## 課程資訊|## CEFR/);
  });
});

describe('validateLessonMdx', () => {
  it('accepts one vocabulary and grammar section per CEFR level in canonical order', async () => {
    await assert.doesNotReject(() =>
      validateLessonMdx(canonicalLevelLesson, {
        video: task.video,
        learningSettings: { targetLanguage: 'zh', cefrLevels: ['A2', 'A1'] },
      }),
    );
  });

  it('requires the canonical table and subsection components', async () => {
    const validationTask = {
      video: task.video,
      learningSettings: { targetLanguage: 'zh' as const, cefrLevels: ['A2', 'A1'] as const },
    };
    const withoutInfoTable = canonicalLevelLesson.replace(
      '| 欄位 | 內容 |\n| --- | --- |\n| 影片 | Me at the zoo |',
      '影片：Me at the zoo',
    );
    const withoutGrammarSubheading = canonicalLevelLesson.replace('### 1. Here we are\n\n', '');

    await assert.rejects(() => validateLessonMdx(withoutInfoTable, validationTask), /table/i);
    await assert.rejects(() => validateLessonMdx(withoutGrammarSubheading, validationTask), /H3/i);
  });

  it('accepts the canonical generated lesson', async () => {
    const content = await readFile('tests/fixtures/valid-generated-lesson.mdx', 'utf8');
    await assert.doesNotReject(() => validateLessonMdx(content, task));
  });

  it('rejects missing levels, code fences, and executable MDX', async () => {
    const content = await readFile('tests/fixtures/valid-generated-lesson.mdx', 'utf8');
    await assert.rejects(
      () => validateLessonMdx(content.replace('## B1 詞彙', '## C1 詞彙'), task),
      /section order/,
    );
    await assert.rejects(() => validateLessonMdx(`\`\`\`mdx\n${content}\n\`\`\``, task), /code fence/);
    await assert.rejects(() => validateLessonMdx(`${content}\n\n{globalThis.process.exit()}`, task), isGenerationInvalid);
    await assert.rejects(() => validateLessonMdx(`${content}\n\n<Broken`, task), isGenerationInvalid);
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

  it('rejects headings nested below non-root nodes', async () => {
    const content = await readFile('tests/fixtures/valid-generated-lesson.mdx', 'utf8');
    await assert.rejects(() => validateLessonMdx(`${content}\n\n> # hidden second H1`, task), /top-level/);
    await assert.rejects(() => validateLessonMdx(`${content}\n\n> ## hidden extra section`, task), /top-level/);
  });

  it('rejects empty sections and CEFR level subsections', async () => {
    const shell = `<YouTubeEmbed videoId="jNQXAC9IVRw" title="Me at the zoo" />

# 我在動物園

## 課程資訊

## 逐句翻譯

## A2 詞彙

## A2 文法

## B1 詞彙

## B1 文法

## 口語用法
`;
    await assert.rejects(() => validateLessonMdx(shell, task), /substantive content/);

    const content = await readFile('tests/fixtures/valid-generated-lesson.mdx', 'utf8');
    const missingA2Vocabulary = content.replace(
      '| 英文 | 繁體中文 | 用法說明 |\n| --- | --- | --- |\n| zoo | 動物園 | 表示展示動物的場所。 |\n\n',
      '',
    );
    await assert.rejects(() => validateLessonMdx(missingA2Vocabulary, task), /A2.*substantive content/);
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
    assert.equal(await readFile(join(rootDir, '.local/lessons/lesson.mdx'), 'utf8'), '# First');
  });

  it('does not write invalid generated output', async () => {
    const rootDir = await createStoredTaskFixture();
    await assert.rejects(
      () =>
        generateLesson(
          { slug: 'lesson', modelPreset: 'best', rootDir },
          {
            generator: { generate: async () => '# invalid' },
            getStatus: getReadyStatus,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GenerationError);
        assert.match(error.message, /invalid/i);
        assert.match(
          error.diagnosticsPath ?? '',
          /^\.local\/errors\/lesson\/[^/]+\/error\.json$/,
        );
        return true;
      },
    );
    await assert.rejects(
      () => readFile(join(rootDir, '.local/lessons/lesson.mdx'), 'utf8'),
      /ENOENT/,
    );

    const attempts = await readdir(join(rootDir, '.local/errors/lesson'));
    assert.equal(attempts.length, 1);
    const attemptDir = join(rootDir, '.local/errors/lesson', attempts[0]!);
    const details = JSON.parse(await readFile(join(attemptDir, 'error.json'), 'utf8'));
    assert.equal(details.taskId, 'lesson');
    assert.equal(details.code, 'GENERATION_INVALID');
    assert.equal(details.stage, 'validation');
    assert.equal(details.generatedOutputPath, `.local/errors/lesson/${attempts[0]}/generated.mdx`);
    assert.equal(await readFile(join(attemptDir, 'generated.mdx'), 'utf8'), '# invalid');
    assert.equal((await readTask('lesson', rootDir)).generation.skillVersion, '3');
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
    await assert.rejects(() => readFile(join(rootDir, '.local/errors/lesson/generated.mdx'), 'utf8'), /ENOENT/);
  });

  it('rejects an existing lesson before spending a model call', async () => {
    const rootDir = await createStoredTaskFixture();
    const { lessonsDir } = await ensureLocalDirs(rootDir);
    await writeFile(join(lessonsDir, 'lesson.mdx'), '# Existing', 'utf8');
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
    await writeFile(join(lessonsDir, 'lesson.mdx'), '# Existing', 'utf8');

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
    const validLesson = await readFile('tests/fixtures/valid-generated-lesson.mdx', 'utf8');
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
      lessonPath: '.local/lessons/lesson.mdx',
    });
    assert.equal(await readFile(join(rootDir, '.local/lessons/lesson.mdx'), 'utf8'), validLesson);
    assert.deepEqual(updates, ['pending', 'succeeded']);
  });

  it('rejects concurrent generation before a second model call', async () => {
    const rootDir = await createStoredTaskFixture();
    const validLesson = await readFile('tests/fixtures/valid-generated-lesson.mdx', 'utf8');
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
    const validLesson = await readFile('tests/fixtures/valid-generated-lesson.mdx', 'utf8');
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

    const validLesson = await readFile('tests/fixtures/valid-generated-lesson.mdx', 'utf8');
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
    const validLesson = await readFile('tests/fixtures/valid-generated-lesson.mdx', 'utf8');

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
      () => readFile(join(rootDir, '.local/lessons/lesson.mdx'), 'utf8'),
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
    await assert.rejects(() => readFile(join(externalDir, 'lessons/lesson.mdx'), 'utf8'), /ENOENT/);
  });

  it('treats a dangling final lesson symlink as an existing lesson', async (context) => {
    const rootDir = await createStoredTaskFixture();
    const { lessonsDir } = await ensureLocalDirs(rootDir);
    try {
      await symlink(join(rootDir, 'missing-lesson.mdx'), join(lessonsDir, 'lesson.mdx'), 'file');
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
