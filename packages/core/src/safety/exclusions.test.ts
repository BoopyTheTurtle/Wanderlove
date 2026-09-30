import { describe, expect, it } from "vitest";
import { EXCLUSIONS, isExcluded } from "./exclusions";

describe("exclusion list", () => {
  it("is seeded with the Rumbula, Biķernieki, and Salaspils memorial sites", () => {
    const reasons = EXCLUSIONS.map((e) => e.reason).join(" ");
    expect(reasons).toMatch(/Rumbula/);
    expect(reasons).toMatch(/Biķernieki/);
    expect(reasons).toMatch(/Salaspils/);
  });

  it("excludes a point inside a listed area", () => {
    expect(isExcluded("node/1", { lat: 56.8835, lng: 24.243 })).toBe(true);
    expect(isExcluded("node/1", { lat: 56.9496, lng: 24.1052 })).toBe(false); // Old Town
  });

  it("excludes an element listed by type and ID", () => {
    const list = [{ osm: "way/42" as const, reason: "test" }];
    expect(isExcluded("way/42", { lat: 0, lng: 0 }, list)).toBe(true);
    expect(isExcluded("node/42", { lat: 0, lng: 0 }, list)).toBe(false);
  });
});
