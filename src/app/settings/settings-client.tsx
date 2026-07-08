'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderOpen, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { codexStatusSchema } from '@/lib/schemas/generation-contracts';

type DesktopSettings = Awaited<
  ReturnType<NonNullable<typeof window.languageLearningDesktop>['getSettings']>
>;

async function getCodexStatus() {
  const response = await fetch('/api/codex/status');
  if (!response.ok) throw new Error('Codex status check failed.');
  return codexStatusSchema.parse(await response.json());
}

export function SettingsClient() {
  const [settings, setSettings] = useState<DesktopSettings>();
  const [error, setError] = useState<string>();
  const [desktopAvailable, setDesktopAvailable] = useState(false);
  const codex = useQuery({
    queryKey: ['codex-status'],
    queryFn: getCodexStatus,
    enabled: desktopAvailable,
  });

  useEffect(() => {
    const desktop = window.languageLearningDesktop;
    if (!desktop) return;

    void desktop.getSettings().then(
      (nextSettings) => {
        setSettings(nextSettings);
        setDesktopAvailable(true);
      },
      (cause: unknown) => {
        setDesktopAvailable(true);
        setError(cause instanceof Error ? cause.message : 'Could not load desktop settings.');
      },
    );
  }, []);

  async function chooseDataRoot() {
    try {
      setError(undefined);
      const nextSettings = await window.languageLearningDesktop?.chooseDataRoot();
      if (nextSettings) setSettings(nextSettings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not choose a data folder.');
    }
  }

  async function openDataRoot() {
    try {
      setError(undefined);
      await window.languageLearningDesktop?.openDataRoot();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the data folder.');
    }
  }

  if (!desktopAvailable) {
    return (
      <p className="text-sm text-muted-foreground">
        Desktop settings are available in the Electron app.
      </p>
    );
  }

  return (
    <div className="not-prose flex flex-col gap-5">
      <section className="rounded-md border bg-card p-5 text-card-foreground">
        <h2 className="text-lg font-semibold">Data folder</h2>
        <p className="mt-3 break-all font-mono text-sm text-muted-foreground">
          {settings?.dataRoot ?? 'Loading...'}
        </p>
        {settings?.warning ? <p className="mt-3 text-sm text-destructive">{settings.warning}</p> : null}
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={chooseDataRoot}>
            <FolderOpen data-icon="inline-start" aria-hidden />
            Choose folder
          </Button>
          <Button type="button" variant="outline" onClick={openDataRoot}>
            Open folder
          </Button>
        </div>
      </section>

      <section className="rounded-md border bg-card p-5 text-card-foreground">
        <h2 className="text-lg font-semibold">AI provider</h2>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <span>Codex: {codex.isPending ? 'Checking...' : codex.data?.status ?? 'Unavailable'}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={codex.isFetching}
            onClick={() => codex.refetch()}
          >
            <RefreshCw data-icon="inline-start" aria-hidden />
            Check again
          </Button>
        </div>
        {codex.data?.status === 'not-authenticated' ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Sign in with Codex locally, then check again.
          </p>
        ) : null}
      </section>
    </div>
  );
}
