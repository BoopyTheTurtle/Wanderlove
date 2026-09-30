// Route safety (docs/research/route-safety.md): the filters and checks behind generateRoute, exported for the stage 2
// simulation and audit scripts.
export { tagRejection, isQuietTags } from "./filters";
export { areaHazards, buildHazardIndex, checkContainment, timedHazards } from "./hazards";
export type { HazardIndex, Containment, TimedHazards } from "./hazards";
export { buildRoadNetwork, checkRoute, parseOsrmRoute, speedKmh } from "./routeChecks";
export type { NetworkExtras, RoadNetwork, RouteIssue, RouteVerdict, RoutedLoop, OsrmResponse } from "./routeChecks";
export { EXCLUSIONS, isExcluded } from "./exclusions";
export type { Exclusion } from "./exclusions";
export { MAX_QUIET_STOPS, orderStops } from "./quiet";
export { overpassQuery, splitSections } from "./overpass";
export type { OsmElement, OverpassSections } from "./overpass";
