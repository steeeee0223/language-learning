const activeTaskOperations = new Set<string>();

export function tryAcquireTaskOperation(rootDir: string, slug: string): (() => void) | undefined {
  const key = `${rootDir}\0${slug}`;
  if (activeTaskOperations.has(key)) {
    return undefined;
  }

  activeTaskOperations.add(key);
  let released = false;

  return () => {
    if (released) {
      return;
    }

    released = true;
    activeTaskOperations.delete(key);
  };
}
