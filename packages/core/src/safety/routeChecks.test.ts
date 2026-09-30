import { describe, expect, it } from "vitest";
import type { LatLng } from "../geo";
import type { OsmElement } from "./overpass";
import { buildRoadNetwork, checkRoute, parseOsrmRoute, speedKmh } from "./routeChecks";
import type { LegSpec } from "./testFixtures";
import { START, node, offset, osrmResponse, way } from "./testFixtures";

// An east–west road 200 m north of the start, with a vertex X straight north of it.
const ROAD_NORTH = 200;
const X = offset(ROAD_NORTH, 0);
const roadPoints = [
  offset(ROAD_NORTH, -300),
  offset(ROAD_NORTH, -100),
  X,
  offset(ROAD_NORTH, 100),
  offset(ROAD_NORTH, 300),
];
const A = offset(400, 0); // a stop across the road

function check(
  legs: LegSpec[],
  stops: LatLng[],
  network: { roads?: OsmElement[]; crossings?: OsmElement[]; fords?: OsmElement[] },
  snap?: number[],
) {
  const loop = parseOsrmRoute(osrmResponse(legs, snap))!;
  const net = buildRoadNetwork(network.roads ?? [], network.crossings ?? [], network.fords ?? []);
  return checkRoute(loop, net, START, stops);
}

// start → A straight across the road at X, and back the same way.
const acrossAtX = (nodes?: number[]): LegSpec[] => [
  { path: [START, offset(100, 0), X, offset(300, 0), A], nodes },
  { path: [A, offset(300, 0), X, offset(100, 0), START], nodes },
];

describe("parseOsrmRoute", () => {
  it("reads legs from step geometry, with ferries and node IDs", () => {
    const loop = parseOsrmRoute(
      osrmResponse([{ path: [START, A], mode: "ferry", nodes: [1, 2] }, { path: [A, START] }], [0, 12, 0]),
    )!;
    expect(loop.legs).toHaveLength(2);
    expect(loop.legs[0]).toMatchObject({ ferry: true, nodeIds: [1, 2] });
    expect(loop.legs[0].path).toHaveLength(2);
    expect(loop.snapMeters).toEqual([0, 12, 0]);
  });

  it("splits the overview at the waypoints when steps carry no geometry", () => {
    const json = osrmResponse([{ path: [START, offset(100, 0), A] }, { path: [A, offset(100, 50), START] }]);
    for (const leg of json.routes![0].legs!) leg.steps = [];
    const loop = parseOsrmRoute(json)!;
    expect(loop.legs[0].path).toEqual([START, offset(100, 0), A]);
    expect(loop.legs[1].path).toEqual([A, offset(100, 50), START]);
  });

  it("returns null without a route", () => {
    expect(parseOsrmRoute({ code: "NoRoute", routes: [] })).toBeNull();
  });
});

