import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';

import { baseOptions } from '@/lib/layout.shared';
import { createLessonsPageTree } from '@/lib/lessons-page-tree';
import type { LessonListItem } from '@/lib/server/lessons';

type LearningDocsLayoutProps = {
  children: ReactNode;
  lessons: LessonListItem[];
};

export function LearningDocsLayout({ children, lessons }: LearningDocsLayoutProps) {
  const tree = createLessonsPageTree(lessons);

  return (
    <DocsLayout
      {...baseOptions()}
      tree={tree}
      tabs={[
        { title: 'Get Started', url: '/get-started' },
        {
          title: 'Generated Lessons',
          url: '/lessons',
          urls: new Set(['/lessons', ...lessons.map((lesson) => `/lessons/${lesson.slug}`)]),
        },
      ]}
      tabMode="auto"
    >
      {children}
    </DocsLayout>
  );
}
