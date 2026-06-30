import assert from 'node:assert/strict';
import test from 'node:test';

import { taskFileInputSchema } from '@/lib/contracts.ts';
import { generationErrorResponseSchema } from '@/lib/generation-contracts.ts';
import { storedTaskSchema } from '@/lib/server/task-schema.ts';

const canonicalTask = {
  video: {
    url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    id: 'jNQXAC9IVRw',
    title: 'Me at the zoo',
  },
  transcript: {
    source: 'youtube-transcript.io',
    segments: [{ text: 'Hello.', start: 0, duration: 1 }],
  },
  learningSettings: {
    targetLanguage: 'zh',
    cefrLevels: ['A2', 'B1'],
  },
};

test('canonical task creation parses unchanged', () => {
  assert.deepEqual(taskFileInputSchema.parse(canonicalTask), canonicalTask);
});

test('empty CEFR levels and malformed transcript segments fail', () => {
  assert.equal(
    taskFileInputSchema.safeParse({
      ...canonicalTask,
      learningSettings: { ...canonicalTask.learningSettings, cefrLevels: [] },
    }).success,
    false,
  );
  assert.equal(
    taskFileInputSchema.safeParse({
      ...canonicalTask,
      transcript: {
        ...canonicalTask.transcript,
        segments: [{ text: '', start: -1, duration: Number.POSITIVE_INFINITY }],
      },
    }).success,
    false,
  );
});

test('unknown object keys fail', () => {
  assert.equal(taskFileInputSchema.safeParse({ ...canonicalTask, unexpected: true }).success, false);
});

test('stored task schema parses the exact version 3 contract', () => {
  const task = {
    schemaVersion: 3,
    createdAt: '2026-06-27T08:00:00.000Z',
    ...canonicalTask,
    output: {
      format: 'json',
      path: '.local/lessons/lesson.json',
    },
    instructions: {
      requiredSections: ['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage'],
    },
    generation: {
      status: 'pending',
      skillVersion: '3',
    },
  };

  assert.deepEqual(storedTaskSchema.parse(task), task);
});

test('generation errors may identify their local diagnostic artifact', () => {
  const payload = {
    error: 'Generated lesson is invalid.',
    code: 'GENERATION_INVALID',
    errorPath: '.local/errors/lesson/attempt/error.json',
  };

  assert.deepEqual(generationErrorResponseSchema.parse(payload), payload);
});