describe("route checks", () => {
  const primary = way(roadPoints, { highway: "primary" });

  it("passes a plain loop", () => {
    const verdict = check([{ path: [START, A] }, { path: [A, START] }], [A], { roads: [primary] });
    expect(verdict).toMatchObject({ ok: true, issues: [], rural: false });
  });

  it("drops a stop the router snapped more than 40 m away (H15)", () => {
    const B = offset(-300, 0);
    const legs = [{ path: [START, A] }, { path: [A, B] }, { path: [B, START] }];
    expect(check(legs, [A, B], {}, [0, 40, 0, 0]).ok).toBe(true);
    const verdict = check(legs, [A, B], {}, [0, 10, 55, 0]);
    expect(verdict.issues).toEqual([{ reason: "H15-snap", stop: 1, at: undefined }]);
  });

  it("rejects a ferry leg", () => {
    const verdict = check([{ path: [START, A], mode: "ferry" }, { path: [A, START] }], [A], {});
    expect(verdict.issues.map((i) => i.reason)).toEqual(["H3-ferry"]);
  });

  it("rejects a path through a ford node or along a ford way", () => {
    const viaNode = check(acrossAtX(), [A], { fords: [node(offset(100, 0), { ford: "yes" })] });
    expect(viaNode.issues.map((i) => i.reason)).toEqual(["H3-ford"]);

    const viaWay = check(acrossAtX(), [A], { fords: [way([offset(300, 0), A], { highway: "track", ford: "yes" })] });
    expect(viaWay.issues.map((i) => i.reason)).toEqual(["H3-ford"]);

    // Touching the end of a ford way at a junction is not walking through it.
    const touching = check(acrossAtX(), [A], { fords: [way([A, offset(400, 80)], { highway: "track", ford: "yes" })] });
    expect(touching.ok).toBe(true);
  });

  it("rejects an unmarked crossing of a major road (H1)", () => {
    const verdict = check(acrossAtX(), [A], { roads: [primary] });
    expect(verdict.ok).toBe(false);
    expect(verdict.issues).toHaveLength(1);
    expect(verdict.issues[0]).toMatchObject({ reason: "H1-crossing", stop: 0 });
  });

  it("lets tertiary and smaller roads cross freely", () => {
    const tertiary = way(roadPoints, { highway: "tertiary", maxspeed: "90" });
    expect(check(acrossAtX(), [A], { roads: [tertiary] }).issues).toEqual([]);
  });

  it("accepts a crossing at a marked node, matched by coordinates", () => {
    const verdict = check(acrossAtX(), [A], { roads: [primary], crossings: [node(X, undefined, 123)] });
    expect(verdict.ok).toBe(true);
  });

  it("matches a crossing node above 10^10 by coordinates, since OSRM prints its ID rounded", () => {
    const crossing = node(X, undefined, 13544555853);
    // What JSON.parse makes of OSRM's "1.354455585e+10".
    const verdict = check(acrossAtX([1.354455585e10]), [A], { roads: [primary], crossings: [crossing] });
    expect(verdict.ok).toBe(true);
  });

  it("uses router node IDs only below 10^10", () => {
    // The crossing node sits 3 m from the path vertex: too far for coordinates alone, close enough with a trusted ID.
    const nearby = offset(ROAD_NORTH, 3);
    const trusted = check(acrossAtX([987654321]), [A], {
      roads: [primary],
      crossings: [node(nearby, undefined, 987654321)],
    });
    expect(trusted.ok).toBe(true);

    const garbled = check(acrossAtX([1.354455585e10]), [A], {
      roads: [primary],
      crossings: [node(nearby, undefined, 13544555853)],
    });
    expect(garbled.issues.map((i) => i.reason)).toEqual(["H1-crossing"]);
  });

  it("does not count a path passing over the road on a bridge", () => {
    // The bridge shares no node with the road, so the path never touches a road vertex.
    const bridge = [START, offset(100, 0), offset(ROAD_NORTH, 1.5), offset(300, 0), A];
    const verdict = check([{ path: bridge }, { path: [...bridge].reverse() }], [A], { roads: [primary] });
    expect(verdict.ok).toBe(true);
  });

  it("drops the farther stop when a crossing lies between two stops", () => {
    const B = offset(150, 20);
    const legs = [{ path: [START, B] }, { path: [B, X, A] }, { path: [A, offset(400, 300), offset(-100, 300), START] }];
    const verdict = check(legs, [B, A], { roads: [primary] });
    expect(verdict.issues).toEqual([expect.objectContaining({ reason: "H1-crossing", stop: 1 })]);
  });
});

describe("sidewalk check (H2)", () => {
  // start → up to the road's west end → 600 m along it → north to a stop → straight home.
  const stop = offset(400, 300);
  const alongRoad: LegSpec[] = [{ path: [START, ...roadPoints, stop] }, { path: [stop, START] }];
  const road = (tags: Record<string, string>) => ({ roads: [way(roadPoints, tags)] });

  it("rejects 600 m along a primary road with no sidewalk tag", () => {
    const verdict = check(alongRoad, [stop], road({ highway: "primary" }));
    expect(verdict.issues.map((i) => i.reason)).toEqual(["H2-sidewalk"]);
  });

  it("accepts it with a sidewalk tag or a 50 km/h limit", () => {
    expect(check(alongRoad, [stop], road({ highway: "primary", sidewalk: "both" })).ok).toBe(true);
    expect(check(alongRoad, [stop], road({ highway: "secondary", maxspeed: "50" })).ok).toBe(true);
  });

  it("rejects a road tagged without a sidewalk", () => {
    const verdict = check(alongRoad, [stop], road({ highway: "tertiary", sidewalk: "no" }));
    expect(verdict.issues.map((i) => i.reason)).toEqual(["H2-sidewalk"]);
  });

  it("allows a fast rural road but flags the route as rural past 300 m", () => {
    const long = check(alongRoad, [stop], road({ highway: "unclassified", maxspeed: "90" }));
    expect(long).toMatchObject({ ok: true, rural: true });
    expect(long.fastRoadMeters).toBeGreaterThan(300);

    const shortRoad = roadPoints.slice(0, 3); // 200 m
    const short = check([{ path: [START, ...shortRoad, stop] }, { path: [stop, START] }], [stop], {
      roads: [way(shortRoad, { highway: "residential", "source:maxspeed": "LV:rural" })],
    });
    expect(short).toMatchObject({ ok: true, rural: false });
  });

  it("rejects a fast primary road without a sidewalk tag rather than calling it rural", () => {
    const verdict = check(alongRoad, [stop], road({ highway: "primary", maxspeed: "90" }));
    expect(verdict.ok).toBe(false);
  });
});

describe("speedKmh", () => {
  it("reads numbers, mph, and zone defaults", () => {
    expect(speedKmh({ maxspeed: "50" })).toBe(50);
    expect(speedKmh({ maxspeed: "30 mph" })).toBeCloseTo(48.3, 1);
    expect(speedKmh({ maxspeed: "LV:rural" })).toBe(90);
    expect(speedKmh({ "source:maxspeed": "LV:urban" })).toBe(50);
    expect(speedKmh({})).toBeNull();
  });
});
