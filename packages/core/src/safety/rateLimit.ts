// Runs tasks one after another, starting each at least `intervalMs` after the previous one started. The FOSSGIS
// router allows one request per second (route-safety.md §3).
export function createRateLimiter(intervalMs: number) {
  let lastStart = -Infinity;
  let queue: Promise<unknown> = Promise.resolve();
  return function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      const wait = lastStart + intervalMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastStart = Date.now();
      return task();
    });
    queue = run.catch(() => undefined);
    return run;
  };
}
