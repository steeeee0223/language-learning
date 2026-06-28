import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { parseYouTubeVideoId } from '@/lib/youtube.ts';
import { buildTaskFile } from '@/lib/server/tasks.ts';
import { listLessons, readLesson } from '@/lib/server/lessons.ts';
import { fetchTranscriptBundle } from '@/lib/server/transcripts.ts';

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
  assert.equal(result.outputPath, '.local/lessons/2026-06-27-how-to-say-hello-bonjour.mdx');

  const task = JSON.parse(await readFile(join(rootDir, result.taskPath), 'utf8'));
  assert.equal(task.schemaVersion, 2);
  assert.deepEqual(task.learningSettings.cefrLevels, ['A2', 'B1']);
  assert.equal(task.output.path, result.outputPath);
  assert.deepEqual(task.instructions.requiredSections, ['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage']);
  assert.deepEqual(task.generation, { status: 'pending', skillVersion: '2' });
});

test('lesson helpers support MDX precedence, legacy markdown, and path traversal protection', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-lessons-'));
  await writeFile(join(rootDir, 'outside.md'), '# Outside');
  await writeFile(join(rootDir, '.local-lessons-placeholder'), '');

  const lessonsDir = join(rootDir, '.local', 'lessons');
  await mkdir(lessonsDir, { recursive: true });
  await writeFile(join(lessonsDir, '2026-06-27-salut.mdx'), '# Salut\n\nBonjour.');
  await writeFile(join(lessonsDir, 'legacy.md'), '# Legacy markdown');
  await writeFile(join(lessonsDir, 'shared-slug.md'), '# Legacy duplicate');
  await writeFile(join(lessonsDir, 'shared-slug.mdx'), '# Preferred MDX');
  await writeFile(join(lessonsDir, 'notes.txt'), 'ignored');

  const lessons = await listLessons({ rootDir });
  assert.equal(lessons.length, 3);
  const salutListItem = lessons.find((lesson) => lesson.slug === '2026-06-27-salut');
  assert.equal(salutListItem?.title, '2026-06-27 Salut');
  assert.equal(salutListItem?.filename, '2026-06-27-salut.mdx');
  assert.equal(salutListItem?.path, '.local/lessons/2026-06-27-salut.mdx');
  assert.equal(lessons.find((lesson) => lesson.slug === 'legacy')?.filename, 'legacy.md');
  assert.equal(lessons.filter((lesson) => lesson.slug === 'shared-slug').length, 1);
  assert.equal(lessons.find((lesson) => lesson.slug === 'shared-slug')?.filename, 'shared-slug.mdx');

  const lesson = await readLesson({ rootDir, slug: '2026-06-27-salut' });
  assert.equal(lesson.content, '# Salut\n\nBonjour.');
  assert.equal(lesson.filename, '2026-06-27-salut.mdx');

  const legacyLesson = await readLesson({ rootDir, slug: 'legacy' });
  assert.equal(legacyLesson.content, '# Legacy markdown');
  assert.equal(legacyLesson.filename, 'legacy.md');

  const preferredLesson = await readLesson({ rootDir, slug: 'shared-slug' });
  assert.equal(preferredLesson.content, '# Preferred MDX');
  assert.equal(preferredLesson.filename, 'shared-slug.mdx');
  await assert.rejects(() => readLesson({ rootDir, slug: '../outside' }), /Invalid lesson slug/);
});

test('listLessons filters invalid slugs and deterministically sorts equal mtimes', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-lesson-list-'));
  const lessonsDir = join(rootDir, '.local', 'lessons');
  await mkdir(lessonsDir, { recursive: true });

  const alphaPath = join(lessonsDir, 'alpha.mdx');
  const zetaPath = join(lessonsDir, 'zeta.mdx');
  await writeFile(zetaPath, '# Zeta');
  await writeFile(alphaPath, '# Alpha');
  await writeFile(join(lessonsDir, 'invalid.slug.mdx'), '# Invalid');
  await writeFile(join(lessonsDir, '-invalid.md'), '# Invalid');

  const sharedTimestamp = new Date('2026-06-27T10:00:00.000Z');
  await utimes(alphaPath, sharedTimestamp, sharedTimestamp);
  await utimes(zetaPath, sharedTimestamp, sharedTimestamp);

  const lessons = await listLessons({ rootDir });
  assert.deepEqual(
    lessons.map((lesson) => lesson.filename),
    ['alpha.mdx', 'zeta.mdx'],
  );
  assert.equal(lessons[0]?.modifiedAt, lessons[1]?.modifiedAt);
});

test('readLesson rejects an MDX symlink instead of reopening or falling back to markdown', async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-lesson-symlink-'));
  const lessonsDir = join(rootDir, '.local', 'lessons');
  const outsidePath = join(rootDir, 'outside.mdx');
  await mkdir(lessonsDir, { recursive: true });
  await writeFile(outsidePath, '# Outside');
  await writeFile(join(lessonsDir, 'linked.md'), '# Legacy fallback');

  try {
    await symlink(outsidePath, join(lessonsDir, 'linked.mdx'), 'file');
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code === 'EPERM' || code === 'EACCES' || code === 'ENOSYS') {
      context.skip(`Symlinks are unavailable: ${code}`);
      return;
    }
    throw error;
  }

  await assert.rejects(() => readLesson({ rootDir, slug: 'linked' }), (error: unknown) => {
    return error instanceof Error && 'code' in error && error.code === 'ELOOP';
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
