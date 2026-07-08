import type { CodexStatus } from '@/lib/schemas/generation-contracts';

import type { CodexGenerationInput } from './codex-lesson-generator';

export type AiProviderId = 'codex';

export interface LessonAiProvider {
  id: AiProviderId;
  getStatus(): Promise<CodexStatus>;
  generate(input: CodexGenerationInput): Promise<string>;
}
