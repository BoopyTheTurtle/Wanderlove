import type { LatLng } from "../geo";
import type { Box, Ring } from "./geometry";
import { assembleRings, boxOf, distanceToLineMeters, inBox, pointInRings } from "./geometry";
import type { OsmElement } from "./overpass";
import { toLatLng } from "./overpass";
import type { Tags } from "./filters";

// Containment filter (route-safety.md §2.2 step 2): drop a candidate that sits inside a hazard area or too close to a
// cliff or pier, and mark one inside a cemetery as quiet.

export const CLIFF_BUFFER_METERS = 30;
// A pier or breakwater mapped as a line: a stop on it sits on the line itself.
export const PIER_BUFFER_METERS = 10;

type Area = { reasons: string[]; quiet: boolean; rings: Ring[]; box: Box };
type Line = { reason: string; bufferMeters: number; coords: LatLng[]; box: Box };
export type HazardIndex = { areas: Area[]; lines: Line[] };

export type Containment = { hazard: string | null; quiet: boolean };

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
  if (/^(pier|breakwater|groyne)$/.test(tags.man_made ?? "")) reasons.push("H3-water");
  if (tags.natural === "water" || tags.waterway === "riverbank") reasons.push("H3-water");
  return [...new Set(reasons)];
}

const isQuietArea = (tags: Tags) => tags.landuse === "cemetery" || tags.amenity === "grave_yard";

export function buildHazardIndex(elements: OsmElement[]): HazardIndex {
  const index: HazardIndex = { areas: [], lines: [] };
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
      } else if (reasons.includes("H3-water")) {
        index.lines.push({ reason: "H3-water", bufferMeters: PIER_BUFFER_METERS, coords, box: boxOf(coords) });
      }
      continue;
    }

    if (el.type === "relation" && el.members && (reasons.length || quiet)) {
      const ways = el.members
        .filter((m) => m.type === "way" && m.geometry && m.role !== "subarea")
        .map((m) => m.geometry!.map(toLatLng));
      const rings = assembleRings(ways);
      if (rings.length) index.areas.push({ reasons, quiet, rings, box: boxOf(rings.flat()) });
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
