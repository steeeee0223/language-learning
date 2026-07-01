import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';

import { LearningDocsLayout } from '@/components/learning-docs-layout.tsx';
import { TasksClient } from '@/components/tasks-client.tsx';
import { listLessons } from '@/lib/server/lessons.ts';
import { listTaskGroups } from '@/lib/server/task-queries.ts';

export default async function TasksPage() {
  const [lessons, tasks] = await Promise.all([listLessons(), listTaskGroups()]);

  return (
    <LearningDocsLayout lessons={lessons}>
      <DocsPage toc={[]}>
        <DocsTitle>Tasks</DocsTitle>
        <DocsDescription>Manage lesson generation tasks grouped by YouTube story.</DocsDescription>
        <DocsBody>
          <TasksClient initialData={tasks} />
        </DocsBody>
      </DocsPage>
    </LearningDocsLayout>
  );
}
