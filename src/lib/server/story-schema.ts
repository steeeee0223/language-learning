import { z } from 'zod';

import { normalizedTranscriptSchema, videoMetadataSchema } from '@/lib/contracts';

export const STORY_SCHEMA_VERSION = 1 as const;

export const storySchema = z
  .strictObject({
    schemaVersion: z.literal(STORY_SCHEMA_VERSION),
    id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
    createdAt: z.iso.datetime(),
    video: videoMetadataSchema,
    transcript: normalizedTranscriptSchema,
  })
  .refine((story) => story.id === story.video.id, {
    message: 'Story ID must match the video ID.',
    path: ['id'],
  });

export type Story = z.infer<typeof storySchema>;
