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

  it('preserves valid collection siblings when another entry is malformed', () => {
    const validUsage = {
      title: 'Here we are',
      explanation: 'A phrase used on arrival.',
      examples: [{ source: 'Here we are.', translation: '我們到了。' }],
    };

    const result = lessonSchema.parse({
      ...fallback,
      spokenUsage: [false, validUsage],
    });

    assert.deepEqual(result.spokenUsage, [
      { title: '', explanation: '', examples: [] },
      validUsage,
    ]);
  });

  it('keeps CEFR records partial', () => {
    const result = lessonSchema.parse({
      ...fallback,
      vocabs: { A2: [] },
      grammars: { B1: [] },
    });

    assert.deepEqual(result.vocabs, { A2: [] });
    assert.deepEqual(result.grammars, { B1: [] });
  });

  it('isolates caught collection values between parses', () => {
    const malformed = {
      ...fallback,
      transcripts: [false],
      vocabs: false,
      grammars: {
        A2: [{ title: 'Arrival', explanation: 'An arrival phrase.', examples: false }],
      },
      spokenUsage: false,
    };
    const first = lessonSchema.parse(malformed);

    first.transcripts[0]!.source = 'mutated';
    first.vocabs.A2 = [{ source: 'mutated', translation: '', usage: '' }];
    first.grammars.A2![0]!.examples.push({ source: 'mutated', translation: '' });
    first.spokenUsage.push({ title: 'mutated', explanation: '', examples: [] });

    const second = lessonSchema.parse(malformed);

    assert.deepEqual(second.transcripts, [{ time: '', source: '', translation: '' }]);
    assert.deepEqual(second.vocabs, {});
    assert.deepEqual(second.grammars.A2![0]!.examples, []);
    assert.deepEqual(second.spokenUsage, []);
  });

  it('repairs an invalid target language without discarding valid content', () => {
    const transcripts = [{ time: '00:01', source: 'The cool thing.', translation: '有趣的是。' }];
    const spokenUsage = [
      { title: 'Cool thing', explanation: 'An informal phrase.', examples: [] },
    ];

    const result = parseLessonValue(
      {
        ...fallback,
        lesson: { ...fallback.lesson, targetLanguage: 'invalid' },
        transcripts,
        spokenUsage,
      },
      fallback,
    );

    assert.equal(result.lesson.targetLanguage, fallback.lesson.targetLanguage);
    assert.deepEqual(result.transcripts, transcripts);
    assert.deepEqual(result.spokenUsage, spokenUsage);
  });
});

describe('createFallbackLesson', () => {
  it('clones caller-owned level and transcript values', () => {
    const cefrLevels: Array<'A2' | 'B1' | 'C1'> = ['A2', 'B1'];
    const transcripts = [
      { time: '00:00', source: 'Here we are.', translation: 'Here we are.' },
    ];
    const result = createFallbackLesson({
      video: { id: 'jNQXAC9IVRw', title: 'Me at the zoo' },
      targetLanguage: 'zh',
      cefrLevels,
      transcriptSource: 'youtube-transcript.io',
      transcripts,
    });

    cefrLevels.push('C1');
    transcripts[0]!.source = 'mutated';
    transcripts.push({ time: '00:01', source: 'mutated', translation: 'mutated' });

    assert.deepEqual(result.lesson.cefrLevels, ['A2', 'B1']);
    assert.deepEqual(result.transcripts, [
      { time: '00:00', source: 'Here we are.', translation: 'Here we are.' },
    ]);
  });
});
