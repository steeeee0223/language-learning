import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { lessonSchema, type LessonContent } from '@/lib/lesson-content';
import { createLearningPageTree } from '@/lib/lessons-page-tree';
import { isYouTubeVideoId, parseYouTubeVideoId } from '@/lib/schemas/youtube';
import { ensureLocalDirs } from '@/lib/server/local-paths';
import { buildTaskFile, TaskCreationError } from '@/lib/server/tasks';
import { readTask, updateTaskGeneration } from '@/lib/server/task-store';
import { listLessons, readLesson } from '@/lib/server/lessons';
import { fetchTranscriptBundle } from '@/lib/server/transcripts';

async function lessonFixture(overrides: { translatedTitle?: string } = {}): Promise<LessonContent> {
  const fixture = JSON.parse(
    await readFile(join(process.cwd(), 'tests', 'fixtures', 'valid-generated-lesson.json'), 'utf8'),
  );

  return lessonSchema.parse({
    ...fixture,
    video: {
      ...fixture.video,
      translatedTitle: overrides.translatedTitle ?? fixture.video.translatedTitle,
    },
  });
}

async function writeLessonFixture(path: string, overrides: { translatedTitle?: string } = {}) {
  await writeFile(path, JSON.stringify(await lessonFixture(overrides)));
}

async function writeStoryFixture(rootDir: string, id = 'jNQXAC9IVRw') {
  const storiesDir = join(rootDir, '.local', 'stories');
  await mkdir(storiesDir, { recursive: true });
  await writeFile(
    join(storiesDir, `${id}.json`),
    JSON.stringify({
      schemaVersion: 1,
      id,
      createdAt: '2026-06-26T08:00:00.000Z',
      video: {
        url: `https://www.youtube.com/watch?v=${id}`,
        id,
        title: 'Me at the zoo',
      },
      transcript: {
        source: 'youtube-transcript.io',
        segments: [{ text: 'Hello.', start: 0, duration: 1 }],
      },
    }),
  );
}

test('createLearningPageTree uses Tasks as the lesson index', () => {
  const tree = createLearningPageTree([
    {
      slug: 'lesson-task',
      title: 'Lesson title',
      filename: 'lesson-task.json',
      path: '.local/lessons/lesson-task.json',
      modifiedAt: '2026-06-30T09:00:00.000Z',
      generatedAt: '2026-06-30T09:00:00.000Z',
    },
  ]);
  const serialized = JSON.stringify(tree);

  assert.match(serialized, /\/get-started/);
  assert.match(serialized, /\/tasks/);
  assert.match(serialized, /\/lessons\/lesson-task/);
  assert.doesNotMatch(serialized, /All Lessons/);
});

test('parseYouTubeVideoId accepts common YouTube URL shapes', () => {
  assert.equal(parseYouTubeVideoId('https://www.youtube.com/watch?v=jNQXAC9IVRw'), 'jNQXAC9IVRw');
  assert.equal(parseYouTubeVideoId('https://youtu.be/jNQXAC9IVRw?t=12'), 'jNQXAC9IVRw');
  assert.equal(parseYouTubeVideoId('https://www.youtube.com/shorts/jNQXAC9IVRw'), 'jNQXAC9IVRw');
  assert.equal(parseYouTubeVideoId('https://www.youtube.com/embed/jNQXAC9IVRw'), 'jNQXAC9IVRw');
});

test('isYouTubeVideoId recognizes only valid YouTube video IDs', () => {
  assert.equal(isYouTubeVideoId('jNQXAC9IVRw'), true);
  assert.equal(isYouTubeVideoId(''), false);
  assert.equal(isYouTubeVideoId('too-short'), false);
  assert.equal(isYouTubeVideoId('jNQXAC9IVR!'), false);
});

test('parseYouTubeVideoId rejects non-YouTube and malformed inputs', () => {
  assert.throws(() => parseYouTubeVideoId('https://example.com/watch?v=jNQXAC9IVRw'), /YouTube/);
  assert.throws(() => parseYouTubeVideoId('not a url'), /valid URL/);
  assert.throws(() => parseYouTubeVideoId('https://www.youtube.com/watch?v=too-short'), /video ID/);
});

