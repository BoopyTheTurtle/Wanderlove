import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { haversineDistanceMeters } from "./geo";
import type { LatLng } from "./geo";

const START: LatLng = { lat: 56.95, lng: 24.1 };

// Offsets a point by metres north/east of START.
function offset(north: number, east: number): LatLng {
  return {
    lat: START.lat + north / 111320,
    lng: START.lng + east / (111320 * Math.cos((START.lat * Math.PI) / 180)),
  };
}

// 20 attractions on rings 150–550 m from the start, plus a plaque that must never be picked.
function overpassElements() {
  const elements = Array.from({ length: 20 }, (_, i) => {
    const angle = (i * 18 * Math.PI) / 180;
    const r = 150 + (i % 5) * 100;
    const p = offset(Math.sin(angle) * r, Math.cos(angle) * r);
    return { type: "node", id: i + 1, lat: p.lat, lon: p.lng, tags: { name: `Place ${i + 1}`, tourism: "attraction" } };
  });
  const plaque = offset(200, 0);
  elements.push({
    type: "node",
    id: 999,
    lat: plaque.lat,
    lon: plaque.lng,
    tags: { name: "Plaque", historic: "memorial", memorial: "plaque" } as never,
  });
  return elements;
}

// Fake foot router: walking distance = straight-line distance × `factor`.
function stubFetch({ routerFactor = 1.2, routerUp = true } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("interpreter")) {
      return new Response(JSON.stringify({ elements: overpassElements() }), { status: 200 });
    }
    if (!routerUp) throw new TypeError("network down");
    const coords = url.split("/driving/")[1].split("?")[0].split(";");
    const pts = coords.map((c) => {
      const [lng, lat] = c.split(",").map(Number);
      return { lat, lng };
    });
    let d = 0;
    for (let i = 1; i < pts.length; i++) d += haversineDistanceMeters(pts[i - 1], pts[i]);
    return new Response(
      JSON.stringify({
        routes: [{ distance: d * routerFactor, geometry: { coordinates: pts.map((p) => [p.lng, p.lat]) } }],
      }),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// routeGen caches places per location, so load a fresh module for each test.
async function loadRouteGen() {
  vi.resetModules();
  return import("./routeGen");
}

describe("generateRoute", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("builds a 4–6 stop loop within the walking limit", async () => {
    stubFetch();
    const { generateRoute, MAX_ROUTE_METERS } = await loadRouteGen();
    const { trail } = await generateRoute(START, false);

    expect(trail.stops.length).toBeGreaterThanOrEqual(4);
    expect(trail.stops.length).toBeLessThanOrEqual(6);
    expect(trail.stopCount).toBe(trail.stops.length);
    expect(trail.distanceMeters).toBeLessThanOrEqual(MAX_ROUTE_METERS);
    expect(trail.distanceEstimated).toBe(false);
    expect(trail.kind).toBe("surprise");
  });

  it("starts and ends the walking path at the user's position", async () => {
    stubFetch();
    const { generateRoute } = await loadRouteGen();
    const { trail } = await generateRoute(START, false);
    const path = trail.path!;

    expect(haversineDistanceMeters({ lat: path[0][0], lng: path[0][1] }, START)).toBeLessThan(1);
    expect(haversineDistanceMeters({ lat: path.at(-1)![0], lng: path.at(-1)![1] }, START)).toBeLessThan(1);
  });

  it("never picks memorial plaques and never repeats a stop", async () => {
    stubFetch();
    const { generateRoute } = await loadRouteGen();
    for (let i = 0; i < 10; i++) {
      const { trail } = await generateRoute(START, false);
      const names = trail.stops.map((s) => s.name);
      expect(names).not.toContain("Plaque");
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("gives every stop a prompt, and the first and last fixed ones", async () => {
    stubFetch();
    const { generateRoute } = await loadRouteGen();
    const { trail } = await generateRoute(START, false);

    for (const stop of trail.stops) expect(stop.prompt.length).toBeGreaterThan(10);
    expect(trail.stops[0].eyebrow).toMatch(/^Stop 01/);
    expect(trail.stops.at(-1)!.prompt).toMatch(/meaningful life/);
  });

  it("falls back to an estimated distance when the router is unreachable", async () => {
    stubFetch({ routerUp: false });
    const { generateRoute, MAX_ROUTE_METERS } = await loadRouteGen();
    const { trail } = await generateRoute(START, false);

    expect(trail.distanceEstimated).toBe(true);
    expect(trail.distanceMeters).toBeLessThanOrEqual(MAX_ROUTE_METERS);
  });

  it("stays within the limit when real paths are much longer than straight lines", async () => {
    stubFetch({ routerFactor: 2.2 });
    const { generateRoute, MAX_ROUTE_METERS } = await loadRouteGen();
    const { trail } = await generateRoute(START, false);

    expect(trail.distanceMeters).toBeLessThanOrEqual(MAX_ROUTE_METERS);
  });

  it("fetches nearby places once and reuses them for the next route", async () => {
    const fetchMock = stubFetch();
    const { generateRoute } = await loadRouteGen();
    await generateRoute(START, false);
    await generateRoute(START, false);

    const overpassCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("interpreter"));
    expect(overpassCalls).toHaveLength(1);
  });

  it("reports a clear error when the map service is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<?xml version='1.0'?><error/>", { status: 200 })),
    );
    const { generateRoute } = await loadRouteGen();
    await expect(generateRoute(START, false)).rejects.toThrow(/map service/);
  });
});
