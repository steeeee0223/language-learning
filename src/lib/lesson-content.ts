import { z } from 'zod';

import {
  cefrLevelSchema,
  targetLanguageSchema,
  type CefrLevel,
  type TargetLanguage,
} from '@/lib/contracts.ts';

const text = z.string().catch('');

const blankTranscript = { time: '', source: '', translation: '' };
const blankExample = { source: '', translation: '' };
const blankVocab = { source: '', translation: '', usage: '' };
const blankGrammar = { title: '', explanation: '', examples: [] };
const blankSpokenUsage = { title: '', explanation: '', examples: [] };

const transcriptSchema = z
  .object({ time: text, source: text, translation: text })
  .catch(blankTranscript);
const exampleSchema = z.object({ source: text, translation: text }).catch(blankExample);
const vocabItemSchema = z
  .object({ source: text, translation: text, usage: text })
  .catch(blankVocab);
const grammarItemSchema = z
  .object({
    title: text,
    explanation: text,
    examples: z.array(exampleSchema).catch([]),
  })
  .catch(blankGrammar);
const spokenUsageItemSchema = z
  .object({
    title: text,
    explanation: text,
    examples: z.array(exampleSchema).catch([]),
  })
  .catch(blankSpokenUsage);

export const lessonSchema = z.object({
  schemaVersion: z.literal(1).catch(1),
  video: z.object({ id: text, title: text, translatedTitle: text }),
  lesson: z.object({
    targetLanguage: targetLanguageSchema,
    cefrLevels: z.array(cefrLevelSchema).catch([]),
    transcriptSource: text,
    focus: text,
  }),
  transcripts: z.array(transcriptSchema).catch([]),
  vocabs: z.partialRecord(cefrLevelSchema, z.array(vocabItemSchema).catch([])).catch({}),
  grammars: z.partialRecord(cefrLevelSchema, z.array(grammarItemSchema).catch([])).catch({}),
  spokenUsage: z.array(spokenUsageItemSchema).catch([]),
});

export type LessonContent = z.infer<typeof lessonSchema>;

export function parseLessonValue(value: unknown, fallback: LessonContent): LessonContent {
  const parsed = lessonSchema.catch(fallback).parse(value);

  return lessonSchema.parse({
    ...parsed,
    video: {
      id: parsed.video.id || fallback.video.id,
      title: parsed.video.title || fallback.video.title,
      translatedTitle: parsed.video.translatedTitle || fallback.video.translatedTitle,
    },
    lesson: {
      targetLanguage: parsed.lesson.targetLanguage,
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
      cefrLevels: input.cefrLevels,
      transcriptSource: input.transcriptSource,
      focus: '',
    },
    transcripts: input.transcripts,
    vocabs: {},
    grammars: {},
    spokenUsage: [],
  };
}
