import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CoupleNameError,
  NO_TOTALS,
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

type Chain = Record<string, (...args: never[]) => unknown>;

function builder(): Chain {
  const chain: Chain = {};
  for (const method of ["from", "select", "limit"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.maybeSingle = () => {
    calls.push({ method: "maybeSingle", args: [] });
    return Promise.resolve(result);
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
  result = { data: null, error: null };
});

describe("totals", () => {
  it("maps the row", async () => {
    result = { data: { quests_done: 3, photos_taken: 12, challenges_done: 9 }, error: null };
    expect(await loadCoupleTotals()).toEqual({ questsDone: 3, photosTaken: 12, challengesDone: 9 });
    expect(calls).toContainEqual({ method: "from", args: ["couple_stats"] });
  });

  it("reads no row as all zeros", async () => {
    expect(await loadCoupleTotals()).toEqual(NO_TOTALS);
  });

  it("reads a null column as zero", () => {
    expect(totalsFromRow({ quests_done: 2, photos_taken: null, challenges_done: null })).toEqual({
      questsDone: 2,
      photosTaken: 0,
      challengesDone: 0,
    });
  });

  it("throws the server's error", async () => {
    result = { data: null, error: new Error("nope") };
    await expect(loadCoupleTotals()).rejects.toThrow("nope");
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
