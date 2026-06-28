import { NextResponse } from 'next/server.js';

import { taskFileInputSchema } from '../../../lib/contracts.ts';
import { getErrorMessage, jsonError } from '../../../lib/server/http.ts';
import { buildTaskFile } from '../../../lib/server/tasks.ts';

export async function POST(request: Request) {
  try {
    const payload = taskFileInputSchema.safeParse(await request.json());
    if (!payload.success) {
      return jsonError('Invalid task payload.');
    }

    return NextResponse.json(await buildTaskFile(payload.data));
  } catch (error) {
    return jsonError(getErrorMessage(error));
  }
}
