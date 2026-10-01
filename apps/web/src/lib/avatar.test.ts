import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMyAppearance, loadPartnerCard, saveMyAppearance } from "./avatar";

// A query builder that records each call and resolves to the queued result.
const calls: { method: string; args: unknown[] }[] = [];
let result: { data: unknown; error: unknown } = { data: null, error: null };

type Chain = Record<string, (...args: never[]) => unknown>;

function builder(): Chain {
  const chain: Chain = {};
  for (const method of ["from", "select", "update", "eq"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  for (const method of ["single", "maybeSingle"]) {
    chain[method] = () => {
      calls.push({ method, args: [] });
      return Promise.resolve(result);
    };
  }
  chain.then = (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

vi.mock("./supabase", () => ({ supabase: { from: (table: string) => builder().from(table as never) } }));

const ME = "user-a";
const look = { v: 1, skin: 3, hair: "curly" };

beforeEach(() => {
  calls.length = 0;
  result = { data: null, error: null };
});

describe("loadMyAppearance", () => {
  it("returns the stored value untouched", async () => {
    result = { data: { appearance: look }, error: null };
    expect(await loadMyAppearance(ME)).toEqual(look);
    expect(calls).toContainEqual({ method: "from", args: ["profiles"] });
    expect(calls).toContainEqual({ method: "eq", args: ["id", ME] });
  });

  it("returns null before an avatar exists", async () => {
    result = { data: { appearance: null }, error: null };
    expect(await loadMyAppearance(ME)).toBeNull();
  });

  it("throws the server's error", async () => {
    result = { data: null, error: new Error("nope") };
    await expect(loadMyAppearance(ME)).rejects.toThrow("nope");
  });
});

describe("saveMyAppearance", () => {
  it("writes the appearance to the caller's row", async () => {
    await saveMyAppearance(ME, look);
    expect(calls).toContainEqual({ method: "update", args: [{ appearance: look }] });
    expect(calls).toContainEqual({ method: "eq", args: ["id", ME] });
  });

  it("throws when the server refuses the value", async () => {
    result = { data: null, error: new Error("check constraint") };
    await expect(saveMyAppearance(ME, look)).rejects.toThrow("check constraint");
  });
});

describe("loadPartnerCard", () => {
  it("reads the name and appearance from profile_cards", async () => {
    result = { data: { display_name: "Emma", appearance: look }, error: null };
    expect(await loadPartnerCard("user-b")).toEqual({ displayName: "Emma", appearance: look });
    expect(calls).toContainEqual({ method: "from", args: ["profile_cards"] });
  });

  it("returns null when the profile is out of sight", async () => {
    expect(await loadPartnerCard("user-b")).toBeNull();
  });
});
