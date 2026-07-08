import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { join } from 'node:path';

import type { StartedNextServer, StartNextServerInput } from './types';

export type NextServerLaunchConfig = {
  url: string;
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
};

type ServerChildProcess = Pick<
  ChildProcess,
  'exitCode' | 'signalCode' | 'kill'
> & {
  once(
    event: 'exit',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
};

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

function stopChild(child: ServerChildProcess) {
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

function devCommand(env: NodeJS.ProcessEnv) {
  const nvmBin = env.NVM_BIN;
  if (!nvmBin) {
    throw new Error(
      'Development mode requires pnpm from the documented nvm environment. Start Electron after running `nvm use 24.11.1 --silent` so `$NVM_BIN/pnpm` is available.',
    );
  }

  return join(nvmBin, 'pnpm');
}

function productionServerEntry(resourcesPath: string) {
  return join(resourcesPath, 'server', 'server.js');
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

export async function waitForReadyOrStopChild(input: {
  child: ServerChildProcess;
  waitForReady(): Promise<void>;
}) {
  try {
    await input.waitForReady();
  } catch (error) {
    await stopChild(input.child);
    throw error;
  }
}

export function createNextServerLaunchConfig(
  input: StartNextServerInput & {
    port: number;
    env?: NodeJS.ProcessEnv;
    execPath?: string;
    resourcesPath?: string;
  },
): NextServerLaunchConfig {
  const baseEnv = input.env ?? process.env;
  const resourcesPath = input.resourcesPath ?? process.resourcesPath;
  const url = `http://127.0.0.1:${input.port}`;
  const env = {
    ...baseEnv,
    HOSTNAME: '127.0.0.1',
    PORT: String(input.port),
    LOCAL_DATA_ROOT: input.dataRoot,
    ...(input.dev ? {} : { ELECTRON_RUN_AS_NODE: '1' }),
  };

  return {
    url,
    command: input.dev ? devCommand(baseEnv) : (input.execPath ?? process.execPath),
    args: input.dev
      ? ['dev', '--hostname', '127.0.0.1', '--port', String(input.port)]
      : [productionServerEntry(resourcesPath)],
    cwd: input.dev ? input.appRoot : join(resourcesPath, 'server'),
    env,
  };
}

export async function startNextServer(
  input: StartNextServerInput,
): Promise<StartedNextServer> {
  const port = await findFreePort();
  const config = createNextServerLaunchConfig({ ...input, port });

  const child = spawn(config.command, config.args, {
    cwd: config.cwd,
    env: config.env,
    stdio: 'inherit',
  });

  const launchFailure = new Promise<never>((_, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      reject(earlyExitError(code, signal));
    });
  });

  await waitForReadyOrStopChild({
    child,
    waitForReady: () => Promise.race([waitForServer(config.url), launchFailure]),
  });

  return {
    url: config.url,
    stop: () => stopChild(child),
  };
}
