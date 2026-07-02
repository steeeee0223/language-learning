import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { localSlugSchema } from '@/lib/generation-contracts';
import { ensureLocalDirs } from './local-paths';
import { hasNodeErrorCode, sleep } from './node-utils';
import { resolveProcessStartIdentity as resolveLocalProcessStartIdentity } from './process-start-identity';

const TASK_FILE_LOCK_POLL_MS = 10;
const TASK_FILE_LOCK_STALE_MS = 5 * 60_000;

type LockOwner = {
  pid: number;
  processStartIdentity?: string;
  token: string;
};

export type ProcessStartIdentityResolver = (pid: number) => Promise<string | null>;

function isPathOccupiedError(error: unknown) {
  return hasNodeErrorCode(error, 'EEXIST') || hasNodeErrorCode(error, 'ENOTEMPTY');
}

async function readOwner(lockPath: string): Promise<LockOwner | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(join(lockPath, 'owner.json'), 'utf8'));
    if (
      typeof value === 'object' &&
      value !== null &&
      'pid' in value &&
      typeof value.pid === 'number' &&
      'token' in value &&
      typeof value.token === 'string' &&
      (!('processStartIdentity' in value) || typeof value.processStartIdentity === 'string')
    ) {
      const processStartIdentity =
        'processStartIdentity' in value && typeof value.processStartIdentity === 'string'
          ? value.processStartIdentity
          : undefined;
      return {
        pid: value.pid,
        processStartIdentity,
        token: value.token,
      };
    }
  } catch (error) {
    if (!hasNodeErrorCode(error, 'ENOENT') && !(error instanceof SyntaxError)) throw error;
  }
  return undefined;
}

function hasSameOwner(left: LockOwner | undefined, right: LockOwner | undefined) {
  return (
    left?.pid === right?.pid &&
    left?.processStartIdentity === right?.processStartIdentity &&
    left?.token === right?.token
  );
}

async function isOwnerRecoverable(
  owner: LockOwner | undefined,
  resolveProcessStartIdentity: ProcessStartIdentityResolver,
) {
  if (!owner) return false;
  let currentIdentity: string | null;
  try {
    currentIdentity = await resolveProcessStartIdentity(owner.pid);
  } catch {
    return false;
  }
  if (currentIdentity === null) return true;
  return owner.processStartIdentity !== undefined && owner.processStartIdentity !== currentIdentity;
}

function recoveryClaimPath(lockPath: string, ownerIdentity: string) {
  const ownerHash = createHash('sha256').update(ownerIdentity).digest('hex');
  return `${lockPath}.recovery.${ownerHash}`;
}

async function publishOwnedDirectory(path: string, owner: LockOwner) {
  const preparedPath = `${path}.pending.${owner.token}`;
  await mkdir(preparedPath);
  try {
    await writeFile(join(preparedPath, 'owner.json'), JSON.stringify(owner), {
      encoding: 'utf8',
      flag: 'wx',
    });
    try {
      await rename(preparedPath, path);
      return true;
    } catch (error) {
      if (isPathOccupiedError(error)) return false;
      throw error;
    }
  } finally {
    await rm(preparedPath, { recursive: true, force: true });
  }
}

async function removeRecoverableOwnedDirectory(
  path: string,
  staleAfterMs: number,
  resolveProcessStartIdentity: ProcessStartIdentityResolver,
) {
  let initialStats;
  try {
    initialStats = await stat(path);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return true;
    throw error;
  }
  if (Date.now() - initialStats.mtimeMs <= staleAfterMs) return false;
  const initialOwner = await readOwner(path);
  if (!(await isOwnerRecoverable(initialOwner, resolveProcessStartIdentity))) return false;

  let currentStats;
  try {
    currentStats = await stat(path);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return true;
    throw error;
  }
  const currentOwner = await readOwner(path);
  if (
    currentStats.dev !== initialStats.dev ||
    currentStats.ino !== initialStats.ino ||
    !hasSameOwner(currentOwner, initialOwner)
  ) {
    return false;
  }

  const abandonedPath = `${path}.abandoned.${randomUUID()}`;
  try {
    await rename(path, abandonedPath);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return true;
    throw error;
  }
  await rm(abandonedPath, { recursive: true, force: true });
  return true;
}

