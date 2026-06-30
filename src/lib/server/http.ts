import { NextResponse } from 'next/server.js';

export function jsonError(message: string, status = 400, code?: string, errorPath?: string) {
  return NextResponse.json(
    code ? { error: message, code, ...(errorPath ? { errorPath } : {}) } : { error: message },
    { status },
  );
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
