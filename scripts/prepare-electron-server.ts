import { access, cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const outputDir = join('dist-electron', 'server');

async function copyIfExists(from: string, to: string) {
  try {
    await access(from);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }

  await cp(from, to, { recursive: true, force: true });
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp('.next/standalone', outputDir, { recursive: true });
await mkdir(join(outputDir, '.next'), { recursive: true });
await cp('.next/static', join(outputDir, '.next', 'static'), { recursive: true });
await copyIfExists('public', join(outputDir, 'public'));
