import { rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { generateLesson } from './generate-lesson';
import { GenerationError } from './generation-errors';
import { canonicalizeLocalRoot, ensureLocalDirs } from './local-paths';
import { tryAcquireTaskOperation } from './task-operation-lock';
import { readTask } from './task-store';
import { buildTaskFile } from './tasks';

type TaskLifecycleInput = {
  slug: string;
  rootDir?: string;
};

export async function regenerateTask(
  input: TaskLifecycleInput,
  dependencies: { generate?: typeof generateLesson } = {},
) {
  const rootDir = await canonicalizeLocalRoot(input.rootDir);
  const release = tryAcquireTaskOperation(rootDir, input.slug);
  if (!release) {
    throw new GenerationError('GENERATION_IN_PROGRESS', 'This task is already being generated.');
  }

  let taskId: string;
  try {
    const source = await readTask(input.slug, rootDir);
    ({ taskId } = await buildTaskFile(
      {
        storyId: source.storyId,
        learningSettings: source.learningSettings,
        modelPreset: source.modelPreset,
      },
      { rootDir },
    ));
  } finally {
    release();
  }

  await (dependencies.generate ?? generateLesson)({ slug: taskId, rootDir });
  return { taskId };
}

export async function deleteTask(input: TaskLifecycleInput) {
  const paths = await ensureLocalDirs(input.rootDir);
  const release = tryAcquireTaskOperation(paths.rootDir, input.slug);
  if (!release) {
    throw new GenerationError('GENERATION_IN_PROGRESS', 'This task is already being generated.');
  }

  try {
    await readTask(input.slug, paths.rootDir);
    await rm(join(paths.lessonsDir, `${input.slug}.json`), { force: true });
    await rm(join(paths.errorsDir, `${input.slug}.json`), { force: true });
    await rm(join(paths.errorsDir, input.slug), { recursive: true, force: true });
    await unlink(join(paths.tasksDir, `${input.slug}.json`));
  } finally {
    release();
  }
}
