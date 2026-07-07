import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type {
  DesktopRuntimeSettings,
  DesktopSettings,
  ResolvedDesktopDataRoot,
} from './types';

const settingsFileName = 'settings.json';

export function settingsPath(userDataPath: string) {
  return join(userDataPath, settingsFileName);
}

export async function readDesktopSettings(path: string): Promise<DesktopSettings> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};

    const dataRoot = (parsed as { dataRoot?: unknown }).dataRoot;
    return typeof dataRoot === 'string' && dataRoot.length > 0 ? { dataRoot } : {};
  } catch {
    return {};
  }
}

export async function writeDesktopSettings(path: string, settings: DesktopSettings) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`);
}

export async function validateDataRoot(path: string) {
  const resolved = resolve(path);
  await mkdir(resolved, { recursive: true });
  const stats = await stat(resolved);

  if (!stats.isDirectory()) {
    throw new Error('Data root must be a directory.');
  }

  return resolved;
}

export async function resolveDesktopDataRoot(input: {
  userDataPath: string;
  settings: DesktopSettings;
}): Promise<ResolvedDesktopDataRoot> {
  const defaultDataRoot = join(input.userDataPath, 'data');

  if (!input.settings.dataRoot) {
    return {
      dataRoot: await validateDataRoot(defaultDataRoot),
      usedFallback: false,
    };
  }

  try {
    return {
      dataRoot: await validateDataRoot(input.settings.dataRoot),
      usedFallback: false,
    };
  } catch (error) {
    return {
      dataRoot: await validateDataRoot(defaultDataRoot),
      usedFallback: true,
      warning:
        error instanceof Error
          ? error.message
          : 'Selected data folder is unavailable.',
    };
  }
}

export function toRuntimeSettings(input: {
  resolved: ResolvedDesktopDataRoot;
  userDataPath: string;
  settings: DesktopSettings;
}): DesktopRuntimeSettings {
  return {
    dataRoot: input.resolved.dataRoot,
    defaultDataRoot: join(input.userDataPath, 'data'),
    customDataRoot: input.settings.dataRoot,
    usedFallback: input.resolved.usedFallback,
    warning: input.resolved.warning,
  };
}
