import { lstat, mkdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

function getLocalPaths(baseDir: string) {
  const localDir = join(baseDir, '.local');
  const storiesDir = join(localDir, 'stories');
  const tasksDir = join(localDir, 'tasks');
  const lessonsDir = join(localDir, 'lessons');
  const errorsDir = join(localDir, 'errors');

  return {
    rootDir: baseDir,
    localDir,
    storiesDir,
    tasksDir,
    lessonsDir,
    errorsDir,
  };
}

function isMissing(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isContained(rootDir: string, candidate: string) {
  const pathFromRoot = relative(rootDir, candidate);
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
}

async function ensureRealDirectory(path: string, rootDir: string) {
  let stats;
  try {
    stats = await lstat(path);
  } catch (error) {
    if (!isMissing(error)) throw error;
    try {
      await mkdir(path);
    } catch (mkdirError) {
      if (!(mkdirError instanceof Error && 'code' in mkdirError && mkdirError.code === 'EEXIST')) {
        throw mkdirError;
      }
    }
    stats = await lstat(path);
  }

  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error('Local storage components must be real directories.');
  }

  const canonicalPath = await realpath(path);
  if (!isContained(rootDir, canonicalPath)) {
    throw new Error('Local storage must remain inside its configured root.');
  }
}

export async function canonicalizeLocalRoot(rootDir?: string) {
  const configuredRoot = resolve(rootDir ?? process.env.LOCAL_DATA_ROOT ?? process.cwd());
  await mkdir(configuredRoot, { recursive: true });
  return realpath(configuredRoot);
}

export async function ensureLocalDirs(rootDir?: string) {
  const canonicalRoot = await canonicalizeLocalRoot(rootDir);
  const paths = getLocalPaths(canonicalRoot);
  await ensureRealDirectory(paths.localDir, canonicalRoot);
  await ensureRealDirectory(paths.storiesDir, canonicalRoot);
  await ensureRealDirectory(paths.tasksDir, canonicalRoot);
  await ensureRealDirectory(paths.lessonsDir, canonicalRoot);
  await ensureRealDirectory(paths.errorsDir, canonicalRoot);
  return paths;
}
