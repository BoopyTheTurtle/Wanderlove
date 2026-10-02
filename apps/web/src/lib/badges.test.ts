import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadgeError, badgesFromRows, claimBadges, isBadgeId, loadBadges, toBadgeError } from "./badges";

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

describe("claiming", () => {
  it("sends the run and the phone's badges, and returns the new ones", async () => {
    queued.push({ data: ["first-walk", "first-after-dark"], error: null });
    expect(await claimBadges("run-1", ["first-after-dark"])).toEqual(["first-walk", "first-after-dark"]);
    expect(calls).toEqual([["claim_badges", { p_run: "run-1", p_badges: ["first-after-dark"] }]]);
  });

  it("claims with no badges by default, and ignores unknown ids in the answer", async () => {
    queued.push({ data: ["first-walk", "first-moon-walk"], error: null });
    expect(await claimBadges("run-1")).toEqual(["first-walk"]);
    expect(calls).toEqual([["claim_badges", { p_run: "run-1", p_badges: [] }]]);
  });

  it("explains each refusal", async () => {
    for (const code of ["badge_unknown", "run_not_finished", "not_member"] as const) {
      queued.push({ data: null, error: { code: "P0001", message: code } });
      await expect(claimBadges("run-1")).rejects.toEqual(new BadgeError(code));
    }
    const other = { code: "500", message: "boom" };
    expect(toBadgeError(other)).toBe(other);
  });
});

describe("listing", () => {
  it("maps the rows with their scope", async () => {
    queued.push({
      data: [
        { badge: "first-walk", earned_on: "2026-10-02", scope: "couple" },
        { badge: "season-autumn", earned_on: "2026-10-02", scope: "solo" },
      ],
      error: null,
    });
    expect(await loadBadges()).toEqual([
      { badge: "first-walk", earnedOn: "2026-10-02", scope: "couple" },
      { badge: "season-autumn", earnedOn: "2026-10-02", scope: "solo" },
    ]);
  });

  it("drops unknown badges and empty rows", () => {
    expect(badgesFromRows([{ badge: "x", earned_on: "2026-10-02", scope: "couple" }])).toEqual([]);
    expect(badgesFromRows(null)).toEqual([]);
    expect(isBadgeId("special-quest")).toBe(true);
  });
});
