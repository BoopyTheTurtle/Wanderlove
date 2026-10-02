import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanError, cancelPlannedWalk, loadPlannedWalk, planFromRows, planWalk, toPlanError } from "./plannedWalks";

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

describe("the plan", () => {
  it("reads the open plan, or none", async () => {
    queued.push({ data: [{ day: "2026-10-04", slot: "morning", planned_by_me: false }], error: null });
    expect(await loadPlannedWalk()).toEqual({ day: "2026-10-04", slot: "morning", plannedByMe: false });
    expect(await loadPlannedWalk()).toBeNull();
    expect(planFromRows([{ day: "2026-10-04", slot: "night", planned_by_me: true }])).toBeNull();
  });

  it("plans and cancels", async () => {
    queued.push({ data: null, error: null }, { data: true, error: null }, { data: false, error: null });
    await planWalk("2026-10-04", "evening");
    expect(await cancelPlannedWalk()).toBe(true);
    expect(await cancelPlannedWalk()).toBe(false);
    expect(calls).toEqual([
      ["plan_walk", { p_day: "2026-10-04", p_slot: "evening" }],
      ["cancel_planned_walk"],
      ["cancel_planned_walk"],
    ]);
  });

  it("explains each refusal", async () => {
    for (const code of ["not_linked", "slot_invalid", "day_invalid"] as const) {
      queued.push({ data: null, error: { code: "P0001", message: code } });
      await expect(planWalk("2026-10-04", "morning")).rejects.toEqual(new PlanError(code));
    }
    const other = { code: "500", message: "boom" };
    expect(toPlanError(other)).toBe(other);
  });
});
