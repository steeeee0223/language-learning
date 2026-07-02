import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureLocalDirs } from '@/lib/server/local-paths.ts';
import { deleteTask, regenerateTask } from '@/lib/server/task-lifecycle.ts';
import { listTaskGroups } from '@/lib/server/task-queries.ts';
import { storySchema } from '@/lib/server/story-schema.ts';
import { storedTaskSchema } from '@/lib/server/task-schema.ts';
import { readTask } from '@/lib/server/task-store.ts';

async function createFixture() {
  const rootDir = await mkdtemp(join(tmpdir(), 'task-lifecycle-'));
  const paths = await ensureLocalDirs(rootDir);
  const story = storySchema.parse({
    schemaVersion: 1,
    id: 'jNQXAC9IVRw',
    createdAt: '2026-06-30T08:00:00.000Z',
    video: {
      id: 'jNQXAC9IVRw',
      title: 'Me at the zoo',
      url: 'https://youtu.be/jNQXAC9IVRw',
    },
    transcript: {
      source: 'youtube-transcript.io',
      segments: [{ text: 'Here we are.', start: 0, duration: 1 }],
    },
  });
  const task = storedTaskSchema.parse({
    schemaVersion: 4,
    id: 'source-task',
    storyId: story.id,
    createdAt: '2026-06-30T09:00:00.000Z',
    learningSettings: { targetLanguage: 'zh', cefrLevels: ['A2'] },
    modelPreset: 'fast',
    output: { format: 'json', path: '.local/lessons/source-task.json' },
    instructions: {
      requiredSections: ['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage'],
    },
    generation: { status: 'succeeded', skillVersion: '4' },
  });

  await writeFile(join(paths.storiesDir, `${story.id}.json`), JSON.stringify(story));
  await writeFile(join(paths.tasksDir, `${task.id}.json`), JSON.stringify(task));
  return { rootDir, paths, story, task };
}

test('listTaskGroups groups task summaries without transcripts', async () => {
  const { rootDir, story, task } = await createFixture();

  const result = await listTaskGroups(rootDir);

  assert.deepEqual(result, {
    groups: [
      {
        story: {
          id: story.id,
          title: story.video.title,
          url: story.video.url,
          createdAt: story.createdAt,
        },
        tasks: [
          {
            id: task.id,
            status: 'succeeded',
            cefrLevels: ['A2'],
            targetLanguage: 'zh',
            modelPreset: 'fast',
            createdAt: task.createdAt,
            lessonUrl: '/lessons/source-task',
          },
        ],
      },
    ],
  });
  assert.equal(JSON.stringify(result).includes('Here we are.'), false);
});

test('listTaskGroups skips migration-conflicted task files', async () => {
  const { rootDir, paths, task } = await createFixture();
  const legacyPath = join(paths.tasksDir, 'unsupported-legacy.json');
  const legacySource = '{"schemaVersion":1}\n';
  await writeFile(legacyPath, legacySource);

  const result = await listTaskGroups(rootDir);

  assert.deepEqual(result.groups.flatMap((group) => group.tasks.map(({ id }) => id)), [task.id]);
  assert.equal(await readFile(legacyPath, 'utf8'), legacySource);
});

test('regenerateTask copies settings and deleteTask removes task artifacts', async () => {
  const { rootDir, paths, task } = await createFixture();
  const result = await regenerateTask(
    { slug: task.id, rootDir },
    {
      generate: async ({ slug }) => ({
        lessonSlug: slug,
        lessonPath: `.local/lessons/${slug}.json`,
      }),
    },
  );
  const regenerated = await readTask(result.taskId, rootDir);

  assert.notEqual(regenerated.id, task.id);
  assert.deepEqual(regenerated.learningSettings, task.learningSettings);
  assert.equal(regenerated.modelPreset, task.modelPreset);

  await writeFile(join(paths.lessonsDir, `${regenerated.id}.json`), '{}');
  await deleteTask({ slug: regenerated.id, rootDir });

  await assert.rejects(() => readFile(join(paths.tasksDir, `${regenerated.id}.json`)), /ENOENT/);
  await assert.rejects(() => readFile(join(paths.lessonsDir, `${regenerated.id}.json`)), /ENOENT/);
});
