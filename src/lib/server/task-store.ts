import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, rename, unlink, writeFile, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';

import { localSlugSchema } from '@/lib/schemas/generation-contracts';
import { ensureLocalDirs } from './local-paths';
import { withTaskFileLock } from './task-file-lock';
import {
  generationMetadataSchema,
  storedTaskSchema,
  type GenerationMetadata,
  type StoredTask,
} from '../schemas/task-schema';

function assertTaskSlug(slug: string) {
  localSlugSchema.parse(slug);
}

export async function readTask(slug: string, rootDir?: string): Promise<StoredTask> {
  assertTaskSlug(slug);
  const { tasksDir } = await ensureLocalDirs(rootDir);
  const taskPath = join(tasksDir, `${slug}.json`);
  let file: FileHandle | undefined;
  try {
    file = await open(taskPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = await file.stat();
    if (!stats.isFile()) throw new Error('Task path is not a regular file.');
    const task = storedTaskSchema.parse(JSON.parse(await file.readFile('utf8')));
    if (task.id !== slug) throw new Error('Task ID must match its filename.');
    return task;
  } finally {
    await file?.close();
  }
}

export async function updateTaskGeneration(
  slug: string,
  generation: GenerationMetadata,
  rootDir?: string,
): Promise<StoredTask> {
  await readTask(slug, rootDir);
  const paths = await ensureLocalDirs(rootDir);
  return withTaskFileLock(paths.rootDir, slug, async () => {
    const current = await readTask(slug, paths.rootDir);
    const next = storedTaskSchema.parse({
      ...current,
      generation: generationMetadataSchema.parse(generation),
    });
    const finalPath = join(paths.tasksDir, `${slug}.json`);
    const tempPath = join(paths.tasksDir, `.${slug}.${process.pid}.${randomUUID()}.tmp`);

    try {
      await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      await rename(tempPath, finalPath);
    } finally {
      await unlink(tempPath).catch(() => undefined);
    }

    return next;
  });
}
