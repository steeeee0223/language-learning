import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createFallbackLesson,
  formatTimestamp,
  lessonSchema,
  parseGeneratedLesson,
  parseLessonValue,
} from '@/lib/lesson-content.ts';
import { storedTaskSchema } from '@/lib/server/task-schema.ts';

const fallback = createFallbackLesson({
  video: { id: 'jNQXAC9IVRw', title: 'Me at the zoo' },
  targetLanguage: 'zh',
  cefrLevels: ['A2', 'B1'],
  transcriptSource: 'youtube-transcript.io',
  transcripts: [{ time: '00:00', source: 'Here we are.', translation: 'Here we are.' }],
});

const task = storedTaskSchema.parse({
  schemaVersion: 3,
  createdAt: '2026-06-30T00:00:00.000Z',
  video: {
    url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    id: 'jNQXAC9IVRw',
    title: 'Me at the zoo',
  },
  transcript: {
    source: 'youtube-transcript.io',
    segments: [
      { text: 'Here we are.', start: 0.9, duration: 1 },
      { text: 'The cool thing is these guys.', start: 65.8, duration: 2 },
      { text: 'That is pretty much all there is to say.', start: 125.2, duration: 3 },
    ],
  },
  learningSettings: { targetLanguage: 'zh', cefrLevels: ['B1', 'A2'] },
  output: { format: 'json', path: '.local/lessons/lesson.json' },
  instructions: {
    requiredSections: ['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage'],
  },
  generation: { status: 'pending', skillVersion: '3' },
});

describe('formatTimestamp', () => {
  it('floors fractional seconds and formats them as mm:ss', () => {
    assert.equal(formatTimestamp(125.9), '02:05');
  });
});

