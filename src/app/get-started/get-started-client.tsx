'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button.tsx';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field.tsx';
import { Input } from '@/components/ui/input.tsx';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group.tsx';
import {
  cefrLevels,
  type CefrLevel,
  type LearningSettings,
  type TaskCreationRequest,
} from '@/lib/contracts.ts';
import {
  apiErrorResponseSchema,
  codexStatusSchema,
  generateLessonResponseSchema,
  taskCreationResponseSchema,
  type ModelPreset,
} from '@/lib/generation-contracts.ts';
import {
  storyResponseSchema,
  type StorySummary,
} from '@/lib/task-contracts.ts';
import { parseYouTubeVideoId } from '@/lib/youtube.ts';

type Post = (url: string, body: unknown) => Promise<unknown>;

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = apiErrorResponseSchema.safeParse(payload);
    throw new Error(error.success ? error.data.error : 'Request failed.');
  }
  return payload;
}

export async function submitLessonGeneration(input: TaskCreationRequest, post: Post = postJson) {
  const task = taskCreationResponseSchema.parse(await post('/api/tasks', input));
  return generateLessonResponseSchema.parse(
    await post(`/api/tasks/${task.taskId}/generate`, {}),
  );
}

const modelOptions: Array<[ModelPreset, string]> = [
  ['auto', 'Auto'],
  ['fast', 'Fast'],
  ['best', 'Best quality'],
];

