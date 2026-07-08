import { NextResponse } from 'next/server.js';

import { codexStatusSchema } from '@/lib/schemas/generation-contracts';
import { createCodexAiProvider } from '@/lib/server/codex-ai-provider';
import { jsonError } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const provider = createCodexAiProvider();
    return NextResponse.json(codexStatusSchema.parse(await provider.getStatus()));
  } catch {
    return jsonError('Codex status check failed.', 500);
  }
}
