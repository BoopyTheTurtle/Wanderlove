import type { LatLng } from "../geo";

// The one Overpass request behind a route: stop candidates, generic fallback points, hazard areas (with parks, woods,
// and ponds for the time-dependent rules), the roads the crossing and sidewalk checks need, marked crossings, fords,
// railway tracks and their crossings, and the service roads on closed land (route-safety.md §2.6).

export type OsmCoord = { lat: number; lon: number };

export type OsmMember = {
  type: string;
  ref: number;
  role: string;
  lat?: number;
  lon?: number;
  geometry?: (OsmCoord | null)[];
};

// One element as Overpass prints it with `out tags center`, `out tags geom`, `out geom`, or `out skel`.
export type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: OsmCoord;
  geometry?: (OsmCoord | null)[];
  members?: OsmMember[];
  tags?: Record<string, string>;
};

export const OVERPASS_SECTIONS = [
  "candidates",
  "generic",
  "hazards",
  "roads",
  "crossings",
  "fords",
  "rails",
  "railCrossings",
  "closedService",
] as const;
export type OverpassSection = (typeof OVERPASS_SECTIONS)[number];
export type OverpassSections = Record<OverpassSection, OsmElement[]>;

// Classes of road whose crossings need a marked place to cross (H1) and whose sidewalks matter (H2).
export const MAJOR_HIGHWAY = /^(motorway|trunk|primary|secondary)(_link)?$/;
// Lower roads fetched only when fast, for the rural-road flag (H2): a posted limit above 50 or a rural default.
const LOWER_ROADS = "^(tertiary|tertiary_link|unclassified|residential|service|track|road)$";

export function searchBox({ lat, lng }: LatLng, radiusMeters: number): string {
  const dLat = radiusMeters / 111320;
  const dLng = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lng - dLng, lat + dLat, lng + dLng].map((n) => n.toFixed(5)).join(",");
}

// A bounding box is far cheaper for Overpass than an "around" filter; exact distance is checked afterwards.
// Each output block ends with `out count`, which prints one element of type "count"; those mark where each section
// ends, since the JSON output is otherwise one flat list. Hazard areas are clipped to the box, or the Daugava's
// relation alone returns kilometres of shoreline.
// Railway tracks (H7) exclude trams, which run in the street. Service roads and tracks come only from within closed
// land (H5), through Overpass's area index; a city has thousands elsewhere. The client checks containment again.
export function overpassQuery(center: LatLng, radiusMeters: number): string {
  const bbox = searchBox(center, radiusMeters);
  return `[out:json][timeout:25][bbox:${bbox}];
(
  nwr[name][tourism~"^(attraction|viewpoint|artwork|museum|gallery)$"];
  nwr[name][historic~"^(monument|memorial|castle|church|ruins|building)$"];
  nwr[name][amenity~"^(place_of_worship|fountain|marketplace)$"];
  nwr[name][leisure~"^(park|garden)$"];
)->.cands;
.cands out tags center 400;
.cands out count;
(
  node[amenity=bench];
  node[tourism=viewpoint][!name];
  wr[leisure=park][!name];
)->.generic;
.generic out tags center 200;
.generic out count;
(
  wr[landuse~"^(industrial|military|construction|railway|quarry|landfill|brownfield|cemetery)$"];
  wr[military];
  wr[aeroway=aerodrome];
  wr[power~"^(plant|substation)$"];
  wr[man_made~"^(wastewater_plant|works|pier|breakwater|groyne)$"];
  wr[access~"^(private|no)$"][!highway][!building];
  wr[amenity=grave_yard];
  wr[natural=water];
  wr[waterway=riverbank];
  way[natural=cliff];
  wr[leisure=park];
  wr[natural=wood];
)->.hazard;
.hazard out tags geom(${bbox});
.hazard out count;
way[highway~"${MAJOR_HIGHWAY.source}"]->.major;
way[highway~"${LOWER_ROADS}"][maxspeed~"^([6-9][0-9]|[1-9][0-9][0-9])"]->.fast;
way[highway~"${LOWER_ROADS}"][~"^(source:maxspeed|maxspeed:type)$"~"rural"]->.rural;
(.major; .fast; .rural;)->.roads;
.roads out tags geom;
.roads out count;
node(w.major)->.majorNodes;
way[highway=footway][footway=crossing]->.crossingWays;
node(w.crossingWays)->.crossingWayNodes;
(
  node(w.major)[highway~"^(crossing|traffic_signals)$"];
  node(w.major)[crossing][crossing!=no];
  node(w.major)[railway~"^(crossing|level_crossing)$"];
  node.majorNodes.crossingWayNodes;
)->.x;
.x out skel;
.x out count;
(
  node[ford=yes];
  way[ford=yes];
)->.ford;
.ford out geom;
.ford out count;
way[railway~"^(rail|light_rail)$"]->.rails;
.rails out tags geom;
.rails out count;
node(w.rails)[railway~"^(crossing|level_crossing)$"]->.railX;
.railX out skel;
.railX out count;
(
  wr[landuse~"^(industrial|military|quarry|railway)$"];
  wr[military];
)->.closedLand;
.closedLand map_to_area->.closedAreas;
way[highway~"^(service|track)$"](area.closedAreas)->.closedService;
.closedService out tags geom;
.closedService out count;`;
}

// Splits the flat element list at the count markers. Returns null when the response is incomplete (a server that
// timed out can answer 200 with a partial list), so the caller tries the next server.
export function splitSections(elements: OsmElement[]): OverpassSections | null {
  const parts: OsmElement[][] = [[]];
  for (const el of elements) {
    if (el.type === "count") parts.push([]);
    else parts[parts.length - 1].push(el);
  }
  if (parts.length !== OVERPASS_SECTIONS.length + 1) return null;
  return Object.fromEntries(OVERPASS_SECTIONS.map((name, i) => [name, parts[i]])) as OverpassSections;
}

// The element's own point: a node's position or the centre Overpass computed for a way or relation.
export function positionOf(el: OsmElement): LatLng | null {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  return lat === undefined || lng === undefined ? null : { lat, lng };
}

export function toLatLng(c: OsmCoord | null): LatLng | null {
  return c ? { lat: c.lat, lng: c.lon } : null;
}
