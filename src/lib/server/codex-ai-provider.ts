import type { LessonAiProvider } from './ai-provider';
import { OpenAICodexLessonGenerator } from './codex-lesson-generator';
import { getCodexStatus } from './codex-status';

export function createCodexAiProvider(): LessonAiProvider {
  const generator = new OpenAICodexLessonGenerator();

  return {
    id: 'codex',
    getStatus: getCodexStatus,
    generate: (input) => generator.generate(input),
  };
}
