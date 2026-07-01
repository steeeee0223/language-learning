import { NextResponse } from 'next/server.js';

import { codexStatusSchema } from '@/lib/generation-contracts.ts';
import { getCodexStatus } from '@/lib/server/codex-status.ts';
import { jsonError } from '@/lib/server/http.ts';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json(codexStatusSchema.parse(await getCodexStatus()));
  } catch {
    return jsonError('Codex status check failed.', 500);
  }
}
