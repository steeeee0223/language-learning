import { z } from 'zod';

import { learningSettingsSchema, normalizedTranscriptSchema, videoMetadataSchema } from '@/lib/contracts';
import { generationErrorCodeSchema, modelPresetSchema } from '@/lib/generation-contracts';

export const TASK_SCHEMA_VERSION = 3 as const;
export const LESSON_SKILL_VERSION = '3' as const;
export const requiredLessonSections = ['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage'] as const;

export const generationMetadataSchema = z.strictObject({
  status: z.enum(['pending', 'succeeded', 'failed']),
  skillVersion: z.string().min(1),
  modelPreset: modelPresetSchema.optional(),
  requestedModel: z.string().min(1).optional(),
  codexVersion: z.string().min(1).optional(),
  startedAt: z.iso.datetime().optional(),
  completedAt: z.iso.datetime().optional(),
  errorCode: generationErrorCodeSchema.optional(),
});

export const storedTaskSchema = z.strictObject({
  schemaVersion: z.literal(TASK_SCHEMA_VERSION),
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
  generation: generationMetadataSchema,
});

export type StoredTask = z.infer<typeof storedTaskSchema>;
export type GenerationMetadata = z.infer<typeof generationMetadataSchema>;
