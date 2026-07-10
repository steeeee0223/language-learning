'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Download, MonitorDown } from 'lucide-react';

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

export function AppleLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 814 1000"
      className={className}
      aria-hidden
      focusable="false"
      role="img"
    >
      <path
        fill="currentColor"
        d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 137.7 200.7 141.9 202.1-.6 3.2-21.9 75.1-72.5 149.4-43.5 63.5-88.5 127-159.4 127-69.7 0-87.7-41.3-163.7-41.3-76 0-99.5 40-165.7 42.6-67.1 2.6-118.2-68.6-162-132C10.2 750.5-55.4 515.6 35.3 356.9c45-78.1 125.6-127.6 213-128.9 66.5-1.3 129.3 44.8 169.8 44.8 40.5 0 116.5-55.4 196.4-47.3 33.4 1.4 127.2 13.5 187.5 101.4-4.9 3-112.3 65.5-111.2 195.5zM560.5 137.9C597.8 92.7 622.9 29.8 616.1 0c-53.7 2.1-118.7 35.8-156.9 81-34.3 39.8-64.3 103.9-56.2 165.1 59.8 4.6 120.9-30.4 157.5-108.2"
      />
    </svg>
  );
}

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
              <AppleLogo className="size-5" />
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
              <AppleLogo className="size-6" />
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
