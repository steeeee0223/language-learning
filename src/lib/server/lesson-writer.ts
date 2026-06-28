import { randomUUID } from 'node:crypto';
import { link, lstat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { localSlugSchema } from '@/lib/generation-contracts';
import { GenerationError } from './generation-errors';
import { ensureLocalDirs } from './local-paths';

export async function lessonExists(input: { rootDir?: string; slug: string }) {
  if (!localSlugSchema.safeParse(input.slug).success) return false;

  try {
    const { lessonsDir } = await ensureLocalDirs(input.rootDir);
    await lstat(join(lessonsDir, `${input.slug}.mdx`));
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw new GenerationError('LESSON_WRITE_FAILED', 'The lesson path could not be checked.', {
      cause: error,
    });
  }
}

export async function writeLessonOnce(input: {
  rootDir?: string;
  slug: string;
  content: string;
}) {
  if (!localSlugSchema.safeParse(input.slug).success) {
    throw new GenerationError('LESSON_WRITE_FAILED', 'Invalid lesson slug.');
  }

  let tempPath: string | undefined;

  try {
    const { lessonsDir } = await ensureLocalDirs(input.rootDir);
    const finalPath = join(lessonsDir, `${input.slug}.mdx`);
    tempPath = join(lessonsDir, `.${input.slug}.${process.pid}.${randomUUID()}.tmp`);
    await writeFile(tempPath, input.content, { encoding: 'utf8', flag: 'wx' });
    await link(tempPath, finalPath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      throw new GenerationError('LESSON_EXISTS', 'A lesson already exists for this task.', {
        cause: error,
      });
    }
    throw new GenerationError('LESSON_WRITE_FAILED', 'The lesson could not be saved.', {
      cause: error,
    });
  } finally {
    if (tempPath) await unlink(tempPath).catch(() => undefined);
  }

  return { lessonSlug: input.slug, lessonPath: `.local/lessons/${input.slug}.mdx` };
}
