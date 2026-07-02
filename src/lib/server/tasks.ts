import { randomUUID } from 'node:crypto';
import { link, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { taskCreationRequestSchema, type TaskCreationRequest } from '@/lib/contracts';
import { localSlugSchema } from '@/lib/generation-contracts';
import { ensureLocalDirs } from './local-paths';
import { hasNodeErrorCode } from './node-utils';
import { readStory, StoryStoreError } from './story-store';
import { LESSON_SKILL_VERSION, requiredLessonSections, storedTaskSchema, TASK_SCHEMA_VERSION } from './task-schema';

type BuildTaskFileDependencies = {
  rootDir?: string;
  now?: () => Date;
  idGenerator?: () => string;
};

type BuildTaskFileResult = {
  taskId: string;
};

export class TaskCreationError extends Error {
  constructor(
    readonly code: 'STORY_NOT_FOUND',
    options?: ErrorOptions,
  ) {
    super('Task creation failed.', options);
    this.name = 'TaskCreationError';
  }
}

export async function buildTaskFile(
  request: TaskCreationRequest,
  dependencies: BuildTaskFileDependencies = {},
): Promise<BuildTaskFileResult> {
  const input = taskCreationRequestSchema.parse(request);
  try {
    await readStory(input.storyId, dependencies.rootDir);
  } catch (error) {
    if (error instanceof StoryStoreError && error.code === 'STORY_NOT_FOUND') {
      throw new TaskCreationError('STORY_NOT_FOUND', { cause: error });
    }
    throw error;
  }

  const paths = await ensureLocalDirs(dependencies.rootDir);
  const now = (dependencies.now ?? (() => new Date()))();
  const idGenerator = dependencies.idGenerator ?? randomUUID;

  while (true) {
    const id = localSlugSchema.parse(idGenerator());
    const task = storedTaskSchema.parse({
      schemaVersion: TASK_SCHEMA_VERSION,
      id,
      storyId: input.storyId,
      createdAt: now.toISOString(),
      learningSettings: input.learningSettings,
      modelPreset: input.modelPreset,
      output: {
        format: 'json',
        path: `.local/lessons/${id}.json`,
      },
      instructions: {
        requiredSections: requiredLessonSections,
      },
      generation: {
        status: 'pending',
        skillVersion: LESSON_SKILL_VERSION,
      },
    });
    const finalPath = join(paths.tasksDir, `${id}.json`);
    const tempPath = join(paths.tasksDir, `.${id}.${process.pid}.${randomUUID()}.tmp`);

    try {
      await writeFile(tempPath, `${JSON.stringify(task, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      try {
        await link(tempPath, finalPath);
      } catch (error) {
        if (hasNodeErrorCode(error, 'EEXIST')) continue;
        throw error;
      }
    } finally {
      await unlink(tempPath).catch(() => undefined);
    }

    return { taskId: id };
  }
}
