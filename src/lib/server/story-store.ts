import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  link,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
  type FileHandle,
} from 'node:fs/promises';
import { resolve } from 'node:path';

import { transcriptBundleSchema, type TranscriptBundle } from '@/lib/contracts';
import { isYouTubeVideoId, parseYouTubeVideoId } from '@/lib/youtube';
import { ensureLocalDirs } from './local-paths';
import { hasNodeErrorCode, sleep } from './node-utils';
import { isPathWithin } from './path-utils';
import { storySchema, type Story } from './story-schema';
import { runSingleFlightOperation } from './task-operation-lock';

type CreateOrReuseStoryInput = {
  url: string;
  rootDir?: string;
  lockTiming?: {
    pollMs: number;
    staleAfterMs: number;
  };
  fetchBundle: (url: string) => Promise<TranscriptBundle>;
};

type StoryCreationErrorCode = 'INVALID_URL' | 'MISSING_CONFIGURATION' | 'PROVIDER_FAILED';
type StoryStoreErrorCode = 'STORY_NOT_FOUND';

type PersistStoryIfAbsentInput = {
  story: Story;
  rootDir?: string;
};

export class StoryCreationError extends Error {
  constructor(
    readonly code: StoryCreationErrorCode,
    options?: ErrorOptions,
  ) {
    super('Story creation failed.', options);
    this.name = 'StoryCreationError';
  }
}

export class StoryStoreError extends Error {
  constructor(
    readonly code: StoryStoreErrorCode,
    options?: ErrorOptions,
  ) {
    super('Story store operation failed.', options);
    this.name = 'StoryStoreError';
  }
}

const STORY_LOCK_STALE_MS = 5 * 60_000;
const STORY_LOCK_POLL_MS = 25;

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return hasNodeErrorCode(error, 'EPERM');
  }
}

async function readLockOwner(lockPath: string) {
  try {
    const value: unknown = JSON.parse(await readFile(resolve(lockPath, 'owner.json'), 'utf8'));
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
    if (!hasNodeErrorCode(error, 'ENOENT') && !(error instanceof SyntaxError)) throw error;
  }
  return undefined;
}

async function recoverStaleLock(lockPath: string, staleAfterMs: number) {
  let lockStats;
  try {
    lockStats = await stat(lockPath);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return;
    throw error;
  }

  if (Date.now() - lockStats.mtimeMs <= staleAfterMs) return;
  const owner = await readLockOwner(lockPath);
  if (owner && isProcessAlive(owner.pid)) return;

  const abandonedPath = `${lockPath}.abandoned.${randomUUID()}`;
  try {
    await rename(lockPath, abandonedPath);
    await rm(abandonedPath, { recursive: true, force: true });
  } catch (error) {
    if (!hasNodeErrorCode(error, 'ENOENT')) throw error;
  }
}

async function acquireStoryLock(
  storiesDir: string,
  id: string,
  timing: { pollMs: number; staleAfterMs: number },
) {
  const lockPath = resolve(storiesDir, `.${id}.lock`);
  const token = randomUUID();

  while (true) {
    try {
      await mkdir(lockPath);
    } catch (error) {
      if (!hasNodeErrorCode(error, 'EEXIST')) throw error;
      await recoverStaleLock(lockPath, timing.staleAfterMs);
      await sleep(timing.pollMs);
      continue;
    }

    try {
      await writeFile(resolve(lockPath, 'owner.json'), JSON.stringify({ pid: process.pid, token }), {
        encoding: 'utf8',
        flag: 'wx',
      });
    } catch (error) {
      await rm(lockPath, { recursive: true, force: true });
      throw error;
    }

    return async () => {
      const owner = await readLockOwner(lockPath);
      if (owner?.token === token) {
        await rm(lockPath, { recursive: true, force: true });
      }
    };
  }
}

function resolveStoryPath(storiesDir: string, id: string) {
  if (!isYouTubeVideoId(id)) {
    throw new Error('Invalid story ID.');
  }

  const storyPath = resolve(storiesDir, `${id}.json`);
  if (!isPathWithin(storiesDir, storyPath)) {
    throw new Error('Story path must remain inside the stories directory.');
  }

  return storyPath;
}

