'use client';

import { useMutation } from '@tanstack/react-query';
import { Download, ExternalLink, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

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
      <Button
        variant="outline"
        size="lg"
        type="button"
        onClick={() => window.print()}
      >
        <Download data-icon="inline-start" aria-hidden />
        Save as PDF
      </Button>
      <Button
        variant="outline"
        size="lg"
        type="button"
        onClick={() => notionMutation.mutate()}
        disabled={notionMutation.isPending}
      >
        {notionMutation.isPending ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <ExternalLink data-icon="inline-start" aria-hidden />}
        Import to Notion
      </Button>
      <Button variant="outline" size="lg" type="button" disabled>
        Google Drive
      </Button>
      {notionMutation.error ? <p className="basis-full text-sm text-fd-muted-foreground">{notionMutation.error.message}</p> : null}
      {notionMutation.data ? <p className="basis-full text-sm text-fd-muted-foreground">Notion page created: {notionMutation.data.url}</p> : null}
    </div>
  );
}
