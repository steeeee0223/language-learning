import { NextResponse } from 'next/server.js';

import { codexStatusSchema } from '@/lib/generation-contracts';
import { getCodexStatus } from '@/lib/server/codex-status';
import { jsonError } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json(codexStatusSchema.parse(await getCodexStatus()));
  } catch {
    return jsonError('Codex status check failed.', 500);
  }
}
