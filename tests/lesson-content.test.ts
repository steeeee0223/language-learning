import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createFallbackLesson,
  lessonSchema,
  parseLessonValue,
} from '@/lib/lesson-content.ts';

const fallback = createFallbackLesson({
  video: { id: 'jNQXAC9IVRw', title: 'Me at the zoo' },
  targetLanguage: 'zh',
  cefrLevels: ['A2', 'B1'],
  transcriptSource: 'youtube-transcript.io',
  transcripts: [{ time: '00:00', source: 'Here we are.', translation: 'Here we are.' }],
});

describe('lessonSchema', () => {
  it('parses valid content and strips unknown keys', () => {
    const result = lessonSchema.parse({
      ...fallback,
      unknown: 'removed',
      video: { ...fallback.video, unknown: 'removed' },
    });

    assert.equal('unknown' in result, false);
    assert.equal('unknown' in result.video, false);
  });

  it('catches malformed nested fields without discarding valid siblings', () => {
    const result = parseLessonValue(
      { ...fallback, video: { ...fallback.video, translatedTitle: 42 }, spokenUsage: false },
      fallback,
    );

    assert.equal(result.video.translatedTitle, fallback.video.translatedTitle);
    assert.deepEqual(result.spokenUsage, []);
    assert.deepEqual(result.transcripts, fallback.transcripts);
  });

  it('returns the supplied fallback for an invalid document value', () => {
    assert.deepEqual(parseLessonValue(null, fallback), fallback);
  });
});
