import type { LatLng } from "../geo";
import { haversineDistanceMeters } from "../geo";
import type { OsmElement } from "./overpass";
import type { OsrmResponse } from "./routeChecks";

// Synthetic OpenStreetMap and router data for the tests, shaped like real Overpass `out tags center` /
// `out tags geom` / `out skel` output and OSRM route responses (route-safety.md §2.3, §2.6). None of it was recorded
// from the live services; the shapes follow their documentation and the notes in route-safety.md.

export const START: LatLng = { lat: 56.95, lng: 24.1 };

// A point `north` and `east` metres from START.
export function offset(north: number, east: number, from: LatLng = START): LatLng {
  return {
    lat: from.lat + north / 111320,
    lng: from.lng + east / (111320 * Math.cos((from.lat * Math.PI) / 180)),
  };
}

const coord = (p: LatLng) => ({ lat: p.lat, lon: p.lng });

let nextId = 1;
const id = () => nextId++;

export function node(at: LatLng, tags?: Record<string, string>, nodeId = id()): OsmElement {
  return { type: "node", id: nodeId, lat: at.lat, lon: at.lng, ...(tags ? { tags } : {}) };
}

// A way printed with `out tags center`, as a stop candidate.
export function wayCenter(at: LatLng, tags: Record<string, string>): OsmElement {
  return { type: "way", id: id(), center: coord(at), tags };
}

// A way printed with `out tags geom`; null stands for a node clipped away by `geom(bbox)`.
export function way(points: (LatLng | null)[], tags: Record<string, string>): OsmElement {
  return { type: "way", id: id(), geometry: points.map((p) => (p ? coord(p) : null)), tags };
}

// A multipolygon relation printed with `out tags geom`: members carry their own geometry.
export function multipolygon(
  members: { role: "outer" | "inner"; points: (LatLng | null)[] }[],
  tags: Record<string, string>,
): OsmElement {
  return {
    type: "relation",
    id: id(),
    members: members.map((m) => ({
      type: "way",
      ref: id(),
      role: m.role,
      geometry: m.points.map((p) => (p ? coord(p) : null)),
    })),
    tags: { type: "multipolygon", ...tags },
  };
}

// A square ring `half` metres either side of `center`, closed.
export function square(center: LatLng, half: number): LatLng[] {
  const c = [
    offset(-half, -half, center),
    offset(-half, half, center),
    offset(half, half, center),
    offset(half, -half, center),
  ];
  return [...c, c[0]];
}

const COUNT: OsmElement = { type: "count", id: 0, tags: { total: "0" } };

// A whole Overpass response: each section followed by its count marker.
export function overpassResponse(sections: Partial<Record<string, OsmElement[]>>): { elements: OsmElement[] } {
  const order = ["candidates", "generic", "hazards", "roads", "crossings", "fords"];
  return { elements: order.flatMap((name) => [...(sections[name] ?? []), COUNT]) };
}

export type LegSpec = { path: LatLng[]; mode?: string; nodes?: number[] };

// An OSRM response for a loop whose legs follow the given paths. `snap` gives each waypoint's snap distance.
export function osrmResponse(legs: LegSpec[], snap?: number[]): OsrmResponse {
  const lngLat = (p: LatLng): [number, number] => [p.lng, p.lat];
  const pathLength = (pts: LatLng[]) => pts.slice(1).reduce((d, p, i) => d + haversineDistanceMeters(pts[i], p), 0);
  const all: LatLng[] = [];
  for (const leg of legs) for (const p of leg.path) if (!all.length || all[all.length - 1] !== p) all.push(p);
  const waypoints = [legs[0].path[0], ...legs.map((l) => l.path[l.path.length - 1])];
  return {
    code: "Ok",
    routes: [
      {
        distance: legs.reduce((d, l) => d + pathLength(l.path), 0),
        geometry: { coordinates: all.map(lngLat) },
        legs: legs.map((l) => ({
          distance: pathLength(l.path),
          steps: [
            { mode: l.mode ?? "walking", geometry: { coordinates: l.path.map(lngLat) } },
            { mode: l.mode ?? "walking", geometry: { coordinates: [lngLat(l.path[l.path.length - 1])] } },
          ],
          annotation: { nodes: l.nodes ?? [] },
        })),
      },
    ],
    waypoints: waypoints.map((p, i) => ({ distance: snap?.[i] ?? 0, location: lngLat(p) })),
  };
}
