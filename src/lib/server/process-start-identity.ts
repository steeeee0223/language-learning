import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { hasNodeErrorCode } from './node-utils';

function processExists(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (hasNodeErrorCode(error, 'ESRCH')) return false;
    if (hasNodeErrorCode(error, 'EPERM')) return true;
    throw error;
  }
}

function runPs(pid: number) {
  return new Promise<string>((resolve, reject) => {
    execFile('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });
}

async function resolveLinuxProcessStartIdentity(pid: number) {
  try {
    const [bootId, processStat] = await Promise.all([
      readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
      readFile(`/proc/${pid}/stat`, 'utf8'),
    ]);
    const commandEnd = processStat.lastIndexOf(')');
    const fieldsAfterCommand = processStat.slice(commandEnd + 1).trim().split(/\s+/u);
    const startTicks = fieldsAfterCommand[19];
    if (commandEnd < 0 || !startTicks) throw new Error('Could not parse the process start identity.');
    return `linux:${bootId.trim()}:${startTicks}`;
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT') && !processExists(pid)) return null;
    return undefined;
  }
}

/** Returns null only when the process is provably absent. */
export async function resolveProcessStartIdentity(pid: number): Promise<string | null> {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;

  if (process.platform === 'linux') {
    const identity = await resolveLinuxProcessStartIdentity(pid);
    if (identity !== undefined) return identity;
  }

  try {
    const startedAt = await runPs(pid);
    if (startedAt) {
      const epochMilliseconds = Date.parse(startedAt);
      if (Number.isFinite(epochMilliseconds)) {
        return `${process.platform}:epoch-second:${Math.floor(epochMilliseconds / 1_000)}`;
      }
      return `${process.platform}:ps:${startedAt}`;
    }
  } catch {
    // Confirm absence below. A ps failure by itself is not proof that the process is dead.
  }

  if (!processExists(pid)) return null;
  if (pid === process.pid) {
    return `${process.platform}:epoch-second:${Math.floor(performance.timeOrigin / 1_000)}`;
  }
  throw new Error(`Could not resolve the start identity for live process ${pid}.`);
}
