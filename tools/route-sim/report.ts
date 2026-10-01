// Reads results.jsonl and produces the §5 outputs: the automated checks on every route, a summary per area with
// success and rejection rates, and the manual-audit pack (30 routes, six per area) for Edgar.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { format, resolveConfig } from "prettier";
import {
  MAX_ROUTE_METERS,
  ROUTE_SLACK_METERS,
  STOP_COUNT,
  haversineDistanceMeters,
} from "../../packages/core/src/index.ts";
import { MAX_QUIET_STOPS } from "../../packages/core/src/safety/quiet.ts";
import { SNAP_LIMIT_METERS } from "../../packages/core/src/safety/routeChecks.ts";
import type { AreaId, Pass, StartRecord } from "./lib.ts";
import { AREAS, JANUARY_AREAS, rngFor, shuffled } from "./lib.ts";

export const QUIET_SLOTS = [1, 3, 5];
export const REJECTION_ALARM = 0.5;
export const AUDIT_PER_AREA = 6;
// In the areas with a January pass, half the audited routes come from it.
export const AUDIT_JANUARY_PER_AREA = 3;

// The automated checks of §5 on one generated route. Ferries and stop snap distance are enforced inside the
// generator (its rejections say how often); these catch anything that slipped through.
export function checkRecord(r: StartRecord): string[] {
  if (r.status !== "ok") return [];
  const problems: string[] = [];
  const cap = MAX_ROUTE_METERS + ROUTE_SLACK_METERS;
  if (r.stopCount !== STOP_COUNT) problems.push(`has ${r.stopCount} stops, not ${STOP_COUNT}`);
  if (r.distanceMeters === undefined || r.distanceEstimated !== false || !r.path?.length) {
    problems.push("lacks a routed distance and path");
  } else if (r.distanceMeters > cap) {
    problems.push(`is ${r.distanceMeters} m, over the ${cap} m cap`);
  }
  const quiet = r.quietSlots ?? [];
  if (quiet.some((s) => !QUIET_SLOTS.includes(s))) problems.push(`puts a quiet stop on slot ${quiet.join(", ")}`);
  if (quiet.length > MAX_QUIET_STOPS) problems.push(`has ${quiet.length} quiet stops`);
  if (r.path?.length) {
    const ends = [r.path[0], r.path[r.path.length - 1]].map(([lat, lng]) =>
      haversineDistanceMeters(r.start, { lat, lng }),
    );
    if (Math.max(...ends) > SNAP_LIMIT_METERS) problems.push("does not start and end at the start");
  }
  return problems;
}

type AreaStats = {
  pass: Pass;
  area: AreaId;
  drawn: number;
  discarded: number;
  ok: number;
  failed: number;
  closed: number;
  routerCalls: number;
  rejections: number;
  reasons: Map<string, number>;
  // Candidates dropped before routing for the time of the walk, summed over the area's routed starts.
  timed: Map<string, number>;
  errors: Map<string, number>;
};

// Every router call ends in one routed loop that is either accepted or rejected, so the rejection rate is
// rejections / router calls. A failed start's calls were all rejections, but the generator throws away the list,
// so in older records their reasons show as "unknown (start failed)". Candidates dropped for the time of the walk (H4, H10) go before
// any router call, so they are counted apart and stay out of the rate.
const TIMED = new Set(["H4-ice", "H10-dark-park"]);
function statsFor(records: StartRecord[], pass: Pass, area: AreaId): AreaStats {
  const s: AreaStats = {
    pass,
    area,
    drawn: 0,
    discarded: 0,
    ok: 0,
    failed: 0,
    closed: 0,
    routerCalls: 0,
    rejections: 0,
    reasons: new Map(),
    timed: new Map(),
    errors: new Map(),
  };
  const bump = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
  for (const r of records) {
    if (r.pass !== pass || r.area !== area) continue;
    s.drawn++;
    if (r.status === "discarded") {
      s.discarded++;
    } else if (r.status === "ok") {
      s.ok++;
      s.routerCalls += r.routerCalls ?? 0;
      for (const j of r.rejections ?? []) {
        if (TIMED.has(j.reason)) bump(s.timed, j.reason);
        else {
          s.rejections++;
          bump(s.reasons, j.reason);
        }
      }
    } else if (r.closedStart) {
      s.closed++;
      bump(s.errors, `start on closed land (${r.closedStart}), expected`);
    } else {
      s.failed++;
      const calls = r.routerCallsObserved ?? 0;
      s.routerCalls += calls;
      s.rejections += calls;
      // Runs since the generator kept its rejections on failure name each one; older records can't.
      const routed = (r.rejections ?? []).filter((j) => !TIMED.has(j.reason));
      for (const j of r.rejections ?? []) if (TIMED.has(j.reason)) bump(s.timed, j.reason);
      if (routed.length) for (const j of routed) bump(s.reasons, `${j.reason} (failed start)`);
      else if (calls) bump(s.reasons, "unknown (start failed)", calls);
      bump(s.errors, r.error ?? "unknown error");
    }
  }
  return s;
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : "n/a");

