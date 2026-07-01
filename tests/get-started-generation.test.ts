import assert from 'node:assert/strict';
import test from 'node:test';

import { submitLessonGeneration } from '@/app/get-started/get-started-client.tsx';

test('submitLessonGeneration creates then generates one task', async () => {
  const calls: Array<[string, unknown]> = [];
  const lesson = await submitLessonGeneration(
    {
      storyId: 'jNQXAC9IVRw',
      learningSettings: { targetLanguage: 'zh', cefrLevels: ['A2'] },
      modelPreset: 'best',
    },
    async (url, body) => {
      calls.push([url, body]);
      return url === '/api/tasks'
        ? { taskId: 'new-task' }
        : { lessonSlug: 'new-task', lessonPath: '.local/lessons/new-task.json' };
    },
  );

  assert.deepEqual(calls, [
    [
      '/api/tasks',
      {
        storyId: 'jNQXAC9IVRw',
        learningSettings: { targetLanguage: 'zh', cefrLevels: ['A2'] },
        modelPreset: 'best',
      },
    ],
    ['/api/tasks/new-task/generate', {}],
  ]);
  assert.equal(lesson.lessonSlug, 'new-task');
});
