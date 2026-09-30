// Canned Overpass and FOSSGIS responses for --dry-run, so the whole pipeline (starts, pacing, results.jsonl, resume,
// checks, audit files) runs without the network. Nothing here was recorded from the live services: the places are
// synthetic, the router walks straight lines, and a hash of each coordinate decides which stops snap far from a
// path, which legs take a ferry, and which starts sit off any public way, so the rejection paths get exercised.
import type { LatLng } from "../../packages/core/src/index.ts";
import { haversineDistanceMeters } from "../../packages/core/src/index.ts";
import { hashString, mulberry32, offsetMeters } from "./lib.ts";
import type { FetchLike } from "./pacer.ts";

// Straight-line metres × this = routed metres. Loops near the generator's budget come out over the limit.
const ROUTE_FACTOR = 1.38;
const FAR_SNAP_METERS = 60;

type Coords = [number, number];
const lngLat = (p: LatLng): Coords => [p.lng, p.lat];
const pctOf = (p: LatLng, salt: string) => hashString(`${salt}:${p.lat.toFixed(6)},${p.lng.toFixed(6)}`) % 100;

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

const NAMED_TAGS: Record<string, string>[] = [
  { tourism: "attraction" },
  { leisure: "park" },
  { amenity: "fountain" },
  { tourism: "artwork" },
  { amenity: "place_of_worship", religion: "christian" },
  { historic: "monument" },
  { historic: "memorial" },
  { tourism: "museum" },
  { tourism: "viewpoint" },
  { amenity: "marketplace" },
];

function overpass(body: string): Response {
  const query = new URLSearchParams(body).get("data") ?? "";
  const box = /\[bbox:([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\]/.exec(query);
  if (!box) return new Response("bad query", { status: 400 });
  const [s, w, n, e] = box.slice(1).map(Number);
  const center = { lat: (s + n) / 2, lng: (w + e) / 2 };
  const seed = hashString(`${center.lat.toFixed(5)},${center.lng.toFixed(5)}`);
  const rng = mulberry32(seed);
  const place = (i: number, radius: number) => {
    const angle = rng() * 2 * Math.PI;
    const r = 150 + rng() * radius;
    const at = offsetMeters(center, Math.sin(angle) * r, Math.cos(angle) * r);
    return { type: "node", id: (seed % 1e6) * 100 + i, lat: at.lat, lon: at.lng };
  };
  const named = Array.from({ length: 24 }, (_, i) => ({
    ...place(i, 500),
    tags: { name: `Fixture place ${i + 1}`, ...NAMED_TAGS[i % NAMED_TAGS.length] },
  }));
  const generic = Array.from({ length: 10 }, (_, i) => ({ ...place(50 + i, 450), tags: { amenity: "bench" } }));
  const count = { type: "count", id: 0, tags: { total: "0" } };
  // Sections in overpassQuery order: candidates, generic, hazards, roads, crossings, fords.
  const elements = [...named, count, ...generic, count, count, count, count, count];
  return json({ elements });
}

function coordsOf(url: string): LatLng[] {
  return url
    .split("/driving/")[1]
    .split("?")[0]
    .split(";")
    .map((c) => {
      const [lng, lat] = c.split(",").map(Number);
      return { lat, lng };
    });
}

// About one start in eight sits more than 40 m from a path and is discarded.
function nearest(url: string): Response {
  const [p] = coordsOf(url);
  const pct = pctOf(p, "nearest");
  return json({ code: "Ok", waypoints: [{ distance: pct < 12 ? 55 : pct % 30, location: lngLat(p) }] });
}

// Legs are straight lines. About one stop in twelve snaps far from a path (H15) and one in twenty-five is reached
// by ferry (H3).
function route(url: string): Response {
  const pts = coordsOf(url);
  const isStop = (i: number) => i > 0 && i < pts.length - 1;
  const legs = pts.slice(1).map((p, i) => {
    const ferry = isStop(i + 1) && pctOf(p, "ferry") < 4;
    const distance = haversineDistanceMeters(pts[i], p) * ROUTE_FACTOR;
    return {
      distance,
      steps: [
        { mode: ferry ? "ferry" : "walking", geometry: { coordinates: [lngLat(pts[i]), lngLat(p)] } },
        { mode: "walking", geometry: { coordinates: [lngLat(p)] } },
      ],
      annotation: { nodes: [] },
    };
  });
  return json({
    code: "Ok",
    routes: [
      {
        distance: legs.reduce((d, l) => d + l.distance, 0),
        geometry: { coordinates: pts.map(lngLat) },
        legs,
      },
    ],
    waypoints: pts.map((p, i) => ({
      distance: isStop(i) && pctOf(p, "snap") < 8 ? FAR_SNAP_METERS : 3,
      location: lngLat(p),
    })),
  });
}

export const fixtureFetch: FetchLike = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/interpreter")) return overpass(String(init?.body ?? ""));
  if (url.includes("/nearest/")) return nearest(url);
  if (url.includes("/driving/")) return route(url);
  return new Response("not in the fixture", { status: 404 });
};
