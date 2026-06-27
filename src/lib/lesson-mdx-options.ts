import type { TOCItemType } from 'fumadocs-core/toc';
import { toString } from 'hast-util-to-string';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';

const youtubeIdPattern = /^[A-Za-z0-9_-]{11}$/;
const allowedTableElements = new Set(['caption', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr']);
const rejectedNodeTypes = new Set(['mdxFlowExpression', 'mdxTextExpression', 'mdxjsEsm']);

type SyntaxTree = Parameters<typeof visit>[0];

type MdxAttribute = {
  type: string;
  name?: string;
  value?: unknown;
};

type MdxNode = {
  type: string;
  name?: string | null;
  attributes?: MdxAttribute[];
  children?: unknown[];
};

type HastElement = Parameters<typeof toString>[0] & {
  tagName: string;
  properties?: {
    id?: unknown;
  };
};

function reject(message: string): never {
  throw new Error(`Generated MDX rejected: ${message}`);
}

function validateStaticAttributes(node: MdxNode, allowedNames: Set<string>) {
  const attributes = node.attributes ?? [];
  const values = new Map<string, string>();

  for (const attribute of attributes) {
    if (attribute.type !== 'mdxJsxAttribute' || !attribute.name) {
      reject(`spread or expression attributes are not allowed on <${node.name}>`);
    }
    if (!allowedNames.has(attribute.name)) {
      reject(`attribute "${attribute.name}" is not allowed on <${node.name}>`);
    }
    if (typeof attribute.value !== 'string') {
      reject(`attribute "${attribute.name}" on <${node.name}> must be a static string`);
    }
    if (values.has(attribute.name)) {
      reject(`attribute "${attribute.name}" is duplicated on <${node.name}>`);
    }
    values.set(attribute.name, attribute.value);
  }

  return values;
}

function validateJsxElement(node: MdxNode) {
  if (!node.name) reject('JSX fragments are not allowed');

  if (node.name === 'YouTubeEmbed') {
    const values = validateStaticAttributes(node, new Set(['title', 'videoId']));
    if (!values.has('title') || !values.has('videoId')) {
      reject('<YouTubeEmbed> requires static title and videoId attributes');
    }
    if (!youtubeIdPattern.test(values.get('videoId') ?? '')) {
      reject('<YouTubeEmbed> videoId must be an 11-character YouTube ID');
    }
    if ((node.children?.length ?? 0) > 0) {
      reject('<YouTubeEmbed> cannot have children');
    }
    return;
  }

  if (allowedTableElements.has(node.name)) {
    validateStaticAttributes(node, new Set());
    return;
  }

  reject(`<${node.name}> is not in the generated MDX allowlist`);
}

function validateGeneratedMdx() {
  return (tree: SyntaxTree) => {
    visit(tree, (rawNode) => {
      const node = rawNode as MdxNode;
      if (rejectedNodeTypes.has(node.type)) {
        reject(`${node.type} nodes are not allowed`);
      }
      if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
        validateJsxElement(node);
      }
    });
  };
}

function collectLessonToc(toc: TOCItemType[]) {
  return (tree: SyntaxTree) => {
    visit(tree, 'element', (rawNode) => {
      const node = rawNode as HastElement;
      const match = /^h([2-4])$/.exec(node.tagName);
      if (!match || typeof node.properties?.id !== 'string') return;

      toc.push({
        title: toString(node),
        url: `#${node.properties.id}`,
        depth: Number(match[1]),
      });
    });
  };
}

export function createLessonMdxOptions(toc?: TOCItemType[]) {
  return {
    mdxOptions: {
      remarkPlugins: [remarkGfm, validateGeneratedMdx],
      rehypePlugins: [rehypeSlug, ...(toc ? [() => collectLessonToc(toc)] : [])],
    },
  };
}
