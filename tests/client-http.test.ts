import assert from 'node:assert/strict';
import test from 'node:test';

import { postJson, readApiError } from '@/lib/client-http';

test('readApiError_TypedErrorPayload_ReturnsPublicMessage', async () => {
  const response = Response.json({
    error: 'Codex usage is currently limited.',
    code: 'USAGE_LIMITED',
  });

  assert.equal(await readApiError(response), 'Codex usage is currently limited.');
});

test('readApiError_InvalidOrNonJsonPayload_ReturnsSafeFallback', async () => {
  const invalidPayload = Response.json({ error: 42 });
  const nonJsonPayload = new Response('<h1>Internal Server Error</h1>', {
    headers: { 'Content-Type': 'text/html' },
  });

  assert.equal(await readApiError(invalidPayload), 'Request failed.');
  assert.equal(await readApiError(nonJsonPayload), 'Request failed.');
});

test('postJson_ValidRequest_SendsJsonAndReturnsParsedResponse', async (context) => {
  let capturedUrl: string | URL | Request | undefined;
  let capturedInit: RequestInit | undefined;
  context.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = input;
    capturedInit = init;
    return Response.json({ taskId: 'lesson-1' });
  });

  const result = await postJson<{ taskId: string }>('/api/tasks', { storyId: 'video-1' });
  const capturedRequest = new Request(new URL(String(capturedUrl), 'http://localhost'), capturedInit);

  assert.deepEqual(result, { taskId: 'lesson-1' });
  assert.equal(capturedUrl, '/api/tasks');
  assert.equal(capturedRequest.method, 'POST');
  assert.equal(capturedRequest.headers.get('content-type'), 'application/json');
  assert.deepEqual(await capturedRequest.json(), { storyId: 'video-1' });
});

test('postJson_ErrorResponse_ThrowsPublicApiMessage', async (context) => {
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Story not found.' }, { status: 404 }),
  );

  await assert.rejects(() => postJson('/api/tasks', {}), {
    name: 'Error',
    message: 'Story not found.',
  });
});
