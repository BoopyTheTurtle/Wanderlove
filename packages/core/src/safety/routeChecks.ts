import type { LatLng } from "../geo";
import { haversineDistanceMeters } from "../geo";
import type { Tags } from "./filters";
import { crossesRoadsAt } from "./geometry";
import type { Zone } from "./hazards";
import { inZone } from "./hazards";
import type { OsmElement } from "./overpass";
import { MAJOR_HIGHWAY, toLatLng } from "./overpass";

// Route checks (route-safety.md §2.2 step 3): inspect the path the foot router returned, before anyone walks it.
// Every check reports the stop to drop, so the generator can reroute without it.

export const SNAP_LIMIT_METERS = 40; // H15: farther than this from a path, a stop's 50 m check-in circle is out of reach
export const MATCH_METERS = 1; // a path vertex this close to an OSM node is that node
export const ID_MATCH_METERS = 5; // looser, when the router named the node by ID as well
export const NO_SIDEWALK_METERS = 20; // H2: along a road tagged without a sidewalk; more than a junction's width
export const UNTAGGED_MAJOR_METERS = 100; // H2: along a primary, secondary, or trunk road with no sidewalk tag
export const RURAL_ROAD_METERS = 300; // H2: along roads faster than 50 km/h, before the route counts as rural
// OSRM prints node IDs of 10^10 and above in floating point with ten significant digits, so they arrive rounded.
const TRUSTED_ID_LIMIT = 1e10;

// --- Router response ----------------------------------------------------------

type Coords = [number, number][];
type OsrmStep = { mode?: string; geometry?: { coordinates: Coords } };
type OsrmLeg = { distance?: number; steps?: OsrmStep[]; annotation?: { nodes?: number[] } };
export type OsrmResponse = {
  code?: string;
  routes?: { distance: number; geometry: { coordinates: Coords }; legs?: OsrmLeg[] }[];
  waypoints?: { distance?: number; location?: [number, number] }[];
};

export type RoutedLeg = { path: LatLng[]; nodeIds: number[]; ferry: boolean };
export type RoutedLoop = { distance: number; path: LatLng[]; legs: RoutedLeg[]; snapMeters: number[] };

const toPoint = ([lng, lat]: [number, number]): LatLng => ({ lat, lng });
const samePoint = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng;

// Reads a route requested with `overview=full&geometries=geojson&steps=true&annotations=nodes`.
export function parseOsrmRoute(json: OsrmResponse): RoutedLoop | null {
  const route = json.routes?.[0];
  if (!route?.geometry?.coordinates) return null;
  const path = route.geometry.coordinates.map(toPoint);
  const waypoints = json.waypoints ?? [];

  let legs: RoutedLeg[] = (route.legs ?? []).map((leg) => {
    const pts: LatLng[] = [];
    for (const step of leg.steps ?? []) {
      for (const c of step.geometry?.coordinates ?? []) {
        const p = toPoint(c);
        if (!pts.length || !samePoint(pts[pts.length - 1], p)) pts.push(p);
      }
    }
    return {
      path: pts,
      nodeIds: leg.annotation?.nodes ?? [],
      ferry: (leg.steps ?? []).some((s) => s.mode === "ferry"),
    };
  });
  if (legs.length === 0) legs = [{ path, nodeIds: [], ferry: false }];
  else if (legs.some((l) => l.path.length < 2)) {
    // No step geometry: split the overview at the vertices nearest each waypoint.
    const cuts = [0];
    for (let w = 1; w < legs.length; w++) {
      const loc = waypoints[w]?.location;
      let best = cuts[w - 1];
      if (loc) {
        const target = toPoint(loc);
        let bestD = Infinity;
        for (let i = cuts[w - 1]; i < path.length; i++) {
          const d = haversineDistanceMeters(path[i], target);
          if (d < bestD) [best, bestD] = [i, d];
        }
      }
      cuts.push(best);
    }
    cuts.push(path.length - 1);
    legs = legs.map((l, k) => ({ ...l, path: path.slice(cuts[k], cuts[k + 1] + 1) }));
  }
  return { distance: route.distance, path, legs, snapMeters: waypoints.map((w) => w.distance ?? 0) };
}

