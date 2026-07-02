import assert from 'node:assert/strict';
import test from 'node:test';

import { taskCreationRequestSchema } from '@/lib/contracts';
import {
  generationErrorResponseSchema,
  taskCreationResponseSchema,
} from '@/lib/generation-contracts';
import { storedTaskSchema } from '@/lib/server/task-schema';

const canonicalTask = {
  storyId: 'jNQXAC9IVRw',
  learningSettings: {
    targetLanguage: 'zh',
    cefrLevels: ['A2', 'B1'],
  },
  modelPreset: 'best',
};

test('canonical task creation parses unchanged', () => {
  assert.deepEqual(taskCreationRequestSchema.parse(canonicalTask), canonicalTask);
});

test('task creation requires at least one CEFR level', () => {
  assert.equal(
    taskCreationRequestSchema.safeParse({
      ...canonicalTask,
      learningSettings: { ...canonicalTask.learningSettings, cefrLevels: [] },
    }).success,
    false,
  );
});

test('task creation rejects embedded source material and unknown keys', () => {
  assert.equal(
    taskCreationRequestSchema.safeParse({
      ...canonicalTask,
      video: { id: 'jNQXAC9IVRw' },
      transcript: {
        source: 'youtube-transcript.io',
        segments: [{ text: 'Hello.', start: 0, duration: 1 }],
      },
    }).success,
    false,
  );
  assert.equal(
    taskCreationRequestSchema.safeParse({ ...canonicalTask, unexpected: true }).success,
    false,
  );
});

test('stored task schema parses the exact version 4 contract', () => {
  const task = {
    schemaVersion: 4,
    id: 'task-123',
    storyId: canonicalTask.storyId,
    createdAt: '2026-06-27T08:00:00.000Z',
    learningSettings: canonicalTask.learningSettings,
    modelPreset: canonicalTask.modelPreset,
    output: {
      format: 'json',
      path: '.local/lessons/task-123.json',
    },
    instructions: {
      requiredSections: ['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage'],
    },
    generation: {
      status: 'pending',
      skillVersion: '4',
    },
  };

  assert.deepEqual(storedTaskSchema.parse(task), task);
});

test('stored task schema requires aligned IDs and rejects embedded source and generation preset', () => {
  const task = {
    schemaVersion: 4,
    id: 'task-123',
    storyId: canonicalTask.storyId,
    createdAt: '2026-06-27T08:00:00.000Z',
    learningSettings: canonicalTask.learningSettings,
    modelPreset: canonicalTask.modelPreset,
    output: { format: 'json', path: '.local/lessons/different-task.json' },
    instructions: {
      requiredSections: ['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage'],
    },
    generation: { status: 'pending', skillVersion: '4' },
  };

  assert.equal(storedTaskSchema.safeParse(task).success, false);
  assert.equal(
    storedTaskSchema.safeParse({
      ...task,
      output: { format: 'json', path: '.local/lessons/task-123.json' },
      video: {},
    }).success,
    false,
  );
  assert.equal(
    storedTaskSchema.safeParse({
      ...task,
      output: { format: 'json', path: '.local/lessons/task-123.json' },
      generation: { ...task.generation, modelPreset: 'best' },
    }).success,
    false,
  );
});

test('task creation response exposes only the task ID', () => {
  assert.deepEqual(taskCreationResponseSchema.parse({ taskId: 'task-123' }), {
    taskId: 'task-123',
  });
  assert.equal(
    taskCreationResponseSchema.safeParse({ taskId: 'task-123', taskPath: '.local/tasks/task-123.json' }).success,
    false,
  );
});

test('generation errors may identify their local diagnostic artifact', () => {
  const payload = {
    error: 'Generated lesson is invalid.',
    code: 'GENERATION_INVALID',
    errorPath: '.local/errors/lesson/attempt/error.json',
  };

  assert.deepEqual(generationErrorResponseSchema.parse(payload), payload);
});
