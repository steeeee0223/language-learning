import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { lessonSchema, type LessonContent } from '@/lib/lesson-content.ts';
import { parseYouTubeVideoId } from '@/lib/youtube.ts';
import { buildTaskFile } from '@/lib/server/tasks.ts';
import { listLessons, readLesson } from '@/lib/server/lessons.ts';
import { fetchTranscriptBundle } from '@/lib/server/transcripts.ts';

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

test('parseYouTubeVideoId accepts common YouTube URL shapes', () => {
  assert.equal(parseYouTubeVideoId('https://www.youtube.com/watch?v=jNQXAC9IVRw'), 'jNQXAC9IVRw');
  assert.equal(parseYouTubeVideoId('https://youtu.be/jNQXAC9IVRw?t=12'), 'jNQXAC9IVRw');
  assert.equal(parseYouTubeVideoId('https://www.youtube.com/shorts/jNQXAC9IVRw'), 'jNQXAC9IVRw');
  assert.equal(parseYouTubeVideoId('https://www.youtube.com/embed/jNQXAC9IVRw'), 'jNQXAC9IVRw');
});

test('parseYouTubeVideoId rejects non-YouTube and malformed inputs', () => {
  assert.throws(() => parseYouTubeVideoId('https://example.com/watch?v=jNQXAC9IVRw'), /YouTube/);
  assert.throws(() => parseYouTubeVideoId('not a url'), /valid URL/);
  assert.throws(() => parseYouTubeVideoId('https://www.youtube.com/watch?v=too-short'), /video ID/);
});

test('buildTaskFile writes the versioned local task contract and returns its slug and paths', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-task-'));

  const result = await buildTaskFile({
    rootDir,
    now: new Date('2026-06-27T08:00:00.000Z'),
    video: {
      url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      id: 'jNQXAC9IVRw',
      title: 'How to Say Hello? / Bonjour!',
    },
    transcript: {
      source: 'youtube-transcript.io',
      segments: [{ text: 'Bonjour tout le monde.', start: 0.4, duration: 2.1 }],
    },
    learningSettings: {
      targetLanguage: 'zh',
      cefrLevels: ['A2', 'B1'],
    },
  });

  assert.equal(result.taskSlug, '2026-06-27-how-to-say-hello-bonjour');
  assert.equal(result.taskPath, '.local/tasks/2026-06-27-how-to-say-hello-bonjour.json');
  assert.equal(result.outputPath, '.local/lessons/2026-06-27-how-to-say-hello-bonjour.json');

  const task = JSON.parse(await readFile(join(rootDir, result.taskPath), 'utf8'));
  assert.equal(task.schemaVersion, 3);
  assert.deepEqual(task.learningSettings.cefrLevels, ['A2', 'B1']);
  assert.deepEqual(task.output, { format: 'json', path: result.outputPath });
  assert.deepEqual(task.instructions.requiredSections, ['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage']);
  assert.deepEqual(task.generation, { status: 'pending', skillVersion: '3' });
});

test('lesson helpers list and read only schema-valid JSON lessons', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-lessons-'));
  await writeLessonFixture(join(rootDir, 'outside.json'), { translatedTitle: 'Outside' });
  await writeFile(join(rootDir, '.local-lessons-placeholder'), '');

  const lessonsDir = join(rootDir, '.local', 'lessons');
  await mkdir(lessonsDir, { recursive: true });
  await writeLessonFixture(join(lessonsDir, '2026-06-27-salut.json'), {
    translatedTitle: 'Salut',
  });
  await writeFile(join(lessonsDir, 'legacy.md'), '# Legacy markdown');
  await writeFile(join(lessonsDir, 'legacy.mdx'), '# Legacy MDX');
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
  await assert.rejects(() => readLesson({ rootDir, slug: 'legacy' }), (error: unknown) => {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
  });
  await assert.rejects(() => readLesson({ rootDir, slug: '../outside' }), /Invalid lesson slug/);
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
  const result = await buildTaskFile({
    rootDir,
    now: new Date('2026-06-26T08:00:00.000Z'),
    video: {
      url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      id: 'jNQXAC9IVRw',
      title: 'Timestamp lesson',
    },
    transcript: {
      source: 'youtube-transcript.io',
      segments: [{ text: 'Hello.', start: 0, duration: 1 }],
    },
    learningSettings: { targetLanguage: 'en', cefrLevels: ['A1'] },
  });
  await writeLessonFixture(join(rootDir, result.outputPath));

  const lesson = await readLesson({ rootDir, slug: result.taskSlug });

  assert.equal(lesson.generatedAt, '2026-06-26T08:00:00.000Z');
  assert.match(lesson.modifiedAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
});

test('readLesson rejects malformed JSON', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-lesson-malformed-'));
  const lessonsDir = join(rootDir, '.local', 'lessons');
  await mkdir(lessonsDir, { recursive: true });
  await writeFile(join(lessonsDir, 'malformed.json'), '{not json');

  await assert.rejects(() => readLesson({ rootDir, slug: 'malformed' }), SyntaxError);
});

test('readLesson rejects a JSON symlink instead of falling back to Markdown', async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-lesson-symlink-'));
  const lessonsDir = join(rootDir, '.local', 'lessons');
  const outsidePath = join(rootDir, 'outside.json');
  await mkdir(lessonsDir, { recursive: true });
  await writeLessonFixture(outsidePath, { translatedTitle: 'Outside' });
  await writeFile(join(lessonsDir, 'linked.md'), '# Legacy fallback');

  try {
    await symlink(outsidePath, join(lessonsDir, 'linked.json'), 'file');
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code === 'EPERM' || code === 'EACCES' || code === 'ENOSYS') {
      context.skip(`Symlinks are unavailable: ${code}`);
      return;
    }
    throw error;
  }

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
