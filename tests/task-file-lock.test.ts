import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { withTaskFileLock } from '@/lib/server/task-file-lock';

test('withTaskFileLock_ConcurrentWaiters_SerializesWithoutReleaseErrors', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'task-file-lock-contention-'));
  let activeOperations = 0;
  let maximumActiveOperations = 0;

  await Promise.all(
    Array.from({ length: 40 }, (_, index) =>
      withTaskFileLock(
        rootDir,
        'lesson',
        async () => {
          activeOperations += 1;
          maximumActiveOperations = Math.max(maximumActiveOperations, activeOperations);
          await new Promise((resolve) => setTimeout(resolve, index % 2));
          activeOperations -= 1;
        },
        { pollMs: 0 },
      ),
    ),
  );

  assert.equal(maximumActiveOperations, 1, 'only one waiter should hold the task lock at a time');
  assert.equal(activeOperations, 0, 'every task lock holder should complete and release the lock');
});
