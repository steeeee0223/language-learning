'use client';

import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, Loader2, Play, Wand2 } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cefrLevels, type CefrLevel, type LearningSettings, type NormalizedTranscript, type VideoMetadata } from '@/lib/contracts';
import { parseYouTubeVideoId } from '@/lib/youtube';

type TranscriptResponse = {
  video: VideoMetadata;
  transcript: NormalizedTranscript;
};

type TaskResponse = {
  taskPath: string;
  outputPath: string;
  suggestedCommand: string;
};

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

export function GetStartedClient() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [targetLanguage, setTargetLanguage] = useState<LearningSettings['targetLanguage']>('zh');
  const [selectedLevels, setSelectedLevels] = useState<CefrLevel[]>(['A2', 'B1']);
  const [clientError, setClientError] = useState<string | null>(null);

  const transcriptMutation = useMutation({
    mutationFn: (url: string) => postJson<TranscriptResponse>('/api/transcripts', { url }),
  });
  const taskMutation = useMutation({
    mutationFn: (settings: LearningSettings) => {
      if (!transcriptMutation.data) {
        throw new Error('Fetch a transcript first.');
      }

      return postJson<TaskResponse>('/api/tasks', {
        ...transcriptMutation.data,
        learningSettings: settings,
      });
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
    setSelectedLevels((current) =>
      current.includes(level) ? current.filter((item) => item !== level) : [...current, level],
    );
  }

  function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedLevels.length === 0) {
      setClientError('Select at least one CEFR level.');
      return;
    }

    setClientError(null);
    taskMutation.mutate({ targetLanguage, cefrLevels: selectedLevels });
  }

  return (
    <div className="not-prose grid gap-5">
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-zinc-950 text-white">
              <Play className="size-4" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-zinc-950">1. Fetch transcript</h2>
          </div>
          <form className="mt-5 flex flex-col gap-4" onSubmit={submitUrl}>
            <Field>
              <FieldLabel htmlFor="youtube-url">YouTube video URL</FieldLabel>
              <Input
                id="youtube-url"
                className="h-10"
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
              />
            </Field>
            <Button
              className="w-fit"
              size="lg"
              type="submit"
              disabled={transcriptMutation.isPending}
            >
              {transcriptMutation.isPending ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <Wand2 data-icon="inline-start" aria-hidden />}
              Fetch Transcript
            </Button>
          </form>

          {(clientError || transcriptMutation.error) && (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {clientError ?? transcriptMutation.error?.message}
            </p>
          )}

          {transcriptMutation.data && (
            <div className="mt-5 rounded-md bg-zinc-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="size-4" aria-hidden />
                Transcript ready
              </div>
              <dl className="mt-4 grid gap-3 text-sm">
                <div>
                  <dt className="font-medium text-zinc-500">Title</dt>
                  <dd className="mt-1 text-zinc-950">{transcriptMutation.data.video.title}</dd>
                </div>
                <div>
                  <dt className="font-medium text-zinc-500">Video ID</dt>
                  <dd className="mt-1 font-mono text-zinc-950">{transcriptMutation.data.video.id}</dd>
                </div>
                <div>
                  <dt className="font-medium text-zinc-500">Preview</dt>
                  <dd className="mt-1 leading-6 text-zinc-700">{transcriptPreview}</dd>
                </div>
              </dl>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-emerald-700 text-white">
              <ClipboardList className="size-4" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-zinc-950">2. Learning settings</h2>
          </div>
          <form className="mt-5 flex flex-col gap-5" onSubmit={submitTask}>
            <FieldSet>
              <FieldLegend variant="label">Target translation language</FieldLegend>
              <RadioGroup
                className="grid-cols-2"
                value={targetLanguage}
                onValueChange={(value) => setTargetLanguage(value as LearningSettings['targetLanguage'])}
              >
                {[
                  ['zh', 'Chinese'],
                  ['en', 'English'],
                ].map(([value, label]) => (
                  <Field key={value} orientation="horizontal" className="h-10 rounded-md border px-3">
                    <RadioGroupItem id={`target-language-${value}`} value={value} />
                    <FieldLabel htmlFor={`target-language-${value}`}>{label}</FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">CEFR levels</FieldLegend>
              <FieldGroup className="grid grid-cols-3 gap-2">
                {cefrLevels.map((level) => (
                  <Field key={level} orientation="horizontal" className="h-10 rounded-md border px-3">
                    <Checkbox id={`cefr-${level}`} checked={selectedLevels.includes(level)} onCheckedChange={() => toggleLevel(level)} />
                    <FieldLabel htmlFor={`cefr-${level}`}>{level}</FieldLabel>
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>

            <Button
              className="w-fit"
              size="lg"
              type="submit"
              disabled={!transcriptMutation.data || taskMutation.isPending}
            >
              {taskMutation.isPending ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <ClipboardList data-icon="inline-start" aria-hidden />}
              Create Local Task
            </Button>
          </form>

          {taskMutation.error && (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{taskMutation.error.message}</p>
          )}

          {taskMutation.data && (
            <div className="mt-5 flex flex-col gap-3 rounded-md bg-zinc-950 p-4 text-sm text-white">
              <p className="font-medium">Task created</p>
              <p className="font-mono text-zinc-300">{taskMutation.data.taskPath}</p>
              <p className="font-mono text-zinc-300">{taskMutation.data.outputPath}</p>
              <pre className="overflow-x-auto rounded-md bg-black/40 p-3 text-xs text-zinc-100">{taskMutation.data.suggestedCommand}</pre>
            </div>
          )}
        </section>
    </div>
  );
}