export type Report = { text: string; stagePassed: boolean; violations: { key: string; problems: string[] }[] };

export function buildReport(records: StartRecord[], perArea: number): Report {
  const lines: string[] = [];
  const violations = records.map((r) => ({ key: r.key, problems: checkRecord(r) })).filter((v) => v.problems.length);
  const passes: [Pass, AreaId[]][] = [
    ["main", AREAS.map((a) => a.id)],
    ["january", JANUARY_AREAS],
  ];
  let allRouted = true;
  let complete = true;
  for (const [pass, areas] of passes) {
    lines.push(pass === "main" ? "Main pass" : "January pass (17:00, ice and darkness rules)");
    lines.push("area            starts  discarded  ok   failed  success  router calls  rejections  rate");
    for (const area of areas) {
      const s = statsFor(records, pass, area);
      const routed = s.ok + s.failed;
      const rate = s.routerCalls ? s.rejections / s.routerCalls : 0;
      const flag = rate > REJECTION_ALARM ? "  <-- over 50%: filters too strict or data too sparse" : "";
      lines.push(
        `${area.padEnd(16)}${String(s.drawn).padStart(6)}${String(s.discarded).padStart(11)}` +
          `${String(s.ok).padStart(5)}${String(s.failed).padStart(8)}${pct(s.ok, routed).padStart(9)}` +
          `${String(s.routerCalls).padStart(14)}${String(s.rejections).padStart(12)}${pct(s.rejections, s.routerCalls).padStart(6)}${flag}`,
      );
      if (s.reasons.size) {
        const reasons = [...s.reasons].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`);
        lines.push(`${" ".repeat(16)}rejections by reason: ${reasons.join(", ")}`);
      }
      if (s.timed.size) {
        const timed = [...s.timed].map(([k, n]) => `${k} ${n}`);
        lines.push(`${" ".repeat(16)}candidates dropped before routing, summed over starts: ${timed.join(", ")}`);
      }
      for (const [error, n] of s.errors) lines.push(`${" ".repeat(16)}failed ${n}x: ${error}`);
      if (s.closed) lines.push(`${" ".repeat(16)}${s.closed} start(s) on closed land fail by design and don't count`);
      if (s.failed) allRouted = false;
      if (routed + s.closed < perArea) complete = false;
    }
    lines.push("");
  }
  const january = records.filter((r) => r.pass === "january");
  if (january.length) {
    const outcomes = new Map<string, number>();
    for (const r of january) {
      const light = r.walkLight?.kind === "dark" ? `dark (after dusk: ${r.walkLight.afterDusk})` : r.walkLight?.kind;
      const key = `walkLight ${light}, seasonNote ${r.seasonNote}`;
      outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
    }
    lines.push(`January daylight outcomes: ${[...outcomes].map(([k, n]) => `${k} (${n})`).join("; ")}`);
    lines.push("");
  }
  if (violations.length) {
    lines.push(`Check violations (${violations.length}):`);
    for (const v of violations) lines.push(`  ${v.key}: ${v.problems.join("; ")}`);
  } else {
    lines.push("Check violations: none");
  }
  if (!complete) lines.push(`Incomplete: some areas have fewer than ${perArea} routed starts.`);
  const stagePassed = complete && allRouted && violations.length === 0;
  lines.push(
    stagePassed
      ? "STAGE CHECKS PASS: every start produced a valid five-stop loop. The manual audit decides the rest."
      : "STAGE CHECKS FAIL: see the failures and violations above.",
  );
  return { text: lines.join("\n"), stagePassed, violations };
}

// --- Manual audit pack --------------------------------------------------------

const osmLink = ({ lat, lng }: { lat: number; lng: number }) =>
  `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=17/${lat.toFixed(6)}/${lng.toFixed(6)}`;

export function pickAudit(records: StartRecord[], seed: string): StartRecord[] {
  const rng = rngFor(seed, "audit");
  const picks: StartRecord[] = [];
  for (const area of AREAS) {
    const pool = (pass: Pass) => records.filter((r) => r.status === "ok" && r.area === area.id && r.pass === pass);
    const january = JANUARY_AREAS.includes(area.id)
      ? shuffled(pool("january"), rng).slice(0, AUDIT_JANUARY_PER_AREA)
      : [];
    const main = shuffled(pool("main"), rng).slice(0, AUDIT_PER_AREA - january.length);
    picks.push(...main, ...january);
  }
  return picks;
}

// GeoJSON for geojson.io: the walking path, the start, and the stops, styled with simplestyle properties.
export function toGeoJson(r: StartRecord) {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: `${r.key} path`, distanceMeters: r.distanceMeters, stroke: "#c2185b", "stroke-width": 4 },
        geometry: { type: "LineString", coordinates: (r.path ?? []).map(([lat, lng]) => [lng, lat]) },
      },
      {
        type: "Feature",
        properties: { name: "Start", "marker-symbol": "star", "marker-color": "#222222" },
        geometry: { type: "Point", coordinates: [r.start.lng, r.start.lat] },
      },
      ...(r.stops ?? []).map((s, i) => ({
        type: "Feature",
        properties: {
          name: s.name,
          slot: i + 1,
          id: s.id,
          kind: s.label,
          quiet: s.quiet,
          "marker-symbol": String(i + 1),
          "marker-color": s.quiet ? "#5e35b1" : "#e65100",
        },
        geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      })),
    ],
  };
}

