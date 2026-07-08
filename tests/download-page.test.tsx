import assert from 'node:assert/strict';
import test from 'node:test';
import { Children, type ReactElement, type ReactNode, createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Check } from 'lucide-react';

import { metadata } from '@/app/download/page';
import {
  DownloadClient,
  DownloadOptionMenuItems,
  resolveDownloadClientState,
} from '@/app/download/download-client';

function getElementChildren(node: ReactNode) {
  return Children.toArray(node).filter((child): child is ReactElement<any> => isValidElement(child));
}

function getMetaCellChildren(menuItem: ReactElement<any>) {
  const menuItemChildren = Children.toArray(menuItem.props.children);
  const metaCell = menuItemChildren[1];

  assert.ok(isValidElement(metaCell));
  return getElementChildren((metaCell as ReactElement<any>).props.children);
}

test('DownloadClient_RendersSelectedDownloadAndMvpNotice', () => {
  const html = renderToStaticMarkup(
    createElement(DownloadClient, {
      options: [
        {
          id: 'mac-universal',
          label: 'macOS Universal',
          meta: '.dmg',
          platform: 'mac',
          href: 'https://example.com/app.dmg',
          enabled: true,
        },
        {
          id: 'windows-exe-x64',
          label: 'Windows .exe x64',
          meta: 'Coming soon',
          platform: 'windows',
          href: null,
          enabled: false,
        },
      ],
    }),
  );

  assert.match(html, /A focused desktop for language-learning notes\./);
  assert.match(html, /macOS Universal/);
  assert.match(html, /href="https:\/\/example\.com\/app\.dmg"/);
  assert.match(html, /This MVP is not notarized yet\./);
});

test('DownloadPage_ExportsDownloadMetadata', () => {
  assert.equal(metadata.title, 'Download Language Learning Notes');
  assert.equal(metadata.description, 'Download the Language Learning Notes desktop app.');
});

test('DownloadOptionMenuItems_RendersDisabledItemsAndSelectedMarker', () => {
  const state = resolveDownloadClientState(
    [
      {
        id: 'mac-universal',
        label: 'macOS Universal',
        meta: '.dmg',
        platform: 'mac',
        href: 'https://example.com/app.dmg',
        enabled: true,
      },
      {
        id: 'windows-exe-x64',
        label: 'Windows .exe x64',
        meta: 'Coming soon',
        platform: 'windows',
        href: null,
        enabled: false,
      },
    ],
    'mac-universal',
  );

  const renderedItems = DownloadOptionMenuItems({
    options: state.menuOptions,
    onSelect: () => {},
  });
  const menuItemElements = getElementChildren(renderedItems.props.children);

  assert.equal(menuItemElements.length, 2);
  assert.equal(menuItemElements[0]?.props.disabled, false);
  assert.equal(menuItemElements[1]?.props.disabled, true);

  const selectedMetaChildren = getMetaCellChildren(menuItemElements[0]!);
  const unselectedMetaChildren = getMetaCellChildren(menuItemElements[1]!);

  assert.ok(selectedMetaChildren.some((child) => child.type === Check));
  assert.ok(unselectedMetaChildren.every((child) => child.type !== Check));
});

test('resolveDownloadClientState_FallsBackToFirstOptionWhenNothingEnabled', () => {
  const state = resolveDownloadClientState([
    {
      id: 'mac-universal',
      label: 'macOS Universal',
      meta: 'Coming soon',
      platform: 'mac',
      href: null,
      enabled: false,
    },
    {
      id: 'windows-exe-x64',
      label: 'Windows .exe x64',
      meta: 'Coming soon',
      platform: 'windows',
      href: null,
      enabled: false,
    },
  ]);

  assert.equal(state.selectedOption?.id, 'mac-universal');
  assert.equal(state.downloadDisabled, true);
  assert.deepEqual(
    state.menuOptions.map((option) => ({
      id: option.id,
      disabled: option.disabled,
      selected: option.selected,
    })),
    [
      { id: 'mac-universal', disabled: true, selected: true },
      { id: 'windows-exe-x64', disabled: true, selected: false },
    ],
  );
});
