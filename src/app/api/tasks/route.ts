import { NextResponse } from 'next/server.js';

import { taskCreationRequestSchema } from '../../../lib/contracts.ts';
import { taskCreationResponseSchema } from '../../../lib/generation-contracts.ts';
import { jsonError } from '../../../lib/server/http.ts';
import { buildTaskFile, TaskCreationError } from '../../../lib/server/tasks.ts';

export async function POST(request: Request) {
  try {
    const payload = taskCreationRequestSchema.safeParse(await request.json().catch(() => null));
    if (!payload.success) {
      return jsonError('Invalid task payload.');
    }

    return NextResponse.json(taskCreationResponseSchema.parse(await buildTaskFile(payload.data)));
  } catch (error) {
    if (error instanceof TaskCreationError && error.code === 'STORY_NOT_FOUND') {
      return jsonError('Story not found.', 404);
    }
    return jsonError('Task creation failed.', 500);
  }
}
