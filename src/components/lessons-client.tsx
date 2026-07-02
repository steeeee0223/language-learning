'use client';

import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { postJson } from '@/lib/client-http';

type LessonActionsViewProps = {
  onDownloadPdf: () => void;
  onExportToNotion: () => void;
  notionPending: boolean;
  notionError: Error | null;
  notionUrl: string | null;
};

function LessonActionsView({
  onDownloadPdf,
  onExportToNotion,
  notionPending,
  notionError,
  notionUrl,
}: LessonActionsViewProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 border-b pb-4 print:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="lg" type="button" />}>
          Export
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onDownloadPdf}>Download as PDF</DropdownMenuItem>
            <DropdownMenuItem onClick={onExportToNotion} disabled={notionPending}>
              Notion
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Google Drive</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {notionError ? <p className="basis-full text-sm text-fd-muted-foreground">{notionError.message}</p> : null}
      {notionUrl ? <p className="basis-full text-sm text-fd-muted-foreground">Notion page created: {notionUrl}</p> : null}
    </div>
  );
}

export function LessonActions({ slug }: { slug: string }) {
  const notionMutation = useMutation({
    mutationFn: () => postJson<{ url: string }>('/api/exports/notion', { slug }),
  });

  return (
    <LessonActionsView
      onDownloadPdf={() => window.print()}
      onExportToNotion={() => notionMutation.mutate()}
      notionPending={notionMutation.isPending}
      notionError={notionMutation.error}
      notionUrl={notionMutation.data?.url ?? null}
    />
  );
}
