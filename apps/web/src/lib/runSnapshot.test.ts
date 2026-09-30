import { describe, expect, it } from "vitest";
import { trail, type Trail } from "@wannadoo/core";
import {
  fromRunDetails,
  fromRunSnapshot,
  fromRunSummary,
  toRunDetails,
  toRunSnapshot,
  toRunSummary,
} from "./runSnapshot";

const routed: Trail = {
  ...trail,
  distanceMeters: 2400,
  distanceEstimated: false,
  start: { lat: 56.95, lng: 24.1 },
  path: [
    [56.95, 24.1],
    [56.9414308, 24.1166392],
  ],
};

describe("toRunSnapshot", () => {
  it("drops start and path from a routed trail", () => {
    const json = JSON.parse(JSON.stringify(toRunSnapshot(routed)));
    expect(json).not.toHaveProperty("start");
    expect(json).not.toHaveProperty("path");
    expect(JSON.stringify(json)).not.toContain("56.95");
  });

  it("adds neither key when the trail has none", () => {
    const json = JSON.parse(JSON.stringify(toRunSnapshot(trail)));
    expect(json).not.toHaveProperty("start");
    expect(json).not.toHaveProperty("path");
  });

  it("drops unknown fields on the trail and its stops", () => {
    const extra = {
      ...routed,
      home: { lat: 1, lng: 2 },
      stops: routed.stops.map((s) => ({ ...s, start: { lat: 1, lng: 2 } })),
    } as Trail;
    const json = JSON.parse(JSON.stringify(toRunSnapshot(extra)));
    expect(json).not.toHaveProperty("home");
    for (const stop of json.stops) expect(stop).not.toHaveProperty("start");
  });

  it("leaves the trail ID to the trail_id column", () => {
    expect(toRunSnapshot(trail)).not.toHaveProperty("id");
  });
});

describe("fromRunSnapshot", () => {
  it("round-trips the stops and display fields", () => {
    const json = JSON.parse(JSON.stringify(toRunSnapshot(routed)));
    const back = fromRunSnapshot(json, trail.id);
    expect(back.id).toBe(trail.id);
    expect(back.stops).toEqual(trail.stops);
    expect(back.name).toBe(trail.name);
    expect(back.kind).toBe("curated");
    expect(back.distanceMeters).toBe(2400);
    expect(back.start).toBeUndefined();
    expect(back.path).toBeUndefined();
  });

  it("ignores start and path if a stored snapshot had them", () => {
    const back = fromRunSnapshot({ ...toRunSnapshot(trail), start: { lat: 1, lng: 2 }, path: [[1, 2]] }, "t");
    expect(back.start).toBeUndefined();
    expect(back.path).toBeUndefined();
  });

  it("fills missing display fields", () => {
    const back = fromRunSnapshot({ stops: [trail.stops[0]] }, "t");
    expect(back.name).toBe("");
    expect(back.stopCount).toBe(1);
  });

  it.each([
    ["null", null],
    ["an array", []],
    ["no stops", { name: "x" }],
    ["stops not an array", { stops: {} }],
    ["empty stops", { stops: [] }],
    ["a stop that is not an object", { stops: ["a"] }],
    ["a stop without an id", { stops: [{ ...trail.stops[0], id: undefined }] }],
    ["a stop without a position", { stops: [{ ...trail.stops[0], lat: "56.9" }] }],
    ["a stop without a radius", { stops: [{ ...trail.stops[0], radiusMeters: 0 }] }],
  ])("throws on %s", (_, json) => {
    expect(() => fromRunSnapshot(json, "t")).toThrow();
  });
});

// A surprise route with a cemetery chapel on stop 3 (route-safety.md H14).
const withQuiet: Trail = {
  ...trail,
  kind: "surprise",
  stops: trail.stops.map((s, i) => (i === 2 ? { ...s, quiet: true } : s)),
};

const roundTrip = <T>(value: T): unknown => JSON.parse(JSON.stringify(value));

describe("quiet stops", () => {
  it("keeps the flag through the snapshot", () => {
    const back = fromRunSnapshot(roundTrip(toRunSnapshot(withQuiet)), trail.id);
    expect(back.stops.map((s) => s.quiet === true)).toEqual([false, false, true, false, false]);
  });

  it("keeps the flag through sealed details, on the sealed stop ID", () => {
    const back = fromRunDetails(roundTrip(toRunDetails(withQuiet)));
    expect(back.stops[2]).toMatchObject({ id: "s3", quiet: true });
    expect(back.stops.filter((s) => s.quiet)).toHaveLength(1);
  });

  it("stores no flag on ordinary stops", () => {
    const json = roundTrip(toRunDetails(withQuiet)) as { stops: Record<string, unknown>[] };
    expect(json.stops[0]).not.toHaveProperty("quiet");
    expect(json.stops[2]).toHaveProperty("quiet", true);
  });

  it("reads details sealed before the flag existed as ordinary stops", () => {
    const old = roundTrip(toRunDetails(trail)) as { stops: Record<string, unknown>[] };
    for (const stop of old.stops) delete stop.quiet;
    expect(fromRunDetails(old).stops.some((s) => s.quiet)).toBe(false);
  });

  it("ignores a flag that is not true", () => {
    const back = fromRunSnapshot({ stops: [{ ...trail.stops[0], quiet: "yes" }] }, "t");
    expect(back.stops[0]).not.toHaveProperty("quiet");
  });

  it("keeps quiet positions in the summary", () => {
    const summary = roundTrip(toRunSummary(withQuiet));
    expect(summary).toHaveProperty("quietStops", [2]);
    const back = fromRunSummary(summary);
    expect(back.stops.map((s) => s.quiet === true)).toEqual([false, false, true, false, false]);
  });

  it("leaves quietStops out of a summary without quiet stops, and reads old summaries", () => {
    const summary = roundTrip(toRunSummary(trail));
    expect(summary).not.toHaveProperty("quietStops");
    expect(fromRunSummary(summary).stops.some((s) => s.quiet)).toBe(false);
  });
});
