import type { Stop, Trail } from "./trail";
import type { LatLng } from "./geo";
import { haversineDistanceMeters } from "./geo";
import { classifyGeneric, classifyNamed, isQuietTags, tagRejection } from "./safety/filters";
import type { Kind } from "./safety/filters";
import { buildHazardIndex, checkContainment, timedHazards } from "./safety/hazards";
import type { HazardIndex } from "./safety/hazards";
import { civilTwilight, seasonNote } from "./daylight";
import { isExcluded } from "./safety/exclusions";
import { MAX_QUIET_STOPS, orderStops } from "./safety/quiet";
import { createRateLimiter } from "./safety/rateLimit";
import { overpassQuery, positionOf, splitSections } from "./safety/overpass";
import type { OsmElement, OverpassSections } from "./safety/overpass";
import { buildRoadNetwork, checkRoute, parseOsrmRoute } from "./safety/routeChecks";
import type { OsrmResponse, RoadNetwork, RoutedLoop } from "./safety/routeChecks";

// Generates a random five-stop walking loop from the user's position:
// candidate stops come from OpenStreetMap (Overpass), pass the safety filters in docs/research/route-safety.md, and
// the routed path from the FOSSGIS foot router is checked before the loop is offered.

// The loop's target length, return included. A routed loop may run ROUTE_SLACK_METERS over it (2.1 km by default):
// real paths rarely match the straight-line estimate exactly, and rejecting a 2,040 m loop would cost a router call.
export const MAX_ROUTE_METERS = 2000;
export const ROUTE_SLACK_METERS = 100;
export const STOP_COUNT = 5;
// The FOSSGIS router allows one request a second and forbids heavy use (route-safety.md §3). Twelve calls take about
// 13 s at worst; the stage 2 simulation lost most failed starts to the earlier cap of eight.
export const MAX_ROUTER_CALLS = 12;
const ROUTER_INTERVAL_MS = 1000;

const SEARCH_RADIUS = 900;
const CACHE_RADIUS = 250;
const MIN_STOP_DISTANCE = 120; // from the start, so the first stop isn't the doorstep
const MIN_STOP_SPACING = 90;
// Street-corner stops (the last resort in places with too few mapped sights): scattered on these fractions of the
// straight-line budget around the start, then moved by the router onto the nearest path. One farther than
// SPOT_SNAP_METERS from any path is dropped.
const SPOT_RINGS = [0.18, 0.28, 0.38];
const SPOT_DIRECTIONS = 12;
const SPOT_SNAP_METERS = 150;
const SPOT_LABEL = "Street corner";
const FILL_ATTEMPTS = 30;
// Walking distance ≈ straight line × this, for the first guess at a loop. The stage 2 simulation measured 1.56 as the
// median (1.41 in Riga's Old Town, 1.72 on Ķīpsala); 1.3 made nearly every first loop too long.
const WALK_FACTOR = 1.5;
const WALK_METERS_PER_MIN = 75;
const MINUTES_PER_STOP = 6;

const SAFE_LOOP_ERROR = "Couldn't find a safe loop here. Try again, or move somewhere with more to see.";
const ROUTER_ERROR = "Couldn't reach the walking router to check this loop. Check your connection and try again.";
const TOO_FEW_ERROR = "Couldn't find walkable streets around you. Try again from a street or path.";

// A start on closed land fails at once, with the reason (mvp-roadmap.md, open question 4): the paths out of a port, a
// rail yard, or a building site are its own service roads, so no safe loop may exist. Water is left out, since a
// start on a bridge sits inside the river's area.
const CLOSED_START: Record<string, string> = {
  "H5-closed": "industrial, military, or private grounds",
  "H7-railway": "railway land",
  "H6-construction": "a building site",
  "H8-quarry": "a quarry",
};
// No safe loop within the router-call cap, or no candidates left to try. Carries what the search rejected, for the
// simulation script.
export class NoSafeLoopError extends Error {
  constructor(
    public routerCalls: number,
    public rejections: RouteRejection[],
  ) {
    super(SAFE_LOOP_ERROR);
  }
}

export class ClosedStartError extends Error {
  constructor(public reason: string) {
    super(
      `You're on ${CLOSED_START[reason]}, where we can't plan a safe walk. Head out to a public street and try again.`,
    );
  }
}

