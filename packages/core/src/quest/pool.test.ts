import { describe, expect, it } from "vitest";
import { questTaskPool } from "./pool";
import type { TaskCategory } from "./types";

// The rules in docs/research/task-design-guide.md §4 and §6 that a machine can check.
const MINUTES: Record<TaskCategory, [number, number]> = {
  intro: [1, 4],
  silly: [2, 5],
  deep: [4, 7],
  wrapup: [1, 4],
};

describe("questTaskPool", () => {
  it("meets the roadmap's size per category", () => {
    const count = (c: TaskCategory) => questTaskPool.filter((t) => t.category === c).length;
    expect(count("intro")).toBeGreaterThanOrEqual(30);
    expect(count("silly")).toBeGreaterThanOrEqual(60);
    expect(count("deep")).toBeGreaterThanOrEqual(30);
    expect(count("wrapup")).toBeGreaterThanOrEqual(30);
  });

  it("keeps every task within the template's limits", () => {
    for (const t of questTaskPool) {
      const where = t.id;
      expect(t.title.split(/\s+/).length, where).toBeLessThanOrEqual(5);
      expect(t.prompt.split(/\s+/).length, where).toBeLessThanOrEqual(40);
      expect(t.steps.length, where).toBeGreaterThanOrEqual(2);
      expect(t.steps.length, where).toBeLessThanOrEqual(4);
      expect(t.photoHint.length, where).toBeGreaterThan(0);
      expect(t.tags.length, where).toBeGreaterThan(0);
      const [min, max] = MINUTES[t.category];
      expect(t.minutes, where).toBeGreaterThanOrEqual(min);
      expect(t.minutes, where).toBeLessThanOrEqual(max);
    }
  });

  it("has enough calm tasks for quiet stops and enough still tasks for low mobility", () => {
    const calm = (c: TaskCategory) =>
      questTaskPool.filter((t) => t.category === c && !t.tags.some((g) => g === "energetic" || g === "voice"));
    const still = (c: TaskCategory) => questTaskPool.filter((t) => t.category === c && !t.tags.includes("move"));
    for (const c of ["intro", "deep", "wrapup"] as const) expect(calm(c).length).toBeGreaterThanOrEqual(20);
    for (const c of ["intro", "silly", "deep", "wrapup"] as const) expect(still(c).length).toBeGreaterThanOrEqual(25);
  });
});
