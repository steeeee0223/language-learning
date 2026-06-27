import { constants } from 'node:fs';
import { open, readdir, realpath, stat, type FileHandle } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { ensureLocalDirs } from './local-paths.ts';

const LESSON_SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const LESSON_EXTENSIONS = ['.mdx', '.md'] as const;

type LessonExtension = (typeof LESSON_EXTENSIONS)[number];

export type LessonListItem = {
  slug: string;
  title: string;
  filename: string;
  path: string;
  modifiedAt: string | null;
};

export type LessonDetail = LessonListItem & {
  content: string;
};

type LessonOptions = {
  rootDir?: string;
};

type ReadLessonOptions = LessonOptions & {
  slug: string;
};

function titleFromSlug(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function assertValidLessonSlug(slug: string) {
  if (!LESSON_SLUG_PATTERN.test(slug)) {
    throw new Error('Invalid lesson slug.');
  }
}

function getLessonExtension(filename: string): LessonExtension | null {
  return LESSON_EXTENSIONS.find((extension) => filename.endsWith(extension)) ?? null;
}

function isChildPath(parentPath: string, candidatePath: string) {
  const relativePath = relative(parentPath, candidatePath);
  return relativePath !== '' && relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

function resolveLessonPath(lessonsDir: string, slug: string, extension: LessonExtension) {
  const absolutePath = resolve(lessonsDir, `${slug}${extension}`);

  if (!isChildPath(lessonsDir, absolutePath)) {
    throw new Error('Invalid lesson slug.');
  }

  return absolutePath;
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export async function listLessons(options: LessonOptions = {}): Promise<LessonListItem[]> {
  const rootDir = options.rootDir;
  const paths = await ensureLocalDirs(rootDir);
  const entries = await readdir(paths.lessonsDir, { withFileTypes: true });
  const entriesBySlug = new Map<string, { name: string; extension: LessonExtension }>();

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const extension = getLessonExtension(entry.name);
    if (!extension) {
      continue;
    }

    const slug = entry.name.slice(0, -extension.length);
    if (!LESSON_SLUG_PATTERN.test(slug)) {
      continue;
    }

    const selected = entriesBySlug.get(slug);
    if (!selected || LESSON_EXTENSIONS.indexOf(extension) < LESSON_EXTENSIONS.indexOf(selected.extension)) {
      entriesBySlug.set(slug, { name: entry.name, extension });
    }
  }

  const lessons = await Promise.all(
    [...entriesBySlug.entries()].map(async ([slug, entry]) => {
      const absolutePath = join(paths.lessonsDir, entry.name);
      const meta = await stat(absolutePath);

      return {
        slug,
        title: titleFromSlug(slug),
        filename: entry.name,
        path: `.local/lessons/${entry.name}`,
        modifiedAt: meta.mtime.toISOString(),
      };
    }),
  );

  return lessons.sort((a, b) => {
    const modifiedAtComparison = (b.modifiedAt ?? '').localeCompare(a.modifiedAt ?? '');
    return modifiedAtComparison || a.slug.localeCompare(b.slug) || a.filename.localeCompare(b.filename);
  });
}

export async function readLesson(options: ReadLessonOptions): Promise<LessonDetail> {
  assertValidLessonSlug(options.slug);

  const rootDir = options.rootDir;
  const paths = await ensureLocalDirs(rootDir);
  const lessonsDir = await realpath(paths.lessonsDir);
  let notFoundError: NodeJS.ErrnoException | undefined;

  for (const extension of LESSON_EXTENSIONS) {
    const filename = `${options.slug}${extension}`;
    const absolutePath = resolveLessonPath(lessonsDir, options.slug, extension);
    let candidateFile: FileHandle | undefined;

    try {
      candidateFile = await open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      const meta = await candidateFile.stat();
      if (!meta.isFile()) {
        throw new Error('Lesson path is not a regular file.');
      }

      const content = await candidateFile.readFile('utf8');

      return {
        slug: options.slug,
        title: titleFromSlug(options.slug),
        filename,
        path: `.local/lessons/${filename}`,
        modifiedAt: meta.mtime.toISOString(),
        content,
      };
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }

      notFoundError = error;
    } finally {
      await candidateFile?.close();
    }
  }

  if (notFoundError) {
    throw notFoundError;
  }

  throw new Error(`Lesson not found: ${options.slug}`);
}
