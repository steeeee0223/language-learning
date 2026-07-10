import { cp, rm } from 'node:fs/promises';
import { join } from 'node:path';

export function packagedMainNodeModulesPath(context) {
  const productFilename = context.packager.appInfo.productFilename;
  return join(
    context.appOutDir,
    `${productFilename}.app`,
    'Contents',
    'Resources',
    'app.asar.unpacked',
    'node_modules',
  );
}

export function isUniversalTempAppOutDir(appOutDir) {
  return /-(?:x64|arm64)-temp$/.test(appOutDir);
}

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
  if (!isUniversalTempAppOutDir(context.appOutDir)) {
    await rm(packagedMainNodeModulesPath(context), { recursive: true, force: true });
  }
}
