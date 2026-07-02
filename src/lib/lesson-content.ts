import { z } from 'zod';

import {
  cefrLevelSchema,
  targetLanguageSchema,
  type CefrLevel,
  type TargetLanguage,
} from '@/lib/contracts';
import {
  lessonLabels,
  lessonSectionLabels,
  orderCefrLevels,
} from '@/lib/lesson-sections';
import type { StoredTask } from '@/lib/server/task-schema';
import type { Story } from '@/lib/server/story-schema';

const text = z.string().catch(() => '');
const requiredText = z.string().refine((value) => value.trim().length > 0, 'Expected non-empty text');

const generatedExampleSchema = z.strictObject({
  source: requiredText,
  translation: requiredText,
});
const generatedVocabItemSchema = z.strictObject({
  source: requiredText,
  translation: requiredText,
  usage: requiredText,
});
const generatedExplanationItemSchema = z.strictObject({
  title: requiredText,
  explanation: requiredText,
  examples: z.array(generatedExampleSchema).min(1),
});
const generatedLessonSchema = z.strictObject({
  schemaVersion: z.literal(1),
  video: z.strictObject({
    id: requiredText,
    title: requiredText,
    translatedTitle: requiredText,
  }),
  lesson: z.strictObject({
    targetLanguage: targetLanguageSchema,
    cefrLevels: z.array(cefrLevelSchema).min(1),
    transcriptSource: requiredText,
    focus: requiredText,
  }),
  transcripts: z.array(
    z.strictObject({ time: requiredText, source: requiredText, translation: requiredText }),
  ),
  vocabs: z.record(z.string(), z.array(generatedVocabItemSchema).min(1)),
  grammars: z.record(z.string(), z.array(generatedExplanationItemSchema).min(1)),
  spokenUsage: z.array(generatedExplanationItemSchema).min(1),
});

const transcriptSchema = z
  .object({ time: text, source: text, translation: text })
  .catch(() => ({ time: '', source: '', translation: '' }));
const exampleSchema = z
  .object({ source: text, translation: text })
  .catch(() => ({ source: '', translation: '' }));
const vocabItemSchema = z
  .object({ source: text, translation: text, usage: text })
  .catch(() => ({ source: '', translation: '', usage: '' }));
const explanationItemSchema = z
  .object({
    title: text,
    explanation: text,
    examples: z.array(exampleSchema).catch(() => []),
  })
  .catch(() => ({ title: '', explanation: '', examples: [] }));

function cefrRecordSchema<Item>(itemSchema: z.ZodType<Item>) {
  return z
    .record(z.string(), z.array(itemSchema).catch(() => [] as Item[]))
    .catch(() => ({}))
    .transform((record) => {
      const result: Partial<Record<CefrLevel, Item[]>> = {};

      for (const [key, items] of Object.entries(record)) {
        const level = cefrLevelSchema.safeParse(key);
        if (level.success) result[level.data] = items;
      }

      return result;
    });
}

const vocabRecordSchema = cefrRecordSchema(vocabItemSchema);
const grammarRecordSchema = cefrRecordSchema(explanationItemSchema);

export const lessonSchema = z.object({
  schemaVersion: z.literal(1).catch(() => 1 as const),
  video: z
    .object({ id: text, title: text, translatedTitle: text })
    .catch(() => ({ id: '', title: '', translatedTitle: '' })),
  lesson: z
    .object({
      targetLanguage: targetLanguageSchema.catch(() => 'en' as const),
      cefrLevels: z.array(cefrLevelSchema).catch(() => []),
      transcriptSource: text,
      focus: text,
    })
    .catch(() => ({
      targetLanguage: 'en' as const,
      cefrLevels: [],
      transcriptSource: '',
      focus: '',
    })),
  transcripts: z.array(transcriptSchema).catch(() => []),
  vocabs: vocabRecordSchema,
  grammars: grammarRecordSchema,
  spokenUsage: z.array(explanationItemSchema).catch(() => []),
});

export type LessonContent = z.infer<typeof lessonSchema>;

