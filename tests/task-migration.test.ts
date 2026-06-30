import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { readTask } from '@/lib/server/task-store.ts';

const videoId = 'jNQXAC9IVRw';

function legacyTask(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 3,
    createdAt: '2026-06-20T08:00:00.000Z',
    video: {
      url: `https://www.youtube.com/watch?v=${videoId}`,
      id: videoId,
      title: 'Me at the zoo',
    },
    transcript: {
      source: 'youtube-transcript.io',
      segments: [{ text: 'Here we are at the zoo.', start: 0, duration: 1 }],
    },
    learningSettings: { targetLanguage: 'zh', cefrLevels: ['A2', 'B1'] },
    output: { format: 'json', path: `.local/lessons/${slug}.json` },
    instructions: {
      requiredSections: ['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage'],
    },
    generation: { status: 'pending', skillVersion: '4', modelPreset: 'fast' },
    ...overrides,
  };
}

function v4Task(slug: string) {
  return {
    schemaVersion: 4,
    id: slug,
    storyId: videoId,
    createdAt: '2026-06-20T08:00:00.000Z',
    learningSettings: { targetLanguage: 'zh', cefrLevels: ['A2'] },
    modelPreset: 'best',
    output: { format: 'json', path: `.local/lessons/${slug}.json` },
    instructions: {
      requiredSections: ['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage'],
    },
    generation: { status: 'pending', skillVersion: '4' },
  };
}

async function localRoot(prefix: string) {
  const rootDir = await mkdtemp(join(tmpdir(), prefix));
  for (const name of ['tasks', 'stories', 'lessons', 'errors']) {
    await mkdir(join(rootDir, '.local', name), { recursive: true });
  }
  return rootDir;
}

async function writeTask(rootDir: string, slug: string, task: unknown) {
  await writeFile(join(rootDir, '.local', 'tasks', `${slug}.json`), `${JSON.stringify(task, null, 2)}\n`);
}

test('legacyStoredTaskSchema is strict and matches the schema-v3 contract', async () => {
  const { legacyStoredTaskSchema } = await import('@/lib/server/task-schema.ts');
  const parsed = legacyStoredTaskSchema.parse({
    ...legacyTask('lesson'),
    generation: { status: 'pending', skillVersion: '3', modelPreset: 'fast' },
  });

  assert.equal(parsed.schemaVersion, 3);
  assert.equal(parsed.generation.modelPreset, 'fast');
  assert.throws(() => legacyStoredTaskSchema.parse({ ...legacyTask('lesson'), unexpected: true }));
});

test('migrates a legacy task without changing its slug or lesson content', async () => {
  const { migrateLegacyTasks } = await import('@/lib/server/task-migration.ts');
  const rootDir = await localRoot('task-migration-basic-');
  const lesson = '{"existing":"lesson bytes stay exact"}\n';
  await writeTask(rootDir, 'kept-slug', legacyTask('kept-slug'));
  await writeFile(join(rootDir, '.local', 'lessons', 'kept-slug.json'), lesson);

  assert.deepEqual(await migrateLegacyTasks(rootDir), { migrated: 1, conflicts: [] });
  const migrated = JSON.parse(await readFile(join(rootDir, '.local', 'tasks', 'kept-slug.json'), 'utf8'));
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.id, 'kept-slug');
  assert.equal(migrated.storyId, videoId);
  assert.equal(migrated.createdAt, '2026-06-20T08:00:00.000Z');
  assert.equal(migrated.modelPreset, 'fast');
  assert.equal('modelPreset' in migrated.generation, false);
  assert.equal(await readFile(join(rootDir, '.local', 'lessons', 'kept-slug.json'), 'utf8'), lesson);
  assert.equal(JSON.parse(await readFile(join(rootDir, '.local', 'stories', `${videoId}.json`), 'utf8')).video.title, 'Me at the zoo');
  assert.deepEqual(await migrateLegacyTasks(rootDir), { migrated: 0, conflicts: [] });
});

test('orders legacy tasks oldest first and converges identical sources on one story', async () => {
  const { migrateLegacyTasks } = await import('@/lib/server/task-migration.ts');
  const rootDir = await localRoot('task-migration-order-');
  await writeTask(rootDir, 'a-newer', legacyTask('a-newer', { createdAt: '2026-06-21T08:00:00.000Z' }));
  await writeTask(rootDir, 'z-older', legacyTask('z-older', { createdAt: '2026-06-19T08:00:00.000Z' }));

  assert.deepEqual(await migrateLegacyTasks(rootDir), { migrated: 2, conflicts: [] });
  const story = JSON.parse(await readFile(join(rootDir, '.local', 'stories', `${videoId}.json`), 'utf8'));
  assert.equal(story.createdAt, '2026-06-19T08:00:00.000Z');
  assert.deepEqual(await readdir(join(rootDir, '.local', 'stories')), [`${videoId}.json`]);
});

