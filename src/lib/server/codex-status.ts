import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

import type { CodexStatus } from '@/lib/generation-contracts';

const execFileAsync = promisify(execFile);
const projectRequire = createRequire(import.meta.url);
const codexVersionPattern = /^codex-cli\s+\S+$/;
const signedOutPattern = /not logged in|not authenticated/i;

function isModuleResolutionError(error: unknown) {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'MODULE_NOT_FOUND' ||
      error.code === 'ERR_MODULE_NOT_FOUND' ||
      error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED')
  );
}

function isMissingExecutableError(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function errorOutput(error: unknown) {
  if (!(error instanceof Error)) return String(error);

  const processError = error as Error & { stdout?: unknown; stderr?: unknown };
  return [processError.stdout, processError.stderr, processError.message]
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
}

function resolveCodexLauncher() {
  try {
    return projectRequire.resolve('@openai/codex/bin/codex.js');
  } catch (error) {
    if (!isModuleResolutionError(error)) throw error;

    const sdkEntry = import.meta.resolve('@openai/codex-sdk');
    return createRequire(sdkEntry).resolve('@openai/codex/bin/codex.js');
  }
}

function runCodex(launcherPath: string, args: string[]) {
  return execFileAsync(process.execPath, [launcherPath, ...args], {
    encoding: 'utf8',
    timeout: 5_000,
  });
}

export async function getCodexStatus(): Promise<CodexStatus> {
  let launcherPath: string;
  let version: string;

  try {
    launcherPath = resolveCodexLauncher();
    const result = await runCodex(launcherPath, ['--version']);
    version = result.stdout.trim();
    if (!codexVersionPattern.test(version)) {
      throw new Error(`Unexpected Codex version output: ${JSON.stringify(version)}`);
    }
  } catch (error) {
    if (isModuleResolutionError(error) || isMissingExecutableError(error)) {
      return { status: 'not-installed' };
    }
    throw error;
  }

  try {
    await runCodex(launcherPath, ['login', 'status']);
    return { status: 'ready', version };
  } catch (error) {
    if (isMissingExecutableError(error)) return { status: 'not-installed' };
    if (signedOutPattern.test(errorOutput(error))) {
      return { status: 'not-authenticated', version };
    }
    throw error;
  }
}
