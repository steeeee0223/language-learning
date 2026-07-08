import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAppSurface,
  isPublicWebPath,
  shouldBlockWebRequest,
} from '../src/lib/app-surface';

test('getAppSurface_DefaultsToDesktop', () => {
  assert.equal(getAppSurface({}), 'desktop');
  assert.equal(getAppSurface({ APP_SURFACE: undefined }), 'desktop');
});

test('getAppSurface_WebMode_IsExplicitOnly', () => {
  assert.equal(getAppSurface({ APP_SURFACE: 'web' }), 'web');
  assert.equal(getAppSurface({ APP_SURFACE: 'desktop' }), 'desktop');
  assert.equal(getAppSurface({ APP_SURFACE: 'unexpected' }), 'desktop');
});

test('isPublicWebPath_AllowsDownloadAndFrameworkAssets', () => {
  assert.equal(isPublicWebPath('/download'), true);
  assert.equal(isPublicWebPath('/download/'), true);
  assert.equal(isPublicWebPath('/_next/static/chunks/app.js'), true);
  assert.equal(isPublicWebPath('/_next/image'), true);
  assert.equal(isPublicWebPath('/favicon.ico'), true);
  assert.equal(isPublicWebPath('/site.webmanifest'), true);
  assert.equal(isPublicWebPath('/images/product.png'), true);
});

test('isPublicWebPath_BlocksProductRoutesAndApis', () => {
  assert.equal(isPublicWebPath('/'), false);
  assert.equal(isPublicWebPath('/tasks'), false);
  assert.equal(isPublicWebPath('/settings'), false);
  assert.equal(isPublicWebPath('/lessons/example'), false);
  assert.equal(isPublicWebPath('/api/tasks'), false);
  assert.equal(isPublicWebPath('/docs'), false);
});

test('shouldBlockWebRequest_OnlyBlocksInWebMode', () => {
  assert.equal(shouldBlockWebRequest({ surface: 'desktop', pathname: '/tasks' }), false);
  assert.equal(shouldBlockWebRequest({ surface: 'web', pathname: '/tasks' }), true);
  assert.equal(shouldBlockWebRequest({ surface: 'web', pathname: '/download' }), false);
});
