import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

import { cn } from '@/lib/cn';

import { YouTubeEmbed } from './youtube-embed';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    YouTubeEmbed,
    th: ({ className, ...props }) => (
      <th {...props} className={cn('border px-3 py-2 text-left font-semibold', className)} />
    ),
    td: ({ className, ...props }) => (
      <td {...props} className={cn('border px-3 py-2 align-top', className)} />
    ),
    ...components,
  } satisfies MDXComponents;
}

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
