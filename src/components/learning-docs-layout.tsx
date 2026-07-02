import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';

import { baseOptions } from '@/lib/layout.shared';
import { createLearningPageTree } from '@/lib/lessons-page-tree';
import type { LessonListItem } from '@/lib/server/lessons';

type LearningDocsLayoutProps = {
  children: ReactNode;
  lessons: LessonListItem[];
};

export function LearningDocsLayout({ children, lessons }: LearningDocsLayoutProps) {
  return (
    <DocsLayout {...baseOptions()} tree={createLearningPageTree(lessons)} tabs={false}>
      {children}
    </DocsLayout>
  );
}
