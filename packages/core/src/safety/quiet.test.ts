import { describe, expect, it } from "vitest";
import type { LatLng } from "../geo";
import { haversineDistanceMeters } from "../geo";
import { orderStops } from "./quiet";
import { START, offset } from "./testFixtures";

const stop = (name: string, north: number, east: number, quiet = false) => ({ name, quiet, ...offset(north, east) });

describe("orderStops", () => {
  // Five stops on a ring; the shortest loop visits them in angle order.
  const ring = [stop("a", 300, 0), stop("b", 0, 300), stop("c", -300, 0), stop("d", 0, -300), stop("e", 200, -200)];

  it("puts quiet stops on slots 1, 3, and 5", () => {
    for (const quietNames of [["a"], ["b"], ["b", "d"], ["a", "b"], ["c", "e"]]) {
      const stops = ring.map((s) => ({ ...s, quiet: quietNames.includes(s.name) }));
      const order = orderStops(START, stops);
      expect(order).toHaveLength(5);
      order.forEach((s, i) => {
        if (s.quiet) expect([0, 2, 4]).toContain(i);
      });
    }
  });

  it("never makes the loop longer than the order it was given", () => {
    const shuffled = [ring[2], ring[0], ring[4], ring[1], ring[3]];
    expect(loopMeters(orderStops(START, shuffled))).toBeLessThanOrEqual(loopMeters(shuffled));
    expect(loopMeters(orderStops(START, shuffled))).toBeLessThan(loopMeters(shuffled) - 100);
  });
});

function loopMeters(stops: LatLng[]): number {
  const pts = [START, ...stops, START];
  return pts.slice(1).reduce((d, p, i) => d + haversineDistanceMeters(pts[i], p), 0);
}