// The §5 audit questions, copied so each route gets its own boxes to tick.
const CHECKLIST = `**Stops**

- [ ] Each stop is on or beside a public way, reachable without climbing, wading, or passing a gate or fence.
- [ ] No stop sits on private, military, industrial, railway, construction, quarry, or fenced land.
- [ ] No stop sits on a pier, breakwater, beach edge, or in water; in the January set, none within 30 m of a pond or lake.
- [ ] No stop sits within 30 m of a cliff edge or quarry.
- [ ] Every church, memorial, and cemetery stop carries the quiet flag and sits on slot 1, 3, or 5.
- [ ] No stop is a mass-grave or execution site.
- [ ] No stop is an unmanaged ruin or abandoned building.

**Path**

- [ ] Every crossing of a primary, secondary, or trunk road happens at a marked crossing, signals, a bridge, or a tunnel.
- [ ] The path never walks along a primary or secondary road without a pavement or a separate footway.
- [ ] Every railway crossing is a level crossing, bridge, or underpass.
- [ ] No ferry, ford, or stepping stones.
- [ ] No service road or track through industrial or military land.
- [ ] In the rural set, any stretch along a road without pavement is under 300 m or carries the rural note.
- [ ] Total length ≤ 2.1 km (2 km plus 100 m slack) and the loop returns to the start.

**Context**

- [ ] The 17:00 January runs show the after-sunset warning with the right time.
- [ ] The January runs show the ice note.
- [ ] Nothing about the route would make Edgar hesitate to send his own family on it.`;

function describeLight(r: StartRecord): string {
  const light = r.walkLight;
  if (!light) return "";
  const what =
    light.kind === "ends-after-sunset"
      ? `ends after sunset (sunset ${new Date(light.sunset).toISOString()})`
      : light.kind === "dark"
        ? `already dark${light.afterDusk ? ", after civil dusk" : ", before civil dusk"}`
        : "daylight throughout";
  return `- Daylight at ${r.when}: ${what}; season note: ${r.seasonNote ?? "none"}\n`;
}

// Output lands inside the repository, where \`npm run check\` runs Prettier over it, so write it already formatted.
async function writePretty(file: string, text: string): Promise<void> {
  const config = (await resolveConfig(file)) ?? {};
  writeFileSync(file, await format(text, { ...config, filepath: file }));
}

export async function writeAudit(records: StartRecord[], seed: string, dir: string): Promise<number> {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const picks = pickAudit(records, seed);
  const sections: string[] = [
    "# Stage 2 manual audit",
    "",
    `${picks.length} routes, picked at random (seed "${seed}"): six per area, three of them from the January pass in ` +
      "the riverside and rural areas. For each, open the start on openstreetmap.org, drop the GeoJSON file on " +
      "https://geojson.io, check satellite and street-level imagery where available, and tick the boxes.",
    "",
    "Record each failure with the start, stop ID, and reason. A failure caused by wrong OSM data counts as a failure; " +
      "add the stop or area to the curated exclusion list and, where the data is plainly wrong, correct OSM. The audit " +
      "passes at zero unsafe stops and zero unsafe crossings across all 30.",
    "",
  ];
  for (const area of AREAS) {
    const n = picks.filter((p) => p.area === area.id).length;
    if (n < AUDIT_PER_AREA) sections.push(`> ${area.name}: only ${n} successful routes to audit.\n`);
  }
  for (const [i, r] of picks.entries()) {
    const file = `${String(i + 1).padStart(2, "0")}-${r.key.replace(/:/g, "-")}.geojson`;
    await writePretty(join(dir, file), JSON.stringify(toGeoJson(r), null, 2));
    const area = AREAS.find((a) => a.id === r.area)!;
    const stops = (r.stops ?? [])
      .map((s, j) => `  ${j + 1}. ${s.name} (${s.label}, \`${s.id}\`)${s.quiet ? " — quiet" : ""}`)
      .join("\n");
    sections.push(
      `## ${i + 1}. ${area.name}, ${r.pass === "january" ? "January 17:00" : "main pass"} (\`${r.key}\`)\n\n` +
        `- Start: ${r.start.lat}, ${r.start.lng} — ${osmLink(r.start)}\n` +
        `- GeoJSON: \`${file}\`\n` +
        `- ${r.distanceMeters} m, ${r.routerCalls} router call(s), rural note: ${r.rural ? "yes" : "no"}, ` +
        `rejections: ${r.rejections?.map((j) => `${j.reason} (${j.stopId})`).join(", ") || "none"}\n` +
        describeLight(r) +
        `- Stops:\n${stops}\n\n${CHECKLIST}\n`,
    );
  }
  await writePretty(join(dir, "checklist.md"), sections.join("\n"));
  return picks.length;
}
