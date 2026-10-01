import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { haversineDistanceMeters } from "./geo";
import type { LatLng } from "./geo";
import type { OsmElement } from "./safety/overpass";
import { START, node, offset, osrmResponse, overpassResponse, square, way } from "./safety/testFixtures";

// 20 places on rings 150–550 m from the start. `tags` can override the kind of place per index.
function places(tags: (i: number) => Record<string, string> = () => ({ tourism: "attraction" })): OsmElement[] {
  return Array.from({ length: 20 }, (_, i) => {
    const angle = (i * 18 * Math.PI) / 180;
    const r = 150 + (i % 5) * 100;
    const p = offset(Math.sin(angle) * r, Math.cos(angle) * r);
    return node(p, { name: `Place ${i + 1}`, ...tags(i) }, i + 1);
  });
}
const placeAt = (id: number) => places().find((p) => p.id === id)!;
const PLAQUE = node(offset(200, 0), { name: "Plaque", historic: "memorial", memorial: "plaque" }, 999);

type StubOptions = {
  overpass?: Partial<Record<string, OsmElement[]>>;
  routerFactor?: number;
  routerUp?: boolean;
  // Legs touching any of these points come back as ferry legs.
  ferryAt?: LatLng[];
  // Where the router puts each waypoint: a street name, metres moved north onto the path, and the snap distance.
  // `call` counts router calls from 0.
  snapTo?: (index: number, call: number) => { street?: string; north?: number; distance?: number };
  // How each Overpass server answers: "ok" (the default), an HTTP status such as 504, or "hang" until aborted.
  overpassServer?: (url: string) => "ok" | "hang" | number;
};

// Fake Overpass and foot router. The router walks straight lines; its distance is straight-line distance × factor.
function stubFetch({
  overpass,
  routerFactor = 1.2,
  routerUp = true,
  ferryAt = [],
  snapTo,
  overpassServer = () => "ok",
}: StubOptions = {}) {
  const routerCallTimes: number[] = [];
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url, init) => {
    if (url.includes("interpreter")) {
      const answer = overpassServer(url);
      if (answer === "hang") {
        return new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
        );
      }
      if (answer !== "ok") return new Response("<?xml version='1.0'?><busy/>", { status: answer });
      const sections = overpass ?? { candidates: [...places(), PLAQUE] };
      return new Response(JSON.stringify(overpassResponse(sections)), { status: 200 });
    }
    routerCallTimes.push(Date.now());
    if (!routerUp) throw new TypeError("network down");
    const pts = url
      .split("/driving/")[1]
      .split("?")[0]
      .split(";")
      .map((c) => {
        const [lng, lat] = c.split(",").map(Number);
        return { lat, lng };
      });
    const near = (p: LatLng) => ferryAt.some((f) => haversineDistanceMeters(f, p) < 1);
    const legs = pts
      .slice(1)
      .map((p, i) => ({ path: [pts[i], p], mode: near(pts[i]) || near(p) ? "ferry" : undefined }));
    const json = osrmResponse(legs);
    json.routes![0].distance *= routerFactor;
    if (snapTo) {
      const call = routerCallTimes.length - 1;
      json.waypoints = json.waypoints!.map((_, i) => {
        const { street, north = 0, distance = 0 } = snapTo(i, call);
        const moved = offset(north, 0, pts[i]);
        return { distance, location: [moved.lng, moved.lat], name: street };
      });
    }
    return new Response(JSON.stringify(json), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, routerCallTimes };
}

// routeGen caches places and queues router calls per module, so load a fresh module for each test.
async function loadRouteGen() {
  vi.resetModules();
  return import("./routeGen");
}

// Runs a promise to completion under fake timers, which the router queue and retries wait on.
async function settle<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true),
  );
  while (!done) await vi.advanceTimersByTimeAsync(250);
  return promise;
}

const toLatLng = (el: OsmElement): LatLng => ({ lat: el.lat!, lng: el.lon! });

