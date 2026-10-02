import { describe, expect, it } from "vitest";
import { KEY_EMOJI, pairEmoji } from "./keyEmoji";

const emma = "0123456789abcdef";
const jonas = "fedcba9876543210";
const jonasNewPhone = "fedcba9876543211";

describe("KEY_EMOJI", () => {
  it("holds 64 distinct emoji with distinct names", () => {
    expect(KEY_EMOJI).toHaveLength(64);
    expect(new Set(KEY_EMOJI.map((e) => e.char)).size).toBe(64);
    expect(new Set(KEY_EMOJI.map((e) => e.name)).size).toBe(64);
  });

  it("uses single code points, so no emoji depends on a variation selector", () => {
    for (const { char } of KEY_EMOJI) expect([...char]).toHaveLength(1);
  });
});

describe("pairEmoji", () => {
  it("gives four emoji from the list", async () => {
    const emoji = await pairEmoji(emma, jonas);
    expect(emoji).toHaveLength(4);
    for (const e of emoji) expect(KEY_EMOJI).toContain(e);
  });

  it("is deterministic", async () => {
    expect(await pairEmoji(emma, jonas)).toEqual(await pairEmoji(emma, jonas));
  });

  it("ignores which phone passes its key first", async () => {
    expect(await pairEmoji(jonas, emma)).toEqual(await pairEmoji(emma, jonas));
  });

  it("changes when either key changes", async () => {
    const before = await pairEmoji(emma, jonas);
    expect(await pairEmoji(emma, jonasNewPhone)).not.toEqual(before);
    expect(await pairEmoji("0123456789abcdee", jonas)).not.toEqual(before);
  });
});
