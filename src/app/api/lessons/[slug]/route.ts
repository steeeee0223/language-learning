import { NextResponse } from 'next/server.js';

import { getErrorMessage, jsonError } from '@/lib/server/http';
import { readLesson } from '@/lib/server/lessons';

export async function GET(
  _request: Request,
  context: RouteContext<'/api/lessons/[slug]'>,
) {
  try {
    const params = await context.params;
    const slug = typeof params === 'object' && params !== null && 'slug' in params ? String(params.slug) : '';
    return NextResponse.json({ lesson: await readLesson({ slug }) });
  } catch (error) {
    return jsonError(getErrorMessage(error), 404);
  }
}
