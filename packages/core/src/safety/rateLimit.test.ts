import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts tasks at least one interval apart, in order", async () => {
    const schedule = createRateLimiter(1000);
    const started: number[] = [];
    const t0 = Date.now();
    const tasks = [1, 2, 3].map((n) =>
      schedule(async () => {
        started.push(Date.now() - t0);
        return n;
      }),
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(await Promise.all(tasks)).toEqual([1, 2, 3]);
    expect(started).toEqual([0, 1000, 2000]);
  });

  it("does not wait when the last task started long ago, and survives a failing task", async () => {
    const schedule = createRateLimiter(1000);
    await expect(schedule(async () => Promise.reject(new Error("down")))).rejects.toThrow("down");
    await vi.advanceTimersByTimeAsync(3000);
    const t0 = Date.now();
    let at = -1;
    await schedule(async () => {
      at = Date.now() - t0;
    });
    expect(at).toBe(0);
  });
});
