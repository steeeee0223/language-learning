import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type { ModelPreset } from '@/lib/generation-contracts';
import { ensureLocalDirs } from './local-paths';

export type GenerationStage =
  | 'preflight'
  | 'status'
  | 'metadata'
  | 'generation'
  | 'validation'
  | 'write';

type ErrorDetails = {
  name: string;
  message: string;
  stack?: string;
  cause?: ErrorDetails;
};

function serializeError(error: unknown, depth = 0): ErrorDetails {
  if (!(error instanceof Error)) {
    return { name: 'UnknownError', message: String(error) };
  }

  return {
    name: error.name,
    message: error.message,
    ...(error.stack ? { stack: error.stack } : {}),
    ...(depth < 4 && error.cause !== undefined
      ? { cause: serializeError(error.cause, depth + 1) }
      : {}),
  };
}

function fileTimestamp(date: Date) {
  return date.toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

export async function writeGenerationErrorLog(input: {
  rootDir: string;
  taskSlug: string;
  error: Error & { code?: string };
  stage: GenerationStage;
  generatedContent?: string;
  modelPreset: ModelPreset;
  requestedModel?: string;
  codexVersion?: string;
  startedAt?: string;
  occurredAt?: Date;
}) {
  const occurredAt = input.occurredAt ?? new Date();
  const { errorsDir } = await ensureLocalDirs(input.rootDir);
  const flatErrorPath = `.local/errors/${input.taskSlug}.json`;
  const baseDetails = {
    taskId: input.taskSlug,
    occurredAt: occurredAt.toISOString(),
    stage: input.stage,
    code: input.error.code ?? 'GENERATION_FAILED',
    message: input.error.message,
    modelPreset: input.modelPreset,
    ...(input.requestedModel ? { requestedModel: input.requestedModel } : {}),
    ...(input.codexVersion ? { codexVersion: input.codexVersion } : {}),
    ...(input.startedAt ? { startedAt: input.startedAt } : {}),
    error: serializeError(input.error),
  };

  if (input.generatedContent === undefined) {
    await writeFile(join(errorsDir, `${input.taskSlug}.json`), `${JSON.stringify(baseDetails, null, 2)}\n`, {
      encoding: 'utf8',
    });
    return flatErrorPath;
  }

  const taskErrorsDir = join(errorsDir, input.taskSlug);
  await mkdir(taskErrorsDir, { recursive: true });

  const attemptName = `${fileTimestamp(occurredAt)}-${randomUUID()}`;
  const attemptDir = join(taskErrorsDir, attemptName);
  await mkdir(attemptDir);

  const relativeAttemptDir = `.local/errors/${input.taskSlug}/${attemptName}`;
  const generatedOutputPath = `${relativeAttemptDir}/generated.json`;
  const errorPath = `${relativeAttemptDir}/error.json`;
  const details = {
    ...baseDetails,
    generatedOutputPath,
  };

  await writeFile(join(attemptDir, 'error.json'), `${JSON.stringify(details, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  await writeFile(join(attemptDir, 'generated.json'), input.generatedContent, {
    encoding: 'utf8',
    flag: 'wx',
  });

  return errorPath;
}
