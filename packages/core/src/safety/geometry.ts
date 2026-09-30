import type { LatLng } from "../geo";

// Small plane geometry for the safety checks. Everything here works on areas a few kilometres across, where treating
// latitude and longitude as a flat grid is accurate to well under a metre.

const METERS_PER_DEGREE = 111320;

export type Ring = LatLng[];
export type Box = { south: number; west: number; north: number; east: number };

// Metres east (x) and north (y) of `origin`.
export function toLocalMeters(origin: LatLng, p: LatLng): { x: number; y: number } {
  return {
    x: (p.lng - origin.lng) * METERS_PER_DEGREE * Math.cos((origin.lat * Math.PI) / 180),
    y: (p.lat - origin.lat) * METERS_PER_DEGREE,
  };
}

export function boxOf(points: LatLng[]): Box {
  const box = { south: Infinity, west: Infinity, north: -Infinity, east: -Infinity };
  for (const p of points) {
    box.south = Math.min(box.south, p.lat);
    box.north = Math.max(box.north, p.lat);
    box.west = Math.min(box.west, p.lng);
    box.east = Math.max(box.east, p.lng);
  }
  return box;
}

// Whether `p` lies in the box grown by `marginMeters` on every side.
export function inBox(p: LatLng, box: Box, marginMeters = 0): boolean {
  const dLat = marginMeters / METERS_PER_DEGREE;
  const dLng = marginMeters / (METERS_PER_DEGREE * Math.cos((p.lat * Math.PI) / 180));
  return p.lat >= box.south - dLat && p.lat <= box.north + dLat && p.lng >= box.west - dLng && p.lng <= box.east + dLng;
}

// Ray casting; the ring may be open or closed.
export function pointInRing(p: LatLng, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) {
      inside = !inside;
    }
  }
  return inside;
}

// Even-odd over every ring of a multipolygon: an island (inner ring) in a lake reads as outside the lake, and a pond on
// that island (another outer ring) as inside water again. Member roles are therefore not needed.
export function pointInRings(p: LatLng, rings: Ring[]): boolean {
  let inside = false;
  for (const ring of rings) if (pointInRing(p, ring)) inside = !inside;
  return inside;
}

const sameCoord = (a: LatLng, b: LatLng) => Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;

// Joins the member ways of a multipolygon end to end into rings, reversing ways as needed.
// Overpass clips geometry to the query box when asked with `geom(bbox)`: nodes outside the box arrive as null or not at
// all. A ring cut by the box cannot close, so it is closed with a straight chord between its loose ends, which runs
// near the box edge; a missing stretch inside one way is bridged the same way. Near the corners of the box the chord
// can cut off a sliver of the area; stops that far out are rarely picked.
export function assembleRings(ways: (LatLng | null)[][]): Ring[] {
  const unused = ways.map((w) => w.filter((p): p is LatLng => p !== null)).filter((w) => w.length >= 2);
  const rings: Ring[] = [];
  while (unused.length > 0) {
    let ring = unused.shift()!;
    for (;;) {
      if (ring.length > 2 && sameCoord(ring[0], ring[ring.length - 1])) break;
      const end = ring[ring.length - 1];
      const head = ring[0];
      const i = unused.findIndex(
        (w) =>
          sameCoord(w[0], end) ||
          sameCoord(w[w.length - 1], end) ||
          sameCoord(w[0], head) ||
          sameCoord(w[w.length - 1], head),
      );
      if (i < 0) break; // open: pointInRing closes it with a chord
      const [w] = unused.splice(i, 1);
      if (sameCoord(w[0], end)) ring = [...ring, ...w.slice(1)];
      else if (sameCoord(w[w.length - 1], end)) ring = [...ring, ...w.slice(0, -1).reverse()];
      else if (sameCoord(w[w.length - 1], head)) ring = [...w.slice(0, -1), ...ring];
      else ring = [...w.slice(1).reverse(), ...ring];
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

// Shortest distance in metres from `p` to a polyline.
export function distanceToLineMeters(p: LatLng, line: LatLng[]): number {
  if (line.length === 0) return Infinity;
  const pts = line.map((q) => toLocalMeters(p, q));
  if (pts.length === 1) return Math.hypot(pts[0].x, pts[0].y);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2));
    best = Math.min(best, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return best;
}

// Whether a path through `at`, arriving from `prev` and leaving to `next`, crosses the roads that meet at `at`.
// `roadNeighbours` are the next road vertices along each road from `at`; together they split the ground around `at`
// into sectors, and the path crosses when it arrives and leaves in different sectors. A road that ends at `at` gives a
// single direction; it is extended through `at`, so walking across its mouth counts as crossing it.
export function crossesRoadsAt(at: LatLng, prev: LatLng, next: LatLng, roadNeighbours: LatLng[]): boolean {
  const TAU = 2 * Math.PI;
  const angle = (p: LatLng) => {
    const v = toLocalMeters(at, p);
    return (Math.atan2(v.y, v.x) + TAU) % TAU;
  };
  const rays = roadNeighbours.map(angle);
  if (rays.length === 0) return false;
  if (rays.length === 1) rays.push((rays[0] + Math.PI) % TAU);
  rays.sort((a, b) => a - b);
  const sector = (a: number) => rays.filter((r) => r < a).length % rays.length;
  return sector(angle(prev)) !== sector(angle(next));
}
