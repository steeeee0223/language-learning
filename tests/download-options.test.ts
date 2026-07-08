import assert from 'node:assert/strict';
import test from 'node:test';

import { getDownloadOptions } from '@/lib/download-options';

test('getDownloadOptions_EnablesOnlyConfiguredMacUniversalBuild', () => {
  const options = getDownloadOptions({
    DOWNLOAD_MAC_UNIVERSAL_URL: 'https://example.com/LanguageLearningNotes.dmg',
  });

  assert.equal(options.length, 5);
  assert.deepEqual(options[0], {
    id: 'mac-universal',
    label: 'macOS Universal',
    meta: '.dmg',
    platform: 'mac',
    href: 'https://example.com/LanguageLearningNotes.dmg',
    enabled: true,
  });

  for (const option of options.slice(1)) {
    assert.equal(option.enabled, false);
    assert.equal(option.href, null);
    assert.equal(option.meta, 'Coming soon');
  }
});

test('getDownloadOptions_DisablesMacUniversalWhenUrlMissing', () => {
  const options = getDownloadOptions({});
  const universalOption = options.find((option) => option.id === 'mac-universal');

  assert.ok(universalOption);
  assert.equal(universalOption.href, null);
  assert.equal(universalOption.enabled, false);
});

test('getDownloadOptions_TreatsEmptyStringUrlAsMissing', () => {
  const options = getDownloadOptions({
    DOWNLOAD_MAC_UNIVERSAL_URL: '',
  });
  const universalOption = options.find((option) => option.id === 'mac-universal');

  assert.ok(universalOption);
  assert.equal(universalOption.href, null);
  assert.equal(universalOption.enabled, false);
});