test('buildTaskFile writes the normalized version 4 task contract', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-task-'));
  await writeStoryFixture(rootDir);

  const result = await buildTaskFile(
    {
      storyId: 'jNQXAC9IVRw',
      learningSettings: {
        targetLanguage: 'zh',
        cefrLevels: ['A2', 'B1'],
      },
      modelPreset: 'best',
    },
    {
      rootDir,
      now: () => new Date('2026-06-27T08:00:00.000Z'),
      idGenerator: () => 'task-123',
    },
  );

  assert.deepEqual(result, { taskId: 'task-123' });

  const task = JSON.parse(await readFile(join(rootDir, '.local', 'tasks', 'task-123.json'), 'utf8'));
  assert.equal(task.schemaVersion, 4);
  assert.equal(task.id, 'task-123');
  assert.equal(task.storyId, 'jNQXAC9IVRw');
  assert.deepEqual(task.learningSettings.cefrLevels, ['A2', 'B1']);
  assert.equal(task.modelPreset, 'best');
  assert.deepEqual(task.output, { format: 'json', path: '.local/lessons/task-123.json' });
  assert.deepEqual(task.instructions.requiredSections, [
    'metadata',
    'translation',
    'vocabulary',
    'grammar',
    'spokenUsage',
  ]);
  assert.deepEqual(task.generation, { status: 'pending', skillVersion: '4' });
});

test('identical task requests create distinct task IDs and aligned files', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-task-repeat-'));
  await writeStoryFixture(rootDir);
  const ids = ['task-first', 'task-second'];
  const request = {
    storyId: 'jNQXAC9IVRw',
    learningSettings: { targetLanguage: 'en' as const, cefrLevels: ['A1' as const] },
    modelPreset: 'auto' as const,
  };
  const dependencies = {
    rootDir,
    idGenerator: () => ids.shift() ?? 'unexpected',
  };

  const first = await buildTaskFile(request, dependencies);
  const second = await buildTaskFile(request, dependencies);

  assert.notEqual(first.taskId, second.taskId);
  assert.deepEqual((await readdir(join(rootDir, '.local', 'tasks'))).sort(), [
    'task-first.json',
    'task-second.json',
  ]);
  assert.equal(
    (await readTask(first.taskId, rootDir)).output.path,
    `.local/lessons/${first.taskId}.json`,
  );
  assert.equal(
    (await readTask(second.taskId, rootDir)).output.path,
    `.local/lessons/${second.taskId}.json`,
  );
});

test('task creation retries an ID collision without overwriting the existing task', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-task-collision-'));
  await writeStoryFixture(rootDir);
  const ids = ['same-id', 'same-id', 'replacement-id'];
  const request = {
    storyId: 'jNQXAC9IVRw',
    learningSettings: { targetLanguage: 'en' as const, cefrLevels: ['A1' as const] },
    modelPreset: 'fast' as const,
  };
  const dependencies = {
    rootDir,
    idGenerator: () => ids.shift() ?? 'unexpected',
  };

  await buildTaskFile(request, dependencies);
  const original = await readFile(join(rootDir, '.local', 'tasks', 'same-id.json'), 'utf8');
  const result = await buildTaskFile(request, dependencies);

  assert.equal(result.taskId, 'replacement-id');
  assert.equal(await readFile(join(rootDir, '.local', 'tasks', 'same-id.json'), 'utf8'), original);
});

test('concurrent generation updates use distinct temporary publication paths', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-task-update-concurrent-'));
  await writeStoryFixture(rootDir);
  await buildTaskFile(
    {
      storyId: 'jNQXAC9IVRw',
      learningSettings: { targetLanguage: 'en', cefrLevels: ['A1'] },
      modelPreset: 'fast',
    },
    { rootDir, idGenerator: () => 'concurrent-task' },
  );
  const tasksDir = join(rootDir, '.local', 'tasks');
  const fixedNow = 1_782_700_000_000;
  const occupiedTempName = `.concurrent-task.${process.pid}.${fixedNow}.tmp`;
  await writeFile(join(tasksDir, occupiedTempName), 'in-flight update');
  const originalNow = Date.now;
  Date.now = () => fixedNow;

  try {
    const updates = await Promise.all([
      updateTaskGeneration('concurrent-task', { status: 'pending', skillVersion: '4' }, rootDir),
      updateTaskGeneration('concurrent-task', { status: 'pending', skillVersion: '4' }, rootDir),
    ]);

    assert.equal(updates.length, 2);
    assert.deepEqual((await readdir(tasksDir)).sort(), [occupiedTempName, 'concurrent-task.json'].sort());
  } finally {
    Date.now = originalNow;
  }
});

