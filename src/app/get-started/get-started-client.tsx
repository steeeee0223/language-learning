'use client';

import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, Loader2, Play, Wand2 } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';

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
          <form className="mt-5 space-y-4" onSubmit={submitUrl}>
            <label className="block text-sm font-medium text-zinc-800" htmlFor="youtube-url">
              YouTube video URL
            </label>
            <input
              id="youtube-url"
              className="h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
            />
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={transcriptMutation.isPending}
            >
              {transcriptMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wand2 className="size-4" aria-hidden />}
              Fetch Transcript
            </button>
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
          <form className="mt-5 space-y-5" onSubmit={submitTask}>
            <fieldset>
              <legend className="text-sm font-medium text-zinc-800">Target translation language</legend>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  ['zh', 'Chinese'],
                  ['en', 'English'],
                ].map(([value, label]) => (
                  <label
                    key={value}
                    className="flex h-10 items-center gap-2 rounded-md border border-zinc-200 px-3 text-sm text-zinc-800"
                  >
                    <input
                      type="radio"
                      name="target-language"
                      checked={targetLanguage === value}
                      onChange={() => setTargetLanguage(value as LearningSettings['targetLanguage'])}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium text-zinc-800">CEFR levels</legend>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {cefrLevels.map((level) => (
                  <label key={level} className="flex h-10 items-center gap-2 rounded-md border border-zinc-200 px-3 text-sm text-zinc-800">
                    <input type="checkbox" checked={selectedLevels.includes(level)} onChange={() => toggleLevel(level)} />
                    {level}
                  </label>
                ))}
              </div>
            </fieldset>

            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={!transcriptMutation.data || taskMutation.isPending}
            >
              {taskMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ClipboardList className="size-4" aria-hidden />}
              Create Local Task
            </button>
          </form>

          {taskMutation.error && (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{taskMutation.error.message}</p>
          )}

          {taskMutation.data && (
            <div className="mt-5 space-y-3 rounded-md bg-zinc-950 p-4 text-sm text-white">
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
