import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE } from "@wannadoo/core";
import type { Appearance } from "@wannadoo/core";
import { appearanceFrom, loadMyAppearance, loadPartnerCard, saveMyAppearance } from "./avatar";

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
// A stored value with an unknown key and missing fields, and what parseAppearance makes of it.
const look = { v: 1, skin: 3, hair: "curly" };
const parsed: Appearance = { ...DEFAULT_APPEARANCE, skin: 3, hair: "curly" };

beforeEach(() => {
  calls.length = 0;
  result = { data: null, error: null };
});

describe("loadMyAppearance", () => {
  it("parses the stored value", async () => {
    result = { data: { appearance: look }, error: null };
    expect(await loadMyAppearance(ME)).toEqual(parsed);
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
    await saveMyAppearance(ME, parsed);
    expect(calls).toContainEqual({ method: "update", args: [{ appearance: parsed }] });
    expect(calls).toContainEqual({ method: "eq", args: ["id", ME] });
  });

  it("throws when the server refuses the value", async () => {
    result = { data: null, error: new Error("check constraint") };
    await expect(saveMyAppearance(ME, parsed)).rejects.toThrow("check constraint");
  });
});

describe("loadPartnerCard", () => {
  it("reads the name and parsed appearance from profile_cards", async () => {
    result = { data: { display_name: "Emma", appearance: look }, error: null };
    expect(await loadPartnerCard("user-b")).toEqual({ displayName: "Emma", appearance: parsed });
    expect(calls).toContainEqual({ method: "from", args: ["profile_cards"] });
  });

  it("keeps a null appearance, as an ex or a partner without an avatar reads", async () => {
    result = { data: { display_name: "Emma", appearance: null }, error: null };
    expect(await loadPartnerCard("user-b")).toEqual({ displayName: "Emma", appearance: null });
  });

  it("returns null when the profile is out of sight", async () => {
    expect(await loadPartnerCard("user-b")).toBeNull();
  });
});

describe("appearanceFrom", () => {
  it("keeps null for no avatar and parses anything else", () => {
    expect(appearanceFrom(null)).toBeNull();
    expect(appearanceFrom(undefined)).toBeNull();
    expect(appearanceFrom("not json")).toEqual(DEFAULT_APPEARANCE);
    expect(appearanceFrom(look)).toEqual(parsed);
  });
});
