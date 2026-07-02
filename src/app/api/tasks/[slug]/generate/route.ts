import { NextResponse } from 'next/server.js';

import {
  generateLessonRequestSchema,
  generateLessonResponseSchema,
  localSlugParamsSchema,
} from '@/lib/schemas/generation-contracts';
import { generateLesson } from '@/lib/server/generate-lesson';
import { GenerationError } from '@/lib/server/generation-errors';
import { jsonError } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: RouteContext<'/api/tasks/[slug]/generate'>,
) {
  try {
    const params = localSlugParamsSchema.safeParse(await context.params);
    const payload = generateLessonRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!params.success || !payload.success) {
      return jsonError('Invalid generation request.');
    }

    const result = await generateLesson({
      slug: params.data.slug,
      signal: request.signal,
    });
    return NextResponse.json(generateLessonResponseSchema.parse(result));
  } catch (error) {
    if (error instanceof GenerationError) {
      return jsonError(error.message, error.status, error.code, error.diagnosticsPath);
    }
    return jsonError('Lesson generation failed.', 502, 'GENERATION_FAILED');
  }
}
