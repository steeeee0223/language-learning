import { NextResponse } from 'next/server.js';

import { codexStatusSchema } from '../../../../lib/generation-contracts.ts';
import { getCodexStatus } from '../../../../lib/server/codex-status.ts';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(codexStatusSchema.parse(await getCodexStatus()));
}