export function lessonToPlainText(content: LessonContent): string {
  const language = content.lesson.targetLanguage;
  const labels = lessonLabels[language];
  const sectionLabels = lessonSectionLabels[language];
  const levels = orderCefrLevels(content.lesson.cefrLevels);
  const sections: string[][] = [
    [content.video.translatedTitle],
    [
      sectionLabels.metadata,
      `${labels.originalTitle}: ${content.video.title}`,
      `${labels.video}: https://www.youtube.com/watch?v=${encodeURIComponent(content.video.id)}`,
      `${labels.videoId}: ${content.video.id}`,
      `${labels.transcriptSource}: ${content.lesson.transcriptSource}`,
      `${labels.targetLanguage}: ${content.lesson.targetLanguage}`,
      `${labels.requestedLevels}: ${levels.join(', ')}`,
      `${labels.focus}: ${content.lesson.focus}`,
    ],
    [
      sectionLabels.translation,
      ...(content.transcripts.length === 0
        ? [labels.noContent]
        : content.transcripts.flatMap((transcript) => [
            `${labels.time}: ${transcript.time}`,
            `${labels.source}: ${transcript.source}`,
            `${labels.translation}: ${transcript.translation}`,
          ])),
    ],
  ];

  for (const level of levels) {
    const vocabulary = content.vocabs[level] ?? [];
    sections.push([
      `${level} ${sectionLabels.vocabulary}`,
      ...(vocabulary.length === 0
        ? [labels.noContent]
        : vocabulary.flatMap((item) => [
            `${labels.source}: ${item.source}`,
            `${labels.translation}: ${item.translation}`,
            `${labels.usage}: ${item.usage}`,
          ])),
    ]);

    const grammars = content.grammars[level] ?? [];
    sections.push([
      `${level} ${sectionLabels.grammar}`,
      ...(grammars.length === 0
        ? [labels.noContent]
        : grammars.flatMap((grammar) => [
            grammar.title,
            grammar.explanation,
            labels.examples,
            ...exampleLines(grammar.examples, labels),
          ])),
    ]);
  }

  sections.push([
    sectionLabels.spokenUsage,
    ...(content.spokenUsage.length === 0
      ? [labels.noContent]
      : content.spokenUsage.flatMap((usage) => [
          usage.title,
          usage.explanation,
          labels.examples,
          ...exampleLines(usage.examples, labels),
        ])),
  ]);

  return sections.flatMap((section, index) => (index === 0 ? section : ['', ...section])).join('\n');
}

function exampleLines(
  examples: LessonContent['spokenUsage'][number]['examples'],
  labels: (typeof lessonLabels)[TargetLanguage],
): string[] {
  if (examples.length === 0) return [labels.noContent];

  return examples.flatMap((example) => [
    `${labels.source}: ${example.source}`,
    `${labels.translation}: ${example.translation}`,
  ]);
}

export function formatTimestamp(seconds: number) {
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

export type LessonGenerationSource = {
  task: StoredTask;
  story: Story;
};

export function parseGeneratedLesson(
  raw: string,
  { task, story }: LessonGenerationSource,
): LessonContent {
  const cefrLevels = orderCefrLevels(task.learningSettings.cefrLevels);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (cause) {
    throw new Error('Generated lesson is not valid JSON.', { cause });
  }

  const result = generatedLessonSchema.safeParse(value);
  if (!result.success) {
    throw new Error('Generated lesson does not match the lesson contract.', {
      cause: result.error,
    });
  }
  const parsed = result.data;
  const expectedLevels = JSON.stringify(cefrLevels);
  if (
    JSON.stringify(Object.keys(parsed.vocabs)) !== expectedLevels ||
    JSON.stringify(Object.keys(parsed.grammars)) !== expectedLevels
  ) {
    throw new Error('Generated lesson does not match the lesson contract: CEFR sections are incomplete.');
  }
  if (parsed.transcripts.length !== story.transcript.segments.length) {
    throw new Error('Generated lesson does not match the lesson contract: transcript count differs.');
  }

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
      id: story.video.id,
      title: story.video.title,
      translatedTitle: parsed.video.translatedTitle.trim()
        ? parsed.video.translatedTitle
        : story.video.title,
    },
    lesson: {
      targetLanguage: task.learningSettings.targetLanguage,
      cefrLevels,
      transcriptSource: story.transcript.source,
      focus: parsed.lesson.focus.trim() ? parsed.lesson.focus : '',
    },
    transcripts: story.transcript.segments.map((segment, index) => {
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
