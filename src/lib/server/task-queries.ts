import { readdir } from 'node:fs/promises';

import { taskListResponseSchema, type TaskListResponse } from '@/lib/task-contracts';
import { ensureLocalDirs } from './local-paths';
import { readStory } from './story-store';
import { migrateLegacyTasks } from './task-migration';
import { readTask } from './task-store';

export async function listTaskGroups(rootDir?: string): Promise<TaskListResponse> {
  const paths = await ensureLocalDirs(rootDir);
  const migration = await migrateLegacyTasks(paths.rootDir);
  const conflictedTaskIds = new Set(migration.conflicts.map(({ id }) => id));
  const entries = await readdir(paths.tasksDir, { withFileTypes: true });
  const groups = new Map<string, TaskListResponse['groups'][number]>();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const taskId = entry.name.slice(0, -'.json'.length);
    if (conflictedTaskIds.has(taskId)) continue;
    const task = await readTask(taskId, paths.rootDir);
    let group = groups.get(task.storyId);
    if (!group) {
      const story = await readStory(task.storyId, paths.rootDir);
      group = {
        story: {
          id: story.id,
          title: story.video.title,
          url: story.video.url,
          createdAt: story.createdAt,
        },
        tasks: [],
      };
      groups.set(task.storyId, group);
    }

    group.tasks.push({
      id: task.id,
      status: task.generation.status,
      cefrLevels: task.learningSettings.cefrLevels,
      targetLanguage: task.learningSettings.targetLanguage,
      modelPreset: task.modelPreset,
      createdAt: task.createdAt,
      ...(task.generation.status === 'succeeded'
        ? { lessonUrl: `/lessons/${task.id}` }
        : {}),
    });
  }

  const result = [...groups.values()];
  for (const group of result) {
    group.tasks.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
  result.sort((left, right) => right.story.createdAt.localeCompare(left.story.createdAt));
  return taskListResponseSchema.parse({ groups: result });
}
