import { LearningDocsLayout } from '@/components/learning-docs-layout';
import { listLessons } from '@/lib/server/lessons';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';

import { GetStartedClient } from './get-started-client';

export default async function GetStartedPage() {
  const lessons = await listLessons();

  return (
    <LearningDocsLayout lessons={lessons}>
      <DocsPage toc={[]}>
        <DocsTitle>Get Started</DocsTitle>
        <DocsDescription>
          Prepare a lesson from a YouTube transcript, then generate it in the app with your signed-in Codex account.
        </DocsDescription>
        <DocsBody>
          <GetStartedClient />
        </DocsBody>
      </DocsPage>
    </LearningDocsLayout>
  );
}
