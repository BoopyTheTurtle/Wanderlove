// Offline proof of the pipeline: a small dry run against the fixture, checked end to end. Throws on the first
// broken expectation.
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { check, resolveConfig } from "prettier";
import { fixtureFetch } from "./fixture.ts";
import type { StartRecord } from "./lib.ts";
import { AREAS, JANUARY_AREAS, USER_AGENT } from "./lib.ts";
import { OVERPASS_ENDPOINTS, ROUTER_GAP_MS } from "./pacer.ts";
import { buildReport, checkRecord, writeAudit } from "./report.ts";
import { readResults, runSimulation } from "./sim.ts";

const PER_AREA = 3;
const SEED = "selfcheck";

function expect(ok: boolean, what: string) {
  if (!ok) throw new Error(`selfcheck failed: ${what}`);
  console.log(`  ok  ${what}`);
}

export async function selfCheck(dir: string): Promise<void> {
  rmSync(dir, { recursive: true, force: true });
  const resultsFile = join(dir, "results.jsonl");
  const options = { resultsFile, seed: SEED, perArea: PER_AREA, startGapMs: 0, base: fixtureFetch, log: () => {} };

  console.log(`Dry run: ${PER_AREA} starts per area, fixture only (about a minute, paced like a live run)`);
  const first = await runSimulation(options);
  const records = readResults(resultsFile);
  const main = records.filter((r) => r.pass === "main" && r.status !== "discarded");
  const january = records.filter((r) => r.pass === "january");
  expect(main.length === AREAS.length * PER_AREA, `${AREAS.length * PER_AREA} main-pass starts on a public way`);
  expect(
    records.some((r) => r.status === "discarded"),
    "starts off a public way are discarded and recorded",
  );
  expect(january.length === JANUARY_AREAS.length * PER_AREA, "the January pass repeats the riverside and rural starts");
  expect(
    january.every((r) => r.walkLight !== undefined && r.seasonNote === "winter"),
    "January starts record walkLight and the winter season note",
  );
  expect(records.filter((r) => r.status === "ok").length > 0, "some starts produce a route");
  expect(
    records.some((r) => (r.rejections?.length ?? 0) > 0),
    "generator rejections are recorded with their reasons",
  );

  const log = first.pacer.log;
  const routerTimes = log.filter((c) => c.kind === "route" || c.kind === "nearest").map((c) => c.at);
  const tightest = Math.min(...routerTimes.slice(1).map((t, i) => t - routerTimes[i]));
  // The pacer aims for ROUTER_GAP_MS; timers may fire a millisecond or two early, so hold it to the FOSSGIS limit.
  expect(
    tightest >= 1000,
    `router requests stay at least 1 s apart (aim ${ROUTER_GAP_MS} ms, tightest ${tightest} ms)`,
  );
  expect(
    log.every((c) => c.userAgent === USER_AGENT),
    "every request carries the script's User-Agent",
  );
  const firstTried = new Set(log.filter((c) => c.kind === "overpass").map((c) => c.url));
  expect(
    OVERPASS_ENDPOINTS.every((u) => firstTried.has(u)),
    "Overpass load is spread across both endpoints",
  );

  const second = await runSimulation(options);
  expect(second.added === 0 && second.pacer.log.length === 0, "a rerun resumes: no start repeated, no request sent");
  expect(readResults(resultsFile).length === records.length, "results.jsonl is unchanged by the rerun");

  // The checks catch every kind of bad route.
  const good = records.find((r) => r.status === "ok")!;
  expect(checkRecord(good).length === 0, "a generated route passes the checks");
  const bad: [string, Partial<StartRecord>][] = [
    ["four stops", { stopCount: 4 }],
    ["an over-long loop", { distanceMeters: 2500 }],
    ["an estimated distance", { distanceEstimated: true }],
    ["a missing path", { path: [] }],
    ["a quiet stop on slot 2", { quietSlots: [2] }],
    ["three quiet stops", { quietSlots: [1, 3, 5] }],
  ];
  for (const [what, change] of bad) {
    expect(checkRecord({ ...good, ...change }).length > 0, `the checks flag ${what}`);
  }
  expect(
    !buildReport([...records, { ...good, key: "x", stopCount: 4 }], PER_AREA).stagePassed,
    "a violation fails the stage",
  );

  // The audit pack.
  const auditDir = join(dir, "audit-check");
  const picked = await writeAudit(records, SEED, auditDir);
  const files = readdirSync(auditDir).filter((f) => f.endsWith(".geojson"));
  expect(picked > 0 && files.length === picked, `the audit pack holds one GeoJSON file per picked route (${picked})`);
  const geo = JSON.parse(readFileSync(join(auditDir, files[0]), "utf8"));
  expect(
    geo.type === "FeatureCollection" && geo.features[0].geometry.type === "LineString" && geo.features.length === 7,
    "each GeoJSON file holds the path, the start, and five stops",
  );
  const checklist = readFileSync(join(auditDir, "checklist.md"), "utf8");
  expect(
    existsSync(join(auditDir, "checklist.md")) && (checklist.match(/^## /gm) ?? []).length === picked,
    "the checklist has one section per picked route",
  );
  expect(checklist.includes("openstreetmap.org/?mlat="), "the checklist links each start on openstreetmap.org");
  let formatted = true;
  for (const f of readdirSync(auditDir)) {
    const file = join(auditDir, f);
    const config = (await resolveConfig(file)) ?? {};
    formatted &&= await check(readFileSync(file, "utf8"), { ...config, filepath: file });
  }
  expect(formatted, "the audit files are Prettier-formatted, so npm run check stays green after a run");
  console.log("Selfcheck passed.");
}
