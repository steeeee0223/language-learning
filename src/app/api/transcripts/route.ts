import { NextResponse } from 'next/server.js';

import { getErrorMessage, jsonError } from '../../../lib/server/http.ts';
import { fetchTranscriptBundle } from '../../../lib/server/transcripts.ts';

export async function POST(request: Request) {
  try {
    const apiKey = process.env.YOUTUBE_TRANSCRIPT_API_KEY;
    if (!apiKey) {
      return jsonError('YOUTUBE_TRANSCRIPT_API_KEY is not configured.', 503);
    }

    const payload = await request.json();
    if (!payload || typeof payload.url !== 'string') {
      return jsonError('A YouTube URL is required.');
    }

    return NextResponse.json(await fetchTranscriptBundle({ url: payload.url, apiKey }));
  } catch (error) {
    return jsonError(getErrorMessage(error));
  }
}
