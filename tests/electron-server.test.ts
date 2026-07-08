import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import test from 'node:test';

import { createNextServerLaunchConfig, waitForReadyOrStopChild } from '../electron/server';

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killedWith: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals) {
    this.killedWith.push(signal);
    this.exitCode = 0;
    this.emit('exit', 0, signal);
    return true;
  }
}

test('waitForReadyOrStopChild_ReadinessSucceeds_DoesNotStopSpawnedServer', async () => {
  const child = new FakeChild();

  await waitForReadyOrStopChild({
    child,
    waitForReady: async () => undefined,
  });

  assert.deepEqual(child.killedWith, []);
});

test('waitForReadyOrStopChild_ReadinessFails_StopsSpawnedServer', async () => {
  const child = new FakeChild();
  const cause = new Error('not ready');

  await assert.rejects(
    waitForReadyOrStopChild({
      child,
      waitForReady: async () => {
        throw cause;
      },
    }),
    cause,
  );

  assert.deepEqual(child.killedWith, ['SIGTERM']);
});

test('createNextServerLaunchConfig_DevMode_UsesDocumentedNvmPnpmCommand', () => {
  const nvmBin = join('/Users', 'awen', '.nvm', 'versions', 'node', 'v24.11.1', 'bin');

  const config = createNextServerLaunchConfig({
    appRoot: '/app/root',
    dataRoot: '/data/root',
    dev: true,
    port: 53177,
    env: { NODE_ENV: 'test', PATH: '/bin', NVM_BIN: nvmBin },
    execPath: '/unused/electron',
    resourcesPath: '/unused/resources',
  });

  assert.equal(config.url, 'http://127.0.0.1:53177');
  assert.equal(config.command, join(nvmBin, 'pnpm'));
  assert.deepEqual(config.args, ['dev', '--hostname', '127.0.0.1', '--port', '53177']);
  assert.equal(config.cwd, '/app/root');
  assert.equal(config.env.HOSTNAME, '127.0.0.1');
  assert.equal(config.env.PORT, '53177');
  assert.equal(config.env.LOCAL_DATA_ROOT, '/data/root');
  assert.equal(config.env.ELECTRON_RUN_AS_NODE, undefined);
});

test('createNextServerLaunchConfig_DevModeWithoutNvmBin_ReturnsActionableError', () => {
  assert.throws(
    () =>
      createNextServerLaunchConfig({
        appRoot: '/app/root',
        dataRoot: '/data/root',
        dev: true,
        port: 53177,
        env: { NODE_ENV: 'test', PATH: '/bin' },
      }),
    /\$NVM_BIN\/pnpm/,
  );
});

test('createNextServerLaunchConfig_ProductionMode_UsesBundledServerEntry', () => {
  const config = createNextServerLaunchConfig({
    appRoot: '/app/root',
    dataRoot: '/data/root',
    dev: false,
    port: 34400,
    env: { NODE_ENV: 'test', PATH: '/bin' },
    execPath: '/Applications/App.app/Contents/MacOS/App',
    resourcesPath: '/Applications/App.app/Contents/Resources',
  });

  assert.equal(config.url, 'http://127.0.0.1:34400');
  assert.equal(config.command, '/Applications/App.app/Contents/MacOS/App');
  assert.deepEqual(config.args, [
    '/Applications/App.app/Contents/Resources/server/server.js',
  ]);
  assert.equal(config.cwd, '/Applications/App.app/Contents/Resources/server');
  assert.equal(config.env.HOSTNAME, '127.0.0.1');
  assert.equal(config.env.PORT, '34400');
  assert.equal(config.env.LOCAL_DATA_ROOT, '/data/root');
  assert.equal(config.env.ELECTRON_RUN_AS_NODE, '1');
});
