import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { resolveDesktopDataRoot, validateDataRoot } from '../electron/settings';

test('validateDataRoot creates and returns a directory path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'language-learning-desktop-'));
  const dataRoot = join(root, 'chosen');

  assert.equal(await validateDataRoot(dataRoot), dataRoot);
});

test('resolveDesktopDataRoot falls back when selected data root is a file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'language-learning-desktop-'));
  const invalid = join(root, 'file');
  await writeFile(invalid, 'not a directory');

  const result = await resolveDesktopDataRoot({
    userDataPath: root,
    settings: { dataRoot: invalid },
  });

  assert.equal(result.dataRoot, join(root, 'data'));
  assert.equal(result.usedFallback, true);
  assert.equal(typeof result.warning, 'string');
});
