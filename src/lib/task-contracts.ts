import { z } from 'zod';

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

export type StorySummary = z.infer<typeof storySummarySchema>;
export type StoryResponse = z.infer<typeof storyResponseSchema>;
