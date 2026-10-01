import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, avatarCatalog, parseAppearance, randomAppearance } from "./appearance";

// Mulberry32: a small seeded generator, so picks repeat.
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("avatarCatalog", () => {
  it("numbers each colour and scale list from 0 with unique labels", () => {
    for (const list of [
      avatarCatalog.face,
      avatarCatalog.age,
      avatarCatalog.skin,
      avatarCatalog.eyes,
      avatarCatalog.hairColour,
      avatarCatalog.topColour,
      avatarCatalog.background,
    ]) {
      expect(list.map((o) => o.id)).toEqual([...list.keys()]);
      expect(new Set(list.map((o) => o.label)).size).toBe(list.length);
    }
  });

  it("offers bald, grey and white among the hair options", () => {
    expect(avatarCatalog.hair.map((h) => h.id)).toContain("bald");
    expect(avatarCatalog.hairColour.map((h) => h.label)).toEqual(expect.arrayContaining(["Grey", "White"]));
  });
});

describe("randomAppearance", () => {
  it("always returns an appearance that parses back to itself", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const a = randomAppearance(seeded(seed));
      expect(parseAppearance(a)).toEqual(a);
      expect(parseAppearance(JSON.parse(JSON.stringify(a)))).toEqual(a);
    }
  });

  it("repeats for the same seed and varies across seeds", () => {
    expect(randomAppearance(seeded(5))).toEqual(randomAppearance(seeded(5)));
    const hairs = new Set(Array.from({ length: 200 }, (_, i) => randomAppearance(seeded(i + 1)).hair));
    expect(hairs.size).toBe(avatarCatalog.hair.length);
  });

  it("copes with a generator that returns 1", () => {
    const a = randomAppearance(() => 0.9999999999);
    expect(parseAppearance(a)).toEqual(a);
  });
});

describe("parseAppearance", () => {
  it("returns the default for anything that is not an object", () => {
    for (const bad of [null, undefined, 3, "nonsense", "[1,2]", [], true]) {
      expect(parseAppearance(bad)).toEqual(DEFAULT_APPEARANCE);
    }
  });

  it("parses a JSON string", () => {
    expect(parseAppearance('{"hair":"bun","age":2}')).toEqual({ ...DEFAULT_APPEARANCE, hair: "bun", age: 2 });
  });

  it("clamps numbers out of range and rounds fractions", () => {
    const a = parseAppearance({ face: 9, age: -3, skin: 3.6, eyes: "4", hairColour: 100, background: -1 });
    expect(a).toMatchObject({ face: 2, age: 0, skin: 4, eyes: 4, hairColour: 7, background: 0 });
  });

  it("defaults unknown or mistyped fields", () => {
    const a = parseAppearance({ hair: "mohawk", top: 3, facialHair: null, skin: "dark", topColour: NaN });
    expect(a.hair).toBe(DEFAULT_APPEARANCE.hair);
    expect(a.top).toBe(DEFAULT_APPEARANCE.top);
    expect(a.facialHair).toBe("none");
    expect(a.skin).toBe(DEFAULT_APPEARANCE.skin);
    expect(a.topColour).toBe(DEFAULT_APPEARANCE.topColour);
  });

  it("drops unknown and repeated accessories and keeps catalog order", () => {
    expect(parseAppearance({ accessories: ["scarf", "cape", "glasses", "scarf", 4] }).accessories).toEqual([
      "glasses",
      "scarf",
    ]);
    expect(parseAppearance({ accessories: "glasses" }).accessories).toEqual([]);
  });

  it("ignores extra keys", () => {
    const a = parseAppearance({ ...DEFAULT_APPEARANCE, gender: "x", extra: { deep: true } });
    expect(a).toEqual(DEFAULT_APPEARANCE);
    expect(Object.keys(a)).not.toContain("gender");
  });
});
