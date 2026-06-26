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
  const outputPath = `.local/lessons/${basename}.md`;
  const task = {
    schemaVersion: 1,
    createdAt: now.toISOString(),
    video: input.video,
    transcript: input.transcript,
    learningSettings: input.learningSettings,
    output: {
      format: 'markdown',
      path: outputPath,
    },
    instructions: {
      requiredSections,
    },
  };

  await writeFile(join(paths.tasksDir, `${basename}.json`), `${JSON.stringify(task, null, 2)}\n`, 'utf8');

  return {
    taskPath,
    outputPath,
    suggestedCommand: `codex "Generate the lesson markdown from ${taskPath}"`,
  };
}
