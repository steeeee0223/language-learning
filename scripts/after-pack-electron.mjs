import { cp, rm } from 'node:fs/promises';
import { join } from 'node:path';

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const productFilename = context.packager.appInfo.productFilename;
  const resourcesDir = join(
    context.appOutDir,
    `${productFilename}.app`,
    'Contents',
    'Resources',
  );
  const target = join(resourcesDir, 'server');

  await rm(target, { recursive: true, force: true });
  await cp('dist-electron/server', target, {
    recursive: true,
    verbatimSymlinks: true,
  });
}
