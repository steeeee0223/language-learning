import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';

import { LearningDocsLayout } from '@/components/learning-docs-layout';
import { TasksClient } from '@/components/tasks-client';
import { listLessons } from '@/lib/server/lessons';
import { listTaskGroups } from '@/lib/server/task-queries';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const [lessons, tasks] = await Promise.all([listLessons(), listTaskGroups()]);

  return (
    <LearningDocsLayout lessons={lessons}>
      <DocsPage toc={[]}>
        <DocsTitle>Stories</DocsTitle>
        <DocsDescription>Manage lesson generation tasks grouped by YouTube story.</DocsDescription>
        <DocsBody>
          <TasksClient initialData={tasks} />
        </DocsBody>
      </DocsPage>
    </LearningDocsLayout>
  );
}
