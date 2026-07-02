import { NextResponse } from 'next/server.js';

import { localSlugParamsSchema } from '@/lib/generation-contracts';
import { GenerationError } from '@/lib/server/generation-errors';
import { jsonError } from '@/lib/server/http';
import { deleteTask } from '@/lib/server/task-lifecycle';

export async function DELETE(
  _request: Request,
  context: RouteContext<'/api/tasks/[slug]'>,
) {
  try {
    const params = localSlugParamsSchema.safeParse(await context.params);
    if (!params.success) return jsonError('Invalid task request.');
    await deleteTask({ slug: params.data.slug });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof GenerationError) {
      return jsonError(error.message, error.status, error.code);
    }
    return jsonError('Task deletion failed.', 500);
  }
}
