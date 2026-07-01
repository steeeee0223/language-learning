import type { Root } from 'fumadocs-core/page-tree';

import type { LessonListItem } from './server/lessons';

export function createLearningPageTree(lessons: LessonListItem[]): Root {
  return {
    type: 'root',
    name: 'Language Learning',
    children: [
      {
        type: 'page',
        name: 'Get Started',
        url: '/get-started',
      },
      {
        type: 'page',
        name: 'Tasks',
        url: '/tasks',
      },
      {
        type: 'separator',
        name: 'Lessons',
      },
      ...lessons.map((lesson) => ({
        type: 'page' as const,
        name: lesson.title,
        url: `/lessons/${lesson.slug}`,
      })),
    ],
  };
}
