import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  link,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  unlink,
  writeFile,
  type FileHandle,
} from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { localSlugSchema } from '@/lib/generation-contracts';
import { ensureLocalDirs } from './local-paths';
import { storySchema } from './story-schema';
import { persistStoryIfAbsent } from './story-store';
import { withTaskFileLock } from './task-file-lock';
import {
  legacyStoredTaskSchema,
  storedTaskSchema,
  TASK_SCHEMA_VERSION,
  type LegacyStoredTask,
} from './task-schema';

export type TaskMigrationConflictReason =
  | 'malformed-task'
  | 'unsafe-output-path'
  | 'story-source-conflict'
  | 'error-diagnostic-conflict';

export type TaskMigrationConflict = {
  id: string;
  reason: TaskMigrationConflictReason;
};

export type TaskMigrationResult = {
  migrated: number;
  conflicts: TaskMigrationConflict[];
};

export type TaskMigrationDependencies = {
  beforeDiagnosticStaging?: () => void | Promise<void>;
};

export class TaskMigrationError extends Error {
  constructor(readonly reason: TaskMigrationConflictReason) {
    super(`Legacy task migration failed: ${reason}.`);
    this.name = 'TaskMigrationError';
  }
}

type LegacyCandidate = {
  slug: string;
  task: LegacyStoredTask;
  source: string;
};

function hasErrorCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}

async function readRegularFile(path: string) {
  let file: FileHandle | undefined;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!(await file.stat()).isFile()) throw new Error('Path is not a regular file.');
    return await file.readFile('utf8');
  } finally {
    await file?.close();
  }
}

async function ensureRealDirectory(path: string) {
  try {
    await mkdir(path);
  } catch (error) {
    if (!hasErrorCode(error, 'EEXIST')) throw error;
  }
  const stats = await lstat(path);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error('Migration diagnostics directories must be real directories.');
  }
}

async function normalizeLegacyError(
  slug: string,
  errorsDir: string,
  dependencies: TaskMigrationDependencies,
) {
  const flatPath = join(errorsDir, `${slug}.json`);
  let source: string;
  try {
    source = await readRegularFile(flatPath);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return true;
    return false;
  }

  try {
    const taskErrorDir = join(errorsDir, slug);
    const legacyDir = join(taskErrorDir, 'legacy');
    await ensureRealDirectory(taskErrorDir);
    await ensureRealDirectory(legacyDir);
    await dependencies.beforeDiagnosticStaging?.();
  } catch {
    return false;
  }

  const legacyDir = join(errorsDir, slug, 'legacy');
  const targetPath = join(legacyDir, 'error.json');
  const stagingPath = join(errorsDir, `.${slug}.${randomUUID()}.legacy-error.tmp`);
  try {
    await rename(flatPath, stagingPath);
  } catch {
    return false;
  }

  try {
    try {
      await link(stagingPath, targetPath);
    } catch (error) {
      if (!hasErrorCode(error, 'EEXIST')) throw error;
      if ((await readRegularFile(targetPath)) !== source) throw new Error('Diagnostic target conflict.');
    }

    await unlink(stagingPath);
    return true;
  } catch {
    try {
      await link(stagingPath, flatPath);
      await unlink(stagingPath);
    } catch {
      // Keep the uniquely named staging file when the original pathname is no longer available.
    }
    return false;
  }
}

function toStory(task: LegacyStoredTask) {
  return storySchema.parse({
    schemaVersion: 1,
    id: task.video.id,
    createdAt: task.createdAt,
    video: task.video,
    transcript: task.transcript,
  });
}

function hasSameSource(story: ReturnType<typeof toStory>, task: LegacyStoredTask) {
  return (
    isDeepStrictEqual(story.video, task.video) &&
    isDeepStrictEqual(story.transcript, task.transcript)
  );
}

