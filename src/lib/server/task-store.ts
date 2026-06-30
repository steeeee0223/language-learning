import { constants } from 'node:fs';
import { open, rename, unlink, writeFile, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';

import { localSlugSchema } from '@/lib/generation-contracts';
import { ensureLocalDirs } from './local-paths';
import { generationMetadataSchema, storedTaskSchema, type GenerationMetadata, type StoredTask } from './task-schema';

function assertTaskSlug(slug: string) {
  localSlugSchema.parse(slug);
}

export async function readTask(slug: string, rootDir?: string): Promise<StoredTask> {
  assertTaskSlug(slug);
  const { tasksDir } = await ensureLocalDirs(rootDir);
  let file: FileHandle | undefined;
  try {
    file = await open(join(tasksDir, `${slug}.json`), constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = await file.stat();
    if (!stats.isFile()) throw new Error('Task path is not a regular file.');
    const task = storedTaskSchema.parse(JSON.parse(await file.readFile('utf8')));
    if (task.id !== slug) throw new Error('Stored task ID does not match its filename.');
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
  const current = await readTask(slug, rootDir);
  const next = storedTaskSchema.parse({ ...current, generation: generationMetadataSchema.parse(generation) });
  const { tasksDir } = await ensureLocalDirs(rootDir);
  const finalPath = join(tasksDir, `${slug}.json`);
  const tempPath = join(tasksDir, `.${slug}.${process.pid}.${Date.now()}.tmp`);

  try {
    await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(tempPath, finalPath);
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }

  return next;
}
