import { NextResponse } from 'next/server.js';
import { z } from 'zod';

import { localSlugSchema } from '@/lib/generation-contracts.ts';
import { GenerationError } from '@/lib/server/generation-errors.ts';
import { jsonError } from '@/lib/server/http.ts';
import { deleteTask } from '@/lib/server/task-lifecycle.ts';

const paramsSchema = z.strictObject({ slug: localSlugSchema });

export async function DELETE(_request: Request, context: { params: Promise<unknown> }) {
  try {
    const params = paramsSchema.safeParse(await context.params);
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
