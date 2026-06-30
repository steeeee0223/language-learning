import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { localSlugSchema } from '@/lib/generation-contracts';
import { ensureLocalDirs } from './local-paths';

const TASK_FILE_LOCK_POLL_MS = 10;
const TASK_FILE_LOCK_STALE_MS = 5 * 60_000;

function hasErrorCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return hasErrorCode(error, 'EPERM');
  }
}

async function readOwner(lockPath: string) {
  try {
    const value: unknown = JSON.parse(await readFile(join(lockPath, 'owner.json'), 'utf8'));
    if (
      typeof value === 'object' &&
      value !== null &&
      'pid' in value &&
      typeof value.pid === 'number' &&
      'token' in value &&
      typeof value.token === 'string'
    ) {
      return { pid: value.pid, token: value.token };
    }
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT') && !(error instanceof SyntaxError)) throw error;
  }
  return undefined;
}

async function recoverStaleLock(lockPath: string, staleAfterMs: number) {
  let lockStats;
  try {
    lockStats = await stat(lockPath);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return;
    throw error;
  }
  if (Date.now() - lockStats.mtimeMs <= staleAfterMs) return;
  const owner = await readOwner(lockPath);
  if (owner && isProcessAlive(owner.pid)) return;

  const abandonedPath = `${lockPath}.abandoned.${randomUUID()}`;
  try {
    await rename(lockPath, abandonedPath);
    await rm(abandonedPath, { recursive: true, force: true });
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) throw error;
  }
}

async function acquireTaskFileLock(rootDir: string, slug: string) {
  localSlugSchema.parse(slug);
  const { tasksDir } = await ensureLocalDirs(rootDir);
  const lockPath = join(tasksDir, `.${slug}.task.lock`);
  const token = randomUUID();

  while (true) {
    try {
      await mkdir(lockPath);
    } catch (error) {
      if (!hasErrorCode(error, 'EEXIST')) throw error;
      await recoverStaleLock(lockPath, TASK_FILE_LOCK_STALE_MS);
      await delay(TASK_FILE_LOCK_POLL_MS);
      continue;
    }

    try {
      await writeFile(join(lockPath, 'owner.json'), JSON.stringify({ pid: process.pid, token }), {
        encoding: 'utf8',
        flag: 'wx',
      });
    } catch (error) {
      await rm(lockPath, { recursive: true, force: true });
      throw error;
    }

    return async () => {
      const owner = await readOwner(lockPath);
      if (owner?.token === token) await rm(lockPath, { recursive: true, force: true });
    };
  }
}

export async function withTaskFileLock<T>(rootDir: string, slug: string, operation: () => Promise<T>) {
  const release = await acquireTaskFileLock(rootDir, slug);
  try {
    return await operation();
  } finally {
    await release();
  }
}
