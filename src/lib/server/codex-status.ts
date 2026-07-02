import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { CodexStatus } from '@/lib/schemas/generation-contracts';
import { hasNodeErrorCode } from './node-utils';

const execFileAsync = promisify(execFile);
const codexVersionPattern = /^codex-cli\s+\S+$/;
const signedOutPattern = /not logged in|not authenticated/i;
const unavailableRuntimePattern =
  /missing optional dependency|unsupported platform|unable to locate codex cli binaries/i;

function isModuleResolutionError(error: unknown) {
  return (
    hasNodeErrorCode(error, 'MODULE_NOT_FOUND') ||
    hasNodeErrorCode(error, 'ERR_MODULE_NOT_FOUND') ||
    hasNodeErrorCode(error, 'ERR_PACKAGE_PATH_NOT_EXPORTED')
  );
}

function isMissingExecutableError(error: unknown) {
  return hasNodeErrorCode(error, 'ENOENT');
}

function errorOutput(error: unknown) {
  if (!(error instanceof Error)) return String(error);

  const processError = error as Error & { stdout?: unknown; stderr?: unknown };
  return [processError.stdout, processError.stderr, processError.message]
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
}

function isUnavailableCodexRuntime(error: unknown) {
  return unavailableRuntimePattern.test(errorOutput(error));
}

function resolveCodexLauncher() {
  return join(process.cwd(), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
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
    await access(launcherPath);
    const result = await runCodex(launcherPath, ['--version']);
    version = result.stdout.trim();
    if (!codexVersionPattern.test(version)) {
      throw new Error(`Unexpected Codex version output: ${JSON.stringify(version)}`);
    }
  } catch (error) {
    if (
      isModuleResolutionError(error) ||
      isMissingExecutableError(error) ||
      isUnavailableCodexRuntime(error)
    ) {
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
