import type { Stop, Trail } from "../data/trail";
import type { LatLng } from "./geo";
import { haversineDistanceMeters } from "./geo";

// Generates a random walking loop from the user's position:
// candidate stops come from OpenStreetMap (Overpass), the loop length is checked
// against real walking distance from the FOSSGIS foot router.

export const MAX_ROUTE_METERS = 2600;
const MIN_STOPS = 4;
const MAX_STOPS = 6;
const SEARCH_RADIUS = 900;
const WALK_FACTOR = 1.3; // walking distance ≈ straight line × this, used for pre-filtering
const WALK_METERS_PER_MIN = 75;
const MINUTES_PER_STOP = 6;

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
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

type Candidate = LatLng & { id: string; name: string; label: string; weight: number };

export type GeneratedRoute = { trail: Trail; approximateStart: boolean };

// --- Places -----------------------------------------------------------------

type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function classify(tags: Record<string, string>): { label: string; weight: number } | null {
  if (tags.memorial === "plaque" || tags.memorial === "stolperstein" || tags.artwork_type === "plaque") return null;
  if (tags.tourism === "viewpoint") return { label: "Viewpoint", weight: 4 };
  if (tags.tourism === "attraction") return { label: "Landmark", weight: 4 };
  if (tags.historic === "castle") return { label: "Castle", weight: 4 };
  if (tags.historic === "monument") return { label: "Monument", weight: 3 };
  if (tags.amenity === "place_of_worship" || tags.historic === "church") return { label: "Church", weight: 3 };
  if (tags.leisure === "park" || tags.leisure === "garden") return { label: "Park", weight: 3 };
  if (tags.amenity === "fountain") return { label: "Fountain", weight: 2 };
  if (tags.tourism === "artwork") return { label: "Artwork", weight: 2 };
  if (tags.tourism === "museum" || tags.tourism === "gallery") return { label: "Museum", weight: 2 };
  if (tags.amenity === "marketplace") return { label: "Market", weight: 2 };
  if (tags.historic === "ruins" || tags.historic === "building") return { label: "Historic spot", weight: 2 };
  if (tags.historic === "memorial") return { label: "Memorial", weight: 1 };
  return null;
}

// A bounding box is far cheaper for Overpass than an "around" filter; exact distance is checked afterwards.
function overpassQuery({ lat, lng }: LatLng): string {
  const dLat = SEARCH_RADIUS / 111320;
  const dLng = SEARCH_RADIUS / (111320 * Math.cos((lat * Math.PI) / 180));
  const bbox = [lat - dLat, lng - dLng, lat + dLat, lng + dLng].map((n) => n.toFixed(5)).join(",");
  return `[out:json][timeout:20][bbox:${bbox}];(
    nwr[name][tourism~"^(attraction|viewpoint|artwork|museum|gallery)$"];
    nwr[name][historic~"^(monument|memorial|castle|church|ruins|building)$"];
    nwr[name][amenity~"^(place_of_worship|fountain|marketplace)$"];
    nwr[name][leisure~"^(park|garden)$"];
  );out tags center 400;`;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

let placeCache: { center: LatLng; places: Candidate[] } | null = null;
let inflight: { center: LatLng; promise: Promise<Candidate[]> } | null = null;

// Nearby places change rarely, so reuse them while the user stays within 250 m,
// and share one request between concurrent callers (Overpass rate-limits per IP).
function fetchPlaces(center: LatLng): Promise<Candidate[]> {
  if (placeCache && haversineDistanceMeters(placeCache.center, center) < 250) return Promise.resolve(placeCache.places);
  if (inflight && haversineDistanceMeters(inflight.center, center) < 250) return inflight.promise;
  const promise = loadPlaces(center).finally(() => {
    inflight = null;
  });
  inflight = { center, promise };
  return promise;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function queryOverpass(center: LatLng): Promise<OsmElement[] | null> {
  const body = () => new URLSearchParams({ data: overpassQuery(center) });
  for (const [i, endpoint] of OVERPASS_ENDPOINTS.entries()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetchWithTimeout(endpoint, { method: "POST", body: body() }, i === 0 ? 20000 : 12000);
        if (res.status === 429 || res.status === 504) {
          await sleep(1500);
          continue; // busy: one retry on the same server
        }
        if (!res.ok) break;
        // A busy server can answer 200 with an XML error page, so parse defensively.
        return (JSON.parse(await res.text()) as { elements: OsmElement[] }).elements;
      } catch {
        break; // timeout or network error: try the next server
      }
    }
  }
  return null;
}

