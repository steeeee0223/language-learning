import { constants } from 'node:fs';
import { open, readdir, realpath, type FileHandle } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { lessonSchema, type LessonContent } from '@/lib/lesson-content';
import { localSlugSchema } from '@/lib/generation-contracts';
import { ensureLocalDirs } from './local-paths';
import { hasNodeErrorCode } from './node-utils';
import { isPathWithin } from './path-utils';
import { TaskMigrationError } from './task-migration';
import { readTask } from './task-store';

const LESSON_EXTENSION = '.json';

export type LessonListItem = {
  slug: string;
  title: string;
  filename: string;
  path: string;
  modifiedAt: string | null;
  generatedAt: string;
};

type LessonDetail = LessonListItem & {
  content: LessonContent;
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

function lessonTitle(slug: string, content: LessonContent) {
  const translatedTitle = content.video.translatedTitle.trim();
  const date = lessonDateFromSlug(slug);

  if (translatedTitle && date && !translatedTitle.startsWith(date)) {
    return `${date} ${translatedTitle}`;
  }

  return translatedTitle || titleFromSlug(slug);
}

async function readGeneratedAt(rootDir: string, slug: string, fallback: string) {
  try {
    return (await readTask(slug, rootDir)).createdAt;
  } catch (error) {
    if (
      !hasNodeErrorCode(error, 'ENOENT') &&
      !(error instanceof SyntaxError) &&
      !(error instanceof TaskMigrationError)
    ) {
      throw error;
    }
  }

  return fallback;
}

function assertValidLessonSlug(slug: string) {
  if (!localSlugSchema.safeParse(slug).success) {
    throw new Error('Invalid lesson slug.');
  }
}

function resolveLessonPath(lessonsDir: string, slug: string) {
  const absolutePath = resolve(lessonsDir, `${slug}${LESSON_EXTENSION}`);

  if (!isPathWithin(lessonsDir, absolutePath)) {
    throw new Error('Invalid lesson slug.');
  }

  return absolutePath;
}

function parseLesson(content: string): LessonContent {
  return lessonSchema.parse(JSON.parse(content));
}

async function readLessonFile(path: string) {
  let file: FileHandle | undefined;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const meta = await file.stat();
    if (!meta.isFile()) {
      throw new Error('Lesson path is not a regular file.');
    }
    return {
      content: parseLesson(await file.readFile('utf8')),
      modifiedAt: meta.mtime.toISOString(),
    };
  } finally {
    await file?.close();
  }
}

export async function listLessons(options: LessonOptions = {}): Promise<LessonListItem[]> {
  const rootDir = options.rootDir;
  const paths = await ensureLocalDirs(rootDir);
  const entries = await readdir(paths.lessonsDir, { withFileTypes: true });
  const lessonEntries: { name: string; slug: string }[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(LESSON_EXTENSION)) {
      continue;
    }

    const slug = entry.name.slice(0, -LESSON_EXTENSION.length);
    if (!localSlugSchema.safeParse(slug).success) {
      continue;
    }

    lessonEntries.push({ name: entry.name, slug });
  }

  const lessons = await Promise.all(
    lessonEntries.map(async ({ name, slug }) => {
      const absolutePath = join(paths.lessonsDir, name);
      const { content, modifiedAt } = await readLessonFile(absolutePath);

      return {
        slug,
        title: lessonTitle(slug, content),
        filename: name,
        path: `.local/lessons/${name}`,
        modifiedAt,
        generatedAt: await readGeneratedAt(paths.rootDir, slug, modifiedAt),
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
  const filename = `${options.slug}${LESSON_EXTENSION}`;
  const absolutePath = resolveLessonPath(lessonsDir, options.slug);
  const candidateRealPath = await realpath(absolutePath);

  if (!isPathWithin(lessonsDir, candidateRealPath)) {
    throw new Error('Lesson path is outside the lessons directory.');
  }

  const { content, modifiedAt } = await readLessonFile(absolutePath);

  return {
    slug: options.slug,
    title: lessonTitle(options.slug, content),
    filename,
    path: `.local/lessons/${filename}`,
    modifiedAt,
    generatedAt: await readGeneratedAt(paths.rootDir, options.slug, modifiedAt),
    content,
  };
}
