import { z } from 'zod';

import { modelPresetSchema } from './generation-contracts';

export const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const targetLanguages = ['zh', 'en'] as const;

export const cefrLevelSchema = z.enum(cefrLevels);
export const targetLanguageSchema = z.enum(targetLanguages);

const transcriptSegmentSchema = z.strictObject({
  text: z.string().nonempty(),
  start: z.number().nonnegative(),
  duration: z.number().nonnegative(),
});

export const youtubeVideoIdSchema = z.string().regex(/^[A-Za-z0-9_-]{11}$/);

export const videoMetadataSchema = z.strictObject({
  url: z.url(),
  id: youtubeVideoIdSchema,
  title: z.string().nonempty(),
});

export const learningSettingsSchema = z.strictObject({
  targetLanguage: targetLanguageSchema,
  cefrLevels: z.array(cefrLevelSchema).nonempty(),
});

export const normalizedTranscriptSchema = z.strictObject({
  source: z.literal('youtube-transcript.io'),
  segments: z.array(transcriptSegmentSchema).nonempty(),
});

export const transcriptBundleSchema = z.strictObject({
  video: videoMetadataSchema,
  transcript: normalizedTranscriptSchema,
});

export const taskCreationRequestSchema = z.strictObject({
  storyId: youtubeVideoIdSchema,
  learningSettings: learningSettingsSchema,
  modelPreset: modelPresetSchema,
});

export type CefrLevel = z.infer<typeof cefrLevelSchema>;
export type TargetLanguage = z.infer<typeof targetLanguageSchema>;
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type LearningSettings = z.infer<typeof learningSettingsSchema>;
export type TranscriptBundle = z.infer<typeof transcriptBundleSchema>;
export type TaskCreationRequest = z.infer<typeof taskCreationRequestSchema>;