test('task creation requires its referenced story before writing', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-task-missing-story-'));

  await assert.rejects(
    () =>
      buildTaskFile(
        {
          storyId: 'jNQXAC9IVRw',
          learningSettings: { targetLanguage: 'en', cefrLevels: ['A1'] },
          modelPreset: 'best',
        },
        {
          rootDir,
          idGenerator: () => 'must-not-exist',
        },
      ),
    (error: unknown) => error instanceof TaskCreationError && error.code === 'STORY_NOT_FOUND',
  );
  assert.deepEqual(await readdir(join(rootDir, '.local', 'tasks')), []);
});

test('lesson helpers list and read only regular JSON lesson files', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-lessons-'));
  await writeLessonFixture(join(rootDir, 'outside.json'), { translatedTitle: 'Outside' });
  await writeFile(join(rootDir, '.local-lessons-placeholder'), '');

  const lessonsDir = join(rootDir, '.local', 'lessons');
  await mkdir(lessonsDir, { recursive: true });
  await writeLessonFixture(join(lessonsDir, '2026-06-27-salut.json'), {
    translatedTitle: 'Salut',
  });
  await writeFile(join(lessonsDir, 'notes.txt'), 'ignored');
  await mkdir(join(lessonsDir, 'directory.json'));

  const lessons = await listLessons({ rootDir });
  assert.equal(lessons.length, 1);
  const salutListItem = lessons.find((lesson) => lesson.slug === '2026-06-27-salut');
  assert.equal(salutListItem?.title, '2026-06-27 Salut');
  assert.equal(salutListItem?.filename, '2026-06-27-salut.json');
  assert.equal(salutListItem?.path, '.local/lessons/2026-06-27-salut.json');

  const lesson = await readLesson({ rootDir, slug: '2026-06-27-salut' });
  assert.deepEqual(lesson.content, await lessonFixture({ translatedTitle: 'Salut' }));
  assert.equal(lesson.filename, '2026-06-27-salut.json');
  await assert.rejects(() => readLesson({ rootDir, slug: '../outside' }), /Invalid lesson slug/);
});

test('listLessons does not duplicate a date already present in the translated title', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-lesson-date-title-'));
  const lessonsDir = join(rootDir, '.local', 'lessons');
  await mkdir(lessonsDir, { recursive: true });
  await writeLessonFixture(join(lessonsDir, '2026-06-27-equal.json'), {
    translatedTitle: '2026-06-27',
  });
  await writeLessonFixture(join(lessonsDir, '2026-06-28-prefixed.json'), {
    translatedTitle: '2026-06-28 Existing title',
  });

  const lessons = await listLessons({ rootDir });

  assert.equal(lessons.find((lesson) => lesson.slug === '2026-06-27-equal')?.title, '2026-06-27');
  assert.equal(
    lessons.find((lesson) => lesson.slug === '2026-06-28-prefixed')?.title,
    '2026-06-28 Existing title',
  );
});

test('listLessons filters invalid slugs, uses title fallbacks, and deterministically sorts equal mtimes', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-lesson-list-'));
  const lessonsDir = join(rootDir, '.local', 'lessons');
  await mkdir(lessonsDir, { recursive: true });

  const alphaPath = join(lessonsDir, 'alpha.json');
  const zetaPath = join(lessonsDir, 'zeta.json');
  await writeLessonFixture(zetaPath, { translatedTitle: '' });
  await writeLessonFixture(alphaPath, { translatedTitle: 'Alpha title' });
  await writeLessonFixture(join(lessonsDir, 'invalid.slug.json'));
  await writeLessonFixture(join(lessonsDir, '-invalid.json'));

  const sharedTimestamp = new Date('2026-06-27T10:00:00.000Z');
  await utimes(alphaPath, sharedTimestamp, sharedTimestamp);
  await utimes(zetaPath, sharedTimestamp, sharedTimestamp);

  const lessons = await listLessons({ rootDir });
  assert.deepEqual(
    lessons.map((lesson) => lesson.filename),
    ['alpha.json', 'zeta.json'],
  );
  assert.equal(lessons[0]?.title, 'Alpha title');
  assert.equal(lessons[1]?.title, 'Zeta');
  assert.equal(lessons[0]?.modifiedAt, lessons[1]?.modifiedAt);
  assert.equal(lessons[0]?.generatedAt, lessons[0]?.modifiedAt);
});

