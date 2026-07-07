import { rm } from 'node:fs/promises';

import { build, type BuildOptions } from 'esbuild';

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info' as const,
} satisfies BuildOptions;

await rm('dist-electron', { recursive: true, force: true });

await Promise.all([
  build({
    ...shared,
    entryPoints: ['electron/main.ts'],
    outfile: 'dist-electron/main.js',
  }),
  build({
    ...shared,
    entryPoints: ['electron/preload.ts'],
    outfile: 'dist-electron/preload.js',
  }),
]);