async function readStoryPath(storyPath: string, expectedId: string) {
  let file: FileHandle | undefined;
  try {
    file = await open(storyPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = await file.stat();
    if (!stats.isFile()) {
      throw new Error('Story path is not a regular file.');
    }

    const story = storySchema.parse(JSON.parse(await file.readFile('utf8')));
    if (story.id !== expectedId) {
      throw new Error('Stored story ID does not match its filename.');
    }
    return story;
  } finally {
    await file?.close();
  }
}

async function findStory(id: string, rootDir?: string) {
  const paths = await ensureLocalDirs(rootDir);
  const storyPath = resolveStoryPath(paths.storiesDir, id);
  try {
    return { story: await readStoryPath(storyPath, id), storyPath, rootDir: paths.rootDir };
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}

export async function readStory(id: string, rootDir?: string): Promise<Story> {
  if (!isYouTubeVideoId(id)) {
    throw new Error('Invalid story ID.');
  }

  const found = await findStory(id, rootDir);
  if (!found) {
    throw new StoryStoreError('STORY_NOT_FOUND');
  }
  return found.story;
}

async function persistStoryFile(story: Story, storiesDir: string) {
  const storyPath = resolveStoryPath(storiesDir, story.id);
  const tempPath = resolve(storiesDir, `.${story.id}.${process.pid}.${randomUUID()}.tmp`);

  try {
    await writeFile(tempPath, `${JSON.stringify(story, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    try {
      await link(tempPath, storyPath);
      return { story, storyPath, created: true as const };
    } catch (error) {
      if (!hasNodeErrorCode(error, 'EEXIST')) throw error;
      return { story: await readStoryPath(storyPath, story.id), storyPath, created: false as const };
    }
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}

export async function persistStoryIfAbsent(input: PersistStoryIfAbsentInput) {
  const story = storySchema.parse(input.story);
  const paths = await ensureLocalDirs(input.rootDir);
  return persistStoryFile(story, paths.storiesDir);
}

export async function createOrReuseStory(input: CreateOrReuseStoryInput) {
  let id: string;
  try {
    id = parseYouTubeVideoId(input.url);
  } catch (error) {
    throw new StoryCreationError('INVALID_URL', { cause: error });
  }
  const existing = await findStory(id, input.rootDir);
  if (existing) {
    return { story: existing.story, storyPath: existing.storyPath, reused: true as const };
  }

  const paths = await ensureLocalDirs(input.rootDir);
  return runSingleFlightOperation(paths.rootDir, `story:${id}`, async () => {
    const releaseLock = await acquireStoryLock(paths.storiesDir, id, {
      pollMs: input.lockTiming?.pollMs ?? STORY_LOCK_POLL_MS,
      staleAfterMs: input.lockTiming?.staleAfterMs ?? STORY_LOCK_STALE_MS,
    });
    try {
      const current = await findStory(id, paths.rootDir);
      if (current) {
        return { story: current.story, storyPath: current.storyPath, reused: true as const };
      }

      let bundle: TranscriptBundle;
      try {
        bundle = transcriptBundleSchema.parse(await input.fetchBundle(input.url));
        if (bundle.video.id !== id) {
          throw new Error('Fetched transcript bundle does not match the requested video.');
        }
      } catch (error) {
        if (error instanceof StoryCreationError && error.code === 'MISSING_CONFIGURATION') throw error;
        throw new StoryCreationError('PROVIDER_FAILED', { cause: error });
      }

      const story = storySchema.parse({
        schemaVersion: 1,
        id,
        createdAt: new Date().toISOString(),
        video: bundle.video,
        transcript: bundle.transcript,
      });
      const persisted = await persistStoryFile(story, paths.storiesDir);
      return {
        story: persisted.story,
        storyPath: persisted.storyPath,
        reused: !persisted.created,
      };
    } finally {
      await releaseLock();
    }
  });
}
