import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { ensureLocalDirs } from './local-paths.ts';

const LESSON_SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

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

export async function listLessons(options: LessonOptions = {}): Promise<LessonListItem[]> {
  const rootDir = options.rootDir;
  const paths = await ensureLocalDirs(rootDir);
  const entries = await readdir(paths.lessonsDir, { withFileTypes: true });
  const lessons = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map(async (entry) => {
        const slug = entry.name.replace(/\.md$/, '');
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

  return lessons.sort((a, b) => (b.modifiedAt ?? '').localeCompare(a.modifiedAt ?? ''));
}

export async function readLesson(options: ReadLessonOptions): Promise<LessonDetail> {
  assertValidLessonSlug(options.slug);

  const rootDir = options.rootDir;
  const paths = await ensureLocalDirs(rootDir);
  const lessonsDir = resolve(paths.lessonsDir);
  const absolutePath = resolve(paths.lessonsDir, `${options.slug}.md`);

  if (!absolutePath.startsWith(`${lessonsDir}/`)) {
    throw new Error('Invalid lesson slug.');
  }

  const content = await readFile(absolutePath, 'utf8');
  const meta = await stat(absolutePath);

  return {
    slug: options.slug,
    title: titleFromSlug(options.slug),
    filename: `${options.slug}.md`,
    path: `.local/lessons/${options.slug}.md`,
    modifiedAt: meta.mtime.toISOString(),
    content,
  };
}
