import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

function getLocalPaths(rootDir?: string) {
  const baseDir = getLocalRoot(rootDir);
  const localDir = join(baseDir, '.local');
  const tasksDir = join(localDir, 'tasks');
  const lessonsDir = join(localDir, 'lessons');

  return {
    rootDir: baseDir,
    localDir,
    tasksDir,
    lessonsDir,
  };
}

function getLocalRoot(rootDir?: string) {
  return rootDir ?? process.env.LOCAL_DATA_ROOT ?? process.cwd();
}

export async function ensureLocalDirs(rootDir?: string) {
  const paths = getLocalPaths(rootDir);
  await mkdir(paths.tasksDir, { recursive: true });
  await mkdir(paths.lessonsDir, { recursive: true });
  return paths;
}
