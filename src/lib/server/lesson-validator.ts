import type { Root, RootContent } from 'mdast';
import { toString } from 'mdast-util-to-string';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import type { CefrLevel, TargetLanguage } from '@/lib/contracts';
import { validateGeneratedMdx } from '@/lib/lesson-mdx-options';
import { lessonSectionLabels } from '@/lib/lesson-sections';
import { GenerationError } from './generation-errors';

type ValidationTask = {
  video: { id: string };
  learningSettings: { targetLanguage: TargetLanguage; cefrLevels: readonly CefrLevel[] };
};

function invalid(message: string): never {
  throw new GenerationError('GENERATION_INVALID', `Generated lesson is invalid: ${message}`);
}

function headingText(node: RootContent | undefined, depth: number) {
  return node?.type === 'heading' && node.depth === depth ? toString(node).trim() : null;
}

function attribute(node: RootContent, name: string) {
  if (node.type !== 'mdxJsxFlowElement') return null;
  const value = node.attributes.find(
    (item) => item.type === 'mdxJsxAttribute' && item.name === name && typeof item.value === 'string',
  );
  return value && typeof value.value === 'string' ? value.value : null;
}

function sectionNodes(children: RootContent[], headingIndex: number) {
  const end = children.findIndex((node, index) => index > headingIndex && headingText(node, 2) !== null);
  return children.slice(headingIndex + 1, end === -1 ? children.length : end);
}

function subsectionNodes(children: RootContent[], headingIndex: number) {
  const end = children.findIndex((node, index) => index > headingIndex && headingText(node, 3) !== null);
  return children.slice(headingIndex + 1, end === -1 ? children.length : end);
}

function hasSubstantiveContent(nodes: RootContent[]) {
  return nodes.some((node) => node.type !== 'heading' && toString(node).trim().length > 0);
}

export async function validateLessonMdx(content: string, task: ValidationTask) {
  if (!content.trim()) invalid('content is empty');
  if (/^```|```$/m.test(content)) invalid('outer code fence is not allowed');

  const processor = unified().use(remarkParse).use(remarkMdx).use(remarkGfm).use(validateGeneratedMdx);
  let tree: Root;
  try {
    tree = processor.parse(content) as Root;
    await processor.run(tree);
  } catch (error) {
    if (error instanceof GenerationError) throw error;
    throw new GenerationError(
      'GENERATION_INVALID',
      'Generated lesson is invalid: MDX syntax or safety validation was rejected',
      { cause: error },
    );
  }

  visit(tree, 'heading', (_node, _index, parent) => {
    if (parent !== tree) invalid('all headings must be top-level');
  });

  const children = tree.children;

  const embed = children[0];
  if (embed?.type !== 'mdxJsxFlowElement' || embed.name !== 'YouTubeEmbed') invalid('YouTubeEmbed must be first');
  if (attribute(embed, 'videoId') !== task.video.id) invalid('YouTubeEmbed videoId does not match the task');
  if (headingText(children[1], 1) === null) invalid('one H1 must immediately follow YouTubeEmbed');
  if (children.filter((node) => headingText(node, 1) !== null).length !== 1) invalid('exactly one H1 is required');

  const labels = Object.values(lessonSectionLabels[task.learningSettings.targetLanguage]);
  const h2 = children.map((node, index) => ({ index, text: headingText(node, 2) })).filter((item) => item.text !== null);
  if (JSON.stringify(h2.map((item) => item.text)) !== JSON.stringify(labels)) invalid('required section order is incorrect');

  for (const section of h2) {
    if (!hasSubstantiveContent(sectionNodes(children, section.index))) {
      invalid(`${section.text} must contain substantive content`);
    }
  }

  for (const label of [
    lessonSectionLabels[task.learningSettings.targetLanguage].vocabulary,
    lessonSectionLabels[task.learningSettings.targetLanguage].grammar,
  ]) {
    const section = h2.find((item) => item.text === label);
    if (!section) invalid(`${label} section is missing`);
    const nodes = sectionNodes(children, section.index);
    const levels = nodes.map((node, index) => ({ index, text: headingText(node, 3) })).filter((item) => item.text !== null);
    if (JSON.stringify(levels.map((item) => item.text)) !== JSON.stringify(task.learningSettings.cefrLevels)) {
      invalid(`${label} must contain exactly ${task.learningSettings.cefrLevels.join(', ')} in order`);
    }
    for (const level of levels) {
      if (!hasSubstantiveContent(subsectionNodes(nodes, level.index))) {
        invalid(`${label} ${level.text} must contain substantive content`);
      }
    }
  }

  return content;
}