async function acquireRecoveryClaim(
  claimPath: string,
  staleAfterMs: number,
  owner: LockOwner,
  resolveProcessStartIdentity: ProcessStartIdentityResolver,
) {
  while (!(await publishOwnedDirectory(claimPath, owner))) {
    const recovered = await removeRecoverableOwnedDirectory(
      claimPath,
      staleAfterMs,
      resolveProcessStartIdentity,
    );
    if (!recovered) return undefined;
  }

  return {
    owner,
    release: async () => {
      const currentOwner = await readOwner(claimPath);
      if (hasSameOwner(currentOwner, owner)) {
        await rm(claimPath, { recursive: true, force: true });
      }
    },
  };
}

async function recoverStaleLock(
  lockPath: string,
  staleAfterMs: number,
  processOwner: Omit<LockOwner, 'token'>,
  resolveProcessStartIdentity: ProcessStartIdentityResolver,
) {
  let initialStats;
  try {
    initialStats = await stat(lockPath);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return;
    throw error;
  }
  if (Date.now() - initialStats.mtimeMs <= staleAfterMs) return;
  const initialOwner = await readOwner(lockPath);
  if (!(await isOwnerRecoverable(initialOwner, resolveProcessStartIdentity))) return;

  const ownerIdentity = initialOwner?.token ?? `missing:${initialStats.dev}:${initialStats.ino}`;
  const recoveryPath = recoveryClaimPath(lockPath, ownerIdentity);
  const claimOwner = { ...processOwner, token: randomUUID() };
  const claim = await acquireRecoveryClaim(
    recoveryPath,
    staleAfterMs,
    claimOwner,
    resolveProcessStartIdentity,
  );
  if (!claim) return;

  try {
    const currentStats = await stat(lockPath);
    const currentOwner = await readOwner(lockPath);
    const currentClaim = await readOwner(recoveryPath);
    if (
      !hasSameOwner(currentClaim, claim.owner) ||
      currentStats.dev !== initialStats.dev ||
      currentStats.ino !== initialStats.ino ||
      !hasSameOwner(currentOwner, initialOwner)
    ) {
      return;
    }

    const abandonedPath = `${lockPath}.abandoned.${randomUUID()}`;
    await rename(lockPath, abandonedPath);
    await rm(abandonedPath, { recursive: true, force: true });
  } catch (error) {
    if (!hasNodeErrorCode(error, 'ENOENT')) throw error;
  } finally {
    await claim.release();
  }
}

export type TaskFileLockOptions = {
  staleAfterMs?: number;
  pollMs?: number;
  resolveProcessStartIdentity?: ProcessStartIdentityResolver;
};

async function acquireTaskFileLock(
  rootDir: string,
  slug: string,
  {
    staleAfterMs = TASK_FILE_LOCK_STALE_MS,
    pollMs = TASK_FILE_LOCK_POLL_MS,
    resolveProcessStartIdentity = resolveLocalProcessStartIdentity,
  }: TaskFileLockOptions,
) {
  localSlugSchema.parse(slug);
  const { tasksDir } = await ensureLocalDirs(rootDir);
  const lockPath = join(tasksDir, `.${slug}.task.lock`);
  const processStartIdentity = await resolveProcessStartIdentity(process.pid);
  if (processStartIdentity === null) {
    throw new Error('The current process disappeared while acquiring a task file lock.');
  }
  const processOwner = { pid: process.pid, processStartIdentity };

  while (true) {
    const owner = { ...processOwner, token: randomUUID() };
    if (await publishOwnedDirectory(lockPath, owner)) {
      const release = async () => {
        const currentOwner = await readOwner(lockPath);
        if (hasSameOwner(currentOwner, owner)) {
          await rm(lockPath, { recursive: true, force: true });
        }
      };
      return { release };
    }

    await recoverStaleLock(lockPath, staleAfterMs, processOwner, resolveProcessStartIdentity);
    await sleep(pollMs);
  }
}

export async function withTaskFileLock<T>(
  rootDir: string,
  slug: string,
  operation: () => Promise<T>,
  options: TaskFileLockOptions = {},
) {
  const { release } = await acquireTaskFileLock(rootDir, slug, options);
  try {
    return await operation();
  } finally {
    await release();
  }
}
