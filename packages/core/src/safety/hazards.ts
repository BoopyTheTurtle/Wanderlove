import type { LatLng } from "../geo";
import type { Box, Ring } from "./geometry";
import { assembleRings, boxOf, distanceToLineMeters, inBox, pointInRings } from "./geometry";
import type { OsmElement } from "./overpass";
import { toLatLng } from "./overpass";
import type { Tags } from "./filters";

// Containment filter (route-safety.md §2.2 step 2): drop a candidate that sits inside a hazard area or too close to a
// cliff or pier, and mark one inside a cemetery as quiet. Two rules depend on the date and time of the walk (H4 thin
// ice, H10 darkness); timedHazards reports them per candidate, so the cached places stay valid all day and all year.

export const CLIFF_BUFFER_METERS = 30;
// A pier or breakwater mapped as a line: a stop on it sits on the line itself.
export const PIER_BUFFER_METERS = 10;
// H4: ponds and lakes freeze first; a stop this close to one invites stepping onto the ice.
export const ICE_BUFFER_METERS = 30;

type Area = { reasons: string[]; quiet: boolean; rings: Ring[]; box: Box };
type Line = { reason: string; bufferMeters: number; coords: LatLng[]; box: Box };
// An area behind a narrower rule: still water (H4), parks and woods (H10), or closed land for the path check (H5).
export type Zone = { rings: Ring[]; box: Box };
export type GreenZone = Zone & { lit: boolean };
export type HazardIndex = {
  areas: Area[];
  lines: Line[];
  stillWater: Zone[];
  green: GreenZone[];
  closedLand: Zone[];
};

export type Containment = { hazard: string | null; quiet: boolean };
// `ice`: within 30 m of a pond or lake, dropped from November through March (H4). `darkPark`: inside a park or wood
// that neither the stop nor the area marks as lit, dropped after civil dusk (H10).
export type TimedHazards = { ice: boolean; darkPark: boolean };

// School and kindergarten grounds count as closed land (H5): often fenced, and no place for strangers' photos.
const SCHOOL = /^(school|kindergarten|childcare)$/;

// The reasons an area makes a stop inside it unsafe (route-safety.md H3, H5, H6, H7, H8).
export function areaHazards(tags: Tags): string[] {
  const reasons: string[] = [];
  const landuse = tags.landuse ?? "";
  if (/^(industrial|military|landfill|brownfield)$/.test(landuse)) reasons.push("H5-closed");
  if (landuse === "railway") reasons.push("H7-railway");
  if (landuse === "construction") reasons.push("H6-construction");
  if (landuse === "quarry") reasons.push("H8-quarry");
  if (tags.military || tags.aeroway === "aerodrome") reasons.push("H5-closed");
  if (tags.power === "plant" || tags.power === "substation") reasons.push("H5-closed");
  if (tags.man_made === "wastewater_plant" || tags.man_made === "works") reasons.push("H5-closed");
  if ((tags.access === "private" || tags.access === "no") && !tags.highway && !tags.building) reasons.push("H5-closed");
  if (SCHOOL.test(tags.amenity ?? "")) reasons.push("H5-school");
  if (/^(pier|breakwater|groyne)$/.test(tags.man_made ?? "")) reasons.push("H3-water");
  if (tags.natural === "water" || tags.waterway === "riverbank") reasons.push("H3-water");
  return [...new Set(reasons)];
}

const isQuietArea = (tags: Tags) => tags.landuse === "cemetery" || tags.amenity === "grave_yard";

// Flowing water rarely freezes over enough to tempt anyone, and river embankments stay (H4). OSM now maps most rivers
// as natural=water + water=river, so the `water` subtag decides; natural=water without it is usually a pond or lake.
const FLOWING_WATER = /^(river|canal|stream|ditch|drain|rapids|lock|fish_pass|wastewater)$/;
const isStillWater = (tags: Tags) => tags.natural === "water" && !FLOWING_WATER.test(tags.water ?? "");

const isGreen = (tags: Tags) => tags.leisure === "park" || tags.natural === "wood";
// The lit values that mean lit after dark. A missing tag is unknown, never lit (route-safety.md H12).
export const isLit = (tags: Tags) => /^(yes|24\/7|automatic|sunset-sunrise)$/.test(tags.lit ?? "");

// Land whose service roads and tracks are no place to walk (H5 path rule); public streets through it stay allowed.
const isClosedLand = (tags: Tags) =>
  /^(industrial|military|quarry|railway)$/.test(tags.landuse ?? "") || tags.military !== undefined;

