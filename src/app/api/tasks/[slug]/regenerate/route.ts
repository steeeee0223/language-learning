import { NextResponse } from 'next/server.js';

import {
  emptyRequestSchema,
  localSlugParamsSchema,
  taskCreationResponseSchema,
} from '@/lib/generation-contracts';
import { GenerationError } from '@/lib/server/generation-errors';
import { jsonError } from '@/lib/server/http';
import { regenerateTask } from '@/lib/server/task-lifecycle';

export async function POST(
  request: Request,
  context: RouteContext<'/api/tasks/[slug]/regenerate'>,
) {
  try {
    const params = localSlugParamsSchema.safeParse(await context.params);
    const payload = emptyRequestSchema.safeParse(await request.json().catch(() => null));
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
