import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { TaskFileInput } from '@/lib/contracts';
import { ensureLocalDirs } from './local-paths.ts';

const requiredSections = [
  'metadata',
  'sentence-by-sentence translation',
  'vocabulary by CEFR level',
  'grammar by CEFR level',
  'spoken usage',
];

function escapeMdxAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function buildMdxRequirements(video: TaskFileInput['video']) {
  return [
    `Start the lesson body with <YouTubeEmbed videoId="${escapeMdxAttribute(video.id)}" title="${escapeMdxAttribute(video.title)}" />.`,
    'Use MDX-compatible syntax.',
    'Use GitHub Flavored Markdown tables only when the renderer supports them; otherwise use simple MDX table markup.',
    'All visible headings, table labels, explanations, vocabulary notes, grammar notes, and metadata labels must be written in learningSettings.targetLanguage.',
    'Source transcript quotes, proper nouns, URLs, video IDs, and code-like values may remain in their original language.',
  ];
}

type BuildTaskFileInput = TaskFileInput & {
  rootDir?: string;
  now?: Date;
};

export type BuildTaskFileResult = {
  taskPath: string;
  outputPath: string;
  suggestedCommand: string;
};

export function slugifyTitle(title: string, fallback: string) {
  const slug = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || fallback;
}

export async function buildTaskFile(input: BuildTaskFileInput): Promise<BuildTaskFileResult> {
  const rootDir = input.rootDir;
  const now = input.now ?? new Date();
  const paths = await ensureLocalDirs(rootDir);
  const datePrefix = now.toISOString().slice(0, 10);
  const basename = `${datePrefix}-${slugifyTitle(input.video.title, input.video.id)}`;
  const taskPath = `.local/tasks/${basename}.json`;
  const outputPath = `.local/lessons/${basename}.mdx`;
  const task = {
    schemaVersion: 1,
    createdAt: now.toISOString(),
    video: input.video,
    transcript: input.transcript,
    learningSettings: input.learningSettings,
    output: {
      format: 'mdx',
      path: outputPath,
    },
    instructions: {
      requiredSections,
      mdxRequirements: buildMdxRequirements(input.video),
    },
  };

  await writeFile(join(paths.tasksDir, `${basename}.json`), `${JSON.stringify(task, null, 2)}\n`, 'utf8');

  return {
    taskPath,
    outputPath,
    suggestedCommand: `codex "Generate the lesson MDX from ${taskPath}"`,
  };
}
