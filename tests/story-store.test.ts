import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createOrReuseStory, readStory } from '@/lib/server/story-store.ts';

const url = 'https://youtu.be/jNQXAC9IVRw';
const bundle = {
  video: { url, id: 'jNQXAC9IVRw', title: 'Me at the zoo' },
  transcript: {
    source: 'youtube-transcript.io' as const,
    segments: [{ text: 'All right, so here we are in front of the elephants.', start: 0, duration: 4 }],
  },
};

test('createOrReuseStory writes and reads a validated story on the first request', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-story-first-'));

  const result = await createOrReuseStory({
    url,
    rootDir,
    fetchBundle: async () => bundle,
  });

  assert.equal(result.reused, false);
  assert.equal(result.story.id, 'jNQXAC9IVRw');
  assert.equal(result.story.video.title, 'Me at the zoo');
  assert.equal(result.storyPath, join(await realpath(rootDir), '.local', 'stories', 'jNQXAC9IVRw.json'));
  assert.deepEqual(await readStory('jNQXAC9IVRw', rootDir), result.story);

  const persisted = JSON.parse(await readFile(result.storyPath, 'utf8'));
  assert.equal(persisted.schemaVersion, 1);
  assert.equal('learningSettings' in persisted, false);
});

test('createOrReuseStory reuses a stored story without fetching again', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-story-reuse-'));
  let fetchCount = 0;
  const fetchBundle = async () => {
    fetchCount += 1;
    return bundle;
  };

  const first = await createOrReuseStory({ url, rootDir, fetchBundle });
  const second = await createOrReuseStory({
    url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    rootDir,
    fetchBundle,
  });

  assert.equal(fetchCount, 1);
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(second.story.id, first.story.id);
});

test('concurrent story creation converges on one file and one transcript fetch', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'language-learning-story-concurrent-'));
  let fetchCount = 0;
  const fetchBundle = async () => {
    fetchCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return bundle;
  };

  const [first, second] = await Promise.all([
    createOrReuseStory({ url, rootDir, fetchBundle }),
    createOrReuseStory({ url, rootDir, fetchBundle }),
  ]);

  assert.equal(fetchCount, 1);
  assert.equal(first.story.id, second.story.id);
  assert.equal(first.reused, false);
  assert.equal(second.reused, false);
  assert.deepEqual(await readdir(join(rootDir, '.local', 'stories')), ['jNQXAC9IVRw.json']);

  const persisted = JSON.parse(await readFile(first.storyPath, 'utf8'));
  assert.equal('learningSettings' in persisted, false);
});
