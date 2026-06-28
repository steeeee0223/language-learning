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
