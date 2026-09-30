// Shared pieces of the stage 2 route simulation (docs/research/route-safety.md §5): the five test areas, the seeded
// random numbers that make a run reproducible, and the shape of one line in results.jsonl.
import type { LatLng, RouteRejection } from "../../packages/core/src/index.ts";
import type { SeasonNote, WalkLight } from "../../packages/core/src/daylight.ts";

export const USER_AGENT = "Wannadoo-route-sim/0.1 (admin@wannadoo.app)";

// Jittered starts land anywhere within this many metres of the area's point.
export const JITTER_METERS = 300;
export const STARTS_PER_AREA = 40;
// Give up drawing starts for an area after this many draws, in case most land off any public way.
export const MAX_DRAWS_PER_AREA = 120;

export type AreaId = "old-town" | "purvciems" | "sarkandaugava" | "kipsala" | "ligatne";

export type Area = { id: AreaId; name: string; center: LatLng; stresses: string };

// route-safety.md §5, "Start points".
export const AREAS: Area[] = [
  {
    id: "old-town",
    name: "Central Riga, Old Town",
    center: { lat: 56.9496, lng: 24.1052 },
    stresses: "Dense stops, churches and memorials (H14), 11. novembra krastmala and Krasta iela (H1)",
  },
  {
    id: "purvciems",
    name: "Residential suburb, Purvciems",
    center: { lat: 56.957, lng: 24.199 },
    stresses: "Wide boulevards between housing blocks (H1), few named stops, fallback points",
  },
  {
    id: "sarkandaugava",
    name: "Industrial edge, Sarkandaugava",
    center: { lat: 57.0015, lng: 24.1195 },
    stresses: "Freeport land, rail yards, private grounds (H5, H7)",
  },
  {
    id: "kipsala",
    name: "Riverside, Ķīpsala",
    center: { lat: 56.954, lng: 24.083 },
    stresses: "Daugava embankments, piers, the Vanšu bridge approaches (H1, H3)",
  },
  {
    id: "ligatne",
    name: "Rural village, Līgatne",
    center: { lat: 57.233, lng: 25.038 },
    stresses: "Gauja sandstone cliffs, forest tracks, a river ferry, roads without pavements (H2, H8, H9)",
  },
];

// The second pass: the riverside and rural starts again, on a January day at 17:00 Riga time (EET, UTC+2), for the
// ice and darkness rules.
export const JANUARY_AREAS: AreaId[] = ["kipsala", "ligatne"];
export const JANUARY_WHEN = "2027-01-15T17:00:00+02:00";

export type Pass = "main" | "january";

export type SimStop = { id: string; name: string; lat: number; lng: number; label: string; quiet: boolean };

// One line of results.jsonl. `status` is "discarded" when the start sat too far from any public way.
export type StartRecord = {
  key: string;
  pass: Pass;
  area: AreaId;
  draw: number;
  start: LatLng;
  // Metres from the jittered start to the nearest walkable way, from the router's nearest service.
  snapMeters: number;
  status: "discarded" | "ok" | "failed";
  finishedAt: string;
  error?: string;
  // Route requests seen on the wire for this start (the generator's own count is lost when it throws).
  routerCallsObserved?: number;
  overpassCallsObserved?: number;
  // From GeneratedRoute, when status is "ok".
  routerCalls?: number;
  rural?: boolean;
  rejections?: RouteRejection[];
  stopCount?: number;
  distanceMeters?: number;
  distanceEstimated?: boolean;
  durationMinutes?: number;
  // Slots (1 to 5) holding a quiet stop.
  quietSlots?: number[];
  stops?: SimStop[];
  path?: [number, number][];
  // January pass only: the pre-quest light and season outcome for the start at JANUARY_WHEN.
  when?: string;
  walkLight?: WalkLight;
  seasonNote?: SeasonNote | null;
};

// FNV-1a, so a text seed turns into a 32-bit number.
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32: small, fast, and good enough to scatter test starts.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rngFor = (...parts: (string | number)[]) => mulberry32(hashString(parts.join(":")));

// A point `north` and `east` metres from `from`.
export function offsetMeters(from: LatLng, north: number, east: number): LatLng {
  return {
    lat: from.lat + north / 111320,
    lng: from.lng + east / (111320 * Math.cos((from.lat * Math.PI) / 180)),
  };
}

// A uniformly random point within `radius` metres of `center`, rounded to about 10 cm.
export function jitter(center: LatLng, radius: number, rng: () => number): LatLng {
  const r = radius * Math.sqrt(rng());
  const theta = 2 * Math.PI * rng();
  const p = offsetMeters(center, r * Math.sin(theta), r * Math.cos(theta));
  return { lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) };
}

export function shuffled<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
