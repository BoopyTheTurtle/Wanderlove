import { describe, expect, it } from "vitest";
import { assembleRings, crossesRoadsAt, distanceToLineMeters, pointInRing, pointInRings } from "./geometry";
import { offset, square } from "./testFixtures";

describe("pointInRing", () => {
  it("tells inside from outside, with or without the closing point", () => {
    const ring = square(offset(0, 0), 100);
    expect(pointInRing(offset(0, 0), ring)).toBe(true);
    expect(pointInRing(offset(150, 0), ring)).toBe(false);
    expect(pointInRing(offset(0, 0), ring.slice(0, -1))).toBe(true);
  });

  it("treats an inner ring as a hole", () => {
    const rings = [square(offset(0, 0), 200), square(offset(0, 0), 50)];
    expect(pointInRings(offset(0, 0), rings)).toBe(false);
    expect(pointInRings(offset(120, 0), rings)).toBe(true);
  });
});

describe("assembleRings", () => {
  it("joins member ways end to end, reversing where needed", () => {
    const [a, b, c, d] = square(offset(0, 0), 100);
    // Three member ways; the middle one runs backwards (c→b instead of b→c).
    const rings = assembleRings([
      [a, b],
      [c, b],
      [c, d, a],
    ]);
    expect(rings).toHaveLength(1);
    expect(pointInRing(offset(0, 0), rings[0])).toBe(true);
    expect(pointInRing(offset(0, 150), rings[0])).toBe(false);
  });

  it("closes a ring cut by the query box with a chord", () => {
    const [a, b, , d] = square(offset(0, 0), 100);
    const rings = assembleRings([[a, b, null, d, a]]);
    expect(rings).toHaveLength(1);
    expect(pointInRing(offset(-50, 0), rings[0])).toBe(true);
  });
});

describe("distanceToLineMeters", () => {
  it("measures to the nearest segment, not just the vertices", () => {
    const line = [offset(0, -100), offset(0, 100)];
    expect(distanceToLineMeters(offset(20, 0), line)).toBeCloseTo(20, 0);
  });
});

describe("crossesRoadsAt", () => {
  const at = offset(0, 0);
  const road = [offset(0, -50), offset(0, 50)]; // east–west road through `at`

  it("counts a path from south to north as a crossing", () => {
    expect(crossesRoadsAt(at, offset(-30, 0), offset(30, 0), road)).toBe(true);
  });

  it("does not count a path that touches the road and turns back", () => {
    expect(crossesRoadsAt(at, offset(-30, -10), offset(-30, 10), road)).toBe(false);
  });

  it("counts walking across the mouth of a road that ends here", () => {
    expect(crossesRoadsAt(at, offset(0, -30), offset(0, 30), [offset(50, 0)])).toBe(true);
  });
});
