import { youtubeVideoIdSchema } from './contracts';

export function isYouTubeVideoId(value: string): boolean {
  return youtubeVideoIdSchema.safeParse(value).success;
}

export function parseYouTubeVideoId(input: string): string {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new Error('Enter a valid URL.');
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  let videoId: string | null = null;

  if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v');
    } else {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'shorts' || parts[0] === 'embed') {
        videoId = parts[1] ?? null;
      }
    }
  } else {
    throw new Error('Enter a YouTube URL.');
  }

  if (!videoId || !isYouTubeVideoId(videoId)) {
    throw new Error('The YouTube URL does not contain a valid video ID.');
  }

  return videoId;
}