test('retains the oldest source and leaves a conflicting same-video legacy task recoverable', async () => {
  const { migrateLegacyTasks } = await import('@/lib/server/task-migration.ts');
  const rootDir = await localRoot('task-migration-conflict-');
  await writeTask(rootDir, 'a-newer', legacyTask('a-newer', {
    createdAt: '2026-06-21T08:00:00.000Z',
    transcript: { source: 'youtube-transcript.io', segments: [{ text: 'Different.', start: 0, duration: 1 }] },
  }));
  await writeTask(rootDir, 'z-older', legacyTask('z-older', { createdAt: '2026-06-19T08:00:00.000Z' }));

  assert.deepEqual(await migrateLegacyTasks(rootDir), {
    migrated: 1,
    conflicts: [{ id: 'a-newer', reason: 'story-source-conflict' }],
  });
  assert.equal(JSON.parse(await readFile(join(rootDir, '.local', 'tasks', 'a-newer.json'), 'utf8')).schemaVersion, 3);
  const story = JSON.parse(await readFile(join(rootDir, '.local', 'stories', `${videoId}.json`), 'utf8'));
  assert.equal(story.transcript.segments[0].text, 'Here we are at the zoo.');
});

test('normalizes a flat legacy error while preserving existing nested diagnostics', async () => {
  const { migrateLegacyTasks } = await import('@/lib/server/task-migration.ts');
  const rootDir = await localRoot('task-migration-errors-');
  await writeTask(rootDir, 'lesson', legacyTask('lesson'));
  await writeFile(join(rootDir, '.local', 'errors', 'lesson.json'), '{"legacy":true}\n');
  await mkdir(join(rootDir, '.local', 'errors', 'lesson', 'attempt-1'), { recursive: true });
  await writeFile(join(rootDir, '.local', 'errors', 'lesson', 'attempt-1', 'error.json'), '{"new":true}\n');

  assert.deepEqual(await migrateLegacyTasks(rootDir), { migrated: 1, conflicts: [] });
  assert.equal(await readFile(join(rootDir, '.local', 'errors', 'lesson', 'legacy', 'error.json'), 'utf8'), '{"legacy":true}\n');
  assert.equal(await readFile(join(rootDir, '.local', 'errors', 'lesson', 'attempt-1', 'error.json'), 'utf8'), '{"new":true}\n');
  await assert.rejects(() => readFile(join(rootDir, '.local', 'errors', 'lesson.json'), 'utf8'), /ENOENT/);
});

test('skips v4 and non-regular entries and reports malformed JSON without deleting it', async () => {
  const { migrateLegacyTasks } = await import('@/lib/server/task-migration.ts');
  const rootDir = await localRoot('task-migration-filter-');
  await writeTask(rootDir, 'current', v4Task('current'));
  await writeFile(join(rootDir, '.local', 'tasks', 'malformed.json'), '{not json');
  await writeFile(join(rootDir, 'outside.json'), JSON.stringify(legacyTask('linked')));
  await symlink(join(rootDir, 'outside.json'), join(rootDir, '.local', 'tasks', 'linked.json'));
  await mkdir(join(rootDir, '.local', 'tasks', 'directory.json'));

  assert.deepEqual(await migrateLegacyTasks(rootDir), {
    migrated: 0,
    conflicts: [{ id: 'malformed', reason: 'malformed-task' }],
  });
  assert.equal(await readFile(join(rootDir, '.local', 'tasks', 'malformed.json'), 'utf8'), '{not json');
  assert.equal(JSON.parse(await readFile(join(rootDir, '.local', 'tasks', 'current.json'), 'utf8')).schemaVersion, 4);
});

test('rejects a mismatched output path without rewriting the legacy task', async () => {
  const { migrateLegacyTasks } = await import('@/lib/server/task-migration.ts');
  const rootDir = await localRoot('task-migration-output-');
  const original = `${JSON.stringify(legacyTask('lesson', {
    output: { format: 'json', path: '.local/lessons/someone-else.json' },
  }), null, 2)}\n`;
  await writeFile(join(rootDir, '.local', 'tasks', 'lesson.json'), original);

  assert.deepEqual(await migrateLegacyTasks(rootDir), {
    migrated: 0,
    conflicts: [{ id: 'lesson', reason: 'unsafe-output-path' }],
  });
  assert.equal(await readFile(join(rootDir, '.local', 'tasks', 'lesson.json'), 'utf8'), original);
  assert.deepEqual(await readdir(join(rootDir, '.local', 'stories')), []);
});

test('readTask migrates one legacy task on demand without touching its peers', async () => {
  const rootDir = await localRoot('task-migration-read-');
  await writeTask(rootDir, 'requested', legacyTask('requested'));
  await writeTask(rootDir, 'peer', legacyTask('peer'));

  const task = await readTask('requested', rootDir);

  assert.equal(task.schemaVersion, 4);
  assert.equal(task.id, 'requested');
  assert.equal(JSON.parse(await readFile(join(rootDir, '.local', 'tasks', 'peer.json'), 'utf8')).schemaVersion, 3);
});
