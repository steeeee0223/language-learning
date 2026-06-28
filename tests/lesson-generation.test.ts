import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { GenerationError } from '@/lib/server/generation-errors.ts';
import { validateLessonMdx } from '@/lib/server/lesson-validator.ts';

const task = {
  video: { id: 'jNQXAC9IVRw' },
  learningSettings: { targetLanguage: 'zh' as const, cefrLevels: ['A2', 'B1'] as const },
};

function isGenerationInvalid(error: unknown) {
  assert.ok(error instanceof GenerationError);
  assert.equal(error.code, 'GENERATION_INVALID');
  return true;
}

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
