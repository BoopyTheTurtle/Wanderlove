import { describe, expect, it } from "vitest";
import { haversineDistanceMeters, isWithinRadius } from "./geo";

describe("haversineDistanceMeters", () => {
  it("is zero for the same point", () => {
    const p = { lat: 56.9496, lng: 24.1052 };
    expect(haversineDistanceMeters(p, p)).toBe(0);
  });

  it("matches a known distance within 1%", () => {
    // Freedom Monument → Riga Castle, roughly 1.02 km apart
    const d = haversineDistanceMeters({ lat: 56.9516, lng: 24.1133 }, { lat: 56.951, lng: 24.0976 });
    expect(d).toBeGreaterThan(940);
    expect(d).toBeLessThan(990);
  });
});

describe("isWithinRadius", () => {
  it("includes points inside the radius and excludes those outside", () => {
    const stop = { lat: 56.9496, lng: 24.1052 };
    expect(isWithinRadius({ lat: 56.9499, lng: 24.1052 }, stop, 50)).toBe(true); // ~33 m
    expect(isWithinRadius({ lat: 56.9506, lng: 24.1052 }, stop, 50)).toBe(false); // ~111 m
  });
});
