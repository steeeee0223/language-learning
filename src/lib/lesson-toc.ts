import type { TOCItemType } from 'fumadocs-core/toc';
import { compileMDX } from 'next-mdx-remote/rsc';

import { createLessonMdxOptions } from './lesson-mdx-options';

export async function extractLessonToc(content: string): Promise<TOCItemType[]> {
  const toc: TOCItemType[] = [];
  await compileMDX({ source: content, options: createLessonMdxOptions(toc) });
  return toc;
}
