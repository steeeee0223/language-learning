import type { GenerationErrorCode } from '@/lib/generation-contracts';

const statusByCode: Record<GenerationErrorCode, number> = {
  CODEX_NOT_INSTALLED: 503,
  CODEX_NOT_AUTHENTICATED: 401,
  MODEL_UNAVAILABLE: 400,
  USAGE_LIMITED: 429,
  GENERATION_TIMEOUT: 504,
  GENERATION_INVALID: 422,
  GENERATION_FAILED: 502,
  GENERATION_IN_PROGRESS: 409,
  LESSON_EXISTS: 409,
  LESSON_WRITE_FAILED: 500,
};

export class GenerationError extends Error {
  constructor(
    public readonly code: GenerationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }

  get status() {
    return statusByCode[this.code];
  }
}
