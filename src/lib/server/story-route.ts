import { NextResponse } from 'next/server.js';
import { z } from 'zod';

import type { TranscriptBundle } from '@/lib/contracts';
import { storyResponseSchema } from '@/lib/task-contracts';
import { jsonError } from './http';
import { createOrReuseStory, StoryCreationError } from './story-store';
import { fetchTranscriptBundle } from './transcripts';

const createStoryRequestSchema = z.strictObject({ url: z.url() });

type StoriesPostDependencies = {
  rootDir?: string;
  fetchBundle?: (url: string) => Promise<TranscriptBundle>;
};

async function fetchConfiguredTranscriptBundle(url: string) {
  const apiKey = process.env.YOUTUBE_TRANSCRIPT_API_KEY;
  if (!apiKey) {
    throw new StoryCreationError('MISSING_CONFIGURATION');
  }
  return fetchTranscriptBundle({ url, apiKey });
}

export function createStoriesPostHandler(dependencies: StoriesPostDependencies = {}) {
  return async function postStories(request: Request) {
    try {
      let requestBody: unknown;
      try {
        requestBody = await request.json();
      } catch {
        return jsonError('Invalid story payload.');
      }
      const payload = createStoryRequestSchema.safeParse(requestBody);
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
      if (error instanceof StoryCreationError) {
        switch (error.code) {
          case 'INVALID_URL':
            return jsonError('Invalid YouTube URL.', 400);
          case 'MISSING_CONFIGURATION':
            return jsonError('YOUTUBE_TRANSCRIPT_API_KEY is not configured.', 503);
          case 'PROVIDER_FAILED':
            return jsonError('Transcript provider request failed.', 502);
        }
      }
      return jsonError('Story creation failed.', 500);
    }
  };
}
