import { z } from 'zod';

import {
  learningSettingsSchema,
  normalizedTranscriptSchema,
  videoMetadataSchema,
  youtubeVideoIdSchema,
} from '@/lib/contracts';
import { generationErrorCodeSchema, localSlugSchema, modelPresetSchema } from '@/lib/generation-contracts';

export const TASK_SCHEMA_VERSION = 4 as const;
export const LESSON_SKILL_VERSION = '4' as const;
export const requiredLessonSections = ['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage'] as const;

export const generationMetadataSchema = z.strictObject({
  status: z.enum(['pending', 'succeeded', 'failed']),
  skillVersion: z.string().min(1),
  requestedModel: z.string().min(1).optional(),
  codexVersion: z.string().min(1).optional(),
  startedAt: z.iso.datetime().optional(),
  completedAt: z.iso.datetime().optional(),
  errorCode: generationErrorCodeSchema.optional(),
});

const legacyGenerationMetadataSchema = z.strictObject({
  status: z.enum(['pending', 'succeeded', 'failed']),
  skillVersion: z.string().min(1),
  modelPreset: modelPresetSchema.optional(),
  requestedModel: z.string().min(1).optional(),
  codexVersion: z.string().min(1).optional(),
  startedAt: z.iso.datetime().optional(),
  completedAt: z.iso.datetime().optional(),
  errorCode: generationErrorCodeSchema.optional(),
});

export const legacyStoredTaskSchema = z.strictObject({
  schemaVersion: z.literal(3),
  createdAt: z.iso.datetime(),
  video: videoMetadataSchema,
  transcript: normalizedTranscriptSchema,
  learningSettings: learningSettingsSchema,
  output: z.strictObject({
    format: z.literal('json'),
    path: z.string().regex(/^\.local\/lessons\/[A-Za-z0-9][A-Za-z0-9_-]*\.json$/),
  }),
  instructions: z.strictObject({
    requiredSections: z.tuple([
      z.literal('metadata'),
      z.literal('translation'),
      z.literal('vocabulary'),
      z.literal('grammar'),
      z.literal('spokenUsage'),
    ]),
  }),
  generation: legacyGenerationMetadataSchema,
});

export const storedTaskV4Schema = z
  .strictObject({
    schemaVersion: z.literal(TASK_SCHEMA_VERSION),
    id: localSlugSchema,
    storyId: youtubeVideoIdSchema,
    createdAt: z.iso.datetime(),
    learningSettings: learningSettingsSchema,
    modelPreset: modelPresetSchema,
    output: z.strictObject({
      format: z.literal('json'),
      path: z.string().regex(/^\.local\/lessons\/[A-Za-z0-9][A-Za-z0-9_-]*\.json$/),
    }),
    instructions: z.strictObject({
      requiredSections: z.tuple([
        z.literal('metadata'),
        z.literal('translation'),
        z.literal('vocabulary'),
        z.literal('grammar'),
        z.literal('spokenUsage'),
      ]),
    }),
    generation: generationMetadataSchema,
  })
  .refine((task) => task.output.path === `.local/lessons/${task.id}.json`, {
    message: 'Task output path must match its ID.',
    path: ['output', 'path'],
  });

export const storedTaskSchema = storedTaskV4Schema;

export type StoredTask = z.infer<typeof storedTaskSchema>;
export type GenerationMetadata = z.infer<typeof generationMetadataSchema>;
export type LegacyStoredTask = z.infer<typeof legacyStoredTaskSchema>;