test('readLesson preserves a task generation timestamp', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-lesson-timestamps-'));
  await writeStoryFixture(rootDir);
  const result = await buildTaskFile(
    {
      storyId: 'jNQXAC9IVRw',
      learningSettings: { targetLanguage: 'en', cefrLevels: ['A1'] },
      modelPreset: 'best',
    },
    {
      rootDir,
      now: () => new Date('2026-06-26T08:00:00.000Z'),
      idGenerator: () => 'timestamp-lesson',
    },
  );
  await writeLessonFixture(join(rootDir, '.local', 'lessons', `${result.taskId}.json`));

  const lesson = await readLesson({ rootDir, slug: result.taskId });

  assert.equal(lesson.generatedAt, '2026-06-26T08:00:00.000Z');
  assert.match(lesson.modifiedAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
});

test('readLesson rejects malformed task metadata instead of using the lesson timestamp', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-task-metadata-malformed-'));
  const paths = await ensureLocalDirs(rootDir);
  await writeLessonFixture(join(paths.lessonsDir, 'malformed-task.json'));
  await writeFile(join(paths.tasksDir, 'malformed-task.json'), '{not json');

  await assert.rejects(() => readLesson({ rootDir, slug: 'malformed-task' }), SyntaxError);
});

test('readLesson rejects malformed JSON', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-lesson-malformed-'));
  const lessonsDir = join(rootDir, '.local', 'lessons');
  await mkdir(lessonsDir, { recursive: true });
  await writeFile(join(lessonsDir, 'malformed.json'), '{not json');

  await assert.rejects(() => readLesson({ rootDir, slug: 'malformed' }), SyntaxError);
});

test('listLessons rejects a syntactically invalid JSON lesson', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-lesson-malformed-list-'));
  const lessonsDir = join(rootDir, '.local', 'lessons');
  await mkdir(lessonsDir, { recursive: true });
  await writeFile(join(lessonsDir, 'malformed.json'), '{not json');

  await assert.rejects(() => listLessons({ rootDir }), SyntaxError);
});

test('readLesson rejects a JSON symlink', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-lesson-symlink-'));
  const lessonsDir = join(rootDir, '.local', 'lessons');
  const outsidePath = join(rootDir, 'outside.json');
  await mkdir(lessonsDir, { recursive: true });
  await writeLessonFixture(outsidePath, { translatedTitle: 'Outside' });

  await symlink(outsidePath, join(lessonsDir, 'linked.json'), 'file');

  await assert.rejects(() => readLesson({ rootDir, slug: 'linked' }), (error: unknown) => {
    return error instanceof Error && (/outside/i.test(error.message) || ('code' in error && error.code === 'ELOOP'));
  });
});

test('fetchTranscriptBundle fetches oEmbed metadata and normalizes transcript segments', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    calls.push({ url: target, init });

    if (target.startsWith('https://www.youtube.com/oembed')) {
      return Response.json({ title: 'Me at the zoo' });
    }

    if (target === 'https://www.youtube-transcript.io/api/transcripts') {
      return Response.json([
        {
          id: 'jNQXAC9IVRw',
          transcript: [
            { text: 'All right, so here we are.', start: '0.32', duration: '2.48' },
            { text: 'One more line.', start: 2.8, dur: 1.1 },
          ],
        },
      ]);
    }

    throw new Error(`Unexpected fetch: ${target}`);
  };

  const result = await fetchTranscriptBundle({
    url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    apiKey: 'secret-token',
    fetchFn,
  });

  assert.equal(result.video.title, 'Me at the zoo');
  assert.equal(result.video.id, 'jNQXAC9IVRw');
  assert.deepEqual(result.transcript.segments, [
    { text: 'All right, so here we are.', start: 0.32, duration: 2.48 },
    { text: 'One more line.', start: 2.8, duration: 1.1 },
  ]);

  const transcriptCall = calls.find((call) => call.url === 'https://www.youtube-transcript.io/api/transcripts');
  assert.equal(transcriptCall?.init?.method, 'POST');
  assert.equal((transcriptCall?.init?.headers as Record<string, string>).Authorization, 'Basic secret-token');
  assert.equal(transcriptCall?.init?.body, JSON.stringify({ ids: ['jNQXAC9IVRw'] }));
});
