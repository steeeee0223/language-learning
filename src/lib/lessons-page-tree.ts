import type { Root } from 'fumadocs-core/page-tree';

import type { LessonListItem } from './server/lessons';

export function createLessonsPageTree(lessons: LessonListItem[]): Root {
  return {
    type: 'root',
    name: 'Language Learning',
    children: [
      {
        type: 'separator',
        name: 'Get Started',
      },
      {
        type: 'page',
        name: 'Get Started',
        url: '/get-started',
      },
      {
        type: 'separator',
        name: 'Generated Lessons',
      },
      {
        type: 'page',
        name: 'All Lessons',
        url: '/lessons',
      },
      ...lessons.map((lesson) => ({
        type: 'page' as const,
        name: lesson.title,
        url: `/lessons/${lesson.slug}`,
      })),
    ],
  };
}
