import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RhythmError,
  daysFromRows,
  goalFromRows,
  loadRhythm,
  loadRhythmGoal,
  pauseRhythmGoal,
  questsByWeek,
  setRhythmGoal,
  weekStart,
} from "./rhythm";

// Each rpc call is recorded and answered from the queue.
const calls: unknown[][] = [];
const queued: { data: unknown; error: unknown }[] = [];

vi.mock("./supabase", () => ({
  supabase: {
    rpc: (name: string, args?: unknown) => {
      calls.push(args === undefined ? [name] : [name, args]);
      return Promise.resolve(queued.shift() ?? { data: null, error: null });
    },
  },
}));

beforeEach(() => {
  calls.length = 0;
  queued.length = 0;
});

describe("loading", () => {
  it("maps the days and asks for 26 weeks by default", async () => {
    queued.push({ data: [{ day: "2026-09-28", quests: 2 }], error: null });
    expect(await loadRhythm()).toEqual([{ day: "2026-09-28", quests: 2 }]);
    expect(calls).toEqual([["my_rhythm", { p_weeks: 26 }]]);
  });

  it("drops rows without a day", () => {
    expect(
      daysFromRows([
        { day: null, quests: 1 },
        { day: "2026-10-01", quests: null },
      ]),
    ).toEqual([{ day: "2026-10-01", quests: 0 }]);
    expect(daysFromRows(null)).toEqual([]);
  });

  it("reads the goal, or none", async () => {
    queued.push({ data: [{ goal: "weekly", paused: true }], error: null });
    expect(await loadRhythmGoal()).toEqual({ goal: "weekly", paused: true });
    expect(goalFromRows([])).toBeNull();
    expect(goalFromRows([{ goal: "daily", paused: false }])).toBeNull();
  });

  it("throws a failed load", async () => {
    const error = new Error("offline");
    queued.push({ data: null, error });
    await expect(loadRhythm()).rejects.toBe(error);
  });
});

describe("the goal", () => {
  it("sets, clears, and pauses", async () => {
    await setRhythmGoal("twice_monthly");
    await setRhythmGoal(null);
    await pauseRhythmGoal(true);
    expect(calls).toEqual([
      ["set_rhythm_goal", { p_goal: "twice_monthly" }],
      ["set_rhythm_goal", { p_goal: null }],
      ["pause_rhythm_goal", { p_paused: true }],
    ]);
  });

  it("explains a refusal", async () => {
    queued.push({ data: null, error: { code: "P0001", message: "not_linked" } });
    await expect(pauseRhythmGoal(false)).rejects.toEqual(new RhythmError("not_linked"));
  });
});

describe("weeks", () => {
  it("finds each day's Monday", () => {
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
    expect(weekStart("2026-10-04")).toBe("2026-09-28");
    expect(weekStart("2026-10-01")).toBe("2026-09-28");
  });

  it("sums quests per week and leaves empty weeks out", () => {
    const weeks = questsByWeek([
      { day: "2026-09-14", quests: 1 },
      { day: "2026-09-28", quests: 1 },
      { day: "2026-10-04", quests: 2 },
    ]);
    expect([...weeks]).toEqual([
      ["2026-09-14", 1],
      ["2026-09-28", 3],
    ]);
  });
});
