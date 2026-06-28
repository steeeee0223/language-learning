import type { StoredTask } from './task-schema.ts';

export function buildLessonPrompt(task: StoredTask) {
  const transcript = task.transcript.segments
    .map((segment, index) => `${index + 1}. [${segment.start.toFixed(2)}s] ${segment.text}`)
    .join('\n');

  return [
    'Use $generating-lesson to produce the final lesson.',
    'Return MDX only. Do not run commands, browse, or modify files.',
    `Target language: ${task.learningSettings.targetLanguage}`,
    `CEFR levels in required order: ${task.learningSettings.cefrLevels.join(', ')}`,
    `Video URL: ${task.video.url}`,
    `Video ID: ${task.video.id}`,
    `Video title: ${task.video.title}`,
    '',
    'Transcript:',
    transcript,
  ].join('\n');
}
