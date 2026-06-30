import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, rename, unlink, writeFile, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';

import { localSlugSchema } from '@/lib/generation-contracts';
import { ensureLocalDirs } from './local-paths';
import { migrateLegacyTask } from './task-migration';
import {
  generationMetadataSchema,
  storedTaskSchema,
  type GenerationMetadata,
  type StoredTask,
} from './task-schema';

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
    const value: unknown = JSON.parse(await file.readFile('utf8'));
    const current = storedTaskSchema.safeParse(value);
    if (current.success) {
      if (current.data.id !== slug) throw new Error('Stored task ID does not match its filename.');
      return current.data;
    }
  } finally {
    await file?.close();
  }

  const result = await migrateLegacyTask(slug, rootDir);
  if (result.migrated !== 1) {
    throw new Error(`Legacy task migration failed: ${result.conflicts[0]?.reason ?? 'unknown'}.`);
  }
  return readTask(slug, rootDir);
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
  const tempPath = join(tasksDir, `.${slug}.${process.pid}.${randomUUID()}.tmp`);

  try {
    await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(tempPath, finalPath);
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }

  return next;
}
