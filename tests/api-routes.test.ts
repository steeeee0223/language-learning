import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { describe, it } from 'node:test';

import { GET as getLessons } from '@/app/api/lessons/route.ts';
import { GET as getLesson } from '@/app/api/lessons/[slug]/route.ts';
import { createStoriesPostHandler } from '@/app/api/stories/route.ts';
import { POST as postTask } from '@/app/api/tasks/route.ts';
import { POST as generateTask } from '@/app/api/tasks/[slug]/generate/route.ts';
import { lessonSchema } from '@/lib/lesson-content.ts';

async function validLessonJson() {
  const fixture = JSON.parse(
    await readFile(join(process.cwd(), 'tests', 'fixtures', 'valid-generated-lesson.json'), 'utf8'),
  );
  return JSON.stringify(lessonSchema.parse(fixture));
}

async function writeApiStory(rootDir: string) {
  const storiesDir = join(rootDir, '.local', 'stories');
  await mkdir(storiesDir, { recursive: true });
  await writeFile(
    join(storiesDir, 'jNQXAC9IVRw.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'jNQXAC9IVRw',
      createdAt: '2026-06-27T08:00:00.000Z',
      video: {
        url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
        id: 'jNQXAC9IVRw',
        title: 'Me at the zoo',
      },
      transcript: {
        source: 'youtube-transcript.io',
        segments: [{ text: 'Hello.', start: 0, duration: 1 }],
      },
    }),
  );
}

test('POST /api/tasks writes a normalized task and returns only its ID', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-api-task-'));
  await writeApiStory(rootDir);
  process.env.LOCAL_DATA_ROOT = rootDir;

  const response = await postTask(
    new Request('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        storyId: 'jNQXAC9IVRw',
        learningSettings: {
          targetLanguage: 'en',
          cefrLevels: ['A1', 'A2'],
        },
        modelPreset: 'best',
      }),
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(payload), ['taskId']);
  assert.match(payload.taskId, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
  const stored = JSON.parse(
    await readFile(join(rootDir, '.local', 'tasks', `${payload.taskId}.json`), 'utf8'),
  );
  assert.equal(stored.id, payload.taskId);
  assert.equal(stored.output.path, `.local/lessons/${payload.taskId}.json`);
});

test('POST /api/tasks strictly rejects embedded source material', async () => {
  const response = await postTask(
    new Request('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        storyId: 'jNQXAC9IVRw',
        learningSettings: { targetLanguage: 'en', cefrLevels: ['A1'] },
        modelPreset: 'fast',
        transcript: {
          source: 'youtube-transcript.io',
          segments: [{ text: 'secret', start: 0, duration: 1 }],
        },
      }),
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid task payload.' });
});

test('POST /api/tasks maps a missing story to a safe client error', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-api-missing-task-story-'));
  process.env.LOCAL_DATA_ROOT = rootDir;
  const response = await postTask(
    new Request('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        storyId: 'jNQXAC9IVRw',
        learningSettings: { targetLanguage: 'en', cefrLevels: ['A1'] },
        modelPreset: 'auto',
      }),
    }),
  );

  const payload = await response.json();
  assert.equal(response.status, 404);
  assert.deepEqual(payload, { error: 'Story not found.' });
  assert.equal(JSON.stringify(payload).includes(rootDir), false);
});

test('POST /api/stories creates then reuses a transcript-free story response', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-api-story-'));
  let fetchCount = 0;
  const postStory = createStoriesPostHandler({
    rootDir,
    fetchBundle: async (url) => {
      fetchCount += 1;
      return {
        video: { url, id: 'jNQXAC9IVRw', title: 'Me at the zoo' },
        transcript: {
          source: 'youtube-transcript.io',
          segments: [{ text: 'Hello.', start: 0, duration: 1 }],
        },
      };
    },
  });

  const firstResponse = await postStory(
    new Request('http://localhost/api/stories', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://youtu.be/jNQXAC9IVRw' }),
    }),
  );
  const firstPayload = await firstResponse.json();

  assert.equal(firstResponse.status, 200);
  assert.deepEqual(firstPayload, {
    story: {
      id: 'jNQXAC9IVRw',
      title: 'Me at the zoo',
      url: 'https://youtu.be/jNQXAC9IVRw',
      createdAt: firstPayload.story.createdAt,
    },
    reused: false,
  });
  assert.match(firstPayload.story.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal('transcript' in firstPayload.story, false);

  const originalApiKey = process.env.YOUTUBE_TRANSCRIPT_API_KEY;
  delete process.env.YOUTUBE_TRANSCRIPT_API_KEY;
  const secondResponse = await createStoriesPostHandler({ rootDir })(
    new Request('http://localhost/api/stories', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' }),
    }),
  );
  if (originalApiKey !== undefined) process.env.YOUTUBE_TRANSCRIPT_API_KEY = originalApiKey;
  const secondPayload = await secondResponse.json();

  assert.equal(secondResponse.status, 200);
  assert.equal(secondPayload.reused, true);
  assert.deepEqual(secondPayload.story, firstPayload.story);
  assert.equal(fetchCount, 1);
});