// Two public Overpass servers. The main one often answers "too busy" (504), so each query starts on one at random
// and brings in the other when the first is slow or fails (queryOverpass). vercel.json's connect-src lists both.
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];
const OVERPASS_HEDGE_MS = 4000; // ask the second server too when the first hasn't answered by then
const OVERPASS_TIMEOUT_MS = 25000; // per round, across both servers
const OVERPASS_ROUNDS = 2;
const OVERPASS_RETRY_PAUSE_MS = 2000;
const FOOT_ROUTER = "https://routing.openstreetmap.de/routed-foot/route/v1/driving";

const PROMPT_WARMUP = "What's a small thing about this place you'd never have noticed if we'd just walked past?";
const PROMPT_FINAL = "What does a meaningful life look like to you right now — has the answer changed lately?";
const PROMPT_BANK = [
  "What's a hobby you've picked up recently, or one you keep wishing you had time for?",
  "What's a decision — big or small — that quietly changed the direction of your life?",
  "What's a compliment someone gave you that's stuck with you for years?",
  "If you could bottle one feeling from our time together, which one would it be?",
  "Who's someone who shaped the person you are, that I've never really heard much about?",
  "What's something you believed as a kid that you secretly still half-believe?",
  "Which moment of the last month would you happily live through again?",
  "What's a place you'd love us to see together, and why that one?",
  "What's something you're quietly proud of that you rarely talk about?",
  "If today were the first page of a story about us, what would the title be?",
  "What's a small ritual of ours you'd miss most if it disappeared?",
  "What's one thing you'd like to get braver about this year?",
];

// `ice` and `darkPark` are the time-dependent rules (H4, H10), applied per call since the places are cached.
// `spot`: a street-corner stop whose position waits for the router to put it on a path.
type Candidate = LatLng &
  Kind & { id: string; name: string; quiet: boolean; ice: boolean; darkPark: boolean; spot?: boolean };

export type RouteOptions = {
  // Target loop length in metres; "Shorter loop" passes less than the default.
  maxMeters?: number;
  // Extra request headers for Overpass and the router. Browsers send a User-Agent themselves; a Node script must set
  // one, or Overpass answers 406.
  headers?: Record<string, string>;
  // When the walk starts: the month decides the thin-ice rule (H4), civil dusk at the start the dark-park rule (H10).
  // Defaults to now.
  when?: Date;
};

export type RouteRejection = { stopId: string; reason: string };

export type GeneratedRoute = {
  trail: Trail;
  approximateStart: boolean;
  // Part of the loop follows roads faster than 50 km/h (route-safety.md H2); the app shows the rural-road note.
  rural: boolean;
  // For the simulation script: router calls used, and each stop dropped with its reason (an H-number or "length").
  // Candidates dropped for the time of the walk (H4-ice, H10-dark-park) come first, before any router call.
  routerCalls: number;
  rejections: RouteRejection[];
};

// --- Places -----------------------------------------------------------------

type PlaceData = { named: Candidate[]; generic: Candidate[]; network: RoadNetwork; hazards: HazardIndex };

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

let placeCache: { center: LatLng; data: PlaceData } | null = null;
let inflight: { center: LatLng; promise: Promise<PlaceData> } | null = null;

// Drops the cached places, hazards, and roads, which reveal roughly where the user started. Call it on sign-out.
export function clearPlaceCache(): void {
  placeCache = null;
  inflight = null;
}

