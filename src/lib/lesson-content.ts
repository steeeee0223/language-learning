import { z } from 'zod';

import {
  cefrLevelSchema,
  targetLanguageSchema,
  type CefrLevel,
  type TargetLanguage,
} from '@/lib/contracts.ts';
import { orderCefrLevels } from '@/lib/lesson-sections.ts';
import type { StoredTask } from '@/lib/server/task-schema.ts';

const text = z.string().catch(() => '');

const transcriptSchema = z
  .object({ time: text, source: text, translation: text })
  .catch(() => ({ time: '', source: '', translation: '' }));
const exampleSchema = z
  .object({ source: text, translation: text })
  .catch(() => ({ source: '', translation: '' }));
const vocabItemSchema = z
  .object({ source: text, translation: text, usage: text })
  .catch(() => ({ source: '', translation: '', usage: '' }));
const grammarItemSchema = z
  .object({
    title: text,
    explanation: text,
    examples: z.array(exampleSchema).catch(() => []),
  })
  .catch(() => ({ title: '', explanation: '', examples: [] }));
const spokenUsageItemSchema = z
  .object({
    title: text,
    explanation: text,
    examples: z.array(exampleSchema).catch(() => []),
  })
  .catch(() => ({ title: '', explanation: '', examples: [] }));

export const lessonSchema = z.object({
  schemaVersion: z.literal(1).catch(() => 1 as const),
  video: z.object({ id: text, title: text, translatedTitle: text }),
  lesson: z.object({
    targetLanguage: targetLanguageSchema.catch(() => 'en' as const),
    cefrLevels: z.array(cefrLevelSchema).catch(() => []),
    transcriptSource: text,
    focus: text,
  }),
  transcripts: z.array(transcriptSchema).catch(() => []),
  vocabs: z
    .partialRecord(cefrLevelSchema, z.array(vocabItemSchema).catch(() => []))
    .catch(() => ({})),
  grammars: z
    .partialRecord(cefrLevelSchema, z.array(grammarItemSchema).catch(() => []))
    .catch(() => ({})),
  spokenUsage: z.array(spokenUsageItemSchema).catch(() => []),
});

export type LessonContent = z.infer<typeof lessonSchema>;

export function formatTimestamp(seconds: number) {
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function parseGeneratedLesson(raw: string, task: StoredTask): LessonContent {
  const cefrLevels = orderCefrLevels(task.learningSettings.cefrLevels);
  const fallback = createFallbackLesson({
    video: { id: task.video.id, title: task.video.title },
    targetLanguage: task.learningSettings.targetLanguage,
    cefrLevels,
    transcriptSource: task.transcript.source,
    transcripts: task.transcript.segments.map((segment) => ({
      time: formatTimestamp(segment.start),
      source: segment.text,
      translation: segment.text,
    })),
  });

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return fallback;
  }

  const parsed = parseLessonValue(value, fallback);
  const vocabs: LessonContent['vocabs'] = {};
  const grammars: LessonContent['grammars'] = {};

  for (const level of cefrLevels) {
    const levelVocabs = parsed.vocabs[level];
    const levelGrammars = parsed.grammars[level];

    if (levelVocabs !== undefined) vocabs[level] = levelVocabs;
    if (levelGrammars !== undefined) grammars[level] = levelGrammars;
  }

  return lessonSchema.parse({
    schemaVersion: 1,
    video: {
      id: task.video.id,
      title: task.video.title,
      translatedTitle: parsed.video.translatedTitle.trim()
        ? parsed.video.translatedTitle
        : task.video.title,
    },
    lesson: {
      targetLanguage: task.learningSettings.targetLanguage,
      cefrLevels,
      transcriptSource: task.transcript.source,
      focus: parsed.lesson.focus.trim() ? parsed.lesson.focus : '',
    },
    transcripts: task.transcript.segments.map((segment, index) => {
      const translation = parsed.transcripts[index]?.translation;

      return {
        time: formatTimestamp(segment.start),
        source: segment.text,
        translation: translation?.trim() ? translation : segment.text,
      };
    }),
    vocabs,
    grammars,
    spokenUsage: parsed.spokenUsage,
  });
}

export function parseLessonValue(value: unknown, fallback: LessonContent): LessonContent {
  const parsed = lessonSchema.catch(fallback).parse(value);
  const targetLanguage = targetLanguageSchema.safeParse(readTargetLanguage(value));

  return lessonSchema.parse({
    ...parsed,
    video: {
      id: parsed.video.id || fallback.video.id,
      title: parsed.video.title || fallback.video.title,
      translatedTitle: parsed.video.translatedTitle || fallback.video.translatedTitle,
    },
    lesson: {
      targetLanguage: targetLanguage.success
        ? targetLanguage.data
        : fallback.lesson.targetLanguage,
      cefrLevels:
        parsed.lesson.cefrLevels.length > 0
          ? parsed.lesson.cefrLevels
          : fallback.lesson.cefrLevels,
      transcriptSource: parsed.lesson.transcriptSource || fallback.lesson.transcriptSource,
      focus: parsed.lesson.focus || fallback.lesson.focus,
    },
    transcripts: parsed.transcripts.length > 0 ? parsed.transcripts : fallback.transcripts,
  });
}

function readTargetLanguage(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('lesson' in value)) return undefined;

  const lesson = value.lesson;
  if (typeof lesson !== 'object' || lesson === null || !('targetLanguage' in lesson)) {
    return undefined;
  }

  return lesson.targetLanguage;
}

export function createFallbackLesson(input: {
  video: { id: string; title: string };
  targetLanguage: TargetLanguage;
  cefrLevels: CefrLevel[];
  transcriptSource: string;
  transcripts: LessonContent['transcripts'];
}): LessonContent {
  return {
    schemaVersion: 1,
    video: { ...input.video, translatedTitle: input.video.title },
    lesson: {
      targetLanguage: input.targetLanguage,
      cefrLevels: [...input.cefrLevels],
      transcriptSource: input.transcriptSource,
      focus: '',
    },
    transcripts: input.transcripts.map((transcript) => ({ ...transcript })),
    vocabs: {},
    grammars: {},
    spokenUsage: [],
  };
}
