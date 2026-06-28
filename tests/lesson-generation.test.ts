import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { generateLesson } from '@/lib/server/generate-lesson.ts';
import { GenerationError } from '@/lib/server/generation-errors.ts';
import { ensureLocalDirs } from '@/lib/server/local-paths.ts';
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

async function createStoredTaskFixture() {
  const rootDir = await mkdtemp(join(tmpdir(), 'generation-task-'));
  const { tasksDir } = await ensureLocalDirs(rootDir);
  const storedTask = storedTaskSchema.parse({
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
  await writeFile(join(tasksDir, 'lesson.json'), `${JSON.stringify(storedTask, null, 2)}\n`, 'utf8');
  return rootDir;
}

const getReadyStatus = async () => ({ status: 'ready' as const, version: 'codex-cli test' });

describe('validateLessonMdx', () => {
  it('accepts the canonical generated lesson', async () => {
    const content = await readFile('tests/fixtures/valid-generated-lesson.mdx', 'utf8');
    await assert.doesNotReject(() => validateLessonMdx(content, task));
  });

  it('rejects missing levels, code fences, and executable MDX', async () => {
    const content = await readFile('tests/fixtures/valid-generated-lesson.mdx', 'utf8');
    await assert.rejects(() => validateLessonMdx(content.replace('### B1', '### C1'), task), /B1/);
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

## 影片資訊

## 逐句翻譯

## CEFR 分級詞彙

### A2

### B1

## CEFR 分級文法

### A2

### B1

## 口語用法
`;
    await assert.rejects(() => validateLessonMdx(shell, task), /substantive content/);

    const content = await readFile('tests/fixtures/valid-generated-lesson.mdx', 'utf8');
    const missingA2Vocabulary = content.replace('- **zoo**：動物園\n\n### B1', '### B1');
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
      /invalid/i,
    );
    await assert.rejects(
      () => readFile(join(rootDir, '.local/lessons/lesson.mdx'), 'utf8'),
      /ENOENT/,
    );
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

  it('rejects concurrent generation before a second model call', async () => {
    const rootDir = await createStoredTaskFixture();
    const validLesson = await readFile('tests/fixtures/valid-generated-lesson.mdx', 'utf8');
    let calls = 0;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const generator = {
      generate: async () => {
        calls += 1;
        await blocked;
        return validLesson;
      },
    };
    const first = generateLesson(
      { slug: 'lesson', modelPreset: 'best', rootDir },
      { generator, getStatus: getReadyStatus },
    );
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
});
