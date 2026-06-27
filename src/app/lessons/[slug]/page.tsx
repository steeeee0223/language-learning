import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';

import { LearningDocsLayout } from '@/components/learning-docs-layout';
import { LessonActions } from '@/components/lessons-client';
import { LessonMdx } from '@/lib/lesson-mdx';
import { extractLessonToc } from '@/lib/lesson-toc';
import { listLessons, readLesson } from '@/lib/server/lessons';

type LessonDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function LessonDetailPage(props: LessonDetailPageProps) {
  const params = await props.params;
  const [lessons, lesson] = await Promise.all([listLessons(), readLesson({ slug: params.slug })]);
  const toc = await extractLessonToc(lesson.content);

  return (
    <LearningDocsLayout lessons={lessons}>
      <DocsPage toc={toc}>
        <DocsTitle>{lesson.title}</DocsTitle>
        <LessonActions slug={lesson.slug} />
        <DocsBody>
          <LessonMdx content={lesson.content} />
        </DocsBody>
      </DocsPage>
    </LearningDocsLayout>
  );
}
