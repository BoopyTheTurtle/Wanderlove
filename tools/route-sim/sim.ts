// Runs the simulated starts (route-safety.md §5): draws the jittered starts, discards those off any public way,
// generates a route from each, and appends one line per start to results.jsonl. A rerun skips every start already
// in the file, so an interrupted run resumes where it stopped.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { LatLng } from "../../packages/core/src/index.ts";
import { clearPlaceCache, generateRoute } from "../../packages/core/src/index.ts";
import { seasonNote, walkLight } from "../../packages/core/src/daylight.ts";
import { SNAP_LIMIT_METERS } from "../../packages/core/src/safety/routeChecks.ts";
import type { AreaId, Pass, StartRecord } from "./lib.ts";
import {
  AREAS,
  JANUARY_AREAS,
  JANUARY_WHEN,
  JITTER_METERS,
  MAX_DRAWS_PER_AREA,
  USER_AGENT,
  hashString,
  jitter,
  rngFor,
} from "./lib.ts";
import type { FetchLike, Pacer } from "./pacer.ts";
import { createPacer } from "./pacer.ts";

const ROUTER = "https://routing.openstreetmap.de/routed-foot";
// Assumed walk length for the daylight outcome when the January start produced no route.
const NOMINAL_MINUTES = 60;

export type SimOptions = {
  resultsFile: string;
  seed: string;
  perArea: number;
  startGapMs: number;
  base: FetchLike;
  // Logs one line per start; the self-check silences it.
  log?: (line: string) => void;
};

// A network failure stops the run instead of being recorded, so the rerun retries those starts.
export class NetworkAbort extends Error {}

export function readResults(file: string): StartRecord[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as StartRecord);
}

async function snapDistance(pacer: Pacer, start: LatLng): Promise<number> {
  const url = `${ROUTER}/nearest/v1/driving/${start.lng.toFixed(6)},${start.lat.toFixed(6)}?number=1`;
  try {
    const res = await pacer.fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { waypoints?: { distance?: number }[] };
    const d = body.waypoints?.[0]?.distance;
    if (typeof d !== "number") throw new Error("no waypoint in the answer");
    return d;
  } catch (e) {
    throw new NetworkAbort(`The router's nearest service failed (${(e as Error).message}).`);
  }
}

type Draft = Pick<StartRecord, "key" | "pass" | "area" | "draw" | "start" | "snapMeters">;

async function simulate(pacer: Pacer, seed: string, draft: Draft): Promise<StartRecord> {
  clearPlaceCache();
  await pacer.beginStart(hashString(draft.key) % 2 === 1);
  const since = pacer.log.length;
  // Seed the generator's random choices too, so a rerun on the same OSM data draws the same loops.
  const random = Math.random;
  Math.random = rngFor(seed, draft.key, "generator");
  let record: StartRecord;
  try {
    const route = await generateRoute(draft.start, false, { headers: { "User-Agent": USER_AGENT } });
    const { trail } = route;
    record = {
      ...draft,
      status: "ok",
      finishedAt: new Date().toISOString(),
      routerCalls: route.routerCalls,
      rural: route.rural,
      rejections: route.rejections,
      stopCount: trail.stops.length,
      distanceMeters: trail.distanceMeters,
      distanceEstimated: trail.distanceEstimated,
      durationMinutes: trail.durationMinutes,
      quietSlots: trail.stops.flatMap((s, i) => (s.quiet ? [i + 1] : [])),
      stops: trail.stops.map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        label: s.eyebrow.split(" — ")[1] ?? "",
        quiet: s.quiet === true,
      })),
      path: trail.path,
    };
  } catch (e) {
    const message = (e as Error).message;
    if (/^Couldn't reach/.test(message)) throw new NetworkAbort(message);
    record = { ...draft, status: "failed", finishedAt: new Date().toISOString(), error: message };
  } finally {
    Math.random = random;
  }
  record.routerCallsObserved = pacer.count("route", since);
  record.overpassCallsObserved = pacer.count("overpass", since);
  if (draft.pass === "january") {
    // The generator takes no date yet, so record what the pre-quest screen would show at JANUARY_WHEN.
    const when = new Date(JANUARY_WHEN);
    record.when = JANUARY_WHEN;
    record.walkLight = walkLight(when, draft.start, record.durationMinutes ?? NOMINAL_MINUTES);
    record.seasonNote = seasonNote(when);
  }
  return record;
}

const describe = (r: StartRecord) =>
  r.status === "ok"
    ? `ok, ${r.distanceMeters} m, ${r.routerCalls} router call(s), ${r.rejections?.length ?? 0} rejection(s)`
    : r.status === "discarded"
      ? `discarded, ${r.snapMeters.toFixed(0)} m from a path`
      : `failed: ${r.error}`;

export async function runSimulation(options: SimOptions): Promise<{ added: number; pacer: Pacer }> {
  const { resultsFile, seed, perArea, log = console.log } = options;
  mkdirSync(dirname(resultsFile), { recursive: true });
  const done = new Map(readResults(resultsFile).map((r) => [r.key, r]));
  const pacer = createPacer(options.base, options.startGapMs);
  const original = globalThis.fetch;
  globalThis.fetch = pacer.fetch as typeof fetch;
  let added = 0;

  const save = (record: StartRecord) => {
    appendFileSync(resultsFile, JSON.stringify(record) + "\n");
    done.set(record.key, record);
    added++;
    log(`${record.key.padEnd(28)} ${describe(record)}`);
  };

  try {
    // Main pass: draw jittered starts until the area has `perArea` on a public way. The draw sequence depends only
    // on the seed and the area, so skipped (already done) draws still advance it.
    const accepted = new Map<AreaId, Draft[]>();
    for (const area of AREAS) {
      const rng = rngFor(seed, area.id);
      const list: Draft[] = [];
      for (let draw = 0; list.length < perArea && draw < MAX_DRAWS_PER_AREA; draw++) {
        const start = jitter(area.center, JITTER_METERS, rng);
        const key = `main:${area.id}:${draw}`;
        const pass: Pass = "main";
        let record = done.get(key);
        if (!record) {
          const snapMeters = await snapDistance(pacer, start);
          const draft: Draft = { key, pass, area: area.id, draw, start, snapMeters };
          record =
            snapMeters > SNAP_LIMIT_METERS
              ? { ...draft, status: "discarded", finishedAt: new Date().toISOString() }
              : await simulate(pacer, seed, draft);
          save(record);
        }
        if (record.status !== "discarded") list.push(record);
      }
      if (list.length < perArea) log(`${area.id}: only ${list.length} of ${perArea} starts sit on a public way`);
      accepted.set(area.id, list);
    }

    // January pass: the same riverside and rural starts again.
    for (const areaId of JANUARY_AREAS) {
      for (const main of accepted.get(areaId) ?? []) {
        const key = `january:${areaId}:${main.draw}`;
        if (done.has(key)) continue;
        const { draw, start, snapMeters } = main;
        save(await simulate(pacer, seed, { key, pass: "january", area: areaId, draw, start, snapMeters }));
      }
    }
  } finally {
    globalThis.fetch = original;
    clearPlaceCache();
  }
  return { added, pacer };
}
