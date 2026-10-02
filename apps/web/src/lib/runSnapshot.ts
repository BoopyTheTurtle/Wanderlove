import type { Stop, Trail } from "@wannadoo/core";

// The copy of a trail a run keeps on the server. It lists fields to keep rather than fields to drop, so a new
// Trail field stays on the phone until someone adds it here. `start` and `path` never go: they can reveal a home.
export type RunSnapshot = {
  kind?: Trail["kind"];
  name: string;
  location: string;
  description: string;
  curatorPick?: boolean;
  durationMinutes: number;
  stopCount: number;
  coverImage: string;
  distanceMeters?: number;
  distanceEstimated?: boolean;
  stops: Stop[];
};

function toStop(stop: Stop): Stop {
  const kept: Stop = {
    id: stop.id,
    name: stop.name,
    lat: stop.lat,
    lng: stop.lng,
    radiusMeters: stop.radiusMeters,
    eyebrow: stop.eyebrow,
    prompt: stop.prompt,
    image: stop.image,
  };
  // Only a quiet stop carries the flag, so runs sealed before it existed read the same as ordinary ones.
  if (stop.quiet) kept.quiet = true;
  return kept;
}

// The trail as JSON for `trail_runs.trail_snapshot`. The trail's ID travels separately, as `trail_id`.
export function toRunSnapshot(trail: Trail): RunSnapshot {
  const snapshot: RunSnapshot = {
    name: trail.name,
    location: trail.location,
    description: trail.description,
    durationMinutes: trail.durationMinutes,
    stopCount: trail.stopCount,
    coverImage: trail.coverImage,
    stops: trail.stops.map(toStop),
  };
  if (trail.kind !== undefined) snapshot.kind = trail.kind;
  if (trail.curatorPick !== undefined) snapshot.curatorPick = trail.curatorPick;
  if (trail.distanceMeters !== undefined) snapshot.distanceMeters = trail.distanceMeters;
  if (trail.distanceEstimated !== undefined) snapshot.distanceEstimated = trail.distanceEstimated;
  return snapshot;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseStop(value: unknown, index: number): Stop {
  if (!isObject(value)) throw new Error(`Run snapshot stop ${index} is not an object`);
  const { id, name, lat, lng, radiusMeters } = value;
  if (typeof id !== "string" || id === "") throw new Error(`Run snapshot stop ${index} has no id`);
  if (typeof name !== "string") throw new Error(`Run snapshot stop ${id} has no name`);
  if (!isNumber(lat) || !isNumber(lng)) throw new Error(`Run snapshot stop ${id} has no position`);
  if (!isNumber(radiusMeters) || radiusMeters <= 0) throw new Error(`Run snapshot stop ${id} has no radius`);
  const stop: Stop = {
    id,
    name,
    lat,
    lng,
    radiusMeters,
    eyebrow: str(value.eyebrow),
    prompt: str(value.prompt),
    image: str(value.image),
  };
  if (value.quiet === true) stop.quiet = true;
  return stop;
}

// Rebuilds a Trail from a stored snapshot. Throws when the stops are missing or malformed; the display fields fall
// back to empty values, since a run stays walkable without them.
export function fromRunSnapshot(json: unknown, trailId: string): Trail {
  if (!isObject(json)) throw new Error("Run snapshot is not an object");
  if (!Array.isArray(json.stops) || json.stops.length === 0) throw new Error("Run snapshot has no stops");
  const stops = json.stops.map(parseStop);

  const trail: Trail = {
    id: trailId,
    name: str(json.name),
    location: str(json.location),
    description: str(json.description),
    durationMinutes: isNumber(json.durationMinutes) ? json.durationMinutes : 0,
    stopCount: isNumber(json.stopCount) ? json.stopCount : stops.length,
    coverImage: str(json.coverImage),
    stops,
  };
  if (json.kind === "curated" || json.kind === "surprise") trail.kind = json.kind;
  if (typeof json.curatorPick === "boolean") trail.curatorPick = json.curatorPick;
  if (isNumber(json.distanceMeters)) trail.distanceMeters = json.distanceMeters;
  if (typeof json.distanceEstimated === "boolean") trail.distanceEstimated = json.distanceEstimated;
  return trail;
}

// ---- Private trails (docs/private-trails.md, section 1) ----------------------------------------------------------

// A private trail's stop IDs: "s1".."sN" in trail order. Completions and photos key on them, so the server learns only
// that a couple reached their third stop, never which place it was.
export function sealedStopId(index: number): string {
  return `s${index + 1}`;
}

// The trail as a private run keeps it: every stop renamed to its position. The trail's own ID stays, inside the
// sealed details, so the phone still tells the Sherlock quest from a surprise route.
export function withSealedStopIds(trail: Trail): Trail {
  return { ...trail, stops: trail.stops.map((stop, i) => ({ ...stop, id: sealedStopId(i) })) };
}

// What a private run seals as its details: the snapshot, with the trail's ID and anonymous stop IDs. Like the
// snapshot, it never holds `start` or `path`.
export type RunDetails = RunSnapshot & { v: 1; id: string };

export function toRunDetails(trail: Trail): RunDetails {
  return { v: 1, id: trail.id, ...toRunSnapshot(withSealedStopIds(trail)) };
}

export function fromRunDetails(json: unknown): Trail {
  if (!isObject(json) || typeof json.id !== "string") throw new Error("Run details have no trail ID");
  return fromRunSnapshot(json, json.id);
}

// What a private run keeps once the monthly trim drops its details: the trail name and stop names, never a place.
export type RunSummary = {
  v: 1;
  trailId: string;
  kind?: Trail["kind"];
  name: string;
  durationMinutes: number;
  stops: string[];
  // Positions (0-based) of the quiet stops, so the album still treats them gently; absent when there are none.
  quietStops?: number[];
  // The local day the walk started, YYYY-MM-DD.
  startedOn: string;
};

export function toRunSummary(trail: Trail, startedAt = new Date()): RunSummary {
  const day = [startedAt.getFullYear(), startedAt.getMonth() + 1, startedAt.getDate()]
    .map((n) => String(n).padStart(2, "0"))
    .join("-");
  const summary: RunSummary = {
    v: 1,
    trailId: trail.id,
    name: trail.name,
    durationMinutes: trail.durationMinutes,
    stops: trail.stops.map((s) => s.name),
    startedOn: day,
  };
  if (trail.kind !== undefined) summary.kind = trail.kind;
  const quietStops = trail.stops.flatMap((s, i) => (s.quiet ? [i] : []));
  if (quietStops.length) summary.quietStops = quietStops;
  return summary;
}

// A Trail from a summary alone: the names, and stops without a place (lat 0, lng 0), so it shows in Activity and the
// album but has no map.
export function fromRunSummary(json: unknown): Trail {
  if (!isObject(json) || !Array.isArray(json.stops) || json.stops.length === 0) {
    throw new Error("Run summary has no stops");
  }
  const quiet = new Set(Array.isArray(json.quietStops) ? json.quietStops : []);
  const stops: Stop[] = json.stops.map((name: unknown, i: number) => {
    const stop: Stop = {
      id: sealedStopId(i),
      name: str(name),
      lat: 0,
      lng: 0,
      radiusMeters: 1,
      eyebrow: "",
      prompt: "",
      image: "",
    };
    if (quiet.has(i)) stop.quiet = true;
    return stop;
  });
  const trail: Trail = {
    id: str(json.trailId, "private"),
    name: str(json.name),
    location: "",
    description: "",
    durationMinutes: isNumber(json.durationMinutes) ? json.durationMinutes : 0,
    stopCount: stops.length,
    coverImage: "",
    stops,
  };
  if (json.kind === "curated" || json.kind === "surprise") trail.kind = json.kind;
  return trail;
}
