import { NextResponse } from 'next/server.js';
import { z } from 'zod';

import {
  generateLessonRequestSchema,
  generateLessonResponseSchema,
  localSlugSchema,
} from '@/lib/generation-contracts';
import { generateLesson } from '@/lib/server/generate-lesson';
import { GenerationError } from '@/lib/server/generation-errors';
import { jsonError } from '@/lib/server/http';

export const runtime = 'nodejs';

const paramsSchema = z.strictObject({ slug: localSlugSchema });

type GenerateRouteContext = {
  params: Promise<unknown>;
};

export async function POST(request: Request, context: GenerateRouteContext) {
  try {
    const params = paramsSchema.safeParse(await context.params);
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
