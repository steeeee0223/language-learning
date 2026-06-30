'use client';

import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, Loader2, Play, Wand2 } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import type { ZodType } from 'zod';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  cefrLevels,
  transcriptBundleSchema,
  type CefrLevel,
  type LearningSettings,
} from '@/lib/contracts';
import { apiErrorResponseSchema, taskCreationResponseSchema } from '@/lib/generation-contracts';
import { parseYouTubeVideoId } from '@/lib/youtube';

import { CodexGenerationStep } from './codex-generation-step';

async function postJson<T>(url: string, body: unknown, schema: ZodType<T>): Promise<T> {
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

  return schema.parse(payload);
}

export function GetStartedClient() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [targetLanguage, setTargetLanguage] = useState<LearningSettings['targetLanguage']>('zh');
  const [selectedLevels, setSelectedLevels] = useState<CefrLevel[]>(['A2', 'B1']);
  const [clientError, setClientError] = useState<string | null>(null);
  const [generationPending, setGenerationPending] = useState(false);

  const transcriptMutation = useMutation({
    mutationFn: (url: string) => postJson('/api/transcripts', { url }, transcriptBundleSchema),
  });
  const taskMutation = useMutation({
    mutationFn: (settings: LearningSettings) => {
      if (!transcriptMutation.data) {
        throw new Error('Fetch a transcript first.');
      }

      return postJson(
        '/api/tasks',
        {
          ...transcriptMutation.data,
          learningSettings: settings,
        },
        taskCreationResponseSchema,
      );
    },
  });

  const transcriptPreview = useMemo(() => {
    const segments = transcriptMutation.data?.transcript.segments ?? [];
    return segments
      .slice(0, 5)
      .map((segment) => segment.text)
      .join(' ');
  }, [transcriptMutation.data]);

  function submitUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (generationPending) {
      return;
    }

    setClientError(null);
    taskMutation.reset();

    try {
      parseYouTubeVideoId(youtubeUrl);
      transcriptMutation.mutate(youtubeUrl);
    } catch (error) {
      setClientError(error instanceof Error ? error.message : 'Enter a valid YouTube URL.');
    }
  }

  function toggleLevel(level: CefrLevel) {
    if (generationPending) {
      return;
    }

    taskMutation.reset();
    setSelectedLevels((current) =>
      current.includes(level) ? current.filter((item) => item !== level) : [...current, level],
    );
  }

  function selectTargetLanguage(value: LearningSettings['targetLanguage']) {
    if (generationPending) {
      return;
    }

    setTargetLanguage(value);
    taskMutation.reset();
  }

  function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (generationPending) {
      return;
    }

    if (selectedLevels.length === 0) {
      setClientError('Select at least one CEFR level.');
      return;
    }

    setClientError(null);
    taskMutation.mutate({ targetLanguage, cefrLevels: selectedLevels });
  }

  return (
    <div className="not-prose grid gap-5">
        <section className="rounded-md border bg-card p-5 text-card-foreground">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Play className="size-4" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-foreground">1. Fetch transcript</h2>
          </div>
          <form className="mt-5 flex flex-col gap-4" onSubmit={submitUrl}>
            <Field data-disabled={generationPending}>
              <FieldLabel htmlFor="youtube-url">YouTube video URL</FieldLabel>
              <Input
                id="youtube-url"
                className="h-10"
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtubeUrl}
                disabled={generationPending}
                onChange={(event) => setYoutubeUrl(event.target.value)}
              />
            </Field>
            <Button
              className="w-fit"
              size="lg"
              type="submit"
              disabled={generationPending || transcriptMutation.isPending}
            >
              {transcriptMutation.isPending ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <Wand2 data-icon="inline-start" aria-hidden />}
              Fetch Transcript
            </Button>
          </form>

          {(clientError || transcriptMutation.error) && (
            <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {clientError ?? transcriptMutation.error?.message}
            </p>
          )}

          {transcriptMutation.data && (
            <div className="mt-5 rounded-md bg-muted p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CheckCircle2 className="size-4" aria-hidden />
                Transcript ready
              </div>
              <dl className="mt-4 grid gap-3 text-sm">
                <div>
                  <dt className="font-medium text-muted-foreground">Title</dt>
                  <dd className="mt-1 text-foreground">{transcriptMutation.data.video.title}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Video ID</dt>
                  <dd className="mt-1 font-mono text-foreground">{transcriptMutation.data.video.id}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Preview</dt>
                  <dd className="mt-1 leading-6 text-foreground">{transcriptPreview}</dd>
                </div>
              </dl>
            </div>
          )}
        </section>

        <section className="rounded-md border bg-card p-5 text-card-foreground">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-emerald-700 text-white">
              <ClipboardList className="size-4" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-foreground">2. Learning settings</h2>
          </div>
          <form className="mt-5 flex flex-col gap-5" onSubmit={submitTask}>
            <FieldSet>
              <FieldLegend variant="label">Target translation language</FieldLegend>
              <RadioGroup
                className="grid-cols-2"
                disabled={generationPending}
                value={targetLanguage}
                onValueChange={(value) =>
                  selectTargetLanguage(value as LearningSettings['targetLanguage'])
                }
              >
                {[
                  ['zh', 'Chinese'],
                  ['en', 'English'],
                ].map(([value, label]) => (
                  <Field
                    key={value}
                    data-disabled={generationPending}
                    orientation="horizontal"
                    className="h-10 rounded-md border px-3"
                  >
                    <RadioGroupItem
                      id={`target-language-${value}`}
                      value={value}
                      disabled={generationPending}
                    />
                    <FieldLabel htmlFor={`target-language-${value}`}>{label}</FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">CEFR levels</FieldLegend>
              <FieldGroup className="grid grid-cols-3 gap-2">
                {cefrLevels.map((level) => (
                  <Field
                    key={level}
                    data-disabled={generationPending}
                    orientation="horizontal"
                    className="h-10 rounded-md border px-3"
                  >
                    <Checkbox
                      id={`cefr-${level}`}
                      checked={selectedLevels.includes(level)}
                      disabled={generationPending}
                      onCheckedChange={() => toggleLevel(level)}
                    />
                    <FieldLabel htmlFor={`cefr-${level}`}>{level}</FieldLabel>
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>

            <Button
              className="w-fit"
              size="lg"
              type="submit"
              disabled={
                generationPending || !transcriptMutation.data || taskMutation.isPending
              }
            >
              {taskMutation.isPending ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <ClipboardList data-icon="inline-start" aria-hidden />}
              Prepare Lesson
            </Button>
          </form>

          {taskMutation.error && (
            <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{taskMutation.error.message}</p>
          )}

          {taskMutation.data && (
            <div className="mt-5 flex flex-col gap-3 rounded-md bg-muted p-4 text-sm">
              <p className="font-medium text-foreground">Task ready</p>
              <p className="font-mono text-muted-foreground">{taskMutation.data.taskPath}</p>
              <p className="font-mono text-muted-foreground">{taskMutation.data.outputPath}</p>
            </div>
          )}
        </section>
        <CodexGenerationStep
          key={`${taskMutation.submittedAt}:${taskMutation.data?.taskSlug ?? 'unprepared'}`}
          taskSlug={taskMutation.data?.taskSlug ?? null}
          onPendingChange={setGenerationPending}
        />
    </div>
  );
}