export function buildHazardIndex(elements: OsmElement[]): HazardIndex {
  const index: HazardIndex = { areas: [], lines: [], stillWater: [], green: [], closedLand: [] };
  const addZones = (tags: Tags, rings: Ring[]) => {
    const box = boxOf(rings.flat());
    if (isStillWater(tags)) index.stillWater.push({ rings, box });
    if (isGreen(tags)) index.green.push({ rings, box, lit: isLit(tags) });
    if (isClosedLand(tags)) index.closedLand.push({ rings, box });
  };
  for (const el of elements) {
    const tags = el.tags ?? {};
    const reasons = areaHazards(tags);
    const quiet = isQuietArea(tags);

    if (el.type === "way" && el.geometry) {
      const raw = el.geometry;
      const coords = raw.map(toLatLng).filter((p): p is LatLng => p !== null);
      if (coords.length < 2) continue;
      if (tags.natural === "cliff") {
        index.lines.push({ reason: "H8-cliff", bufferMeters: CLIFF_BUFFER_METERS, coords, box: boxOf(coords) });
        continue;
      }
      // A way clipped by the box has lost its closing node, so treat it as an area too.
      const first = coords[0];
      const last = coords[coords.length - 1];
      const closed = first.lat === last.lat && first.lng === last.lng;
      const clipped = raw.some((p) => p === null);
      if (closed || clipped) {
        if (reasons.length || quiet) index.areas.push({ reasons, quiet, rings: [coords], box: boxOf(coords) });
        addZones(tags, [coords]);
      } else if (reasons.includes("H3-water")) {
        index.lines.push({ reason: "H3-water", bufferMeters: PIER_BUFFER_METERS, coords, box: boxOf(coords) });
      }
      continue;
    }

    if (el.type === "relation" && el.members) {
      const ways = el.members
        .filter((m) => m.type === "way" && m.geometry && m.role !== "subarea")
        .map((m) => m.geometry!.map(toLatLng));
      const rings = assembleRings(ways);
      if (!rings.length) continue;
      if (reasons.length || quiet) index.areas.push({ reasons, quiet, rings, box: boxOf(rings.flat()) });
      addZones(tags, rings);
    }
  }
  return index;
}

// What the ground at `p` means for a stop. `tags` are the stop's own tags: a viewpoint near a cliff stays when it is a
// built, railed platform or tower.
export function checkContainment(p: LatLng, index: HazardIndex, tags: Tags = {}): Containment {
  let hazard: string | null = null;
  let quiet = false;
  for (const area of index.areas) {
    if (!inBox(p, area.box) || !pointInRings(p, area.rings)) continue;
    if (area.quiet) quiet = true;
    if (!hazard && area.reasons.length) hazard = area.reasons[0];
  }
  const platform = tags.man_made === "tower" || tags.man_made === "observation_platform";
  for (const line of index.lines) {
    if (hazard) break;
    if (line.reason === "H8-cliff" && platform) continue;
    if (inBox(p, line.box, line.bufferMeters) && distanceToLineMeters(p, line.coords) <= line.bufferMeters) {
      hazard = line.reason;
    }
  }
  return { hazard, quiet };
}

export const inZone = (p: LatLng, zone: Zone): boolean => inBox(p, zone.box) && pointInRings(p, zone.rings);

// Metres from `p` to the nearest edge of a zone, or 0 inside it.
function distanceToZoneMeters(p: LatLng, zone: Zone): number {
  if (pointInRings(p, zone.rings)) return 0;
  return Math.min(...zone.rings.map((ring) => distanceToLineMeters(p, [...ring, ring[0]])));
}

// The rules for a stop at `p` that depend on when the walk happens (H4, H10); `tags` are the stop's own. The caller
// knows the date and the light, so these flags say only what would apply.
export function timedHazards(p: LatLng, index: HazardIndex, tags: Tags = {}): TimedHazards {
  const ice = index.stillWater.some(
    (w) => inBox(p, w.box, ICE_BUFFER_METERS) && distanceToZoneMeters(p, w) <= ICE_BUFFER_METERS,
  );
  // A stop in a lit park counts as lit, even when a larger unlit park or wood surrounds that park.
  const around = index.green.filter((g) => inZone(p, g));
  const darkPark = around.length > 0 && !isLit(tags) && !around.some((g) => g.lit);
  return { ice, darkPark };
}
