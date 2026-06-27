import Link from 'next/link';
import { FileText } from 'lucide-react';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';

import { LearningDocsLayout } from '@/components/learning-docs-layout';
import { listLessons } from '@/lib/server/lessons';

export default async function LessonsPage() {
  const lessons = await listLessons();

  return (
    <LearningDocsLayout lessons={lessons}>
      <DocsPage toc={[]}>
        <DocsTitle>Generated Lessons</DocsTitle>
        <DocsDescription>Lessons generated from your local YouTube transcript tasks.</DocsDescription>
        <DocsBody>
          {lessons.length === 0 ? (
            <p>Generated MDX files will appear here after your local agent writes them to .local/lessons.</p>
          ) : (
            <div className="not-prose grid gap-3">
              {lessons.map((lesson) => (
                <Link
                  key={lesson.slug}
                  href={`/lessons/${lesson.slug}`}
                  className="flex items-start gap-3 rounded-md border bg-fd-card p-4 text-fd-card-foreground transition-colors hover:bg-fd-accent"
                >
                  <FileText className="mt-0.5 size-4 shrink-0 text-fd-muted-foreground" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-medium">{lesson.title}</span>
                    <span className="mt-1 block truncate text-xs text-fd-muted-foreground">{lesson.filename}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </DocsBody>
      </DocsPage>
    </LearningDocsLayout>
  );
}
