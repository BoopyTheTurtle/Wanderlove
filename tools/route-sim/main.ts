// Stage 2 route simulation (docs/research/route-safety.md §5). See README.md in this folder for the commands.
//
//   run      draw the starts, generate the routes (resumable), then report
//   report   rerun the checks, the summary, and the audit pack from results.jsonl
//   selfcheck  prove the pipeline offline against the fixture
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STARTS_PER_AREA } from "./lib.ts";
import { fixtureFetch } from "./fixture.ts";
import type { FetchLike } from "./pacer.ts";
import { buildReport, writeAudit } from "./report.ts";
import { readResults, runSimulation, NetworkAbort } from "./sim.ts";
import { selfCheck } from "./selfcheck.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const USAGE = `Usage: npx vite-node tools/route-sim/main.ts -- <run|report|selfcheck> [options]

  --dry-run        answer Overpass and the router from the offline fixture (default output out/dry-run)
  --out <dir>      output folder (default tools/route-sim/out/live, or out/dry-run with --dry-run)
  --seed <text>    seed for the starts, the generator's choices, and the audit picks (default "stage2")
  --per-area <n>   starts per area on a public way (default ${STARTS_PER_AREA})
  --gap <ms>       minimum time between starts (default 5000; 0 is allowed only with --dry-run)`;

function parseArgs(argv: string[]) {
  const args = argv.filter((a) => a !== "--");
  const [command, ...rest] = args;
  const opts = { dryRun: false, out: "", seed: "stage2", perArea: STARTS_PER_AREA, gap: 5000 };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    const value = () => {
      const v = rest[++i];
      if (v === undefined) throw new Error(`${flag} needs a value`);
      return v;
    };
    if (flag === "--dry-run") opts.dryRun = true;
    else if (flag === "--out") opts.out = value();
    else if (flag === "--seed") opts.seed = value();
    else if (flag === "--per-area") opts.perArea = Number(value());
    else if (flag === "--gap") opts.gap = Number(value());
    else throw new Error(`Unknown option ${flag}`);
  }
  if (!Number.isInteger(opts.perArea) || opts.perArea < 1) throw new Error("--per-area must be a positive integer");
  if (!Number.isFinite(opts.gap) || opts.gap < 0) throw new Error("--gap must be a number of milliseconds");
  // One start every few seconds against the public services (route-safety.md §3).
  if (!opts.dryRun && opts.gap < 3000) throw new Error("--gap below 3000 ms is for --dry-run only");
  opts.out ||= join(HERE, "out", opts.dryRun ? "dry-run" : "live");
  return { command, ...opts };
}

async function report(out: string, seed: string, perArea: number): Promise<boolean> {
  const records = readResults(join(out, "results.jsonl"));
  const { text, stagePassed } = buildReport(records, perArea);
  writeFileSync(join(out, "summary.txt"), text + "\n");
  const audited = await writeAudit(records, seed, join(out, "audit"));
  console.log(`\n${text}\n`);
  console.log(`Wrote ${join(out, "summary.txt")} and ${audited} audit routes to ${join(out, "audit")}.`);
  return stagePassed;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.command === "selfcheck") {
    await selfCheck(join(HERE, "out", "selfcheck"));
    return;
  }
  if (opts.command === "report") {
    process.exitCode = (await report(opts.out, opts.seed, opts.perArea)) ? 0 : 1;
    return;
  }
  if (opts.command !== "run") {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const base: FetchLike = opts.dryRun ? fixtureFetch : globalThis.fetch.bind(globalThis);
  console.log(`${opts.dryRun ? "Dry run (fixture, no network)" : "Live run"}, results in ${opts.out}`);
  try {
    const { added } = await runSimulation({
      resultsFile: join(opts.out, "results.jsonl"),
      seed: opts.seed,
      perArea: opts.perArea,
      startGapMs: opts.gap,
      base,
    });
    console.log(`${added} new start(s) recorded.`);
  } catch (e) {
    if (!(e instanceof NetworkAbort)) throw e;
    console.error(`Stopped: ${e.message}\nNothing was recorded for that start; rerun the same command to resume.`);
    process.exitCode = 3;
    return;
  }
  process.exitCode = (await report(opts.out, opts.seed, opts.perArea)) ? 0 : 1;
}

main().catch((e: Error) => {
  console.error(e.message.startsWith("--") || e.message.startsWith("Unknown") ? `${e.message}\n\n${USAGE}` : e);
  process.exitCode = 2;
});
