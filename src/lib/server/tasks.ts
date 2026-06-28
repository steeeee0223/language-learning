import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { TaskFileInput } from '@/lib/contracts';
import { ensureLocalDirs } from './local-paths.ts';
import { LESSON_SKILL_VERSION, requiredLessonSections, storedTaskSchema, TASK_SCHEMA_VERSION } from './task-schema.ts';
import { tryAcquireTaskOperation } from './task-operation-lock.ts';

type BuildTaskFileInput = TaskFileInput & {
  rootDir?: string;
  now?: Date;
};

type BuildTaskFileResult = {
  taskSlug: string;
  taskPath: string;
  outputPath: string;
};

function slugifyTitle(title: string, fallback: string) {
  const slug = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || fallback;
}

export async function buildTaskFile(input: BuildTaskFileInput): Promise<BuildTaskFileResult> {
  const rootDir = input.rootDir;
  const now = input.now ?? new Date();
  const paths = await ensureLocalDirs(rootDir);
  const datePrefix = now.toISOString().slice(0, 10);
  const basename = `${datePrefix}-${slugifyTitle(input.video.title, input.video.id)}`;
  const taskPath = `.local/tasks/${basename}.json`;
  const outputPath = `.local/lessons/${basename}.mdx`;
  const releaseTaskOperation = tryAcquireTaskOperation(paths.rootDir, basename);
  if (!releaseTaskOperation) {
    throw new Error('This task is currently being generated.');
  }

  try {
    const task = storedTaskSchema.parse({
      schemaVersion: TASK_SCHEMA_VERSION,
      createdAt: now.toISOString(),
      video: input.video,
      transcript: input.transcript,
      learningSettings: input.learningSettings,
      output: {
        format: 'mdx',
        path: outputPath,
      },
      instructions: {
        requiredSections: requiredLessonSections,
      },
      generation: {
        status: 'pending',
        skillVersion: LESSON_SKILL_VERSION,
      },
    });

    await writeFile(
      join(paths.tasksDir, `${basename}.json`),
      `${JSON.stringify(task, null, 2)}\n`,
      'utf8',
    );
  } finally {
    releaseTaskOperation();
  }

  return {
    taskSlug: basename,
    taskPath,
    outputPath,
  };
}
