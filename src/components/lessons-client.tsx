'use client';

import { useMutation } from '@tanstack/react-query';
import { Download, ExternalLink, Loader2 } from 'lucide-react';

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

export function LessonActions({ slug }: { slug: string }) {
  const notionMutation = useMutation({
    mutationFn: () => postJson<{ url: string }>('/api/exports/notion', { slug }),
  });

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 border-b pb-4 print:hidden">
      <button
        className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-fd-accent"
        type="button"
        onClick={() => window.print()}
      >
        <Download className="size-4" aria-hidden />
        Save as PDF
      </button>
      <button
        className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-fd-accent disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        onClick={() => notionMutation.mutate()}
        disabled={notionMutation.isPending}
      >
        {notionMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ExternalLink className="size-4" aria-hidden />}
        Import to Notion
      </button>
      <button className="inline-flex h-9 cursor-not-allowed items-center rounded-md border px-3 text-sm opacity-60" type="button" disabled>
        Google Drive
      </button>
      {notionMutation.error ? <p className="basis-full text-sm text-fd-muted-foreground">{notionMutation.error.message}</p> : null}
      {notionMutation.data ? <p className="basis-full text-sm text-fd-muted-foreground">Notion page created: {notionMutation.data.url}</p> : null}
    </div>
  );
}