// Nearby places change rarely, so reuse them (with the hazards and roads) while the user stays within 250 m,
// and share one request between concurrent callers (Overpass rate-limits per IP).
function fetchPlaces(center: LatLng, headers?: Record<string, string>): Promise<PlaceData> {
  if (placeCache && haversineDistanceMeters(placeCache.center, center) < CACHE_RADIUS) {
    return Promise.resolve(placeCache.data);
  }
  if (inflight && haversineDistanceMeters(inflight.center, center) < CACHE_RADIUS) return inflight.promise;
  const entry = {
    center,
    promise: loadPlaces(center, headers).finally(() => {
      if (inflight === entry) inflight = null;
    }),
  };
  inflight = entry;
  return entry.promise;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One query to one server: its sections, or null when the server is busy, errs, is aborted, or sends a partial
// answer (a busy server can answer 200 with an XML error page or a cut-off list, so parse defensively).
async function askOverpass(
  endpoint: string,
  data: string,
  signal: AbortSignal,
  headers?: Record<string, string>,
): Promise<OverpassSections | null> {
  try {
    const res = await fetch(endpoint, { method: "POST", body: new URLSearchParams({ data }), headers, signal });
    if (!res.ok) return null;
    return splitSections((JSON.parse(await res.text()) as { elements: OsmElement[] }).elements) ?? null;
  } catch {
    return null;
  }
}

// One round: ask one server, chosen at random to spread the load. If it fails, or hasn't answered within
// OVERPASS_HEDGE_MS, ask the other too, and take the first usable answer. The loser is aborted.
function hedgedOverpass(data: string, headers?: Record<string, string>): Promise<OverpassSections | null> {
  const order = Math.random() < 0.5 ? OVERPASS_ENDPOINTS : [...OVERPASS_ENDPOINTS].reverse();
  const ctl = new AbortController();
  return new Promise((resolve) => {
    let next = 0;
    let pending = 0;
    let settled = false;
    const finish = (sections: OverpassSections | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedgeTimer);
      clearTimeout(deadline);
      ctl.abort();
      resolve(sections);
    };
    const launch = () => {
      if (settled || next >= order.length) return;
      pending++;
      void askOverpass(order[next++], data, ctl.signal, headers).then((sections) => {
        pending--;
        if (sections) return finish(sections);
        launch(); // this server failed: bring in the next one now
        if (pending === 0) finish(null);
      });
    };
    const hedgeTimer = setTimeout(launch, OVERPASS_HEDGE_MS);
    const deadline = setTimeout(() => finish(null), OVERPASS_TIMEOUT_MS);
    launch();
  });
}

async function queryOverpass(center: LatLng, headers?: Record<string, string>): Promise<OverpassSections | null> {
  const data = overpassQuery(center, SEARCH_RADIUS);
  for (let round = 0; round < OVERPASS_ROUNDS; round++) {
    if (round > 0) await sleep(OVERPASS_RETRY_PAUSE_MS);
    const sections = await hedgedOverpass(data, headers);
    if (sections) return sections;
  }
  return null;
}

// Candidate filter, exclusion list, and containment filter, in that order (route-safety.md §2.2).
async function loadPlaces(center: LatLng, headers?: Record<string, string>): Promise<PlaceData> {
  const sections = await queryOverpass(center, headers);
  if (!sections) throw new Error("Couldn't reach the map service. Check your connection and try again.");
  const hazards = buildHazardIndex(sections.hazards);

  const toCandidate = (el: OsmElement, generic: boolean): Candidate | null => {
    const tags = el.tags ?? {};
    const at = positionOf(el);
    const kind = generic ? classifyGeneric(tags) : classifyNamed(tags);
    const name = tags["name:en"] || tags.name || (generic ? kind?.label : undefined);
    if (!at || !kind || !name) return null;
    if (haversineDistanceMeters(center, at) > SEARCH_RADIUS) return null;
    if (tagRejection(tags)) return null;
    if (isExcluded(`${el.type}/${el.id}`, at)) return null;
    const ground = checkContainment(at, hazards, tags);
    if (ground.hazard) return null;
    const quiet = isQuietTags(tags) || ground.quiet;
    if (generic && quiet) return null; // a bench in a cemetery is no place for a game
    return { id: `osm-${el.type}-${el.id}`, name, ...at, ...kind, quiet, ...timedHazards(at, hazards, tags) };
  };

  const seen = new Set<string>();
  const named: Candidate[] = [];
  for (const el of sections.candidates) {
    const c = toCandidate(el, false);
    if (!c || seen.has(c.name.toLowerCase())) continue;
    seen.add(c.name.toLowerCase());
    named.push(c);
  }
  const ids = new Set(named.map((c) => c.id));
  const generic: Candidate[] = [];
  for (const el of sections.generic) {
    const c = toCandidate(el, true);
    if (c && !ids.has(c.id)) generic.push(c);
  }
  const network = buildRoadNetwork(sections.roads, sections.crossings, sections.fords, {
    rails: sections.rails,
    railCrossings: sections.railCrossings,
    service: sections.closedService,
    closedLand: hazards.closedLand,
  });
  const data = { named, generic, network, hazards };
  placeCache = { center, data };
  return data;
}

// --- Loop building ----------------------------------------------------------

function loopLength(start: LatLng, stops: LatLng[]): number {
  const pts = [start, ...stops, start];
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversineDistanceMeters(pts[i - 1], pts[i]);
  return d;
}

