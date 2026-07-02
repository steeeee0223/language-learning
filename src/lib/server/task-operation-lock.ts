const activeTaskOperations = new Set<string>();
const activeSingleFlightOperations = new Map<string, Promise<unknown>>();

export function runSingleFlightOperation<T>(rootDir: string, key: string, operation: () => Promise<T>): Promise<T> {
  const operationKey = `${rootDir}\0${key}`;
  const existing = activeSingleFlightOperations.get(operationKey);
  if (existing) {
    return existing as Promise<T>;
  }

  const pending = Promise.resolve().then(operation);
  let shared: Promise<T>;
  shared = pending.finally(() => {
    if (activeSingleFlightOperations.get(operationKey) === shared) {
      activeSingleFlightOperations.delete(operationKey);
    }
  });
  activeSingleFlightOperations.set(operationKey, shared);
  return shared;
}

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
