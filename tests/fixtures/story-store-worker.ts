import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createOrReuseStory } from '@/lib/server/story-store.ts';

const [rootDir, label, serializedOptions] = process.argv.slice(2);
if (!rootDir || !label) throw new Error('Expected a root directory and worker label.');
const options = serializedOptions
  ? (JSON.parse(serializedOptions) as {
      providerHoldMs?: number;
      waitForPeerReady?: boolean;
      waitForPeerProvider?: boolean;
      lockTiming?: { pollMs: number; staleAfterMs: number };
    })
  : {};

const readyDir = join(rootDir, '.story-worker-ready');
const providerDir = join(rootDir, '.story-worker-provider');
await mkdir(readyDir, { recursive: true });
await mkdir(providerDir, { recursive: true });
await writeFile(join(readyDir, label), '', { flag: 'wx' });

if (options.waitForPeerReady !== false) {
  while ((await readdir(readyDir)).length < 2) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const result = await createOrReuseStory({
  url: 'https://youtu.be/jNQXAC9IVRw',
  rootDir,
  lockTiming: options.lockTiming,
  fetchBundle: async (url) => {
    await writeFile(join(providerDir, label), '', { flag: 'wx' });
    const providerHoldMs = options.providerHoldMs ?? 750;
    if (options.waitForPeerProvider === false) {
      await new Promise((resolve) => setTimeout(resolve, providerHoldMs));
    } else {
      const deadline = Date.now() + providerHoldMs;
      while ((await readdir(providerDir)).length < 2 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    return {
      video: { url, id: 'jNQXAC9IVRw', title: `Me at the zoo ${label}` },
      transcript: {
        source: 'youtube-transcript.io',
        segments: [{ text: `Worker ${label}`, start: 0, duration: 1 }],
      },
    };
  },
});

process.stdout.write(JSON.stringify(result));
