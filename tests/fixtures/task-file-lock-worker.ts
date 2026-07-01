import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { withTaskFileLock } from '@/lib/server/task-file-lock.ts';

const [rootDir, label] = process.argv.slice(2);
if (!rootDir || !label) throw new Error('Missing task lock worker arguments.');

await mkdir(join(rootDir, '.task-lock-ready'), { recursive: true });
await writeFile(join(rootDir, '.task-lock-ready', label), 'ready');
while (true) {
  try {
    await access(join(rootDir, '.task-lock-start'));
    break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

await withTaskFileLock(rootDir, 'lesson', async () => {
  const guard = join(rootDir, '.task-lock-critical');
  try {
    await mkdir(guard);
  } catch {
    await writeFile(join(rootDir, '.task-lock-overlap'), label);
    throw new Error('Task file lock allowed overlapping owners.');
  }
  try {
    await mkdir(join(rootDir, '.task-lock-entered'), { recursive: true });
    await writeFile(join(rootDir, '.task-lock-entered', label), 'entered');
    await new Promise((resolve) => setTimeout(resolve, 75));
  } finally {
    await rm(guard, { recursive: true, force: true });
  }
});
