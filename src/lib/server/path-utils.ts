import { isAbsolute, relative, sep } from 'node:path';

export function isPathWithin(
  parentPath: string,
  candidatePath: string,
  options: { allowSame?: boolean } = {},
) {
  const pathFromParent = relative(parentPath, candidatePath);
  if (pathFromParent === '') return options.allowSame === true;
  return (
    pathFromParent !== '..' &&
    !pathFromParent.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromParent)
  );
}