// --- Road network from Overpass -------------------------------------------------

type RoadWay = { id: number; tags: Tags; coords: LatLng[] };
type VertexRef = { way: number; index: number };

// Points bucketed on a grid of about 3 m, so looking up the nodes near a path vertex stays cheap.
type PointGrid<T> = Map<string, { at: LatLng; value: T }[]>;
const CELL = 3e-5;
const cellKey = (lat: number, lng: number) => `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;

function gridAdd<T>(grid: PointGrid<T>, at: LatLng, value: T) {
  const key = cellKey(at.lat, at.lng);
  const bucket = grid.get(key);
  if (bucket) bucket.push({ at, value });
  else grid.set(key, [{ at, value }]);
}

function gridNear<T>(grid: PointGrid<T>, p: LatLng, meters: number): T[] {
  const out: T[] = [];
  const row = Math.floor(p.lat / CELL);
  const col = Math.floor(p.lng / CELL);
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      for (const item of grid.get(`${r}:${c}`) ?? []) {
        if (haversineDistanceMeters(item.at, p) <= meters) out.push(item.value);
      }
    }
  }
  return out;
}

export type RoadNetwork = {
  roads: RoadWay[];
  roadVertices: PointGrid<VertexRef>;
  crossings: PointGrid<number>;
  crossingById: Map<number, LatLng>;
  fordNodes: PointGrid<number>;
  fordWays: RoadWay[];
  fordVertices: PointGrid<VertexRef>;
  rails: RoadWay[];
  railVertices: PointGrid<VertexRef>;
  railCrossings: PointGrid<number>;
  railCrossingById: Map<number, LatLng>;
  serviceWays: RoadWay[];
  serviceVertices: PointGrid<VertexRef>;
  closedLand: Zone[];
};

// The inputs of the railway (H7) and closed-land (H5) path checks. `rails` are railway ways, `railCrossings` the
// crossing nodes on them (`out skel`), `service` the service roads and tracks on closed land, and `closedLand` the
// industrial, military, quarry, and railway areas from the hazard index.
export type NetworkExtras = {
  rails?: OsmElement[];
  railCrossings?: OsmElement[];
  service?: OsmElement[];
  closedLand?: Zone[];
};

// Tracks a walker must cross only at a marked crossing (H7). Trams run in the street, so they cross freely in stage 2.
const MAIN_RAIL = /^(rail|light_rail)$/;
const onBridgeOrTunnel = (tags: Tags) =>
  (tags.bridge !== undefined && tags.bridge !== "no") || (tags.tunnel !== undefined && tags.tunnel !== "no");
const CLOSED_LAND_ROAD = /^(service|track)$/;

function toWays(elements: OsmElement[]): RoadWay[] {
  return elements
    .filter((el) => el.type === "way" && el.geometry)
    .map((el) => ({
      id: el.id,
      tags: el.tags ?? {},
      coords: el.geometry!.map(toLatLng).filter((p): p is LatLng => p !== null),
    }))
    .filter((w) => w.coords.length >= 2);
}

function indexWays(ways: RoadWay[]): PointGrid<VertexRef> {
  const grid: PointGrid<VertexRef> = new Map();
  ways.forEach((w, way) => w.coords.forEach((at, index) => gridAdd(grid, at, { way, index })));
  return grid;
}

function indexNodes(elements: OsmElement[]): { grid: PointGrid<number>; byId: Map<number, LatLng> } {
  const grid: PointGrid<number> = new Map();
  const byId = new Map<number, LatLng>();
  for (const el of elements) {
    if (el.type !== "node" || el.lat === undefined || el.lon === undefined) continue;
    const at = { lat: el.lat, lng: el.lon };
    gridAdd(grid, at, el.id);
    byId.set(el.id, at);
  }
  return { grid, byId };
}

// `roads` are the major roads plus the fast lower roads; `crossings` the marked crossing nodes (`out skel`);
// `fords` the nodes and ways tagged ford=yes.
export function buildRoadNetwork(
  roads: OsmElement[],
  crossings: OsmElement[],
  fords: OsmElement[],
  extras: NetworkExtras = {},
): RoadNetwork {
  const roadWays = toWays(roads);
  const { grid: crossingGrid, byId: crossingById } = indexNodes(crossings);
  // A track on a bridge or in a tunnel shares no node with the path, but drop it anyway in case the data joins them.
  const rails = toWays(extras.rails ?? []).filter(
    (w) => MAIN_RAIL.test(w.tags.railway ?? "") && !onBridgeOrTunnel(w.tags),
  );
  const railCrossings = indexNodes(extras.railCrossings ?? []);
  const serviceWays = toWays(extras.service ?? []).filter((w) => CLOSED_LAND_ROAD.test(w.tags.highway ?? ""));
  const fordNodes: PointGrid<number> = new Map();
  for (const el of fords) {
    if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
      gridAdd(fordNodes, { lat: el.lat, lng: el.lon }, el.id);
    }
  }
  const fordWays = toWays(fords);
  return {
    roads: roadWays,
    roadVertices: indexWays(roadWays),
    crossings: crossingGrid,
    crossingById,
    fordNodes,
    fordWays,
    fordVertices: indexWays(fordWays),
    rails,
    railVertices: indexWays(rails),
    railCrossings: railCrossings.grid,
    railCrossingById: railCrossings.byId,
    serviceWays,
    serviceVertices: indexWays(serviceWays),
    closedLand: extras.closedLand ?? [],
  };
}

// --- Road tags ------------------------------------------------------------------

// A road's speed limit in km/h, from `maxspeed` or a country default such as "LV:urban"; null when unknown.
export function speedKmh(tags: Tags): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(mph)?$/.exec((tags.maxspeed ?? "").trim());
  if (m) return Number(m[1]) * (m[2] ? 1.609 : 1);
  const zone = [tags.maxspeed, tags["source:maxspeed"], tags["maxspeed:type"]].join(" ");
  if (/:living_street/.test(zone)) return 20;
  if (/:urban/.test(zone)) return 50;
  if (/:rural/.test(zone)) return 90;
  if (/:(motorway|trunk)/.test(zone)) return 110;
  return null;
}

const TERTIARY_OR_ABOVE = /^(motorway|trunk|primary|secondary|tertiary)(_link)?$/;
const NEEDS_SIDEWALK_TAG = /^(trunk|primary|secondary)(_link)?$/;

function taggedWithoutSidewalk(tags: Tags): boolean {
  return (
    tags.sidewalk === "no" || tags.sidewalk === "none" || tags["sidewalk:both"] === "no" || tags.foot === "use_sidepath"
  );
}

function hasSidewalkTag(tags: Tags): boolean {
  return Object.keys(tags).some((k) => k === "sidewalk" || k.startsWith("sidewalk:"));
}

// --- Checks ---------------------------------------------------------------------

// `stop` indexes the stop to drop in the order the loop was routed.
export type RouteIssue = { reason: string; stop: number; at?: LatLng };
export type RouteVerdict = { ok: boolean; issues: RouteIssue[]; rural: boolean; fastRoadMeters: number };

// Checks a routed loop start → stops → start. `stops` are in walking order, so leg k runs from waypoint k to k + 1.
export function checkRoute(loop: RoutedLoop, net: RoadNetwork, start: LatLng, stops: LatLng[]): RouteVerdict {
  // Each problem first names the stops that could cause it: one for a stop's own problem, the two ends of a leg for
  // a problem on the way. Resolved at the end.
  const found: { reason: string; suspects: number[]; at?: LatLng }[] = [];
  const add = (reason: string, suspects: number[], at?: LatLng) => found.push({ reason, suspects, at });
  const legEnds = (k: number): number[] => [k - 1, k].filter((s) => s >= 0 && s < stops.length);

  // H15: a stop the router had to snap far away sits off any path (an island, a fenced yard).
  loop.snapMeters.forEach((d, w) => {
    if (w >= 1 && w <= stops.length && d > SNAP_LIMIT_METERS) add("H15-snap", [w - 1]);
  });

  // H3: ferries.
  loop.legs.forEach((leg, k) => {
    if (leg.ferry) add("H3-ferry", legEnds(k));
  });

  // One path with the leg of each vertex.
  const pts: LatLng[] = [];
  const legOf: number[] = [];
  loop.legs.forEach((leg, k) =>
    leg.path.forEach((p) => {
      if (pts.length && samePoint(pts[pts.length - 1], p)) return;
      pts.push(p);
      legOf.push(k);
    }),
  );

  // Road vertices each path vertex sits on, and which ways each path segment walks along.
  const onRoad = pts.map((p) => gridNear(net.roadVertices, p, MATCH_METERS));
  const alongWays = (refs: VertexRef[][], i: number): number[] => {
    const ways: number[] = [];
    for (const a of refs[i]) {
      for (const b of refs[i + 1]) {
        if (a.way === b.way && Math.abs(a.index - b.index) === 1 && !ways.includes(a.way)) ways.push(a.way);
      }
    }
    return ways;
  };
  const along = pts.slice(0, -1).map((_, i) => alongWays(onRoad, i));

  // H3: fords, as a node on the path or a stretch of a ford way.
  const onFord = pts.map((p) => gridNear(net.fordVertices, p, MATCH_METERS));
  pts.forEach((p, i) => {
    if (gridNear(net.fordNodes, p, MATCH_METERS).length) add("H3-ford", legEnds(legOf[i]), p);
    if (i < pts.length - 1 && alongWays(onFord, i).length) add("H3-ford", legEnds(legOf[i + 1]), p);
  });

  // H2: how far the path walks along roads without sidewalks, per leg, and along fast roads in total.
  const legs = loop.legs.length;
  const noSidewalk = new Array<number>(legs).fill(0);
  const untaggedMajor = new Array<number>(legs).fill(0);
  let fastRoadMeters = 0;
  along.forEach((ways, i) => {
    if (!ways.length) return;
    const len = haversineDistanceMeters(pts[i], pts[i + 1]);
    const leg = legOf[i + 1];
    const tags = ways.map((w) => net.roads[w].tags);
    const highway = (t: Tags) => t.highway ?? "";
    if (tags.some((t) => TERTIARY_OR_ABOVE.test(highway(t)) && taggedWithoutSidewalk(t))) noSidewalk[leg] += len;
    else if (
      tags.some((t) => {
        const speed = speedKmh(t);
        return NEEDS_SIDEWALK_TAG.test(highway(t)) && !hasSidewalkTag(t) && !(speed !== null && speed <= 50);
      })
    ) {
      untaggedMajor[leg] += len;
    }
    if (tags.some((t) => (speedKmh(t) ?? 0) > 50)) fastRoadMeters += len;
  });
  const worstLeg = (meters: number[]) => meters.indexOf(Math.max(...meters));
  if (noSidewalk.reduce((a, b) => a + b, 0) > NO_SIDEWALK_METERS) add("H2-sidewalk", legEnds(worstLeg(noSidewalk)));
  if (untaggedMajor.reduce((a, b) => a + b, 0) > UNTAGGED_MAJOR_METERS) {
    add("H2-sidewalk", legEnds(worstLeg(untaggedMajor)));
  }

  // H1: a path vertex on a major road, with neither neighbouring segment along a major road, crosses it there when it
  // arrives and leaves on different sides. The crossing must be marked. Router node IDs help only below 10^10; above,
  // the coordinates decide.
  const markedBy = (grid: PointGrid<number>, byId: Map<number, LatLng>) => {
    const passed: LatLng[] = [];
    for (const leg of loop.legs) {
      for (const id of leg.nodeIds) {
        const at = Number.isInteger(id) && id < TRUSTED_ID_LIMIT ? byId.get(id) : undefined;
        if (at) passed.push(at);
      }
    }
    return (p: LatLng) =>
      gridNear(grid, p, MATCH_METERS).length > 0 ||
      passed.some((c) => haversineDistanceMeters(c, p) <= ID_MATCH_METERS);
  };
  const isMajor = (way: number) => MAJOR_HIGHWAY.test(net.roads[way].tags.highway ?? "");
  const marked = markedBy(net.crossings, net.crossingById);
  for (let i = 1; i < pts.length - 1; i++) {
    const refs = onRoad[i].filter((r) => isMajor(r.way));
    if (!refs.length) continue;
    if (along[i - 1].some(isMajor) || along[i].some(isMajor)) continue;
    const neighbours = refs.flatMap((r) => {
      const coords = net.roads[r.way].coords;
      return [coords[r.index - 1], coords[r.index + 1]].filter((p): p is LatLng => p !== undefined);
    });
    if (!crossesRoadsAt(pts[i], pts[i - 1], pts[i + 1], neighbours)) continue;
    if (!marked(pts[i])) add("H1-crossing", legEnds(legOf[i]), pts[i]);
  }

  // H7: the same test against railway tracks. A path meets a track at grade only at a shared node, which must be tagged
  // railway=crossing or level_crossing; a bridge or tunnel shares none. Matched by coordinates, as for H1.
  if (net.rails.length) {
    const onRail = pts.map((p) => gridNear(net.railVertices, p, MATCH_METERS));
    const alongRail = pts.slice(0, -1).map((_, i) => alongWays(onRail, i));
    const railMarked = markedBy(net.railCrossings, net.railCrossingById);
    for (let i = 1; i < pts.length - 1; i++) {
      const refs = onRail[i];
      if (!refs.length || alongRail[i - 1].length || alongRail[i].length) continue;
      const neighbours = refs.flatMap((r) => {
        const coords = net.rails[r.way].coords;
        return [coords[r.index - 1], coords[r.index + 1]].filter((p): p is LatLng => p !== undefined);
      });
      if (!crossesRoadsAt(pts[i], pts[i - 1], pts[i + 1], neighbours)) continue;
      if (!railMarked(pts[i])) add("H7-rail-crossing", legEnds(legOf[i]), pts[i]);
    }
  }

  // H5: service roads and tracks on industrial, military, quarry, or railway land are yards and works access, not
  // walks. A stretch counts when it runs along such a way and its midpoint lies inside such land.
  if (net.serviceWays.length && net.closedLand.length) {
    const onService = pts.map((p) => gridNear(net.serviceVertices, p, MATCH_METERS));
    const flagged = new Set<number>(); // once per leg, so a long yard road doesn't outweigh other problems
    for (let i = 0; i < pts.length - 1; i++) {
      const leg = legOf[i + 1];
      if (flagged.has(leg) || !alongWays(onService, i).length) continue;
      const mid = { lat: (pts[i].lat + pts[i + 1].lat) / 2, lng: (pts[i].lng + pts[i + 1].lng) / 2 };
      if (!net.closedLand.some((z) => inZone(mid, z))) continue;
      flagged.add(leg);
      add("H5-industrial-service", legEnds(leg), mid);
    }
  }

  // The stop named by the most problems is the likeliest cause: a stop across a river fails both legs that reach it.
  // On a tie, blame the stop farther from the start, which is usually the one across the road or the river.
  const blame = new Map<number, number>();
  for (const f of found) for (const s of f.suspects) blame.set(s, (blame.get(s) ?? 0) + 1);
  const rank = (s: number) => (blame.get(s) ?? 0) * 1e6 + haversineDistanceMeters(start, stops[s]);
  const issues: RouteIssue[] = [];
  for (const f of found) {
    const stop = f.suspects.reduce((a, b) => (rank(b) > rank(a) ? b : a));
    if (!issues.some((i) => i.reason === f.reason && i.stop === stop))
      issues.push({ reason: f.reason, stop, at: f.at });
  }
  issues.sort((a, b) => rank(b.stop) - rank(a.stop));

  return { ok: issues.length === 0, issues, rural: fastRoadMeters > RURAL_ROAD_METERS, fastRoadMeters };
}
