import { z } from 'zod';

export const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const targetLanguages = ['zh', 'en'] as const;

export const cefrLevelSchema = z.enum(cefrLevels);
export const targetLanguageSchema = z.enum(targetLanguages);

export const transcriptSegmentSchema = z.strictObject({
  text: z.string().nonempty(),
  start: z.number().finite().nonnegative(),
  duration: z.number().finite().nonnegative(),
});

export const videoMetadataSchema = z.strictObject({
  url: z.url(),
  id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
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

export const taskFileInputSchema = z.strictObject({
  video: videoMetadataSchema,
  transcript: normalizedTranscriptSchema,
  learningSettings: learningSettingsSchema,
});

export type CefrLevel = z.infer<typeof cefrLevelSchema>;
export type TargetLanguage = z.infer<typeof targetLanguageSchema>;
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type VideoMetadata = z.infer<typeof videoMetadataSchema>;
export type LearningSettings = z.infer<typeof learningSettingsSchema>;
export type NormalizedTranscript = z.infer<typeof normalizedTranscriptSchema>;
export type TranscriptBundle = z.infer<typeof transcriptBundleSchema>;
export type TaskFileInput = z.infer<typeof taskFileInputSchema>;
