import { NextResponse } from 'next/server.js';

import { getErrorMessage, jsonError } from '@/lib/server/http';
import { listLessons } from '@/lib/server/lessons';

export async function GET() {
  try {
    return NextResponse.json({ lessons: await listLessons() });
  } catch (error) {
    return jsonError(getErrorMessage(error), 500);
  }
}
