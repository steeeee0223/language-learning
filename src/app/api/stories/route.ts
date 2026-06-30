import { NextResponse } from 'next/server.js';
import { z } from 'zod';

import type { TranscriptBundle } from '../../../lib/contracts.ts';
import { createOrReuseStory } from '../../../lib/server/story-store.ts';
import { fetchTranscriptBundle } from '../../../lib/server/transcripts.ts';
import { getErrorMessage, jsonError } from '../../../lib/server/http.ts';
import { storyResponseSchema } from '../../../lib/task-contracts.ts';

const createStoryRequestSchema = z.strictObject({ url: z.string().min(1) });

type StoriesPostDependencies = {
  rootDir?: string;
  fetchBundle?: (url: string) => Promise<TranscriptBundle>;
};

async function fetchConfiguredTranscriptBundle(url: string) {
  const apiKey = process.env.YOUTUBE_TRANSCRIPT_API_KEY;
  if (!apiKey) {
    throw new Error('YOUTUBE_TRANSCRIPT_API_KEY is not configured.');
  }
  return fetchTranscriptBundle({ url, apiKey });
}

export function createStoriesPostHandler(dependencies: StoriesPostDependencies = {}) {
  return async function postStories(request: Request) {
    try {
      const payload = createStoryRequestSchema.safeParse(await request.json());
      if (!payload.success) {
        return jsonError('Invalid story payload.');
      }

      const result = await createOrReuseStory({
        url: payload.data.url,
        rootDir: dependencies.rootDir,
        fetchBundle: dependencies.fetchBundle ?? fetchConfiguredTranscriptBundle,
      });
      return NextResponse.json(
        storyResponseSchema.parse({
          story: {
            id: result.story.id,
            title: result.story.video.title,
            url: result.story.video.url,
            createdAt: result.story.createdAt,
          },
          reused: result.reused,
        }),
      );
    } catch (error) {
      const message = getErrorMessage(error);
      return jsonError(message, message === 'YOUTUBE_TRANSCRIPT_API_KEY is not configured.' ? 503 : 400);
    }
  };
}

export const POST = createStoriesPostHandler();
