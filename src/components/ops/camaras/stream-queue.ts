const MAX_STARTING = 4;
let starting = 0;
const waiters: Array<() => void> = [];

export async function withStreamStart<T>(fn: () => Promise<T>): Promise<T> {
  while (starting >= MAX_STARTING) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  starting += 1;
  try {
    return await fn();
  } finally {
    starting -= 1;
    waiters.shift()?.();
  }
}
