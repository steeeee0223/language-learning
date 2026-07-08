'use client';

import { useMemo, useState } from 'react';
import { Apple, Check, ChevronDown, Download, MonitorDown } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DownloadOption } from '@/lib/download-options';

type DownloadClientProps = {
  options: DownloadOption[];
};

type ResolvedDownloadOption = DownloadOption & {
  disabled: boolean;
  selected: boolean;
};

type DownloadOptionMenuItemsProps = {
  options: ResolvedDownloadOption[];
  onSelect: (id: string) => void;
};

export function resolveDownloadClientState(options: DownloadOption[], selectedId?: string) {
  const firstEnabledOption = options.find((option) => option.enabled) ?? options[0];
  const selectedOption = options.find((option) => option.id === selectedId) ?? firstEnabledOption;

  return {
    firstEnabledOption,
    selectedOption,
    downloadDisabled: !selectedOption?.enabled || !selectedOption.href,
    menuOptions: options.map<ResolvedDownloadOption>((option) => ({
      ...option,
      disabled: !option.enabled,
      selected: option.id === selectedOption?.id,
    })),
  };
}

export function DownloadOptionMenuItems({
  options,
  onSelect,
}: DownloadOptionMenuItemsProps) {
  return (
    <>
      {options.map((option) => (
        <DropdownMenuItem
          key={option.id}
          disabled={option.disabled}
          onSelect={() => onSelect(option.id)}
          className="flex min-h-12 items-center justify-between rounded-lg px-4 text-base"
        >
          <span className="flex items-center gap-3">
            {option.platform === 'mac' ? (
              <Apple className="size-5 fill-current" aria-hidden />
            ) : (
              <MonitorDown className="size-5" aria-hidden />
            )}
            <span>{option.label}</span>
          </span>
          <span className="flex items-center gap-2 text-zinc-500">
            {option.meta}
            {option.selected ? <Check className="size-4" aria-hidden /> : null}
          </span>
        </DropdownMenuItem>
      ))}
    </>
  );
}

export function DownloadClient({ options }: DownloadClientProps) {
  const firstEnabledOption = useMemo(() => resolveDownloadClientState(options).firstEnabledOption, [options]);
  const [selectedId, setSelectedId] = useState(firstEnabledOption?.id ?? 'mac-universal');
  const { selectedOption, downloadDisabled, menuOptions } = useMemo(
    () => resolveDownloadClientState(options, selectedId),
    [options, selectedId],
  );

  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center px-5 pb-16 pt-14 text-center md:pt-20">
        <div className="flex size-16 items-center justify-center rounded-lg border-2 border-zinc-950 bg-white text-3xl font-black shadow-[6px_6px_0_#18181b]">
          L
        </div>
        <h1 className="mt-12 max-w-5xl text-balance text-5xl font-semibold leading-[0.95] tracking-normal md:text-7xl lg:text-8xl">
          A focused desktop for language-learning notes.
        </h1>
        <p className="mt-7 max-w-2xl text-balance text-lg leading-8 text-zinc-600 md:text-2xl">
          Turn short videos into local lessons, tasks, and study notes without opening another
          browser tab.
        </p>

        <div className="mt-12 flex flex-col items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-14 items-center justify-center gap-2 rounded-full border-2 border-zinc-200 bg-white px-7 text-lg font-medium shadow-sm hover:bg-zinc-50">
              <Apple className="size-6 fill-current" aria-hidden />
              <span>{selectedOption?.label ?? 'macOS Universal'}</span>
              <ChevronDown className="size-5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-80 rounded-xl p-2">
              <DownloadOptionMenuItems options={menuOptions} onSelect={setSelectedId} />
            </DropdownMenuContent>
          </DropdownMenu>

          <a
            href={downloadDisabled ? undefined : (selectedOption.href ?? undefined)}
            aria-disabled={downloadDisabled}
            tabIndex={downloadDisabled ? -1 : undefined}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-8 text-lg font-medium text-white transition hover:bg-zinc-800 aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            Download
            <Download className="size-5" aria-hidden />
          </a>

          <p className="max-w-xl text-sm leading-6 text-zinc-500">
            This MVP is not notarized yet. On first launch, macOS may require right-clicking the
            app and choosing Open.
          </p>
        </div>
      </section>
    </main>
  );
}
