import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
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

function recoveryClaimPath(lockPath: string, ownerIdentity: string) {
  const ownerHash = createHash('sha256').update(ownerIdentity).digest('hex');
  return `${lockPath}.recovery.${ownerHash}`;
}

async function acquireRecoveryClaim(claimPath: string, staleAfterMs: number) {
  const token = randomUUID();
  while (true) {
    try {
      await mkdir(claimPath);
    } catch (error) {
      if (!hasErrorCode(error, 'EEXIST')) throw error;
      let claimStats;
      try {
        claimStats = await stat(claimPath);
      } catch (statError) {
        if (hasErrorCode(statError, 'ENOENT')) continue;
        throw statError;
      }
      if (Date.now() - claimStats.mtimeMs <= staleAfterMs) return undefined;

      const abandonedClaim = `${claimPath}.abandoned.${randomUUID()}`;
      try {
        await rename(claimPath, abandonedClaim);
      } catch (renameError) {
        if (hasErrorCode(renameError, 'ENOENT')) continue;
        throw renameError;
      }
      await rm(abandonedClaim, { recursive: true, force: true });
      continue;
    }

    try {
      await writeFile(
        join(claimPath, 'owner.json'),
        JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }),
        { encoding: 'utf8', flag: 'wx' },
      );
    } catch (error) {
      await rm(claimPath, { recursive: true, force: true });
      throw error;
    }

    return {
      token,
      release: async () => {
        const owner = await readOwner(claimPath);
        if (owner?.token === token) await rm(claimPath, { recursive: true, force: true });
      },
    };
  }
}

async function recoverStaleLock(lockPath: string, staleAfterMs: number) {
  let initialStats;
  try {
    initialStats = await stat(lockPath);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return;
    throw error;
  }
  if (Date.now() - initialStats.mtimeMs <= staleAfterMs) return;
  const initialOwner = await readOwner(lockPath);
  const ownerIdentity = initialOwner?.token ?? `missing:${initialStats.dev}:${initialStats.ino}`;
  const recoveryPath = recoveryClaimPath(lockPath, ownerIdentity);
  const claim = await acquireRecoveryClaim(recoveryPath, staleAfterMs);
  if (!claim) return;

  try {
    const currentStats = await stat(lockPath);
    const currentOwner = await readOwner(lockPath);
    const currentClaim = await readOwner(recoveryPath);
    if (
      currentClaim?.token !== claim.token ||
      currentStats.dev !== initialStats.dev ||
      currentStats.ino !== initialStats.ino ||
      Date.now() - currentStats.mtimeMs <= staleAfterMs ||
      currentOwner?.token !== initialOwner?.token
    ) {
      return;
    }

    const abandonedPath = `${lockPath}.abandoned.${randomUUID()}`;
    await rename(lockPath, abandonedPath);
    await rm(abandonedPath, { recursive: true, force: true });
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) throw error;
  } finally {
    await claim.release();
  }
}

export type TaskFileLockOptions = {
  staleAfterMs?: number;
  pollMs?: number;
};

async function acquireTaskFileLock(
  rootDir: string,
  slug: string,
  { staleAfterMs = TASK_FILE_LOCK_STALE_MS, pollMs = TASK_FILE_LOCK_POLL_MS }: TaskFileLockOptions,
) {
  localSlugSchema.parse(slug);
  const { tasksDir } = await ensureLocalDirs(rootDir);
  const lockPath = join(tasksDir, `.${slug}.task.lock`);
  const token = randomUUID();

  while (true) {
    try {
      await mkdir(lockPath);
    } catch (error) {
      if (!hasErrorCode(error, 'EEXIST')) throw error;
      await recoverStaleLock(lockPath, staleAfterMs);
      await delay(pollMs);
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

    const release = async () => {
      const owner = await readOwner(lockPath);
      if (owner?.token === token) await rm(lockPath, { recursive: true, force: true });
    };
    return { lockPath, token, release };
  }
}

function startLeaseHeartbeat(lockPath: string, token: string, staleAfterMs: number) {
  const intervalMs = Math.max(1, Math.floor(staleAfterMs / 3));
  let pending = Promise.resolve();
  let failure: unknown;
  const timer = setInterval(() => {
    pending = pending.then(async () => {
      if (failure) return;
      try {
        const owner = await readOwner(lockPath);
        if (owner?.token !== token) return;
        const now = new Date();
        await utimes(lockPath, now, now);
      } catch (error) {
        if (!hasErrorCode(error, 'ENOENT')) failure = error;
      }
    });
  }, intervalMs);

  return async () => {
    clearInterval(timer);
    await pending;
    if (failure) throw failure;
  };
}

export async function withTaskFileLock<T>(
  rootDir: string,
  slug: string,
  operation: () => Promise<T>,
  options: TaskFileLockOptions = {},
) {
  const staleAfterMs = options.staleAfterMs ?? TASK_FILE_LOCK_STALE_MS;
  const { lockPath, token, release } = await acquireTaskFileLock(rootDir, slug, options);
  const stopHeartbeat = startLeaseHeartbeat(lockPath, token, staleAfterMs);
  try {
    return await operation();
  } finally {
    try {
      await stopHeartbeat();
    } finally {
      await release();
    }
  }
}
