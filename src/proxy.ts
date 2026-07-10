import { NextResponse, type NextRequest } from 'next/server';

import { getAppSurface, shouldBlockWebRequest } from '@/lib/app-surface';

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!shouldBlockWebRequest({ surface: getAppSurface(), pathname })) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const url = request.nextUrl.clone();
  url.pathname = '/download';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|site.webmanifest).*)'],
};
