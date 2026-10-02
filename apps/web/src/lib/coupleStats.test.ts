import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CoupleNameError,
  NO_TOTALS,
  POINTS_ATTEMPTS,
  POINTS_RETRY_MS,
  loadQuestPoints,
  loadQuestPointsSoon,
  pointsBreakdown,
  questPointsFromRow,
  agreeCoupleName,
  clearCoupleName,
  coupleNameFromRows,
  dropSuggestion,
  loadCoupleName,
  loadCoupleTotals,
  nameErrorMessage,
  suggestCoupleName,
  toNameError,
  totalsFromRow,
} from "./coupleStats";

// Records each call and resolves to the queued result.
const calls: { method: string; args: unknown[] }[] = [];
let result: { data: unknown; error: unknown } = { data: null, error: null };
// Results for the next queries, in order, before falling back to result.
const queued: { data: unknown; error: unknown }[] = [];

type Chain = Record<string, (...args: never[]) => unknown>;

function builder(): Chain {
  const chain: Chain = {};
  for (const method of ["from", "select", "limit", "eq"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.maybeSingle = () => {
    calls.push({ method: "maybeSingle", args: [] });
    return Promise.resolve(queued.shift() ?? result);
  };
  return chain;
}

vi.mock("./supabase", () => ({
  supabase: {
    from: (table: string) => builder().from(table as never),
    rpc: (name: string, args?: unknown) => {
      calls.push({ method: "rpc", args: args === undefined ? [name] : [name, args] });
      return Promise.resolve(result);
    },
  },
}));

const refusal = (message: string) => ({ code: "P0001", message, details: "", hint: "" });

beforeEach(() => {
  calls.length = 0;
  queued.length = 0;
  result = { data: null, error: null };
});

describe("totals", () => {
  it("maps the row", async () => {
    result = { data: { quests_done: 3, photos_taken: 12, challenges_done: 9, points: 1240 }, error: null };
    expect(await loadCoupleTotals()).toEqual({ questsDone: 3, photosTaken: 12, challengesDone: 9, points: 1240 });
    expect(calls).toContainEqual({ method: "from", args: ["couple_stats"] });
    expect(calls).toContainEqual({ method: "select", args: ["quests_done, photos_taken, challenges_done, points"] });
  });

  it("reads no row as all zeros", async () => {
    expect(await loadCoupleTotals()).toEqual(NO_TOTALS);
  });

  it("reads a null column as zero", () => {
    expect(totalsFromRow({ quests_done: 2, photos_taken: null, challenges_done: null, points: null })).toEqual({
      questsDone: 2,
      photosTaken: 0,
      challengesDone: 0,
      points: 0,
    });
  });

  it("throws the server's error", async () => {
    result = { data: null, error: new Error("nope") };
    await expect(loadCoupleTotals()).rejects.toThrow("nope");
  });
});

const pointsRow = (stops: number, photos: number, finish: number, bonus: number) => ({
  stop_points: stops,
  photo_points: photos,
  finish_points: finish,
  week_bonus: bonus,
  total: stops + photos + finish + bonus,
});

describe("quest points", () => {
  it("maps the run's row", async () => {
    result = { data: pointsRow(50, 25, 100, 30), error: null };
    expect(await loadQuestPoints("run-1")).toEqual({
      total: 205,
      stops: 50,
      photos: 25,
      finish: 100,
      weekBonus: 30,
      share: 0,
    });
    expect(calls).toContainEqual({ method: "from", args: ["quest_points"] });
    expect(calls).toContainEqual({ method: "eq", args: ["run_id", "run-1"] });
  });

  it("is null without a row", async () => {
    expect(await loadQuestPoints("run-1")).toBeNull();
  });

  it("adds the parts when the total is missing", () => {
    expect(
      questPointsFromRow({ stop_points: 10, photo_points: null, finish_points: 100, week_bonus: 0, total: null }),
    ).toEqual({ total: 110, stops: 10, photos: 0, finish: 100, weekBonus: 0, share: 0 });
  });

  it("lists only the parts that earned something", () => {
    expect(pointsBreakdown({ total: 205, stops: 50, photos: 25, finish: 100, weekBonus: 30, share: 0 })).toEqual([
      "50 for stops",
      "25 for photos",
      "100 for finishing",
      "30 for your first walk this week",
    ]);
    expect(pointsBreakdown({ total: 150, stops: 50, photos: 0, finish: 100, weekBonus: 0, share: 0 })).toEqual([
      "50 for stops",
      "100 for finishing",
    ]);
    expect(pointsBreakdown({ total: 170, stops: 50, photos: 0, finish: 100, weekBonus: 0, share: 20 })).toEqual([
      "50 for stops",
      "100 for finishing",
      "20 for sharing a photo",
    ]);
  });
});

describe("quest points after the walk", () => {
  const noWait = vi.fn(() => Promise.resolve());

  beforeEach(() => noWait.mockClear());
  afterEach(() => vi.restoreAllMocks());

  it("returns at once when the row is there", async () => {
    result = { data: pointsRow(50, 25, 100, 0), error: null };
    expect((await loadQuestPointsSoon("run-1", true, noWait))?.total).toBe(175);
    expect(noWait).not.toHaveBeenCalled();
  });

  it("tries again until the row arrives", async () => {
    queued.push({ data: null, error: null }, { data: pointsRow(30, 0, 0, 0), error: null });
    result = { data: pointsRow(30, 0, 100, 30), error: null };
    // The second answer has no finish yet, so a finished run waits for the third.
    expect((await loadQuestPointsSoon("run-1", true, noWait))?.total).toBe(160);
    expect(noWait).toHaveBeenCalledTimes(2);
    expect(noWait).toHaveBeenCalledWith(POINTS_RETRY_MS);
  });

  it("takes a left-early run's points without a finish", async () => {
    result = { data: pointsRow(20, 5, 0, 0), error: null };
    expect((await loadQuestPointsSoon("run-1", false, noWait))?.total).toBe(25);
  });

  it("gives up quietly after three tries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    queued.push({ data: null, error: new Error("offline") });
    expect(await loadQuestPointsSoon("run-1", true, noWait)).toBeNull();
    expect(calls.filter((c) => c.method === "maybeSingle")).toHaveLength(POINTS_ATTEMPTS);
    expect(noWait).toHaveBeenCalledTimes(POINTS_ATTEMPTS - 1);
  });
});

describe("couple name", () => {
  it("is null when not linked", async () => {
    result = { data: [], error: null };
    expect(await loadCoupleName()).toBeNull();
    expect(coupleNameFromRows(null)).toBeNull();
  });

  it("reads a linked couple with no name as all empty", async () => {
    result = { data: [{ name: null, proposal: null, proposed_by_me: null }], error: null };
    expect(await loadCoupleName()).toEqual({ name: null, proposal: null, proposedByMe: false });
  });

  it("says whose suggestion is open", () => {
    expect(coupleNameFromRows([{ name: null, proposal: "Wild Pair", proposed_by_me: true }])).toEqual({
      name: null,
      proposal: "Wild Pair",
      proposedByMe: true,
    });
    expect(coupleNameFromRows([{ name: "Old", proposal: "New", proposed_by_me: false }])).toEqual({
      name: "Old",
      proposal: "New",
      proposedByMe: false,
    });
  });

  it("ignores proposed_by_me without a suggestion", () => {
    expect(coupleNameFromRows([{ name: "Us", proposal: null, proposed_by_me: true }])?.proposedByMe).toBe(false);
  });
});

describe("name errors", () => {
  it("maps each refusal to its code", () => {
    for (const code of ["not_linked", "name_invalid", "name_blocked", "no_proposal"] as const) {
      const mapped = toNameError(refusal(code));
      expect(mapped).toBeInstanceOf(CoupleNameError);
      expect((mapped as CoupleNameError).code).toBe(code);
    }
  });

  it("passes other errors through", () => {
    const other = { code: "42501", message: "permission denied" };
    expect(toNameError(other)).toBe(other);
    expect(toNameError(refusal("something_else"))).not.toBeInstanceOf(CoupleNameError);
  });

  it("says each in plain words", () => {
    expect(nameErrorMessage(new CoupleNameError("name_invalid"))).toBe(
      "Use 2 to 30 letters, numbers, spaces, apostrophes or hyphens.",
    );
    expect(nameErrorMessage(new CoupleNameError("name_blocked"))).toBe("That name isn’t allowed. Try another.");
    expect(nameErrorMessage(new CoupleNameError("no_proposal"))).toMatch(/suggestion changed/);
    expect(nameErrorMessage(new Error("fetch failed"))).toMatch(/connection/);
  });

  it("throws the mapped error from each action", async () => {
    result = { data: null, error: refusal("name_blocked") };
    await expect(suggestCoupleName("x")).rejects.toMatchObject({ code: "name_blocked" });
    result = { data: null, error: refusal("no_proposal") };
    await expect(agreeCoupleName("x")).rejects.toMatchObject({ code: "no_proposal" });
    result = { data: null, error: refusal("not_linked") };
    await expect(clearCoupleName()).rejects.toMatchObject({ code: "not_linked" });
  });
});

describe("name actions", () => {
  it("suggests and reports the outcome", async () => {
    result = { data: "proposed", error: null };
    expect(await suggestCoupleName("Wild Pair")).toBe("proposed");
    expect(calls).toContainEqual({ method: "rpc", args: ["set_couple_name", { p_name: "Wild Pair" }] });
    result = { data: "named", error: null };
    expect(await suggestCoupleName("Wild Pair")).toBe("named");
  });

  it("agrees to the suggestion the user saw", async () => {
    await agreeCoupleName("Wild Pair");
    expect(calls).toContainEqual({ method: "rpc", args: ["confirm_couple_name", { p_name: "Wild Pair" }] });
  });

  it("drops a suggestion by clearing when there is no name", async () => {
    await dropSuggestion({ name: null, proposal: "New", proposedByMe: true });
    expect(calls).toEqual([{ method: "rpc", args: ["clear_couple_name"] }]);
  });

  it("drops a suggestion but keeps the current name", async () => {
    result = { data: "named", error: null };
    await dropSuggestion({ name: "Old", proposal: "New", proposedByMe: false });
    expect(calls).toEqual([{ method: "rpc", args: ["set_couple_name", { p_name: "Old" }] }]);
  });
});
