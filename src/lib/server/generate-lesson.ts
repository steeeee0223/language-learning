import type { ModelPreset } from '@/lib/generation-contracts';
import { parseGeneratedLesson } from '@/lib/lesson-content';
import {
  OpenAICodexLessonGenerator,
  type CodexLessonGenerator,
} from './codex-lesson-generator';
import { getCodexStatus } from './codex-status';
import { GenerationError } from './generation-errors';
import { writeGenerationErrorLog, type GenerationStage } from './generation-error-log';
import { buildLessonPrompt } from './lesson-prompt';
import { lessonExists, writeLessonOnce } from './lesson-writer';
import { canonicalizeLocalRoot } from './local-paths';
import { resolveModelPreset } from './model-registry';
import { LESSON_SKILL_VERSION, type StoredTask } from './task-schema';
import { tryAcquireTaskOperation } from './task-operation-lock';
import { readTask, updateTaskGeneration } from './task-store';

type GenerateLessonInput = {
  slug: string;
  modelPreset: ModelPreset;
  rootDir?: string;
  signal?: AbortSignal;
};

type GenerateLessonDependencies = {
  generator?: CodexLessonGenerator;
  getStatus?: typeof getCodexStatus;
  timeoutMs?: number;
  updateGeneration?: typeof updateTaskGeneration;
};

function generationTimeout(cause?: unknown) {
  return new GenerationError('GENERATION_TIMEOUT', 'Lesson generation timed out.', { cause });
}

function throwIfGenerationAborted(signal: AbortSignal) {
  if (signal.aborted) throw generationTimeout(signal.reason);
}

async function generateUntilAbort(
  generator: CodexLessonGenerator,
  input: Parameters<CodexLessonGenerator['generate']>[0],
) {
  throwIfGenerationAborted(input.signal);
  let onAbort!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(generationTimeout(input.signal.reason));
    input.signal.addEventListener('abort', onAbort, { once: true });
    if (input.signal.aborted) onAbort();
  });

  try {
    return await Promise.race([Promise.resolve().then(() => generator.generate(input)), aborted]);
  } finally {
    input.signal.removeEventListener('abort', onAbort);
  }
}

export async function generateLesson(
  input: GenerateLessonInput,
  dependencies: GenerateLessonDependencies = {},
): Promise<{ lessonSlug: string; lessonPath: string }> {
  let dataRoot: string;
  try {
    dataRoot = await canonicalizeLocalRoot(input.rootDir);
  } catch (cause) {
    throw new GenerationError('GENERATION_FAILED', 'Codex could not generate the lesson.', { cause });
  }
  const releaseTaskOperation = tryAcquireTaskOperation(dataRoot, input.slug);
  if (!releaseTaskOperation) {
    throw new GenerationError('GENERATION_IN_PROGRESS', 'This task is already being generated.');
  }

  let task: StoredTask | undefined;
  let startedAt: string | undefined;
  let codexVersion: string | undefined;
  let requestedModel: string | undefined;
  let pendingRecorded = false;
  let generatedContent: string | undefined;
  let stage: GenerationStage = 'preflight';
  const updateGeneration = dependencies.updateGeneration ?? updateTaskGeneration;

  try {
    task = await readTask(input.slug, dataRoot);

    const expectedOutputPath = `.local/lessons/${input.slug}.json`;
    if (task.output.path !== expectedOutputPath) {
      throw new GenerationError(
        'GENERATION_INVALID',
        'The task output path does not match the requested lesson.',
      );
    }

    if (await lessonExists({ rootDir: dataRoot, slug: input.slug })) {
      throw new GenerationError('LESSON_EXISTS', 'A lesson already exists for this task.');
    }

    requestedModel = resolveModelPreset(input.modelPreset);
    stage = 'status';
    const status = await (dependencies.getStatus ?? getCodexStatus)();
    if (status.status === 'not-installed') {
      throw new GenerationError('CODEX_NOT_INSTALLED', 'The local Codex runtime is unavailable.');
    }
    if (status.status === 'not-authenticated') {
      throw new GenerationError('CODEX_NOT_AUTHENTICATED', 'Sign in to Codex and try again.');
    }
    codexVersion = status.version;
    startedAt = new Date().toISOString();

    stage = 'metadata';
    await updateGeneration(
      input.slug,
      {
        status: 'pending',
        skillVersion: LESSON_SKILL_VERSION,
        modelPreset: input.modelPreset,
        requestedModel,
        codexVersion,
        startedAt,
      },
      dataRoot,
    );
    pendingRecorded = true;

    const generator = dependencies.generator ?? new OpenAICodexLessonGenerator();
    const timeoutSignal = AbortSignal.timeout(dependencies.timeoutMs ?? 180_000);
    const generationSignal = input.signal
      ? AbortSignal.any([input.signal, timeoutSignal])
      : timeoutSignal;
    stage = 'generation';
    const content = await generateUntilAbort(generator, {
      prompt: buildLessonPrompt(task),
      model: requestedModel,
      signal: generationSignal,
    });
    generatedContent = content;
    throwIfGenerationAborted(generationSignal);
    const lesson = parseGeneratedLesson(content, task);
    const normalizedContent = `${JSON.stringify(lesson, null, 2)}\n`;
    throwIfGenerationAborted(generationSignal);
    stage = 'write';
    const result = await writeLessonOnce({
      rootDir: dataRoot,
      slug: input.slug,
      content: normalizedContent,
    });

    try {
      await updateGeneration(
        input.slug,
        {
          status: 'succeeded',
          skillVersion: LESSON_SKILL_VERSION,
          modelPreset: input.modelPreset,
          requestedModel,
          codexVersion,
          startedAt,
          completedAt: new Date().toISOString(),
        },
        dataRoot,
      );
    } catch {
      // The published lesson is the commit point; metadata repair can happen separately.
    }

    return result;
  } catch (cause) {
    const error =
      cause instanceof GenerationError
        ? cause
        : new GenerationError('GENERATION_FAILED', 'Codex could not generate the lesson.', { cause });

    error.diagnosticsPath = await writeGenerationErrorLog({
      rootDir: dataRoot,
      taskSlug: input.slug,
      error,
      stage,
      generatedContent,
      modelPreset: input.modelPreset,
      requestedModel,
      codexVersion,
      startedAt,
    }).catch(() => undefined);

    if (task && startedAt && pendingRecorded) {
      await updateGeneration(
        input.slug,
        {
          status: 'failed',
          skillVersion: LESSON_SKILL_VERSION,
          modelPreset: input.modelPreset,
          requestedModel,
          codexVersion,
          startedAt,
          completedAt: new Date().toISOString(),
          errorCode: error.code,
        },
        dataRoot,
      ).catch(() => undefined);
    }

    throw error;
  } finally {
    releaseTaskOperation();
  }
}
