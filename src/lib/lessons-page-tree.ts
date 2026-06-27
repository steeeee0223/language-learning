import type { Root } from 'fumadocs-core/page-tree';

import type { LessonListItem } from './server/lessons';

export function createLessonsPageTree(lessons: LessonListItem[]): Root {
  return {
    type: 'root',
    name: 'Language Learning',
    children: [
      {
        type: 'folder',
        name: 'Get Started',
        root: true,
        defaultOpen: true,
        index: {
          type: 'page',
          name: 'Get Started',
          url: '/get-started',
        },
        children: [],
      },
      {
        type: 'folder',
        name: 'Generated Lessons',
        root: true,
        defaultOpen: true,
        index: {
          type: 'page',
          name: 'All Lessons',
          url: '/lessons',
        },
        children: lessons.map((lesson) => ({
          type: 'page' as const,
          name: lesson.title,
          url: `/lessons/${lesson.slug}`,
        })),
      },
    ],
  };
}
