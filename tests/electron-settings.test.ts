import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  readDesktopSettings,
  resolveDesktopDataRoot,
  settingsPath,
  toRuntimeSettings,
  validateDataRoot,
  writeDesktopSettings,
} from '../electron/settings';

test('settingsPath_UserDataPath_ReturnsSettingsJsonPath', () => {
  assert.equal(settingsPath('/Users/example/AppData'), join('/Users/example/AppData', 'settings.json'));
});

test('readDesktopSettings_MissingOrCorruptSettings_ReturnsEmptySettings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'language-learning-desktop-'));
  const missingPath = join(root, 'missing.json');
  const corruptPath = join(root, 'corrupt.json');
  await writeFile(corruptPath, '{not json');

  assert.deepEqual(await readDesktopSettings(missingPath), {});
  assert.deepEqual(await readDesktopSettings(corruptPath), {});
});

test('readDesktopSettings_ValidSettingsFile_ReturnsPersistedDataRootOnly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'language-learning-desktop-'));
  const path = join(root, 'settings.json');
  await writeFile(path, JSON.stringify({ dataRoot: '/chosen/data', ignored: true }));

  assert.deepEqual(await readDesktopSettings(path), { dataRoot: '/chosen/data' });
});

test('readDesktopSettings_EmptyOrNonStringDataRoot_ReturnsEmptySettings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'language-learning-desktop-'));
  const emptyPath = join(root, 'empty-data-root.json');
  const nonStringPath = join(root, 'non-string-data-root.json');
  await writeFile(emptyPath, JSON.stringify({ dataRoot: '' }));
  await writeFile(nonStringPath, JSON.stringify({ dataRoot: 42 }));

  assert.deepEqual(await readDesktopSettings(emptyPath), {});
  assert.deepEqual(await readDesktopSettings(nonStringPath), {});
});

test('writeDesktopSettings_NestedSettingsPath_PersistsFormattedJson', async () => {
  const root = await mkdtemp(join(tmpdir(), 'language-learning-desktop-'));
  const path = join(root, 'nested', 'settings.json');

  await writeDesktopSettings(path, { dataRoot: '/chosen/data' });

  assert.equal(await readFile(path, 'utf8'), '{\n  "dataRoot": "/chosen/data"\n}\n');
});

test('validateDataRoot_NewDirectoryPath_CreatesAndReturnsDirectoryPath', async () => {
  const root = await mkdtemp(join(tmpdir(), 'language-learning-desktop-'));
  const dataRoot = join(root, 'chosen');

  assert.equal(await validateDataRoot(dataRoot), dataRoot);
});

test('validateDataRoot_FilePath_ReturnsDirectoryRequiredError', async () => {
  const root = await mkdtemp(join(tmpdir(), 'language-learning-desktop-'));
  const dataRoot = join(root, 'file');
  await writeFile(dataRoot, 'not a directory');

  await assert.rejects(() => validateDataRoot(dataRoot), /Data root must be a directory/);
});

test('resolveDesktopDataRoot_NoCustomDataRoot_UsesDefaultWithoutFallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'language-learning-desktop-'));

  const result = await resolveDesktopDataRoot({
    userDataPath: root,
    settings: {},
  });

  assert.equal(result.dataRoot, join(root, 'data'));
  assert.equal(result.usedFallback, false);
  assert.equal(result.warning, undefined);
});

test('resolveDesktopDataRoot_SelectedDataRootIsFile_ReturnsFallbackWithWarning', async () => {
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

test('toRuntimeSettings_FallbackResult_ReturnsRendererSettingsContract', () => {
  const settings = toRuntimeSettings({
    resolved: {
      dataRoot: '/user-data/data',
      usedFallback: true,
      warning: 'Data root must be a directory.',
    },
    userDataPath: '/user-data',
    settings: { dataRoot: '/custom-data' },
  });

  assert.deepEqual(settings, {
    dataRoot: '/user-data/data',
    defaultDataRoot: '/user-data/data',
    customDataRoot: '/custom-data',
    usedFallback: true,
    warning: 'Data root must be a directory.',
  });
});
