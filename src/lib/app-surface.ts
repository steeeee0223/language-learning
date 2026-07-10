export type AppSurface = 'desktop' | 'web';

const PUBLIC_FILE_EXTENSION =
  /\.(?:avif|css|gif|ico|jpg|jpeg|js|json|map|png|svg|txt|webmanifest|webp|xml)$/i;

export function getAppSurface(
  env: Record<string, string | undefined> = process.env,
): AppSurface {
  return env.APP_SURFACE === 'web' ? 'web' : 'desktop';
}

export function isPublicWebPath(pathname: string): boolean {
  if (pathname === '/download' || pathname === '/download/') return true;
  if (pathname === '/favicon.ico' || pathname === '/site.webmanifest') return true;
  if (pathname.startsWith('/_next/static/') || pathname.startsWith('/_next/image')) return true;
  return PUBLIC_FILE_EXTENSION.test(pathname);
}

export function shouldBlockWebRequest(input: {
  surface: AppSurface;
  pathname: string;
}): boolean {
  return input.surface === 'web' && !isPublicWebPath(input.pathname);
}