describe('parseGeneratedLesson', () => {
  it('returns a task-derived fallback when the generated JSON is malformed', () => {
    assert.deepEqual(parseGeneratedLesson('{not JSON', task), {
      schemaVersion: 1,
      video: {
        id: 'jNQXAC9IVRw',
        title: 'Me at the zoo',
        translatedTitle: 'Me at the zoo',
      },
      lesson: {
        targetLanguage: 'zh',
        cefrLevels: ['A2', 'B1'],
        transcriptSource: 'youtube-transcript.io',
        focus: '',
      },
      transcripts: [
        { time: '00:00', source: 'Here we are.', translation: 'Here we are.' },
        {
          time: '01:05',
          source: 'The cool thing is these guys.',
          translation: 'The cool thing is these guys.',
        },
        {
          time: '02:05',
          source: 'That is pretty much all there is to say.',
          translation: 'That is pretty much all there is to say.',
        },
      ],
      vocabs: {},
      grammars: {},
      spokenUsage: [],
    });
  });

  it('preserves valid pedagogical sections when trusted metadata containers are malformed', () => {
    const pedagogicalSections = {
      transcripts: [{ time: '99:99', source: 'Override.', translation: '我們到了。' }],
      vocabs: { A2: [{ source: 'zoo', translation: '動物園', usage: 'noun' }] },
      grammars: {
        B1: [{ title: 'The thing is', explanation: 'Introduces a point.', examples: [] }],
      },
      spokenUsage: [
        { title: 'Here we are', explanation: 'Signals arrival.', examples: [] },
      ],
    };
    const validVideo = { id: 'override', title: 'Override', translatedTitle: '我在動物園' };
    const validLesson = {
      targetLanguage: 'en',
      cefrLevels: ['C2'],
      transcriptSource: 'override',
      focus: 'Spoken English',
    };

    for (const metadata of [
      { video: false, lesson: validLesson },
      { video: validVideo, lesson: false },
      { lesson: validLesson },
      { video: validVideo },
    ]) {
      const result = parseGeneratedLesson(
        JSON.stringify({ schemaVersion: 1, ...metadata, ...pedagogicalSections }),
        task,
      );

      assert.equal(result.transcripts[0]?.translation, '我們到了。');
      assert.deepEqual(result.vocabs, pedagogicalSections.vocabs);
      assert.deepEqual(result.grammars, pedagogicalSections.grammars);
      assert.deepEqual(result.spokenUsage, pedagogicalSections.spokenUsage);
    }
  });

  it('strips invalid CEFR keys without discarding valid requested-level siblings', () => {
    const result = parseGeneratedLesson(
      JSON.stringify({
        ...fallback,
        vocabs: {
          A2: [{ source: 'zoo', translation: '動物園', usage: 'noun' }],
          D1: [{ source: 'invalid', translation: '無效', usage: 'ignored' }],
        },
        grammars: {
          B1: [{ title: 'The thing is', explanation: 'Introduces a point.', examples: [] }],
          D1: [{ title: 'Invalid', explanation: 'Ignored.', examples: [] }],
        },
      }),
      task,
    );

    assert.deepEqual(result.vocabs, {
      A2: [{ source: 'zoo', translation: '動物園', usage: 'noun' }],
    });
    assert.deepEqual(result.grammars, {
      B1: [{ title: 'The thing is', explanation: 'Introduces a point.', examples: [] }],
    });
  });

  it('normalizes model content around trusted task fields', () => {
    const spokenUsage = [
      {
        title: 'Here we are',
        explanation: 'Used when arriving somewhere.',
        examples: [{ source: 'Here we are!', translation: '我們到了！' }],
      },
    ];
    const result = parseGeneratedLesson(
      JSON.stringify({
        schemaVersion: 1,
        video: {
          id: 'overridden',
          title: 'Overridden title',
          translatedTitle: '我在動物園',
        },
        lesson: {
          targetLanguage: 'en',
          cefrLevels: ['C2'],
          transcriptSource: 'model-source',
          focus: 'Everyday spoken English',
        },
        transcripts: [
          { time: '99:99', source: 'Overridden source.', translation: '我們到了。' },
          { time: '88:88', source: 'Another override.', translation: '   ' },
          { time: '77:77', source: 'Extra source.', translation: '額外翻譯。' },
          { time: '66:66', source: 'Ignored extra.', translation: '忽略。' },
        ],
        vocabs: {
          B1: [{ source: 'cool', translation: '很棒', usage: 'informal adjective' }],
          A2: [{ source: 'zoo', translation: '動物園', usage: 'noun' }],
          C2: [{ source: 'unexpected', translation: '不應保留', usage: 'ignored' }],
        },
        grammars: {
          B1: [{ title: 'The thing is', explanation: 'Introduces a point.', examples: [] }],
          A2: [{ title: 'Here we are', explanation: 'Signals arrival.', examples: [] }],
          C2: [{ title: 'Unexpected', explanation: 'Ignored.', examples: [] }],
        },
        spokenUsage,
      }),
      task,
    );

    assert.deepEqual(result.video, {
      id: 'jNQXAC9IVRw',
      title: 'Me at the zoo',
      translatedTitle: '我在動物園',
    });
    assert.deepEqual(result.lesson, {
      targetLanguage: 'zh',
      cefrLevels: ['A2', 'B1'],
      transcriptSource: 'youtube-transcript.io',
      focus: 'Everyday spoken English',
    });
    assert.deepEqual(result.transcripts, [
      { time: '00:00', source: 'Here we are.', translation: '我們到了。' },
      {
        time: '01:05',
        source: 'The cool thing is these guys.',
        translation: 'The cool thing is these guys.',
      },
      {
        time: '02:05',
        source: 'That is pretty much all there is to say.',
        translation: '額外翻譯。',
      },
    ]);
    assert.deepEqual(Object.keys(result.vocabs), ['A2', 'B1']);
    assert.deepEqual(result.vocabs, {
      A2: [{ source: 'zoo', translation: '動物園', usage: 'noun' }],
      B1: [{ source: 'cool', translation: '很棒', usage: 'informal adjective' }],
    });
    assert.deepEqual(Object.keys(result.grammars), ['A2', 'B1']);
    assert.deepEqual(result.grammars, {
      A2: [{ title: 'Here we are', explanation: 'Signals arrival.', examples: [] }],
      B1: [{ title: 'The thing is', explanation: 'Introduces a point.', examples: [] }],
    });
    assert.deepEqual(result.spokenUsage, spokenUsage);
  });
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
