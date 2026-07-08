import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';

import { LearningDocsLayout } from '@/components/learning-docs-layout';
import { listLessons } from '@/lib/server/lessons';

import { SettingsClient } from './settings-client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const lessons = await listLessons();

  return (
    <LearningDocsLayout lessons={lessons}>
      <DocsPage toc={[]}>
        <DocsTitle>Settings</DocsTitle>
        <DocsDescription>Configure desktop storage and local AI setup.</DocsDescription>
        <DocsBody>
          <SettingsClient />
        </DocsBody>
      </DocsPage>
    </LearningDocsLayout>
  );
}
