import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { waitForReadyOrStopChild } from '../electron/server';

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

test('waitForReadyOrStopChild stops the spawned server when readiness fails', async () => {
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
