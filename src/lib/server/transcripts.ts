import type { TranscriptBundle, TranscriptSegment } from '@/lib/schemas/contracts';
import { parseYouTubeVideoId } from '@/lib/schemas/youtube';

const TRANSCRIPT_ENDPOINT = 'https://www.youtube-transcript.io/api/transcripts';

type FetchTranscriptBundleInput = {
  url: string;
  apiKey: string;
  fetchFn?: typeof fetch;
};



type RawSegment = {
  text?: unknown;
  start?: unknown;
  duration?: unknown;
  dur?: unknown;
};

function asNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeSegments(rawSegments: unknown): TranscriptSegment[] {
  if (!Array.isArray(rawSegments)) {
    return [];
  }

  return rawSegments.flatMap((segment): TranscriptSegment[] => {
    if (!isRecord(segment)) {
      return [];
    }

    const raw = segment as RawSegment;
    const start = asNumber(raw.start);
    const duration = asNumber(raw.duration ?? raw.dur);

    if (typeof raw.text !== 'string' || start === null || duration === null) {
      return [];
    }

    return [{ text: raw.text, start, duration }];
  });
}

function extractTranscriptSegments(payload: unknown): TranscriptSegment[] {
  const candidates = Array.isArray(payload) ? payload : [payload];

  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      continue;
    }

    const direct = normalizeSegments(candidate.transcript ?? candidate.segments);
    if (direct.length > 0) {
      return direct;
    }

    if (Array.isArray(candidate.tracks)) {
      for (const track of candidate.tracks) {
        if (!isRecord(track)) {
          continue;
        }

        const trackSegments = normalizeSegments(track.transcript ?? track.segments);
        if (trackSegments.length > 0) {
          return trackSegments;
        }
      }
    }
  }

  throw new Error('No transcript segments were returned for this video.');
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

async function fetchVideoTitle(videoId: string, fetchFn: typeof fetch) {
  const url = new URL('https://www.youtube.com/oembed');
  url.searchParams.set('format', 'json');
  url.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);

  const response = await fetchFn(url);
  if (!response.ok) {
    return `YouTube video ${videoId}`;
  }

  const payload = await readJson(response);
  return isRecord(payload) && typeof payload.title === 'string' ? payload.title : `YouTube video ${videoId}`;
}

async function fetchTranscriptPayload(videoId: string, apiKey: string, fetchFn: typeof fetch) {
  const response = await fetchFn(TRANSCRIPT_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ids: [videoId] }),
  });

  if (!response.ok) {
    throw new Error(`Transcript request failed with status ${response.status}.`);
  }

  return readJson(response);
}

export async function fetchTranscriptBundle(input: FetchTranscriptBundleInput): Promise<TranscriptBundle
> {
  const videoId = parseYouTubeVideoId(input.url);
  const fetchFn = input.fetchFn ?? fetch;
  const [title, transcriptPayload] = await Promise.all([
    fetchVideoTitle(videoId, fetchFn),
    fetchTranscriptPayload(videoId, input.apiKey, fetchFn),
  ]);

  return {
    video: {
      url: input.url,
      id: videoId,
      title,
    },
    transcript: {
      source: 'youtube-transcript.io',
      segments: extractTranscriptSegments(transcriptPayload),
    },
  };
}