// Random key biased by weight (Efraimidis–Spirakis), so landmarks come up more often than artworks.
function weightedShuffle<T extends { weight: number }>(items: T[]): T[] {
  return items
    .map((item, i) => ({ item, i, key: Math.pow(Math.random(), 1 / item.weight) }))
    .sort((a, b) => b.key - a.key || a.i - b.i)
    .map((x) => x.item);
}

// Variety: at most this many of a kind, so a route isn't five street sculptures or five benches.
const KIND_LIMITS: Record<string, number> = {
  Artwork: 1,
  Museum: 1,
  Memorial: 1,
  "Historic spot": 1,
  Bench: 3,
  Café: 1,
  "Ice cream": 1,
  Bakery: 1,
  Library: 1,
  "Street art": 2,
  Tree: 2,
  "Picnic spot": 2,
  "Drinking fountain": 1,
  Shelter: 1,
  "Notice board": 1,
};

// Adds candidates to `loop` by cheapest insertion until it holds five stops, keeping its straight-line length within
// `budgetStraight`. The order of discovery stays random, so every route differs.
function buildLoop(start: LatLng, pool: Candidate[], budgetStraight: number, loop: Candidate[] = []): Candidate[] {
  loop = [...loop];
  for (const cand of weightedShuffle(pool)) {
    if (loop.length >= STOP_COUNT) break;
    if (loop.some((s) => s.id === cand.id || haversineDistanceMeters(s, cand) < MIN_STOP_SPACING)) continue;
    const limit = KIND_LIMITS[cand.label];
    if (limit !== undefined && loop.filter((s) => s.label === cand.label).length >= limit) continue;
    if (cand.quiet && loop.filter((s) => s.quiet).length >= MAX_QUIET_STOPS) continue;
    let best: { at: number; len: number } | null = null;
    for (let at = 0; at <= loop.length; at++) {
      const len = loopLength(start, [...loop.slice(0, at), cand, ...loop.slice(at)]);
      if (!best || len < best.len) best = { at, len };
    }
    if (best && best.len <= budgetStraight) loop.splice(best.at, 0, cand);
  }
  return loop;
}

// The stop whose removal shortens the loop most.
function costliestIndex(start: LatLng, loop: Candidate[]): number {
  let bestIdx = 0;
  let bestLen = Infinity;
  loop.forEach((_, i) => {
    const len = loopLength(
      start,
      loop.filter((__, j) => j !== i),
    );
    if (len < bestLen) {
      bestLen = len;
      bestIdx = i;
    }
  });
  return bestIdx;
}

// Street-corner stops for places the map knows little about: points on rings around the start, off hazard land. Their
// names come later, from the street the router snaps them to.
function scatterSpots(start: LatLng, budgetStraight: number, hazards: HazardIndex): Candidate[] {
  const spots: Candidate[] = [];
  const turn = Math.random() * 2 * Math.PI;
  for (const ring of SPOT_RINGS) {
    const r = Math.max(budgetStraight * ring, MIN_STOP_DISTANCE + 20);
    for (let i = 0; i < SPOT_DIRECTIONS; i++) {
      const angle = turn + (i * 2 * Math.PI) / SPOT_DIRECTIONS + ring; // stagger the rings
      const at = offsetMeters(start, Math.sin(angle) * r, Math.cos(angle) * r);
      if (checkContainment(at, hazards).hazard) continue;
      spots.push({
        id: `spot-${at.lat.toFixed(5)}-${at.lng.toFixed(5)}`,
        name: "A street corner",
        ...at,
        label: SPOT_LABEL,
        weight: 1,
        quiet: false,
        ...timedHazards(at, hazards),
        spot: true,
      });
    }
  }
  return spots;
}

function offsetMeters(p: LatLng, east: number, north: number): LatLng {
  const lat = p.lat + north / 111320;
  const lng = p.lng + east / (111320 * Math.cos((p.lat * Math.PI) / 180));
  return { lat, lng };
}

// Moves each street-corner stop to where the router put it and names it after that street. Returns the index of the
// first stop that can't stay: too far from any path, on hazard land, or on top of another stop.
function placeSpots(loop: Candidate[], routed: RoutedLoop, hazards: HazardIndex): number | null {
  for (let k = 0; k < loop.length; k++) {
    const cand = loop[k];
    if (!cand.spot) continue;
    const snap = routed.snapped[k + 1];
    if (!snap?.at || routed.snapMeters[k + 1] > SPOT_SNAP_METERS) return k;
    if (checkContainment(snap.at, hazards).hazard) return k;
    if (loop.some((s, j) => j !== k && haversineDistanceMeters(s, snap.at!) < MIN_STOP_SPACING)) return k;
    const onSameStreet = snap.street && loop.some((s) => s.name === `On ${snap.street}`);
    const name = !snap.street ? "A quiet corner" : onSameStreet ? `Further along ${snap.street}` : `On ${snap.street}`;
    loop[k] = { ...cand, ...snap.at, name, spot: false };
    routed.snapMeters[k + 1] = 0; // the stop now sits on the path itself
  }
  return null;
}

