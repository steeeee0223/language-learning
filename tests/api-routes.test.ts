import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { GET as getLessons } from '@/app/api/lessons/route.ts';
import { GET as getLesson } from '@/app/api/lessons/[slug]/route.ts';
import { POST as postTask } from '@/app/api/tasks/route.ts';

test('POST /api/tasks writes a task file and returns local paths', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-api-task-'));
  process.env.LOCAL_DATA_ROOT = rootDir;

  const response = await postTask(
    new Request('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
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
          targetLanguage: 'en',
          cefrLevels: ['A1', 'A2'],
        },
      }),
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.match(payload.taskSlug, /^\d{4}-\d{2}-\d{2}-me-at-the-zoo$/);
  assert.match(payload.taskPath, /^\.local\/tasks\/\d{4}-\d{2}-\d{2}-me-at-the-zoo\.json$/);
  assert.match(payload.outputPath, /^\.local\/lessons\/\d{4}-\d{2}-\d{2}-me-at-the-zoo\.mdx$/);
  assert.equal('suggestedCommand' in payload, false);
});

test('GET /api/lessons lists MDX lessons and detail reads one lesson', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-api-lessons-'));
  process.env.LOCAL_DATA_ROOT = rootDir;
  const lessonsDir = join(rootDir, '.local', 'lessons');
  await mkdir(lessonsDir, { recursive: true });
  await writeFile(join(lessonsDir, '2026-06-27-me-at-the-zoo.mdx'), '# Me at the zoo');

  const listResponse = await getLessons();
  const listPayload = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(listPayload.lessons.length, 1);
  assert.equal(listPayload.lessons[0].slug, '2026-06-27-me-at-the-zoo');
  assert.equal(listPayload.lessons[0].filename, '2026-06-27-me-at-the-zoo.mdx');

  const detailResponse = await getLesson(new Request('http://localhost/api/lessons/2026-06-27-me-at-the-zoo'), {
    params: Promise.resolve({ slug: '2026-06-27-me-at-the-zoo' }),
  });
  const detailPayload = await detailResponse.json();
  assert.equal(detailResponse.status, 200);
  assert.equal(detailPayload.lesson.content, '# Me at the zoo');
});
