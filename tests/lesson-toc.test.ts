import assert from 'node:assert/strict';
import test from 'node:test';

import { getMDXComponents } from '../src/components/mdx.tsx';
import { YouTubeEmbed } from '../src/components/youtube-embed.tsx';
import { createLessonMdxOptions } from '../src/lib/lesson-mdx-options.ts';
import { extractLessonToc } from '../src/lib/lesson-toc.ts';
import { compileMDX } from 'next-mdx-remote/rsc';
import { renderToStaticMarkup } from 'react-dom/server';

test('extractLessonToc matches heading IDs from the shared rendered MDX pipeline', async () => {
  const source = `<YouTubeEmbed videoId="jNQXAC9IVRw" title="Sample video" />

# 重複

## **重複**！
### 中繼資料：影片 &amp; 作者
#### \`口語_表現\` / [用法](https://example.com)
##### 重複！
## 重複！

<table>
  <tbody>
    <tr><td>Safe table markup</td></tr>
  </tbody>
</table>
`;

  const toc = await extractLessonToc(source);
  const { content } = await compileMDX({
    source,
    options: createLessonMdxOptions(),
    components: getMDXComponents(),
  });
  const html = renderToStaticMarkup(content);
  const renderedIds = [...html.matchAll(/<h[2-4][^>]* id="([^"]+)"/g)].map((match) => `#${match[1]}`);

  assert.deepEqual(
    toc.map((item) => item.url),
    renderedIds,
  );
  assert.deepEqual(toc, [
    { title: '重複！', url: '#重複-1', depth: 2 },
    { title: '中繼資料：影片 & 作者', url: '#中繼資料影片--作者', depth: 3 },
    { title: '口語_表現 / 用法', url: '#口語_表現--用法', depth: 4 },
    { title: '重複！', url: '#重複-3', depth: 2 },
  ]);
});

test('shared MDX options compile GFM pipe tables', async () => {
  const { content } = await compileMDX({
    source: '| 欄位 | 內容 |\n| --- | --- |\n| A | B |',
    options: createLessonMdxOptions(),
  });

  assert.match(renderToStaticMarkup(content), /<table>/);
});

test('getMDXComponents registers YouTubeEmbed', () => {
  assert.equal(getMDXComponents().YouTubeEmbed, YouTubeEmbed);
});

test('shared MDX validation rejects unsafe or executable MDX', async () => {
  const rejectedSources = [
    '## Hello <span>world</span>',
    '<script>alert(1)</script>',
    '<iframe src="https://example.com" />',
    '<object data="https://example.com" />',
    '<embed src="https://example.com" />',
    '<style>hidden</style>',
    '<table onClick="alert(1)"><tbody /></table>',
    '<YouTubeEmbed videoId="not-valid" title="Unsafe" />',
    '<YouTubeEmbed videoId={process.env.VIDEO_ID} title="Unsafe" />',
    '## Value: {process.version}',
    'import value from "./unsafe"',
    'export const value = 1',
  ];

  for (const source of rejectedSources) {
    await assert.rejects(
      () => compileMDX({ source, options: createLessonMdxOptions() }),
      /Generated MDX rejected/,
    );
    await assert.rejects(() => extractLessonToc(source), /Generated MDX rejected/);
  }
});

test('YouTubeEmbed validates IDs and applies privacy-conscious iframe attributes', () => {
  assert.throws(
    () => YouTubeEmbed({ videoId: 'not-valid', title: 'Invalid' }),
    /valid 11-character YouTube video ID/,
  );

  const html = renderToStaticMarkup(YouTubeEmbed({ videoId: 'jNQXAC9IVRw', title: 'Sample' }));
  assert.match(html, /loading="lazy"/);
  assert.match(html, /referrerPolicy="strict-origin-when-cross-origin"/);
});