// --- Router -----------------------------------------------------------------

const routerQueue = createRateLimiter(ROUTER_INTERVAL_MS);

// Routes through `points` on foot, queued at one request a second. Null when the router is unreachable.
function routeOnFoot(points: LatLng[], headers?: Record<string, string>): Promise<RoutedLoop | null> {
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const url = `${FOOT_ROUTER}/${coords}?overview=full&geometries=geojson&steps=true&annotations=nodes`;
  return routerQueue(async () => {
    try {
      const res = await fetchWithTimeout(url, { headers }, 12000);
      if (!res.ok) return null;
      return parseOsrmRoute((await res.json()) as OsrmResponse);
    } catch {
      return null;
    }
  });
}

// --- Public API -------------------------------------------------------------

// Builds a loop of exactly five stops, routes it, and checks the route. A failed check drops the offending stop,
// tops the loop up with another candidate, and reroutes; a loop over the limit loses its costliest stop and the
// search tightens. After MAX_ROUTER_CALLS router calls it gives up.
// When the router is unreachable it fails rather than hand out a loop whose crossings and paths nobody checked.
export async function generateRoute(
  start: LatLng,
  approximateStart: boolean,
  options: RouteOptions = {},
): Promise<GeneratedRoute> {
  const maxMeters = options.maxMeters ?? MAX_ROUTE_METERS;
  const hardCap = maxMeters + ROUTE_SLACK_METERS;
  const data = await fetchPlaces(start, options.headers);
  const ground = checkContainment(start, data.hazards).hazard;
  if (ground && ground in CLOSED_START) throw new ClosedStartError(ground);

  const dropped = new Set<string>();
  const rejections: RouteRejection[] = [];

  // H4 and H10 depend on when the walk starts; the places are cached, so apply them here on every call.
  const when = options.when ?? new Date();
  const winter = seasonNote(when) === "winter";
  const dark = isAfterDusk(when, start);
  for (const c of [...data.named, ...data.generic]) {
    const reason = winter && c.ice ? "H4-ice" : dark && c.darkPark ? "H10-dark-park" : null;
    if (!reason || dropped.has(c.id)) continue;
    dropped.add(c.id);
    rejections.push({ stopId: c.id, reason });
  }

  let budget = maxMeters / WALK_FACTOR;
  let routerCalls = 0;

  // Named places first; everyday points (cafés, benches, parks) top up a loop the named ones can't fill, and street
  // corners fill whatever is left, so a quiet suburb still gets a walk. A random pick can wander off and leave no room
  // for a fifth stop, so try a few; this costs no network. The last stage leaves the named places out: where the only
  // one sits at the edge of reach, every loop that starts with it has no room left.
  const fill = (partial: Candidate[]): Candidate[] | null => {
    const reachable = (c: Candidate) => {
      const d = haversineDistanceMeters(start, c);
      return !dropped.has(c.id) && d > MIN_STOP_DISTANCE && d < budget / 2;
    };
    const named = data.named.filter(reachable);
    const generic = data.generic.filter(reachable);
    const spots = scatterSpots(start, budget, data.hazards)
      .filter((c) => !dropped.has(c.id))
      .map((c) => ({ ...c, ice: c.ice && winter, darkPark: c.darkPark && dark }))
      .filter((c) => !c.ice && !c.darkPark);
    for (const stage of [0, 1, 2, 3]) {
      if (stage === 1 && !generic.length) continue;
      for (let attempt = 0; attempt < FILL_ATTEMPTS; attempt++) {
        let loop = stage < 3 ? buildLoop(start, named, budget, partial) : partial;
        if (stage >= 1) loop = buildLoop(start, generic, budget, loop);
        if (stage >= 2) loop = buildLoop(start, spots, budget, loop);
        if (loop.length === STOP_COUNT) return loop;
      }
    }
    return null;
  };

  const first = fill([]);
  if (!first) throw new Error(TOO_FEW_ERROR);
  let loop: Candidate[] = first;

  for (;;) {
    loop = orderStops(start, loop);
    if (routerCalls >= MAX_ROUTER_CALLS) throw new NoSafeLoopError(routerCalls, rejections);
    routerCalls++;
    const routed = await routeOnFoot([start, ...loop, start], options.headers);

    if (!routed) throw new Error(ROUTER_ERROR);

    const misplaced = placeSpots(loop, routed, data.hazards);
    const verdict = checkRoute(routed, data.network, start, loop);
    let drop: number;
    if (misplaced !== null) {
      drop = misplaced;
      rejections.push({ stopId: loop[drop].id, reason: "spot-off-path" });
    } else if (!verdict.ok) {
      const issue = verdict.issues[0];
      drop = issue.stop;
      rejections.push({ stopId: loop[drop].id, reason: issue.reason });
    } else if (routed.distance > hardCap) {
      // Too long on real paths: tighten the straight-line budget by how much the paths overran, then swap out the
      // stop that costs the most.
      budget = Math.min(budget, loopLength(start, loop) * (maxMeters / routed.distance));
      drop = costliestIndex(start, loop);
      rejections.push({ stopId: loop[drop].id, reason: "length" });
    } else {
      const path = routed.path.map((p) => [p.lat, p.lng] as [number, number]);
      const trail = toTrail(start, loop, routed.distance, path, false);
      return { trail, approximateStart, rural: verdict.rural, routerCalls, rejections };
    }

    dropped.add(loop[drop].id);
    let rest: Candidate[] = loop.filter((_, i) => i !== drop);
    while (rest.length && loopLength(start, rest) > budget) {
      const costliest = costliestIndex(start, rest);
      rest = rest.filter((_, i) => i !== costliest);
    }
    const next: Candidate[] | null = fill(rest) ?? fill([]);
    if (!next) throw new NoSafeLoopError(routerCalls, rejections);
    loop = next;
  }
}

