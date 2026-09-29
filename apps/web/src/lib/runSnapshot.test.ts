import { describe, expect, it } from "vitest";
import { trail, type Trail } from "@wannadoo/core";
import { fromRunSnapshot, toRunSnapshot } from "./runSnapshot";

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