async function replaceLegacyTask(candidate: LegacyCandidate, tasksDir: string) {
  const { task, slug } = candidate;
  const { modelPreset, ...generation } = task.generation;
  const migrated = storedTaskSchema.parse({
    schemaVersion: TASK_SCHEMA_VERSION,
    id: slug,
    storyId: task.video.id,
    createdAt: task.createdAt,
    learningSettings: task.learningSettings,
    modelPreset: modelPreset ?? 'best',
    output: task.output,
    instructions: task.instructions,
    generation,
  });
  const finalPath = join(tasksDir, `${slug}.json`);
  const tempPath = join(tasksDir, `.${slug}.${process.pid}.${randomUUID()}.tmp`);

  try {
    await writeFile(tempPath, `${JSON.stringify(migrated, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    if ((await readRegularFile(finalPath)) !== candidate.source) {
      throw new Error('Legacy task changed during migration.');
    }
    await rename(tempPath, finalPath);
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}

async function migrateCandidate(
  candidate: LegacyCandidate,
  canonical: LegacyCandidate,
  rootDir?: string,
  dependencies: TaskMigrationDependencies = {},
) {
  const paths = await ensureLocalDirs(rootDir);
  if (candidate.task.output.path !== `.local/lessons/${candidate.slug}.json`) {
    return { id: candidate.slug, reason: 'unsafe-output-path' } satisfies TaskMigrationConflict;
  }

  const story = toStory(canonical.task);
  const persisted = await persistStoryIfAbsent({ story, rootDir: paths.rootDir });
  if (
    !hasSameSource(persisted.story, canonical.task) ||
    !hasSameSource(persisted.story, candidate.task)
  ) {
    return { id: candidate.slug, reason: 'story-source-conflict' } satisfies TaskMigrationConflict;
  }

  if (!(await normalizeLegacyError(candidate.slug, paths.errorsDir, dependencies))) {
    return { id: candidate.slug, reason: 'error-diagnostic-conflict' } satisfies TaskMigrationConflict;
  }

  await replaceLegacyTask(candidate, paths.tasksDir);
  return undefined;
}

async function readCandidate(slug: string, tasksDir: string) {
  const source = await readRegularFile(join(tasksDir, `${slug}.json`));
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return { malformed: true as const };
  }
  const current = storedTaskSchema.safeParse(value);
  if (current.success) {
    return current.data.id === slug ? { current: true as const } : { malformed: true as const };
  }
  const legacy = legacyStoredTaskSchema.safeParse(value);
  if (!legacy.success) return { malformed: true as const };
  return { candidate: { slug, task: legacy.data, source } satisfies LegacyCandidate };
}

async function findCanonicalCandidate(videoId: string, tasksDir: string) {
  const candidates: LegacyCandidate[] = [];
  const entries = await readdir(tasksDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const slug = entry.name.slice(0, -'.json'.length);
    if (!localSlugSchema.safeParse(slug).success) continue;
    try {
      const parsed = await readCandidate(slug, tasksDir);
      if ('candidate' in parsed && parsed.candidate.task.video.id === videoId) {
        candidates.push(parsed.candidate);
      }
    } catch {
      // Invalid peer tasks cannot own a canonical source.
    }
  }
  candidates.sort((left, right) =>
    left.task.createdAt.localeCompare(right.task.createdAt) || left.slug.localeCompare(right.slug),
  );
  return candidates[0];
}

export async function migrateLegacyTask(
  slug: string,
  rootDir?: string,
  dependencies: TaskMigrationDependencies = {},
): Promise<TaskMigrationResult> {
  localSlugSchema.parse(slug);
  const { tasksDir, rootDir: canonicalRoot } = await ensureLocalDirs(rootDir);
  return withTaskFileLock(canonicalRoot, slug, async () => {
    let parsed;
    try {
      parsed = await readCandidate(slug, tasksDir);
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) throw error;
      return { migrated: 0, conflicts: [{ id: slug, reason: 'malformed-task' }] };
    }
    if ('current' in parsed) return { migrated: 0, conflicts: [] };
    if ('malformed' in parsed) {
      return { migrated: 0, conflicts: [{ id: slug, reason: 'malformed-task' }] };
    }
    const canonical =
      (await findCanonicalCandidate(parsed.candidate.task.video.id, tasksDir)) ?? parsed.candidate;
    const conflict = await migrateCandidate(
      parsed.candidate,
      canonical,
      canonicalRoot,
      dependencies,
    );
    return conflict ? { migrated: 0, conflicts: [conflict] } : { migrated: 1, conflicts: [] };
  });
}

export async function migrateLegacyTasks(rootDir?: string): Promise<TaskMigrationResult> {
  const paths = await ensureLocalDirs(rootDir);
  const entries = (await readdir(paths.tasksDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name));
  const conflicts: TaskMigrationConflict[] = [];
  const candidates: LegacyCandidate[] = [];

  for (const entry of entries) {
    const slug = entry.name.slice(0, -'.json'.length);
    if (!localSlugSchema.safeParse(slug).success) {
      conflicts.push({ id: slug, reason: 'malformed-task' });
      continue;
    }
    try {
      const parsed = await readCandidate(slug, paths.tasksDir);
      if ('malformed' in parsed) conflicts.push({ id: slug, reason: 'malformed-task' });
      else if ('candidate' in parsed) candidates.push(parsed.candidate);
    } catch {
      conflicts.push({ id: slug, reason: 'malformed-task' });
    }
  }

  candidates.sort((left, right) =>
    left.task.createdAt.localeCompare(right.task.createdAt) || left.slug.localeCompare(right.slug),
  );
  let migrated = 0;
  for (const candidate of candidates) {
    const result = await migrateLegacyTask(candidate.slug, paths.rootDir);
    migrated += result.migrated;
    conflicts.push(...result.conflicts);
  }
  return { migrated, conflicts };
}
