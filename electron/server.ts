import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { join } from 'node:path';

import type { StartedNextServer, StartNextServerInput } from './types';

async function findFreePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not allocate a local port.');
  }

  const port = address.port;
  server.close();
  await once(server, 'close');
  return port;
}

async function waitForServer(url: string) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function stopChild(child: ChildProcess) {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    child.once('exit', () => resolve());
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }, 5_000).unref();
  });
}

function devCommand() {
  const nvmBin = process.env.NVM_BIN;
  if (!nvmBin) {
    throw new Error(
      'Development mode requires pnpm from the documented nvm environment. Start Electron after running `nvm use 24.11.1 --silent` so `$NVM_BIN/pnpm` is available.',
    );
  }

  return join(nvmBin, 'pnpm');
}

function productionServerEntry() {
  return join(process.resourcesPath, 'server', 'server.js');
}

function earlyExitError(code: number | null, signal: NodeJS.Signals | null) {
  const detail =
    code !== null
      ? `exit code ${code}`
      : signal !== null
        ? `signal ${signal}`
        : 'an unknown reason';
  return new Error(`Next server exited before becoming ready (${detail}).`);
}

export async function startNextServer(
  input: StartNextServerInput,
): Promise<StartedNextServer> {
  const port = await findFreePort();
  const url = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    HOSTNAME: '127.0.0.1',
    PORT: String(port),
    LOCAL_DATA_ROOT: input.dataRoot,
    ...(input.dev ? {} : { ELECTRON_RUN_AS_NODE: '1' }),
  };

  const command = input.dev ? devCommand() : process.execPath;
  const args = input.dev
    ? ['dev', '--hostname', '127.0.0.1', '--port', String(port)]
    : [productionServerEntry()];

  const child = spawn(command, args, {
    cwd: input.dev ? input.appRoot : join(process.resourcesPath, 'server'),
    env,
    stdio: 'inherit',
  });

  const launchFailure = new Promise<never>((_, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      reject(earlyExitError(code, signal));
    });
  });

  await Promise.race([waitForServer(url), launchFailure]);

  return {
    url,
    stop: () => stopChild(child),
  };
}
