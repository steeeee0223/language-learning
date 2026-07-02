import { LearningDocsLayout } from '@/components/learning-docs-layout';
import { youtubeVideoIdSchema } from '@/lib/contracts';
import { listLessons } from '@/lib/server/lessons';
import { readStory } from '@/lib/server/story-store';
import { storySummarySchema } from '@/lib/task-contracts';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';

import { GetStartedClient } from './get-started-client';

export default async function GetStartedPage({
  searchParams,
}: {
  searchParams: Promise<{ story?: string | string[] }>;
}) {
  const requestedStory = youtubeVideoIdSchema.safeParse((await searchParams).story);
  const initialStoryPromise = requestedStory.success
    ? readStory(requestedStory.data)
        .then((story) =>
          storySummarySchema.parse({
            id: story.id,
            title: story.video.title,
            url: story.video.url,
            createdAt: story.createdAt,
          }),
        )
        .catch(() => undefined)
    : Promise.resolve(undefined);
  const [initialStory, lessons] = await Promise.all([initialStoryPromise, listLessons()]);

  return (
    <LearningDocsLayout lessons={lessons}>
      <DocsPage toc={[]}>
        <DocsTitle>Get Started</DocsTitle>
        <DocsDescription>
          Add or reuse a YouTube story, choose lesson settings, and generate with your signed-in Codex account.
        </DocsDescription>
        <DocsBody>
          <GetStartedClient initialStory={initialStory} />
        </DocsBody>
      </DocsPage>
    </LearningDocsLayout>
  );
}
