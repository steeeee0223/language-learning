import { Codex } from '@openai/codex-sdk';

import { GenerationError } from './generation-errors';

export type CodexGenerationInput = {
  prompt: string;
  model?: string;
  signal: AbortSignal;
};

export interface CodexLessonGenerator {
  generate(input: CodexGenerationInput): Promise<string>;
}

function classifyCodexFailure(error: unknown, signal: AbortSignal) {
  if (signal.aborted) {
    return new GenerationError('GENERATION_TIMEOUT', 'Lesson generation timed out.', { cause: error });
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/unable to locate Codex CLI|ENOENT/i.test(message)) {
    return new GenerationError('CODEX_NOT_INSTALLED', 'The local Codex runtime is unavailable.', { cause: error });
  }
  if (/not logged in|authentication|unauthorized|\b401\b/i.test(message)) {
    return new GenerationError('CODEX_NOT_AUTHENTICATED', 'Sign in to Codex and try again.', { cause: error });
  }
  if (/model.+(?:not found|not available|unsupported)/i.test(message)) {
    return new GenerationError('MODEL_UNAVAILABLE', 'The selected model is unavailable for this account.', {
      cause: error,
    });
  }
  if (/rate limit|usage limit|quota|too many requests/i.test(message)) {
    return new GenerationError('USAGE_LIMITED', 'Codex usage is currently limited. Try again later.', {
      cause: error,
    });
  }
  return new GenerationError('GENERATION_FAILED', 'Codex could not generate the lesson.', { cause: error });
}

export class OpenAICodexLessonGenerator implements CodexLessonGenerator {
  private codex?: Codex;

  private getCodex() {
    this.codex ??= new Codex({
      config: {
        history: { persistence: 'none' },
        web_search: 'disabled',
      },
    });
    return this.codex;
  }

  async generate(input: CodexGenerationInput) {
    try {
      const thread = this.getCodex().startThread({
        workingDirectory: process.cwd(),
        model: input.model,
        sandboxMode: 'read-only',
        networkAccessEnabled: false,
        webSearchMode: 'disabled',
        approvalPolicy: 'never',
      });
      const result = await thread.run(input.prompt, { signal: input.signal });
      return result.finalResponse;
    } catch (error) {
      throw classifyCodexFailure(error, input.signal);
    }
  }
}
