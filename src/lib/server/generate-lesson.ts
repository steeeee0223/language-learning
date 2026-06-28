import { resolve } from 'node:path';

import type { ModelPreset } from '@/lib/generation-contracts';
import {
  OpenAICodexLessonGenerator,
  type CodexLessonGenerator,
} from './codex-lesson-generator';
import { getCodexStatus } from './codex-status';
import { GenerationError } from './generation-errors';
import { buildLessonPrompt } from './lesson-prompt';
import { validateLessonMdx } from './lesson-validator';
import { lessonExists, writeLessonOnce } from './lesson-writer';
import { resolveModelPreset } from './model-registry';
import type { StoredTask } from './task-schema';
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
};

const activeTasks = new Set<string>();

export async function generateLesson(
  input: GenerateLessonInput,
  dependencies: GenerateLessonDependencies = {},
): Promise<{ lessonSlug: string; lessonPath: string }> {
  const dataRoot = resolve(input.rootDir ?? process.env.LOCAL_DATA_ROOT ?? process.cwd());
  const lockKey = `${dataRoot}:${input.slug}`;
  if (activeTasks.has(lockKey)) {
    throw new GenerationError('GENERATION_IN_PROGRESS', 'This task is already being generated.');
  }

  activeTasks.add(lockKey);
  let task: StoredTask | undefined;
  let startedAt: string | undefined;
  let codexVersion: string | undefined;
  const requestedModel = resolveModelPreset(input.modelPreset);

  try {
    task = await readTask(input.slug, input.rootDir);
    startedAt = new Date().toISOString();

    if (await lessonExists({ rootDir: input.rootDir, slug: input.slug })) {
      throw new GenerationError('LESSON_EXISTS', 'A lesson already exists for this task.');
    }

    const status = await (dependencies.getStatus ?? getCodexStatus)();
    if (status.status === 'not-installed') {
      throw new GenerationError('CODEX_NOT_INSTALLED', 'The local Codex runtime is unavailable.');
    }
    if (status.status === 'not-authenticated') {
      throw new GenerationError('CODEX_NOT_AUTHENTICATED', 'Sign in to Codex and try again.');
    }
    codexVersion = status.version;

    await updateTaskGeneration(
      input.slug,
      {
        status: 'pending',
        skillVersion: task.generation.skillVersion,
        modelPreset: input.modelPreset,
        requestedModel,
        codexVersion,
        startedAt,
      },
      input.rootDir,
    );

    const generator = dependencies.generator ?? new OpenAICodexLessonGenerator();
    const timeoutSignal = AbortSignal.timeout(dependencies.timeoutMs ?? 180_000);
    const content = await generator.generate({
      prompt: buildLessonPrompt(task),
      model: requestedModel,
      signal: input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal,
    });
    await validateLessonMdx(content, task);
    const result = await writeLessonOnce({ rootDir: input.rootDir, slug: input.slug, content });

    await updateTaskGeneration(
      input.slug,
      {
        status: 'succeeded',
        skillVersion: task.generation.skillVersion,
        modelPreset: input.modelPreset,
        requestedModel,
        codexVersion,
        startedAt,
        completedAt: new Date().toISOString(),
      },
      input.rootDir,
    );

    return result;
  } catch (cause) {
    const error =
      cause instanceof GenerationError
        ? cause
        : new GenerationError('GENERATION_FAILED', 'Codex could not generate the lesson.', { cause });

    if (task && startedAt) {
      await updateTaskGeneration(
        input.slug,
        {
          status: 'failed',
          skillVersion: task.generation.skillVersion,
          modelPreset: input.modelPreset,
          requestedModel,
          codexVersion,
          startedAt,
          completedAt: new Date().toISOString(),
          errorCode: error.code,
        },
        input.rootDir,
      ).catch(() => undefined);
    }

    throw error;
  } finally {
    activeTasks.delete(lockKey);
  }
}
