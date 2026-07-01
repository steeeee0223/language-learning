import { NextResponse } from 'next/server.js';
import { z } from 'zod';

import {
  localSlugSchema,
  taskCreationResponseSchema,
} from '../../../../../lib/generation-contracts.ts';
import { GenerationError } from '../../../../../lib/server/generation-errors.ts';
import { jsonError } from '../../../../../lib/server/http.ts';
import { regenerateTask } from '../../../../../lib/server/task-lifecycle.ts';

const paramsSchema = z.strictObject({ slug: localSlugSchema });
const requestSchema = z.strictObject({});

export async function POST(request: Request, context: { params: Promise<unknown> }) {
  try {
    const params = paramsSchema.safeParse(await context.params);
    const payload = requestSchema.safeParse(await request.json().catch(() => null));
    if (!params.success || !payload.success) return jsonError('Invalid regeneration request.');
    return NextResponse.json(
      taskCreationResponseSchema.parse(await regenerateTask({ slug: params.data.slug })),
    );
  } catch (error) {
    if (error instanceof GenerationError) {
      return jsonError(error.message, error.status, error.code, error.diagnosticsPath);
    }
    return jsonError('Task regeneration failed.', 500);
  }
}