// Whether civil twilight has ended at `at` (route-safety.md H10). A white night never gets that dark.
function isAfterDusk(when: Date, at: LatLng): boolean {
  const civil = civilTwilight(when, at.lat, at.lng);
  if (civil === "always-up") return false;
  if (civil === "always-down") return true;
  return when.getTime() < civil.rise.getTime() || when.getTime() >= civil.set.getTime();
}

function toTrail(
  start: LatLng,
  loop: Candidate[],
  distance: number,
  path: [number, number][],
  estimated: boolean,
): Trail {
  const prompts = [...PROMPT_BANK].sort(() => Math.random() - 0.5);
  const stops: Stop[] = loop.map((c, i) => {
    const n = String(i + 1).padStart(2, "0");
    const isFirst = i === 0;
    const isLast = i === loop.length - 1;
    return {
      id: c.id,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      radiusMeters: 50,
      eyebrow: `Stop ${n} — ${c.label}`,
      prompt: isFirst ? PROMPT_WARMUP : isLast ? PROMPT_FINAL : prompts[i],
      image: `https://picsum.photos/seed/wannadoo-${c.id}/800/600`,
      quiet: c.quiet,
    };
  });
  const km = (distance / 1000).toFixed(1);
  return {
    id: `surprise-${Date.now()}`,
    kind: "surprise",
    name: "Surprise Route",
    location: `${estimated ? "~" : ""}${km} km loop from where you are`,
    description: `${stops.length} spots picked at random near you, looping back to your start. Wander, talk, and collect a photo at each one.`,
    durationMinutes: Math.round(distance / WALK_METERS_PER_MIN + stops.length * MINUTES_PER_STOP),
    stopCount: stops.length,
    coverImage: `https://picsum.photos/seed/wannadoo-${stops[0].id}/800/600`,
    distanceMeters: Math.round(distance),
    distanceEstimated: estimated,
    start,
    path,
    stops,
  };
}

// Adds a real walking line and distance to a hand-made trail; leaves it untouched if routing fails.
export async function withWalkingPath(trail: Trail): Promise<Trail> {
  if (trail.path) return trail;
  const routed = await routeOnFoot(trail.stops);
  if (!routed) return trail;
  const path = routed.path.map((p) => [p.lat, p.lng] as [number, number]);
  return { ...trail, path, distanceMeters: Math.round(routed.distance) };
}

// --- Location ---------------------------------------------------------------

export const FALLBACK_START: LatLng = { lat: 56.9496, lng: 24.1052 }; // Riga Old Town