export function GetStartedClient({ initialStory }: { initialStory?: StorySummary }) {
  const router = useRouter();
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [story, setStory] = useState(initialStory);
  const [targetLanguage, setTargetLanguage] =
    useState<LearningSettings['targetLanguage']>('zh');
  const [selectedLevels, setSelectedLevels] = useState<CefrLevel[]>(['A2', 'B1']);
  const [modelPreset, setModelPreset] = useState<ModelPreset>('best');
  const [clientError, setClientError] = useState<string>();
  const statusQuery = useQuery({
    queryKey: ['codex-status'],
    queryFn: async () => {
      const response = await fetch('/api/codex/status');
      if (!response.ok) throw new Error('Codex status check failed.');
      return codexStatusSchema.parse(await response.json());
    },
  });
  const storyMutation = useMutation({
    mutationFn: async (url: string) =>
      storyResponseSchema.parse(await postJson('/api/stories', { url })).story,
    onSuccess: setStory,
  });
  const generation = useMutation({
    mutationFn: async () => {
      if (!story) throw new Error('Add a YouTube story first.');
      if (selectedLevels.length === 0) throw new Error('Select at least one CEFR level.');
      return submitLessonGeneration({
        storyId: story.id,
        learningSettings: { targetLanguage, cefrLevels: selectedLevels },
        modelPreset,
      });
    },
    onSuccess: ({ lessonSlug }) => router.push(`/lessons/${lessonSlug}`),
  });

  function submitStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClientError(undefined);
    try {
      parseYouTubeVideoId(youtubeUrl);
      storyMutation.mutate(youtubeUrl);
    } catch (error) {
      setClientError(error instanceof Error ? error.message : 'Enter a valid YouTube URL.');
    }
  }

  function toggleLevel(level: CefrLevel) {
    setSelectedLevels((current) =>
      current.includes(level) ? current.filter((item) => item !== level) : [...current, level],
    );
  }

  const isGenerating = generation.isPending;
  const error = clientError ?? storyMutation.error?.message ?? generation.error?.message;

  return (
    <div className="not-prose flex flex-col gap-5">
      <section className="rounded-md border bg-card p-5 text-card-foreground">
        <h2 className="text-lg font-semibold">1. YouTube story</h2>
        {story ? (
          <div className="mt-4 flex flex-col gap-1 text-sm">
            <span className="font-medium">{story.title}</span>
            <span className="font-mono text-muted-foreground">{story.id}</span>
          </div>
        ) : (
          <form className="mt-4 flex flex-col gap-4" onSubmit={submitStory}>
            <Field data-disabled={isGenerating}>
              <FieldLabel htmlFor="youtube-url">YouTube video URL</FieldLabel>
              <Input
                id="youtube-url"
                value={youtubeUrl}
                disabled={isGenerating}
                placeholder="https://www.youtube.com/watch?v=..."
                onChange={(event) => setYoutubeUrl(event.target.value)}
              />
            </Field>
            <Button
              className="w-fit"
              type="submit"
              disabled={isGenerating || storyMutation.isPending}
            >
              {storyMutation.isPending ? (
                <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
              ) : null}
              Add story
            </Button>
          </form>
        )}
      </section>

      <section className="rounded-md border bg-card p-5 text-card-foreground">
        <h2 className="text-lg font-semibold">2. Lesson settings</h2>
        <form
          className="mt-4 flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            generation.mutate();
          }}
        >
          <FieldSet disabled={isGenerating}>
            <FieldLegend variant="label">Target translation language</FieldLegend>
            <RadioGroup
              className="grid-cols-2"
              value={targetLanguage}
              onValueChange={(value) =>
                setTargetLanguage(value as LearningSettings['targetLanguage'])
              }
            >
              {[
                ['zh', 'Chinese'],
                ['en', 'English'],
              ].map(([value, label]) => (
                <Field key={value} orientation="horizontal" className="rounded-md border p-3">
                  <RadioGroupItem id={`language-${value}`} value={value} />
                  <FieldLabel htmlFor={`language-${value}`}>{label}</FieldLabel>
                </Field>
              ))}
            </RadioGroup>
          </FieldSet>

          <FieldSet disabled={isGenerating}>
            <FieldLegend variant="label">CEFR levels</FieldLegend>
            <FieldGroup className="grid grid-cols-3 gap-2">
              {cefrLevels.map((level) => (
                <Field key={level} orientation="horizontal" className="rounded-md border p-3">
                  <Checkbox
                    id={`cefr-${level}`}
                    checked={selectedLevels.includes(level)}
                    onCheckedChange={() => toggleLevel(level)}
                  />
                  <FieldLabel htmlFor={`cefr-${level}`}>{level}</FieldLabel>
                </Field>
              ))}
            </FieldGroup>
          </FieldSet>

          <FieldSet disabled={isGenerating}>
            <FieldLegend variant="label">Model</FieldLegend>
            <RadioGroup
              value={modelPreset}
              onValueChange={(value) => setModelPreset(value as ModelPreset)}
            >
              {modelOptions.map(([value, label]) => (
                <Field key={value} orientation="horizontal" className="rounded-md border p-3">
                  <RadioGroupItem id={`model-${value}`} value={value} />
                  <FieldLabel htmlFor={`model-${value}`}>{label}</FieldLabel>
                </Field>
              ))}
            </RadioGroup>
          </FieldSet>

          <div className="flex items-center gap-3 text-sm">
            <span role="status">
              Codex: {statusQuery.isPending ? 'Checking…' : statusQuery.data?.status ?? 'Unavailable'}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={statusQuery.isFetching}
              onClick={() => statusQuery.refetch()}
            >
              <RefreshCw data-icon="inline-start" aria-hidden />
              Check again
            </Button>
          </div>

          {statusQuery.data?.status === 'not-authenticated' ? (
            <p className="text-sm text-muted-foreground">
              Sign in with <code>pnpm exec codex login</code>, then check again.
            </p>
          ) : null}
          {statusQuery.data?.status === 'not-installed' ? (
            <p className="text-sm text-muted-foreground">
              Run <code>pnpm install</code> to install the local Codex runtime.
            </p>
          ) : null}

          <p className="text-sm text-muted-foreground">
            The transcript is processed through your own signed-in Codex account and usage allowance.
          </p>
          <Button
            className="w-fit"
            size="lg"
            type="submit"
            disabled={!story || statusQuery.data?.status !== 'ready' || isGenerating}
          >
            {isGenerating ? (
              <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
            ) : null}
            {isGenerating ? 'Generating lesson…' : 'Generate lesson'}
          </Button>
        </form>

        {error ? (
          <div role="alert" className="mt-4 flex flex-col gap-2 text-sm text-destructive">
            <p>{error}</p>
            {generation.error ? <Link href="/tasks">Open Tasks to recover</Link> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
