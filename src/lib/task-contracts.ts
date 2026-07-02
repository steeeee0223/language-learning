import { z } from 'zod';

import { cefrLevelSchema, targetLanguageSchema } from './contracts.ts';
import { localSlugSchema, modelPresetSchema } from './generation-contracts.ts';

export const storySummarySchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  title: z.string().nonempty(),
  url: z.url(),
  createdAt: z.iso.datetime(),
});

export const storyResponseSchema = z.strictObject({
  story: storySummarySchema,
  reused: z.boolean(),
});

const taskSummarySchema = z.strictObject({
  id: localSlugSchema,
  status: z.enum(['pending', 'succeeded', 'failed']),
  cefrLevels: z.array(cefrLevelSchema).nonempty(),
  targetLanguage: targetLanguageSchema,
  modelPreset: modelPresetSchema,
  createdAt: z.iso.datetime(),
  lessonUrl: z.string().startsWith('/lessons/').optional(),
});

const taskGroupSchema = z.strictObject({
  story: storySummarySchema,
  tasks: z.array(taskSummarySchema),
});

export const taskListResponseSchema = z.strictObject({
  groups: z.array(taskGroupSchema),
});

export type StorySummary = z.infer<typeof storySummarySchema>;
export type TaskListResponse = z.infer<typeof taskListResponseSchema>;