describe("generateRoute", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("builds a five-stop loop within the walking limit", async () => {
    stubFetch();
    const { generateRoute, MAX_ROUTE_METERS, ROUTE_SLACK_METERS } = await loadRouteGen();
    const { trail, rural, routerCalls } = await settle(generateRoute(START, false));

    expect(trail.stops).toHaveLength(5);
    expect(trail.stopCount).toBe(5);
    expect(trail.distanceMeters).toBeLessThanOrEqual(MAX_ROUTE_METERS + ROUTE_SLACK_METERS);
    expect(trail.distanceEstimated).toBe(false);
    expect(trail.kind).toBe("surprise");
    expect(trail.durationMinutes).toBeGreaterThan(0);
    expect(rural).toBe(false);
    expect(routerCalls).toBeGreaterThanOrEqual(1);
  });

  it("starts and ends the walking path at the user's position", async () => {
    stubFetch();
    const { generateRoute } = await loadRouteGen();
    const { trail } = await settle(generateRoute(START, false));
    const path = trail.path!;

    expect(haversineDistanceMeters({ lat: path[0][0], lng: path[0][1] }, START)).toBeLessThan(1);
    expect(haversineDistanceMeters({ lat: path.at(-1)![0], lng: path.at(-1)![1] }, START)).toBeLessThan(1);
  });

  it("never picks memorial plaques and never repeats a stop", async () => {
    stubFetch();
    const { generateRoute } = await loadRouteGen();
    for (let i = 0; i < 10; i++) {
      const { trail } = await settle(generateRoute(START, false));
      const names = trail.stops.map((s) => s.name);
      expect(names).not.toContain("Plaque");
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("gives every stop a prompt, and the first and last fixed ones", async () => {
    stubFetch();
    const { generateRoute } = await loadRouteGen();
    const { trail } = await settle(generateRoute(START, false));

    for (const stop of trail.stops) expect(stop.prompt.length).toBeGreaterThan(10);
    expect(trail.stops[0].eyebrow).toMatch(/^Stop 01/);
    expect(trail.stops.at(-1)!.prompt).toMatch(/meaningful life/);
  });

  it("fails rather than offer an unchecked loop when the router is unreachable", async () => {
    stubFetch({ routerUp: false });
    const { generateRoute } = await loadRouteGen();
    await expect(settle(generateRoute(START, false))).rejects.toThrow(/walking router/);
  });

  it("stays within the limit when real paths are much longer than straight lines", async () => {
    stubFetch({ routerFactor: 1.7 });
    const { generateRoute, MAX_ROUTE_METERS, ROUTE_SLACK_METERS } = await loadRouteGen();
    const { trail, rejections } = await settle(generateRoute(START, false));

    expect(trail.stops).toHaveLength(5);
    expect(trail.distanceMeters).toBeLessThanOrEqual(MAX_ROUTE_METERS + ROUTE_SLACK_METERS);
    expect(rejections.every((r) => r.reason === "length")).toBe(true);
  });

  it("builds a shorter loop when asked", async () => {
    stubFetch();
    const { generateRoute, ROUTE_SLACK_METERS } = await loadRouteGen();
    const { trail } = await settle(generateRoute(START, false, { maxMeters: 1500 }));

    expect(trail.stops).toHaveLength(5);
    expect(trail.distanceMeters).toBeLessThanOrEqual(1500 + ROUTE_SLACK_METERS);
  });

  it("fetches nearby places once, reuses them, and fetches again after clearPlaceCache", async () => {
    const { fetchMock } = stubFetch();
    const { generateRoute, clearPlaceCache } = await loadRouteGen();
    await settle(generateRoute(START, false));
    await settle(generateRoute(START, false));
    const overpassCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes("interpreter")).length;
    expect(overpassCalls()).toBe(1);

    clearPlaceCache();
    await settle(generateRoute(START, false));
    expect(overpassCalls()).toBe(2);
  });

  it("sends custom headers, such as a script's User-Agent, to Overpass and the router", async () => {
    const { fetchMock } = stubFetch();
    const { generateRoute } = await loadRouteGen();
    await settle(generateRoute(START, false, { headers: { "User-Agent": "wannadoo-sim/1" } }));

    for (const [, init] of fetchMock.mock.calls) {
      expect((init?.headers as Record<string, string>)["User-Agent"]).toBe("wannadoo-sim/1");
    }
  });

  it("reports a clear error when the map service is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<?xml version='1.0'?><error/>", { status: 200 })),
    );
    const { generateRoute } = await loadRouteGen();
    await expect(settle(generateRoute(START, false))).rejects.toThrow(/map service/);
  });

  it("uses the other map server when one is busy", async () => {
    for (const busy of ["overpass-api.de", "openstreetmap.fr"]) {
      stubFetch({ overpassServer: (url) => (url.includes(busy) ? 504 : "ok") });
      const { generateRoute } = await loadRouteGen();
      const { trail } = await settle(generateRoute(START, false));
      expect(trail.stops).toHaveLength(5);
    }
  });

  it("asks the second map server after a few seconds when the first hangs, and aborts the slow one", async () => {
    for (const slow of ["overpass-api.de", "openstreetmap.fr"]) {
      const { fetchMock } = stubFetch({ overpassServer: (url) => (url.includes(slow) ? "hang" : "ok") });
      const { generateRoute } = await loadRouteGen();
      const started = Date.now();
      const { trail } = await settle(generateRoute(START, false));
      expect(trail.stops).toHaveLength(5);
      const overpass = fetchMock.mock.calls.filter(([url]) => url.includes("interpreter"));
      expect(overpass.length).toBeLessThanOrEqual(2);
      expect(overpass.every(([, init]) => init?.signal?.aborted)).toBe(true);
      expect(Date.now() - started).toBeLessThan(15000);
    }
  });

  it("tries a second round before giving up on the map service", async () => {
    let calls = 0;
    stubFetch({ overpassServer: () => (++calls <= 2 ? 504 : "ok") });
    const { generateRoute } = await loadRouteGen();
    const { trail } = await settle(generateRoute(START, false));
    expect(trail.stops).toHaveLength(5);
    expect(calls).toBe(3);
  });

  it("treats a response missing its section markers as a failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ elements: places() }), { status: 200 })),
    );
    const { generateRoute } = await loadRouteGen();
    await expect(settle(generateRoute(START, false))).rejects.toThrow(/map service/);
  });

  it("tops up with benches, viewpoints, and parks where too few named places exist", async () => {
    const named = places().slice(0, 2);
    const benches = Array.from({ length: 12 }, (_, i) => {
      const angle = (i * 30 * Math.PI) / 180;
      return node(offset(Math.sin(angle) * 300, Math.cos(angle) * 300), { amenity: "bench" }, 100 + i);
    });
    const viewpoint = node(offset(-250, 100), { tourism: "viewpoint" }, 200);
    stubFetch({ overpass: { candidates: named, generic: [...benches, viewpoint] } });
    const { generateRoute } = await loadRouteGen();
    const { trail } = await settle(generateRoute(START, false));

    expect(trail.stops).toHaveLength(5);
    const labels = trail.stops.map((s) => s.eyebrow.split(" — ")[1]);
    expect(labels.filter((l) => l === "Bench").length).toBeLessThanOrEqual(3);
    expect(labels.filter((l) => l === "Landmark").length).toBeGreaterThanOrEqual(1);
  });

  it("fills a quiet area with street corners named after their streets", async () => {
    stubFetch({
      overpass: { candidates: places().slice(0, 2) },
      snapTo: (i) => ({ street: `Street ${i}`, north: 20, distance: 20 }),
    });
    const { generateRoute } = await loadRouteGen();
    const { trail } = await settle(generateRoute(START, false));

    expect(trail.stops).toHaveLength(5);
    const corners = trail.stops.filter((s) => s.eyebrow.endsWith("Street corner"));
    expect(corners.length).toBe(3);
    for (const s of corners) expect(s.name).toMatch(/^On Street \d$/);
    expect(trail.stops.filter((s) => s.name.startsWith("Place")).length).toBe(2);
  });

  it("builds a loop even where the map has no places at all", async () => {
    stubFetch({ overpass: {} });
    const { generateRoute } = await loadRouteGen();
    const { trail } = await settle(generateRoute(START, false));

    expect(trail.stops).toHaveLength(5);
    for (const s of trail.stops) expect(s.name).toBe("A quiet corner"); // the stub router names no streets
  });

  it("moves a street corner onto the path the router found", async () => {
    stubFetch({ overpass: {}, snapTo: () => ({ street: "Long Road", north: 30, distance: 30 }) });
    const { generateRoute } = await loadRouteGen();
    const { trail } = await settle(generateRoute(START, false));
    const onPath = (p: LatLng) => trail.path!.some(([lat, lng]) => haversineDistanceMeters({ lat, lng }, p) < 1);

    expect(trail.stops.map((s) => s.name)).toEqual([
      "On Long Road",
      "Further along Long Road",
      "Further along Long Road",
      "Further along Long Road",
      "Further along Long Road",
    ]);
    // Each stop sits 30 m north of the point the loop was routed through, as the router snapped it.
    for (const s of trail.stops) expect(onPath(offset(-30, 0, s))).toBe(true);
  });

  it("drops a street corner the router can't put near a path, and tries another", async () => {
    // On the first call every corner sits 400 m from any path; after that they snap close.
    stubFetch({ overpass: {}, snapTo: (i, call) => ({ distance: call === 0 && i > 0 ? 400 : 10 }) });
    const { generateRoute } = await loadRouteGen();
    const { trail, rejections, routerCalls } = await settle(generateRoute(START, false));

    expect(trail.stops).toHaveLength(5);
    expect(rejections[0].reason).toBe("spot-off-path");
    expect(routerCalls).toBeGreaterThan(1);
  });

  it("fails clearly when all the land around is off limits", async () => {
    const yard = way(square(START, 2000), { landuse: "industrial" });
    stubFetch({ overpass: { hazards: [yard] } });
    const { generateRoute } = await loadRouteGen();
    await expect(settle(generateRoute(START, false))).rejects.toThrow(/walkable streets/);
  });

  it("flags quiet stops, keeps at most two, and puts them on slots 1, 3, or 5", async () => {
    // Every other place is a church.
    const overpass = {
      candidates: places((i): Record<string, string> =>
        i % 2 ? { amenity: "place_of_worship" } : { tourism: "attraction" },
      ),
    };
    stubFetch({ overpass });
    const { generateRoute } = await loadRouteGen();
    for (let run = 0; run < 8; run++) {
      const { trail } = await settle(generateRoute(START, false));
      const quiet = trail.stops.flatMap((s, i) => (s.quiet ? [i] : []));
      expect(quiet.length).toBeLessThanOrEqual(2);
      for (const i of quiet) expect([0, 2, 4]).toContain(i);
      for (const s of trail.stops) expect(s.quiet).toBe(/Church/.test(s.eyebrow));
    }
  });

  it("marks a stop inside a cemetery quiet", async () => {
    // A cemetery around Places 1 and 6, which are otherwise ordinary attractions.
    const graves = [placeAt(1), placeAt(6)];
    const cemetery = graves.map((p) => way(square(toLatLng(p), 30), { landuse: "cemetery" }));
    stubFetch({ overpass: { candidates: places(), hazards: cemetery } });
    const { generateRoute } = await loadRouteGen();
    for (let run = 0; run < 5; run++) {
      const { trail } = await settle(generateRoute(START, false));
      for (const s of trail.stops) expect(s.quiet).toBe(s.name === "Place 1" || s.name === "Place 6");
    }
  });

  it("never picks a place inside a hazard area", async () => {
    // Industrial land covers everything north of the start.
    const industrial = way([offset(10, -800), offset(10, 800), offset(800, 800), offset(800, -800), offset(10, -800)], {
      landuse: "industrial",
    });
    stubFetch({ overpass: { candidates: places(), hazards: [industrial] } });
    const { generateRoute } = await loadRouteGen();
    for (let run = 0; run < 5; run++) {
      const { trail } = await settle(generateRoute(START, false));
      for (const s of trail.stops) expect(s.lat).toBeLessThan(offset(10, 0).lat);
    }
  });

  // Riga, where START lies: noon in January and July, and 23:00 local on an October night, hours after civil dusk.
  const WINTER_NOON = new Date("2026-01-15T10:00:00Z");
  const SUMMER_NOON = new Date("2026-07-15T09:00:00Z");
  const OCTOBER_DAY = new Date("2026-10-15T10:00:00Z");
  const OCTOBER_NIGHT = new Date("2026-10-15T20:00:00Z");

  it("drops places beside a pond from November through March, but not beside a river (H4)", async () => {
    // A pond 20 m from Place 1 (150 m east of the start) and a river 20 m from Place 6 (150 m north).
    const pond = way(square(offset(0, 185), 15), { natural: "water", water: "pond" });
    const river = way(square(offset(185, 0), 15), { natural: "water", water: "river" });
    stubFetch({ overpass: { candidates: places(), hazards: [pond, river] } });
    const { generateRoute } = await loadRouteGen();
    for (let run = 0; run < 5; run++) {
      const { trail, rejections } = await settle(generateRoute(START, false, { when: WINTER_NOON }));
      expect(trail.stops.map((s) => s.id)).not.toContain("osm-node-1");
      expect(rejections.filter((r) => r.reason === "H4-ice")).toEqual([{ stopId: "osm-node-1", reason: "H4-ice" }]);
    }
    const { rejections } = await settle(generateRoute(START, false, { when: SUMMER_NOON }));
    expect(rejections.some((r) => r.reason === "H4-ice")).toBe(false);
  });

  it("drops places in unlit parks and woods after civil dusk, unless lit (H10)", async () => {
    // Place 1 in an unlit park, Place 6 in a lit park, and Place 11, itself lit, in an unlit wood.
    const areas = [
      way(square(toLatLng(placeAt(1)), 40), { leisure: "park" }),
      way(square(toLatLng(placeAt(6)), 40), { leisure: "park", lit: "yes" }),
      way(square(toLatLng(placeAt(11)), 40), { natural: "wood" }),
    ];
    const candidates = places((i): Record<string, string> =>
      i === 10 ? { tourism: "attraction", lit: "yes" } : { tourism: "attraction" },
    );
    stubFetch({ overpass: { candidates, hazards: areas } });
    const { generateRoute } = await loadRouteGen();
    for (let run = 0; run < 5; run++) {
      const { trail, rejections } = await settle(generateRoute(START, false, { when: OCTOBER_NIGHT }));
      expect(trail.stops.map((s) => s.id)).not.toContain("osm-node-1");
      const dark = rejections.filter((r) => r.reason === "H10-dark-park");
      expect(dark).toEqual([{ stopId: "osm-node-1", reason: "H10-dark-park" }]);
    }
    const { rejections } = await settle(generateRoute(START, false, { when: OCTOBER_DAY }));
    expect(rejections.some((r) => r.reason === "H10-dark-park")).toBe(false);
  });

  it("drops a stop whose route fails a check and reroutes", async () => {
    const bad = [placeAt(1), placeAt(2), placeAt(6)];
    stubFetch({ ferryAt: bad.map(toLatLng) });
    const { generateRoute } = await loadRouteGen();
    for (let run = 0; run < 5; run++) {
      const { trail, rejections, routerCalls } = await settle(generateRoute(START, false));
      expect(trail.stops).toHaveLength(5);
      for (const b of bad) expect(trail.stops.map((s) => s.id)).not.toContain(`osm-node-${b.id}`);
      expect(rejections.every((r) => r.reason === "H3-ferry")).toBe(true);
      expect(routerCalls).toBe(rejections.length + 1);
    }
  });

  it("gives up after eight router calls", async () => {
    const { routerCallTimes } = stubFetch({ ferryAt: [START] });
    const { generateRoute, MAX_ROUTER_CALLS } = await loadRouteGen();
    await expect(settle(generateRoute(START, false))).rejects.toThrow(/Couldn't find a safe loop here/);
    expect(MAX_ROUTER_CALLS).toBe(8);
    expect(routerCallTimes).toHaveLength(8);
  });

  it("calls the router at most once a second", async () => {
    const { routerCallTimes } = stubFetch({ ferryAt: [START] });
    const { generateRoute } = await loadRouteGen();
    await expect(settle(generateRoute(START, false))).rejects.toThrow();
    for (let i = 1; i < routerCallTimes.length; i++) {
      expect(routerCallTimes[i] - routerCallTimes[i - 1]).toBeGreaterThanOrEqual(1000);
    }
  });
});
