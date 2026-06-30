import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, rename, unlink, writeFile, type FileHandle } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { transcriptBundleSchema, type TranscriptBundle } from '@/lib/contracts';
import { isYouTubeVideoId, parseYouTubeVideoId } from '@/lib/youtube';
import { ensureLocalDirs } from './local-paths';
import { storySchema, type Story } from './story-schema';
import { runSingleFlightOperation } from './task-operation-lock';

type CreateOrReuseStoryInput = {
  url: string;
  rootDir?: string;
  fetchBundle: (url: string) => Promise<TranscriptBundle>;
};

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function resolveStoryPath(storiesDir: string, id: string) {
  if (!isYouTubeVideoId(id)) {
    throw new Error('Invalid story ID.');
  }

  const storyPath = resolve(storiesDir, `${id}.json`);
  const pathFromStories = relative(storiesDir, storyPath);
  if (
    pathFromStories === '' ||
    pathFromStories === '..' ||
    pathFromStories.startsWith(`..${sep}`) ||
    isAbsolute(pathFromStories)
  ) {
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
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

export async function readStory(id: string, rootDir?: string): Promise<Story> {
  if (!isYouTubeVideoId(id)) {
    throw new Error('Invalid story ID.');
  }

  const found = await findStory(id, rootDir);
  if (!found) {
    throw new Error(`Story ${id} does not exist.`);
  }
  return found.story;
}

export async function createOrReuseStory(input: CreateOrReuseStoryInput) {
  const id = parseYouTubeVideoId(input.url);
  const existing = await findStory(id, input.rootDir);
  if (existing) {
    return { story: existing.story, storyPath: existing.storyPath, reused: true as const };
  }

  const paths = await ensureLocalDirs(input.rootDir);
  return runSingleFlightOperation(paths.rootDir, `story:${id}`, async () => {
    const current = await findStory(id, paths.rootDir);
    if (current) {
      return { story: current.story, storyPath: current.storyPath, reused: true as const };
    }

    const bundle = transcriptBundleSchema.parse(await input.fetchBundle(input.url));
    if (bundle.video.id !== id) {
      throw new Error('Fetched transcript bundle does not match the requested video.');
    }

    const story = storySchema.parse({
      schemaVersion: 1,
      id,
      createdAt: new Date().toISOString(),
      video: bundle.video,
      transcript: bundle.transcript,
    });
    const storyPath = resolveStoryPath(paths.storiesDir, id);
    const tempPath = resolve(paths.storiesDir, `.${id}.${process.pid}.${randomUUID()}.tmp`);

    try {
      await writeFile(tempPath, `${JSON.stringify(story, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      await rename(tempPath, storyPath);
    } finally {
      await unlink(tempPath).catch(() => undefined);
    }

    return { story, storyPath, reused: false as const };
  });
}
