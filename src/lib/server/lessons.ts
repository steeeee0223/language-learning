import { constants } from 'node:fs';
import { open, readFile, readdir, realpath, stat, type FileHandle } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { ensureLocalDirs } from './local-paths.ts';
import { storedTaskSchema } from './task-schema.ts';

const LESSON_SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const LESSON_EXTENSIONS = ['.mdx', '.md'] as const;

type LessonExtension = (typeof LESSON_EXTENSIONS)[number];

export type LessonListItem = {
  slug: string;
  title: string;
  filename: string;
  path: string;
  modifiedAt: string | null;
  generatedAt: string;
};

type LessonDetail = LessonListItem & {
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

function lessonDateFromSlug(slug: string) {
  return slug.match(/^(\d{4}-\d{2}-\d{2})(?:-|$)/)?.[1] ?? null;
}

function extractLessonHeading(content: string) {
  return content.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim() ?? null;
}

export function removeLessonHeading(content: string) {
  return content.replace(/^#\s+.+?\s*(?:\r?\n|$)/m, '');
}

function lessonTitle(slug: string, content: string) {
  const heading = extractLessonHeading(content);
  const date = lessonDateFromSlug(slug);

  if (heading && date) {
    return `${date} ${heading}`;
  }

  return heading ?? titleFromSlug(slug);
}

async function readGeneratedAt(tasksDir: string, slug: string, fallback: string) {
  try {
    const parsed = storedTaskSchema.safeParse(JSON.parse(await readFile(join(tasksDir, `${slug}.json`), 'utf8')));
    if (parsed.success) {
      return parsed.data.createdAt;
    }
  } catch (error) {
    if (!isNotFoundError(error) && !(error instanceof SyntaxError)) {
      throw error;
    }
  }

  return fallback;
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
      const [meta, content] = await Promise.all([stat(absolutePath), readFile(absolutePath, 'utf8')]);
      const modifiedAt = meta.mtime.toISOString();

      return {
        slug,
        title: lessonTitle(slug, content),
        filename: entry.name,
        path: `.local/lessons/${entry.name}`,
        modifiedAt,
        generatedAt: await readGeneratedAt(paths.tasksDir, slug, modifiedAt),
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
      const modifiedAt = meta.mtime.toISOString();

      return {
        slug: options.slug,
        title: lessonTitle(options.slug, content),
        filename,
        path: `.local/lessons/${filename}`,
        modifiedAt,
        generatedAt: await readGeneratedAt(paths.tasksDir, options.slug, modifiedAt),
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
