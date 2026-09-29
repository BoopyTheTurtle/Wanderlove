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
  return {
    id: stop.id,
    name: stop.name,
    lat: stop.lat,
    lng: stop.lng,
    radiusMeters: stop.radiusMeters,
    eyebrow: stop.eyebrow,
    prompt: stop.prompt,
    image: stop.image,
  };
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
  return {
    id,
    name,
    lat,
    lng,
    radiusMeters,
    eyebrow: str(value.eyebrow),
    prompt: str(value.prompt),
    image: str(value.image),
  };
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