async function loadPlaces(center: LatLng): Promise<Candidate[]> {
  const elements = await queryOverpass(center);
  if (!elements) throw new Error("Couldn't reach the map service. Check your connection and try again.");

  const seen = new Set<string>();
  const places: Candidate[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const name = tags["name:en"] || tags.name;
    const kind = classify(tags);
    if (lat === undefined || lng === undefined || !name || !kind) continue;
    if (haversineDistanceMeters(center, { lat, lng }) > SEARCH_RADIUS) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({ id: `osm-${el.type}-${el.id}`, name, lat, lng, ...kind });
  }
  placeCache = { center, places };
  return places;
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
    .map((item) => ({ item, key: Math.pow(Math.random(), 1 / item.weight) }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.item);
}

const MINOR_KINDS = new Set(["Artwork", "Museum", "Memorial", "Historic spot"]);

function buildLoop(start: LatLng, places: Candidate[], budgetStraight: number): Candidate[] {
  const pool = weightedShuffle(
    places.filter((p) => haversineDistanceMeters(start, p) > 120 && haversineDistanceMeters(start, p) < budgetStraight / 2),
  );
  const loop: Candidate[] = [];
  for (const cand of pool) {
    if (loop.length >= MAX_STOPS) break;
    if (loop.some((s) => haversineDistanceMeters(s, cand) < 90)) continue;
    // Variety: at most one of each minor kind, so a route isn't five street sculptures.
    if (MINOR_KINDS.has(cand.label) && loop.some((s) => s.label === cand.label)) continue;
    // cheapest insertion keeps the loop compact while the order of discovery stays random
    let best: { at: number; len: number } | null = null;
    for (let at = 0; at <= loop.length; at++) {
      const trial = [...loop.slice(0, at), cand, ...loop.slice(at)];
      const len = loopLength(start, trial);
      if (!best || len < best.len) best = { at, len };
    }
    if (best && best.len <= budgetStraight) loop.splice(best.at, 0, cand);
  }
  return loop;
}

type RoutedPath = { distance: number; path: [number, number][] };

async function routeOnFoot(points: LatLng[]): Promise<RoutedPath | null> {
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  try {
    const res = await fetchWithTimeout(`${FOOT_ROUTER}/${coords}?overview=full&geometries=geojson`, {}, 12000);
    if (!res.ok) return null;
    const json = (await res.json()) as { routes?: { distance: number; geometry: { coordinates: [number, number][] } }[] };
    const r = json.routes?.[0];
    if (!r) return null;
    return { distance: r.distance, path: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]) };
  } catch {
    return null;
  }
}

// --- Public API -------------------------------------------------------------

export async function generateRoute(start: LatLng, approximateStart: boolean): Promise<GeneratedRoute> {
  const places = await fetchPlaces(start);
  if (places.length < MIN_STOPS) throw new Error("Not enough interesting places nearby for a route. Try somewhere a bit more central.");

  let budget = MAX_ROUTE_METERS / WALK_FACTOR;
  for (let attempt = 0; attempt < 6; attempt++) {
    let loop = buildLoop(start, places, budget);
    if (loop.length < MIN_STOPS) {
      budget *= 1.05;
      continue;
    }

    let routed = await routeOnFoot([start, ...loop, start]);
    // Too long on real paths: drop the stop that costs the most, then re-route.
    while (routed && routed.distance > MAX_ROUTE_METERS && loop.length > MIN_STOPS) {
      loop = dropCostliest(start, loop);
      routed = await routeOnFoot([start, ...loop, start]);
    }
    if (routed && routed.distance > MAX_ROUTE_METERS) {
      budget *= 0.85;
      continue;
    }

    const estimated = !routed;
    const distance = routed ? routed.distance : loopLength(start, loop) * WALK_FACTOR;
    if (distance > MAX_ROUTE_METERS) {
      budget *= 0.85;
      continue;
    }
    const path = routed ? routed.path : [start, ...loop, start].map((p) => [p.lat, p.lng] as [number, number]);
    return { trail: toTrail(start, loop, distance, path, estimated), approximateStart };
  }
  throw new Error("Couldn't fit a route under 2.6 km here. Try again, or move somewhere with more to see.");
}

function dropCostliest(start: LatLng, loop: Candidate[]): Candidate[] {
  let bestIdx = 0;
  let bestLen = Infinity;
  loop.forEach((_, i) => {
    const len = loopLength(start, loop.filter((__, j) => j !== i));
    if (len < bestLen) {
      bestLen = len;
      bestIdx = i;
    }
  });
  return loop.filter((_, i) => i !== bestIdx);
}

function toTrail(start: LatLng, loop: Candidate[], distance: number, path: [number, number][], estimated: boolean): Trail {
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
  return routed ? { ...trail, path: routed.path, distanceMeters: Math.round(routed.distance) } : trail;
}

// --- Location ---------------------------------------------------------------

export const FALLBACK_START: LatLng = { lat: 56.9496, lng: 24.1052 }; // Riga Old Town

export function getStartPosition(timeoutMs = 7000): Promise<{ position: LatLng; approximate: boolean }> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve({ position: FALLBACK_START, approximate: true });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ position: { lat: pos.coords.latitude, lng: pos.coords.longitude }, approximate: false }),
      () => resolve({ position: FALLBACK_START, approximate: true }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}
