import type { LatLng } from "../geo";
import { haversineDistanceMeters } from "../geo";

// Curated exclusion list (route-safety.md H14): places that deserve silence rather than a task, and places the audit
// finds wrong in OSM. An entry names one OSM element by `type/id`, or an area as a centre and radius. Stage 11 moves
// this list into a table fed by user reports; until then it lives here and grows with the stage 2 audit.

export type Exclusion =
  | { osm: `${"node" | "way" | "relation"}/${number}`; reason: string }
  | { center: LatLng; radiusMeters: number; reason: string };

// Sites of mass killing and mass graves near Riga. OSM has no reliable tag for them, so they are listed by area.
// The centres are approximate (from general knowledge, not surveyed); the radii are generous to cover the memorial
// grounds. Confirm both during the stage 2 audit.
export const EXCLUSIONS: readonly Exclusion[] = [
  { center: { lat: 56.8831, lng: 24.2425 }, radiusMeters: 700, reason: "Rumbula memorial, site of the 1941 massacre" },
  { center: { lat: 56.9644, lng: 24.2339 }, radiusMeters: 800, reason: "Biķernieki memorial, mass execution site" },
  { center: { lat: 56.8736, lng: 24.3967 }, radiusMeters: 700, reason: "Salaspils memorial, former camp" },
];

// Whether a candidate is on the list. `osm` is the candidate's `type/id`, such as "way/123".
export function isExcluded(osm: string, at: LatLng, list: readonly Exclusion[] = EXCLUSIONS): boolean {
  return list.some((e) => ("osm" in e ? e.osm === osm : haversineDistanceMeters(e.center, at) <= e.radiusMeters));
}
