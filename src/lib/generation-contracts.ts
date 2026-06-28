import { z } from 'zod';

export const modelPresets = ['auto', 'fast', 'best'] as const;
export const modelPresetSchema = z.enum(modelPresets);
export const localSlugSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

export const codexStatusSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ready'), version: z.string().min(1) }),
  z.strictObject({ status: z.literal('not-installed') }),
  z.strictObject({ status: z.literal('not-authenticated'), version: z.string().min(1) }),
]);

export const generateLessonRequestSchema = z.strictObject({
  modelPreset: modelPresetSchema,
});

export const taskCreationResponseSchema = z.strictObject({
  taskSlug: localSlugSchema,
  taskPath: z.string().startsWith('.local/tasks/'),
  outputPath: z.string().startsWith('.local/lessons/'),
});

export const generateLessonResponseSchema = z.strictObject({
  lessonSlug: localSlugSchema,
  lessonPath: z.string().startsWith('.local/lessons/'),
});

export const generationErrorCodes = [
  'CODEX_NOT_INSTALLED',
  'CODEX_NOT_AUTHENTICATED',
  'MODEL_UNAVAILABLE',
  'USAGE_LIMITED',
  'GENERATION_TIMEOUT',
  'GENERATION_INVALID',
  'GENERATION_FAILED',
  'GENERATION_IN_PROGRESS',
  'LESSON_EXISTS',
  'LESSON_WRITE_FAILED',
] as const;

export const generationErrorCodeSchema = z.enum(generationErrorCodes);
export const generationErrorResponseSchema = z.strictObject({
  error: z.string(),
  code: generationErrorCodeSchema,
});
export const apiErrorResponseSchema = z.strictObject({
  error: z.string(),
  code: generationErrorCodeSchema.optional(),
});

export type ModelPreset = z.infer<typeof modelPresetSchema>;
export type CodexStatus = z.infer<typeof codexStatusSchema>;
export type GenerationErrorCode = z.infer<typeof generationErrorCodeSchema>;
