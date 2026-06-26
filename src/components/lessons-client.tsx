'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, ExternalLink, FileText, Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';

import { MarkdownRenderer } from './markdown-renderer';

type LessonListItem = {
  slug: string;
  title: string;
  filename: string;
  modifiedAt: string | null;
};

type LessonDetail = LessonListItem & {
  content: string;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? 'Request failed.');
  }

  return payload;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? 'Request failed.');
  }

  return payload;
}

export function LessonsClient({ slug }: { slug?: string }) {
  const lessonsQuery = useQuery({
    queryKey: ['lessons'],
    queryFn: () => getJson<{ lessons: LessonListItem[] }>('/api/lessons'),
  });
  const lessonQuery = useQuery({
    queryKey: ['lesson', slug],
    queryFn: () => getJson<{ lesson: LessonDetail }>(`/api/lessons/${slug}`),
    enabled: Boolean(slug),
  });
  const notionMutation = useMutation({
    mutationFn: () => postJson<{ url: string }>('/api/exports/notion', { slug }),
  });

  const lessons = lessonsQuery.data?.lessons ?? [];
  const selectedLesson = lessonQuery.data?.lesson;

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-8 md:grid-cols-[320px_1fr] md:py-12">
      <aside className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-zinc-950">Lessons</h1>
          <button
            className="inline-flex size-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            type="button"
            onClick={() => lessonsQuery.refetch()}
            aria-label="Refresh lessons"
          >
            <RefreshCw className={`size-4 ${lessonsQuery.isFetching ? 'animate-spin' : ''}`} aria-hidden />
          </button>
        </div>

        {lessons.length === 0 && !lessonsQuery.isLoading ? (
          <p className="mt-5 rounded-md bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
            Generated markdown files will appear here after your local agent writes them to .local/lessons.
          </p>
        ) : (
          <nav className="mt-4 space-y-2">
            {lessons.map((lesson) => (
              <Link
                key={lesson.slug}
                href={`/lessons/${lesson.slug}`}
                className={`flex gap-3 rounded-md border px-3 py-3 text-sm transition ${
                  lesson.slug === slug ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200 text-zinc-800 hover:bg-zinc-50'
                }`}
              >
                <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <span className="block font-medium">{lesson.title}</span>
                  {lesson.modifiedAt && <span className="mt-1 block text-xs opacity-70">{new Date(lesson.modifiedAt).toLocaleString()}</span>}
                </span>
              </Link>
            ))}
          </nav>
        )}
      </aside>

      <section className="min-h-[560px] rounded-lg border border-zinc-200 bg-white p-5 md:p-8">
        {!slug && (
          <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center">
            <FileText className="size-10 text-zinc-400" aria-hidden />
            <h2 className="mt-4 text-xl font-semibold text-zinc-950">Select a lesson</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-zinc-600">Choose a markdown lesson from the sidebar, or refresh after generating a new file locally.</p>
          </div>
        )}

        {slug && lessonQuery.isLoading && (
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading lesson
          </div>
        )}

        {lessonQuery.error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{lessonQuery.error.message}</p>}

        {selectedLesson && (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
              <div>
                <p className="text-sm font-medium text-zinc-500">{selectedLesson.filename}</p>
                <h2 className="mt-1 text-2xl font-semibold text-zinc-950">{selectedLesson.title}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-200 px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                  type="button"
                  onClick={() => window.print()}
                >
                  <Download className="size-4" aria-hidden />
                  Save as PDF
                </button>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => notionMutation.mutate()}
                  disabled={notionMutation.isPending}
                >
                  {notionMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ExternalLink className="size-4" aria-hidden />}
                  Import to Notion
                </button>
                <button
                  className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-md border border-zinc-200 px-3 text-sm font-medium text-zinc-400"
                  type="button"
                  disabled
                >
                  Google Drive
                </button>
              </div>
            </div>
            {notionMutation.error && <p className="mb-5 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{notionMutation.error.message}</p>}
            {notionMutation.data && <p className="mb-5 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Notion page created: {notionMutation.data.url}</p>}
            <MarkdownRenderer content={selectedLesson.content} />
          </>
        )}
      </section>
    </main>
  );
}
