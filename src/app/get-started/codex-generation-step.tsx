'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ZodType } from 'zod';

import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  apiErrorResponseSchema,
  codexStatusSchema,
  generateLessonResponseSchema,
  type ModelPreset,
} from '@/lib/generation-contracts';

type CodexGenerationStepProps = {
  taskSlug: string | null;
  onPendingChange: (isPending: boolean) => void;
};

class ApiRequestError extends Error {
  constructor(message: string, public readonly errorPath?: string) {
    super(message);
  }
}

async function readJson<T>(response: Response, schema: ZodType<T>): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = apiErrorResponseSchema.safeParse(payload);
    throw new ApiRequestError(
      error.success ? error.data.error : 'Request failed.',
      error.success ? error.data.errorPath : undefined,
    );
  }

  return schema.parse(payload);
}

const modelOptions: Array<{
  value: ModelPreset;
  label: string;
  description: string;
}> = [
  { value: 'auto', label: 'Auto', description: 'Use the current Codex default.' },
  { value: 'fast', label: 'Fast', description: 'Faster generation for shorter lessons.' },
  { value: 'best', label: 'Best quality', description: 'More consistent lesson quality.' },
];

export function CodexGenerationStep({ taskSlug, onPendingChange }: CodexGenerationStepProps) {
  const router = useRouter();
  const [modelPreset, setModelPreset] = useState<ModelPreset>('best');
  const statusQuery = useQuery({
    queryKey: ['codex-status'],
    queryFn: async () => readJson(await fetch('/api/codex/status'), codexStatusSchema),
  });
  const generation = useMutation({
    mutationFn: async () => {
      if (!taskSlug) {
        throw new Error('Prepare a lesson task first.');
      }

      return readJson(
        await fetch(`/api/tasks/${taskSlug}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelPreset }),
        }),
        generateLessonResponseSchema,
      );
    },
    onSuccess: ({ lessonSlug }) => router.push(`/lessons/${lessonSlug}`),
  });
  const status = statusQuery.data?.status;

  useEffect(() => {
    onPendingChange(generation.isPending);
    return () => onPendingChange(false);
  }, [generation.isPending, onPendingChange]);

  return (
    <section className="rounded-md border bg-card p-5 text-card-foreground">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Sparkles className="size-4" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold text-foreground">3. Generate lesson</h2>
      </div>

      <div className="mt-5 flex items-center gap-3 text-sm">
        <span role="status">
          Codex: {statusQuery.isPending ? 'Checking…' : status ?? 'Unavailable'}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={statusQuery.isFetching}
          onClick={() => statusQuery.refetch()}
        >
          <RefreshCw data-icon="inline-start" aria-hidden />
          Check again
        </Button>
      </div>

      {statusQuery.error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {statusQuery.error.message}
        </p>
      ) : null}

      {status === 'not-authenticated' ? (
        <div className="mt-4 rounded-md bg-muted p-4 text-sm">
          <p>Sign in with your own ChatGPT/Codex account, then check again.</p>
          <div className="mt-3 flex items-center gap-2">
            <code>pnpm exec codex login</code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText('pnpm exec codex login');
              }}
            >
              <Copy data-icon="inline-start" aria-hidden />
              Copy
            </Button>
          </div>
        </div>
      ) : null}

      {status === 'not-installed' ? (
        <p className="mt-4 rounded-md bg-muted p-4 text-sm">
          Run <code>pnpm install</code> to install the local Codex runtime.
        </p>
      ) : null}

      <FieldSet className="mt-5">
        <FieldLegend variant="label">Model</FieldLegend>
        <RadioGroup
          disabled={generation.isPending}
          value={modelPreset}
          onValueChange={(value) => setModelPreset(value as ModelPreset)}
        >
          {modelOptions.map((option) => (
            <Field
              key={option.value}
              data-disabled={generation.isPending}
              orientation="horizontal"
              className="rounded-md border p-3"
            >
              <RadioGroupItem
                id={`model-${option.value}`}
                value={option.value}
                disabled={generation.isPending}
              />
              <FieldLabel
                className="flex-col items-start gap-0.5"
                htmlFor={`model-${option.value}`}
              >
                <span>{option.label}</span>
                <span className="block font-normal text-muted-foreground">
                  {option.description}
                </span>
              </FieldLabel>
            </Field>
          ))}
        </RadioGroup>
      </FieldSet>

      <p className="mt-4 text-sm text-muted-foreground">
        The transcript is processed through your own signed-in Codex account and usage allowance.
      </p>
      <Button
        className="mt-5 w-fit"
        size="lg"
        type="button"
        disabled={!taskSlug || status !== 'ready' || generation.isPending}
        onClick={() => generation.mutate()}
      >
        {generation.isPending ? (
          <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
        ) : (
          <Sparkles data-icon="inline-start" aria-hidden />
        )}
        {generation.isPending ? 'Generating lesson…' : 'Generate Lesson'}
      </Button>
      {generation.error ? (
        <div role="alert" className="mt-4 space-y-2 text-sm text-destructive">
          <p>{generation.error.message}</p>
          {generation.error instanceof ApiRequestError && generation.error.errorPath ? (
            <p className="text-muted-foreground">
              Debug details saved to{' '}
              <code className="break-all">{generation.error.errorPath}</code>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