test('POST /api/stories rejects a non-URL before fetching a transcript', async () => {
  let fetchCount = 0;
  const postStory = createStoriesPostHandler({
    fetchBundle: async () => {
      fetchCount += 1;
      throw new Error('Transcript fetch must not run.');
    },
  });

  const response = await postStory(
    new Request('http://localhost/api/stories', {
      method: 'POST',
      body: JSON.stringify({ url: 'not a URL' }),
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid story payload.' });
  assert.equal(fetchCount, 0);
});

test('POST /api/stories rejects malformed JSON as an invalid payload', async () => {
  const response = await createStoriesPostHandler()(
    new Request('http://localhost/api/stories', { method: 'POST', body: '{' }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid story payload.' });
});

test('POST /api/stories rejects a non-YouTube URL with a safe client error', async () => {
  const response = await createStoriesPostHandler({
    fetchBundle: async () => {
      throw new Error('Transcript fetch must not run.');
    },
  })(
    new Request('http://localhost/api/stories', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/video' }),
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid YouTube URL.' });
});

test('POST /api/stories hides transcript provider failure details', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-api-provider-error-'));
  const response = await createStoriesPostHandler({
    rootDir,
    fetchBundle: async () => {
      throw new Error('provider leaked token secret-123 at /private/provider.json');
    },
  })(
    new Request('http://localhost/api/stories', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://youtu.be/jNQXAC9IVRw' }),
    }),
  );

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Transcript provider request failed.' });
  assert.deepEqual(await readdir(join(rootDir, '.local', 'stories')), []);
});

test('POST /api/stories classifies an invalid provider result as a safe upstream failure', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-api-provider-schema-'));
  const response = await createStoriesPostHandler({
    rootDir,
    fetchBundle: async () =>
      ({
        video: { url: 'https://youtu.be/jNQXAC9IVRw', id: 'jNQXAC9IVRw', title: 'Me at the zoo' },
        transcript: { source: 'youtube-transcript.io', segments: [] },
      }) as never,
  })(
    new Request('http://localhost/api/stories', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://youtu.be/jNQXAC9IVRw' }),
    }),
  );

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Transcript provider request failed.' });
});

test('POST /api/stories classifies a mismatched provider video as a safe upstream failure', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-api-provider-mismatch-'));
  const response = await createStoriesPostHandler({
    rootDir,
    fetchBundle: async (url) => ({
      video: { url, id: 'dQw4w9WgXcQ', title: 'A different video' },
      transcript: {
        source: 'youtube-transcript.io',
        segments: [{ text: 'Different.', start: 0, duration: 1 }],
      },
    }),
  })(
    new Request('http://localhost/api/stories', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://youtu.be/jNQXAC9IVRw' }),
    }),
  );

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Transcript provider request failed.' });
});

test('POST /api/stories reports missing transcript configuration as unavailable', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-api-missing-config-'));
  const originalApiKey = process.env.YOUTUBE_TRANSCRIPT_API_KEY;
  delete process.env.YOUTUBE_TRANSCRIPT_API_KEY;
  const response = await createStoriesPostHandler({ rootDir })(
    new Request('http://localhost/api/stories', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://youtu.be/jNQXAC9IVRw' }),
    }),
  );
  if (originalApiKey !== undefined) process.env.YOUTUBE_TRANSCRIPT_API_KEY = originalApiKey;

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'YOUTUBE_TRANSCRIPT_API_KEY is not configured.' });
});

test('POST /api/stories hides unexpected storage failure details', async () => {
  const parentDir = await mkdtemp(join(tmpdir(), 'language-learning-api-storage-error-'));
  const rootDir = join(parentDir, 'not-a-directory');
  await writeFile(rootDir, 'private storage contents');
  const response = await createStoriesPostHandler({ rootDir })(
    new Request('http://localhost/api/stories', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://youtu.be/jNQXAC9IVRw' }),
    }),
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Story creation failed.' });
});

test('GET /api/lessons lists JSON lessons and detail returns structured content', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-api-lessons-'));
  process.env.LOCAL_DATA_ROOT = rootDir;
  const lessonsDir = join(rootDir, '.local', 'lessons');
  await mkdir(lessonsDir, { recursive: true });
  await writeFile(join(lessonsDir, '2026-06-27-me-at-the-zoo.json'), await validLessonJson());

  const listResponse = await getLessons();
  const listPayload = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(listPayload.lessons.length, 1);
  assert.equal(listPayload.lessons[0].slug, '2026-06-27-me-at-the-zoo');
  assert.equal(listPayload.lessons[0].filename, '2026-06-27-me-at-the-zoo.json');

  const detailResponse = await getLesson(new Request('http://localhost/api/lessons/2026-06-27-me-at-the-zoo'), {
    params: Promise.resolve({ slug: '2026-06-27-me-at-the-zoo' }),
  });
  const detailPayload = await detailResponse.json();
  assert.equal(detailResponse.status, 200);
  assert.deepEqual(detailPayload.lesson.content, lessonSchema.parse(JSON.parse(await validLessonJson())));
});

test('POST /api/tasks/[slug]/generate accepts only an empty request body', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-api-generate-'));
  const originalRoot = process.env.LOCAL_DATA_ROOT;
  process.env.LOCAL_DATA_ROOT = rootDir;

  try {
    const accepted = await generateTask(
      new Request('http://localhost/api/tasks/missing/generate', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ slug: 'missing' }) },
    );
    const rejected = await generateTask(
      new Request('http://localhost/api/tasks/missing/generate', {
        method: 'POST',
        body: JSON.stringify({ modelPreset: 'fast' }),
      }),
      { params: Promise.resolve({ slug: 'missing' }) },
    );

    assert.notEqual(accepted.status, 400);
    assert.equal(rejected.status, 400);
  } finally {
    if (originalRoot === undefined) delete process.env.LOCAL_DATA_ROOT;
    else process.env.LOCAL_DATA_ROOT = originalRoot;
  }
});

describe('Codex generation API', () => {
  it.skip('GET /api/codex/status returns each Zod-defined readiness state');
  it.skip('POST /api/tasks/[slug]/generate rejects invalid slugs and model presets');
  it.skip('POST /api/tasks/[slug]/generate maps every GenerationError to its stable status and code');
  it.skip('POST /api/tasks/[slug]/generate returns the validated lesson slug and path');
  it.skip('POST /api/tasks/[slug]/generate never exposes raw SDK errors');
});
