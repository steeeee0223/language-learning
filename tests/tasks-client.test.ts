import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import test from 'node:test';

import { TasksClient } from '@/components/tasks-client';

test('TasksClient renders grouped story and task data', () => {
  const queryClient = new QueryClient();
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(TasksClient, {
        initialData: {
          groups: [
            {
              story: {
                id: 'jNQXAC9IVRw',
                title: 'Me at the zoo',
                url: 'https://youtu.be/jNQXAC9IVRw',
                createdAt: '2026-06-30T08:00:00.000Z',
              },
              tasks: [
                {
                  id: 'lesson-task',
                  status: 'succeeded',
                  cefrLevels: ['A2'],
                  targetLanguage: 'zh',
                  modelPreset: 'fast',
                  createdAt: '2026-06-30T09:00:00.000Z',
                  lessonUrl: '/lessons/lesson-task',
                },
              ],
            },
          ],
        },
      }),
    ),
  );

  assert.match(html, /Me at the zoo/);
  assert.match(html, /lesson-task/);
  assert.match(html, /A2/);
});
