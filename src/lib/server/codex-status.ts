import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { CodexStatus } from '@/lib/generation-contracts';

const execFileAsync = promisify(execFile);

export async function localCodexPath() {
  const executableName = process.platform === 'win32' ? 'codex.cmd' : 'codex';
  const candidate = join(process.cwd(), 'node_modules', '.bin', executableName);

  try {
    await access(candidate);
    return candidate;
  } catch {
    return 'codex';
  }
}

export async function getCodexStatus(): Promise<CodexStatus> {
  const executable = await localCodexPath();
  let version: string;

  try {
    const result = await execFileAsync(executable, ['--version'], {
      encoding: 'utf8',
      timeout: 5_000,
    });
    version = result.stdout.trim();
  } catch {
    return { status: 'not-installed' };
  }

  try {
    await execFileAsync(executable, ['login', 'status'], {
      encoding: 'utf8',
      timeout: 5_000,
    });
    return { status: 'ready', version };
  } catch {
    return { status: 'not-authenticated', version };
  }
}
