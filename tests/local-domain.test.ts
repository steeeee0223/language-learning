import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { parseYouTubeVideoId } from '../src/lib/youtube.ts';
import { buildTaskFile } from '../src/lib/server/tasks.ts';
import { listLessons, readLesson } from '../src/lib/server/lessons.ts';
import { fetchTranscriptBundle } from '../src/lib/server/transcripts.ts';

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

test('buildTaskFile writes the local task contract and returns paths plus command', async () => {
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

  assert.equal(result.taskPath, '.local/tasks/2026-06-27-how-to-say-hello-bonjour.json');
  assert.equal(result.outputPath, '.local/lessons/2026-06-27-how-to-say-hello-bonjour.md');
  assert.match(result.suggestedCommand, /codex "Generate the lesson markdown from \.local\/tasks\/2026-06-27-how-to-say-hello-bonjour\.json"/);

  const task = JSON.parse(await readFile(join(rootDir, result.taskPath), 'utf8'));
  assert.equal(task.schemaVersion, 1);
  assert.deepEqual(task.learningSettings.cefrLevels, ['A2', 'B1']);
  assert.equal(task.output.path, result.outputPath);
  assert.deepEqual(task.instructions.requiredSections, [
    'metadata',
    'sentence-by-sentence translation',
    'vocabulary by CEFR level',
    'grammar by CEFR level',
    'spoken usage',
  ]);
});

test('lesson helpers list markdown files and prevent path traversal', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-lessons-'));
  await writeFile(join(rootDir, 'outside.md'), '# Outside');
  await writeFile(join(rootDir, '.local-lessons-placeholder'), '');

  const lessonsDir = join(rootDir, '.local', 'lessons');
  await mkdir(lessonsDir, { recursive: true });
  await writeFile(join(lessonsDir, '2026-06-27-salut.md'), '# Salut\n\nBonjour.');
  await writeFile(join(lessonsDir, 'notes.txt'), 'ignored');

  const lessons = await listLessons({ rootDir });
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0]?.slug, '2026-06-27-salut');
  assert.equal(lessons[0]?.title, '2026 06 27 Salut');

  const lesson = await readLesson({ rootDir, slug: '2026-06-27-salut' });
  assert.equal(lesson.content, '# Salut\n\nBonjour.');
  await assert.rejects(() => readLesson({ rootDir, slug: '../outside' }), /Invalid lesson slug/);
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
