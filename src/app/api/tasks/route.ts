import { NextResponse } from 'next/server.js';

import { cefrLevels, targetLanguages, type CefrLevel, type TargetLanguage, type TaskFileInput } from '../../../lib/contracts.ts';
import { getErrorMessage, jsonError } from '../../../lib/server/http.ts';
import { buildTaskFile } from '../../../lib/server/tasks.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validatePayload(value: unknown): TaskFileInput {
  if (!isRecord(value) || !isRecord(value.video) || !isRecord(value.transcript) || !isRecord(value.learningSettings)) {
    throw new Error('Invalid task payload.');
  }

  const { video, transcript, learningSettings } = value;

  if (typeof video.url !== 'string' || typeof video.id !== 'string' || typeof video.title !== 'string') {
    throw new Error('Invalid video metadata.');
  }

  if (transcript.source !== 'youtube-transcript.io' || !Array.isArray(transcript.segments)) {
    throw new Error('Invalid transcript payload.');
  }

  const segments = transcript.segments.map((segment) => {
    if (
      !isRecord(segment) ||
      typeof segment.text !== 'string' ||
      typeof segment.start !== 'number' ||
      typeof segment.duration !== 'number'
    ) {
      throw new Error('Invalid transcript segment.');
    }

    return {
      text: segment.text,
      start: segment.start,
      duration: segment.duration,
    };
  });

  if (!targetLanguages.includes(learningSettings.targetLanguage as TargetLanguage)) {
    throw new Error('Invalid target language.');
  }

  if (!Array.isArray(learningSettings.cefrLevels) || learningSettings.cefrLevels.length === 0) {
    throw new Error('Select at least one CEFR level.');
  }

  const selectedLevels = learningSettings.cefrLevels.map((level) => {
    if (!cefrLevels.includes(level as CefrLevel)) {
      throw new Error('Invalid CEFR level.');
    }

    return level as CefrLevel;
  });

  return {
    video: {
      url: video.url,
      id: video.id,
      title: video.title,
    },
    transcript: {
      source: 'youtube-transcript.io',
      segments,
    },
    learningSettings: {
      targetLanguage: learningSettings.targetLanguage as TargetLanguage,
      cefrLevels: selectedLevels,
    },
  };
}

export async function POST(request: Request) {
  try {
    const payload = validatePayload(await request.json());
    return NextResponse.json(await buildTaskFile(payload));
  } catch (error) {
    return jsonError(getErrorMessage(error));
  }
}
