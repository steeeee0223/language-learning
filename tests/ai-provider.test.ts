import assert from 'node:assert/strict';
import test from 'node:test';

import type { LessonAiProvider } from '@/lib/server/ai-provider';
import { createCodexAiProvider } from '@/lib/server/codex-ai-provider';

test('LessonAiProvider keeps generation and status behind one boundary', async () => {
  const provider: LessonAiProvider = {
    id: 'codex',
    getStatus: async () => ({ status: 'ready', version: 'codex-cli 0.142.3' }),
    generate: async () => '{"title":"ok"}',
  };

  assert.equal(provider.id, 'codex');
  assert.deepEqual(await provider.getStatus(), {
    status: 'ready',
    version: 'codex-cli 0.142.3',
  });
  assert.equal(
    await provider.generate({ prompt: 'x', signal: AbortSignal.timeout(1) }),
    '{"title":"ok"}',
  );
});

test('createCodexAiProvider exposes the codex provider boundary', () => {
  const provider = createCodexAiProvider();

  assert.equal(provider.id, 'codex');
  assert.equal(typeof provider.getStatus, 'function');
  assert.equal(typeof provider.generate, 'function');
});
