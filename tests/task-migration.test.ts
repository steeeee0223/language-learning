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

test('preserves a historical generation skill version during migration', async () => {
  const { migrateLegacyTasks } = await import('@/lib/server/task-migration.ts');
  const rootDir = await localRoot('task-migration-skill-version-');
  await writeTask(rootDir, 'historical', legacyTask('historical', {
    generation: { status: 'succeeded', skillVersion: '3', modelPreset: 'best' },
  }));

  assert.deepEqual(await migrateLegacyTasks(rootDir), { migrated: 1, conflicts: [] });
  const migrated = JSON.parse(
    await readFile(join(rootDir, '.local', 'tasks', 'historical.json'), 'utf8'),
  );
  assert.equal(migrated.generation.skillVersion, '3');
  assert.equal('modelPreset' in migrated.generation, false);
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

test('serializes concurrent migration of the same flat diagnostic', async () => {
  const { migrateLegacyTask } = await import('@/lib/server/task-migration.ts');
  const rootDir = await localRoot('task-migration-error-concurrent-');
  await writeTask(rootDir, 'lesson', legacyTask('lesson'));
  await writeFile(join(rootDir, '.local', 'errors', 'lesson.json'), '{"legacy":true}\n');

  const results = await Promise.all([
    migrateLegacyTask('lesson', rootDir),
    migrateLegacyTask('lesson', rootDir),
  ]);

  assert.equal(results.reduce((sum, result) => sum + result.migrated, 0), 1);
  assert.equal(
    await readFile(join(rootDir, '.local', 'errors', 'lesson', 'legacy', 'error.json'), 'utf8'),
    '{"legacy":true}\n',
  );
});

test('keeps a differing flat diagnostic when the nested legacy target already exists', async () => {
  const { migrateLegacyTasks } = await import('@/lib/server/task-migration.ts');
  const rootDir = await localRoot('task-migration-error-target-conflict-');
  await writeTask(rootDir, 'lesson', legacyTask('lesson'));
  await writeFile(join(rootDir, '.local', 'errors', 'lesson.json'), '{"flat":true}\n');
  await mkdir(join(rootDir, '.local', 'errors', 'lesson', 'legacy'), { recursive: true });
  await writeFile(
    join(rootDir, '.local', 'errors', 'lesson', 'legacy', 'error.json'),
    '{"nested":true}\n',
  );

  assert.deepEqual(await migrateLegacyTasks(rootDir), {
    migrated: 0,
    conflicts: [{ id: 'lesson', reason: 'error-diagnostic-conflict' }],
  });
  assert.equal(await readFile(join(rootDir, '.local', 'errors', 'lesson.json'), 'utf8'), '{"flat":true}\n');
  assert.equal(
    await readFile(join(rootDir, '.local', 'errors', 'lesson', 'legacy', 'error.json'), 'utf8'),
    '{"nested":true}\n',
  );
});

test('reports a symlinked diagnostic directory as a recoverable conflict', async () => {
  const { migrateLegacyTasks } = await import('@/lib/server/task-migration.ts');
  const rootDir = await localRoot('task-migration-error-symlink-');
  await writeTask(rootDir, 'lesson', legacyTask('lesson'));
  await writeFile(join(rootDir, '.local', 'errors', 'lesson.json'), '{"flat":true}\n');
  const outside = join(rootDir, 'outside-errors');
  await mkdir(outside);
  await symlink(outside, join(rootDir, '.local', 'errors', 'lesson'));

  assert.deepEqual(await migrateLegacyTasks(rootDir), {
    migrated: 0,
    conflicts: [{ id: 'lesson', reason: 'error-diagnostic-conflict' }],
  });
  assert.equal(await readFile(join(rootDir, '.local', 'errors', 'lesson.json'), 'utf8'), '{"flat":true}\n');
  assert.deepEqual(await readdir(outside), []);
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

test('reports a schema-valid v4 task whose ID differs from its filename without rewriting it', async () => {
  const { migrateLegacyTasks } = await import('@/lib/server/task-migration.ts');
  const rootDir = await localRoot('task-migration-v4-id-mismatch-');
  const original = `${JSON.stringify(v4Task('embedded-id'), null, 2)}\n`;
  await writeFile(join(rootDir, '.local', 'tasks', 'filename-id.json'), original);

  assert.deepEqual(await migrateLegacyTasks(rootDir), {
    migrated: 0,
    conflicts: [{ id: 'filename-id', reason: 'malformed-task' }],
  });
  assert.equal(
    await readFile(join(rootDir, '.local', 'tasks', 'filename-id.json'), 'utf8'),
    original,
  );
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

test('on-demand migration makes the oldest same-video source canonical', async () => {
  const { TaskMigrationError } = await import('@/lib/server/task-migration.ts');
  const rootDir = await localRoot('task-migration-read-newer-first-');
  await writeTask(rootDir, 'newer', legacyTask('newer', {
    createdAt: '2026-06-21T08:00:00.000Z',
    transcript: {
      source: 'youtube-transcript.io',
      segments: [{ text: 'Newer source.', start: 0, duration: 1 }],
    },
  }));
  await writeTask(rootDir, 'older', legacyTask('older', {
    createdAt: '2026-06-19T08:00:00.000Z',
    transcript: {
      source: 'youtube-transcript.io',
      segments: [{ text: 'Oldest source.', start: 0, duration: 1 }],
    },
  }));

  await assert.rejects(
    () => readTask('newer', rootDir),
    (error: unknown) =>
      error instanceof TaskMigrationError && error.reason === 'story-source-conflict',
  );
  const story = JSON.parse(
    await readFile(join(rootDir, '.local', 'stories', `${videoId}.json`), 'utf8'),
  );
  assert.equal(story.transcript.segments[0].text, 'Oldest source.');
  assert.equal(
    JSON.parse(await readFile(join(rootDir, '.local', 'tasks', 'newer.json'), 'utf8')).schemaVersion,
    3,
  );
});

test('single-task migration reports malformed JSON through the typed conflict path', async () => {
  const { migrateLegacyTask, TaskMigrationError } = await import('@/lib/server/task-migration.ts');
  const rootDir = await localRoot('task-migration-single-malformed-');
  await writeFile(join(rootDir, '.local', 'tasks', 'broken.json'), '{not json');

  assert.deepEqual(await migrateLegacyTask('broken', rootDir), {
    migrated: 0,
    conflicts: [{ id: 'broken', reason: 'malformed-task' }],
  });
  await assert.rejects(
    () => readTask('broken', rootDir),
    (error: unknown) => error instanceof TaskMigrationError && error.reason === 'malformed-task',
  );
  assert.equal(await readFile(join(rootDir, '.local', 'tasks', 'broken.json'), 'utf8'), '{not json');
});

test('migration and generation update wait on the same filesystem task lock', async () => {
  const { withTaskFileLock } = await import('@/lib/server/task-file-lock.ts');
  const { migrateLegacyTask } = await import('@/lib/server/task-migration.ts');
  const { updateTaskGeneration } = await import('@/lib/server/task-store.ts');
  const rootDir = await localRoot('task-migration-update-lock-');
  await writeTask(rootDir, 'lesson', legacyTask('lesson'));
  let migration!: ReturnType<typeof migrateLegacyTask>;
  let update!: ReturnType<typeof updateTaskGeneration>;

  await withTaskFileLock(rootDir, 'lesson', async () => {
    migration = migrateLegacyTask('lesson', rootDir);
    update = updateTaskGeneration(
      'lesson',
      { status: 'succeeded', skillVersion: '4', completedAt: '2026-06-22T08:00:00.000Z' },
      rootDir,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(
      JSON.parse(await readFile(join(rootDir, '.local', 'tasks', 'lesson.json'), 'utf8')).schemaVersion,
      3,
    );
  });

  await Promise.all([migration, update]);
  const finalTask = await readTask('lesson', rootDir);
  assert.equal(finalTask.generation.status, 'succeeded');
  assert.equal(finalTask.generation.completedAt, '2026-06-22T08:00:00.000Z');
});
