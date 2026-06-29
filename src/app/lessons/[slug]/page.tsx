import { DocsBody, DocsDescription, DocsPage } from 'fumadocs-ui/layouts/docs/page';

import { LearningDocsLayout } from '@/components/learning-docs-layout';
import { Lesson } from '@/components/lesson';
import { LessonActions } from '@/components/lessons-client';
import { createLessonToc } from '@/lib/lesson-sections';
import { listLessons, readLesson } from '@/lib/server/lessons';

type LessonDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function LessonDetailPage(props: LessonDetailPageProps) {
  const params = await props.params;
  const [lessons, lesson] = await Promise.all([listLessons(), readLesson({ slug: params.slug })]);
  const toc = createLessonToc(lesson.content);
  const generatedAt = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(lesson.generatedAt));

  return (
    <LearningDocsLayout lessons={lessons}>
      <DocsPage toc={toc}>
        <DocsBody>
          <Lesson
            content={lesson.content}
            intro={
              <>
                <DocsDescription>
                  Generated <time dateTime={lesson.generatedAt}>{generatedAt}</time>
                </DocsDescription>
                <LessonActions slug={lesson.slug} />
              </>
            }
          />
        </DocsBody>
      </DocsPage>
    </LearningDocsLayout>
  );
}
