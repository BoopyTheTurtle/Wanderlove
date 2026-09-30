# Route simulation (stage 2)

The done-when test for route generator v2 ([route-safety.md §5](../../docs/research/route-safety.md)): 200 simulated
starts across five Riga-area test areas, a second January 17:00 pass over the riverside and rural starts, automated
checks on every route, and a 30-route pack for the manual audit.

It runs the real `generateRoute` from `packages/core` under Node with
[vite-node](https://github.com/vitest-dev/vitest/tree/main/packages/vite-node), which ships with vitest, so it needs
no extra dependency. Run every command from the repository root.

## Commands

```sh
# Offline proof of the pipeline: a small dry run against canned responses, checked end to end (about 90 s).
npx vite-node tools/route-sim/main.ts -- selfcheck

# Full dry run: all 280 starts against the fixture, no network (about 16 minutes: the router pacing still applies).
npx vite-node tools/route-sim/main.ts -- run --dry-run --gap 0

# The live run against Overpass and the FOSSGIS router (roughly 30 to 60 minutes).
npx vite-node tools/route-sim/main.ts -- run

# Rebuild the summary and the audit pack from the recorded results, without any network.
npx vite-node tools/route-sim/main.ts -- report
```

Options for `run` and `report`:

| Option           | Default                                      | Meaning                                                     |
| ---------------- | -------------------------------------------- | ----------------------------------------------------------- |
| `--dry-run`      | off                                          | Answer Overpass and the router from `fixture.ts`            |
| `--out <dir>`    | `tools/route-sim/out/live`, or `out/dry-run` | Output folder                                               |
| `--seed <text>`  | `stage2`                                     | Seeds the starts, the generator's random choices, the audit |
| `--per-area <n>` | 40                                           | Starts per area that sit on a public way                    |
| `--gap <ms>`     | 5000                                         | Minimum time between starts; below 3000 only with a dry run |

`run` exits 0 when the stage checks pass, 1 when they fail, and 3 when the network gave out (see Resuming).

## What a run does

1. **Starts.** For each area it draws starts uniformly within 300 m of the area's point, from a random sequence seeded
   by `--seed` and the area, so the same seed gives the same starts. Each start is looked up with the router's
   `nearest` service; one more than 40 m from a walkable way is recorded as discarded and another is drawn, until the
   area has 40 (at most 120 draws).
2. **Routes.** For each start it calls `clearPlaceCache()` and `generateRoute(start, false, { headers })` with the
   User-Agent `Wannadoo-route-sim/0.1 (admin@wannadoo.app)`. `Math.random` is seeded per start during the call, so on
   unchanged OSM data a rerun draws the same loops.
3. **January pass.** The accepted Ķīpsala and Līgatne starts run again, and each records `walkLight` and `seasonNote`
   for 15 January 2027, 17:00 Riga time. The generator takes no date yet, so the route itself is not date-aware; when
   `RouteOptions` gains a date, pass it in `simulate()` in `sim.ts`.
4. **Report.** The summary goes to the terminal and `summary.txt`, the audit pack to `audit/`.

## Pacing

`pacer.ts` wraps `fetch` for the whole run (route-safety.md §3):

- router requests, the script's `nearest` lookups included, start at least 1.1 s apart;
- Overpass queries start at least 3 s apart, and every other start swaps the order of the two Overpass endpoints the
  generator tries, so the load spreads across both;
- starts begin at least `--gap` apart (5 s by default);
- every request carries the User-Agent.

A live run makes roughly 280 Overpass queries and 700 to 1,000 router requests, far inside both services' limits.

## Output

Everything lands in the output folder, which `tools/route-sim/.gitignore` keeps out of git.

- `results.jsonl`: one line per start, written as soon as the start finishes: the start, its snap distance, status,
  error message, stop count, routed distance, router calls, the rural flag, quiet stop slots, every rejection with
  its reason (`H15-snap`, `H3-ferry`, `H3-ford`, `H2-sidewalk`, `H1-crossing`, `length`), the stops, and the path.
- `summary.txt`: per area and pass, starts drawn and discarded, success rate, router calls, and the rejection rate.
- `audit/checklist.md` and `audit/NN-<pass>-<area>-<draw>.geojson`: see below.

The audit files are written through Prettier, so `npm run check` stays green with them in the tree.

### Resuming

A rerun with the same options skips every start already in `results.jsonl`. When Overpass or the router cannot be
reached, the run stops without recording that start (exit code 3); run the same command again to carry on. To start
over, delete the output folder.

## Checks

Every generated route must have exactly five stops, a routed (not estimated) distance and path, a distance of at most
`MAX_ROUTE_METERS + ROUTE_SLACK_METERS` (2,100 m), quiet stops only on slots 1, 3, and 5 and at most two of them, and a
path that starts and ends within 40 m of the start. Ferries and stop snap distance are enforced inside the generator;
its rejections show how often they came up.

The stage checks pass only when every area has its 40 starts, every start produced a route, and no route broke a
check. A start the generator could not route counts against the stage.

The **rejection rate** is rejections divided by router calls: each router call routes one loop, which is either
accepted or rejected for one reason. A failed start's router calls were all rejections, but the generator throws its
list away, so their reasons show as `unknown (start failed)`. An area above 50% is flagged: the filters are too strict
there, or the data too sparse.

## Manual audit

`audit/checklist.md` lists 30 routes picked at random with the seed: six per area, three of them from the January
pass in Ķīpsala and Līgatne. Each entry has the start with an openstreetmap.org link, the route's facts, the daylight
outcome for January runs, and the §5 audit questions to tick. Drop the matching `.geojson` file on
[geojson.io](https://geojson.io) to see the path (red), the start (star), and the numbered stops (purple when quiet).

## Files

- `main.ts`: the command line.
- `sim.ts`: drawing starts, the nearest-way check, generating routes, `results.jsonl`, and resume.
- `pacer.ts`: the rate-limited, User-Agent-setting `fetch`.
- `report.ts`: the checks, the summary, and the audit pack.
- `fixture.ts`: the canned Overpass and router answers for `--dry-run`. They are synthetic: a hash of each
  coordinate decides which starts sit off a path, which stops snap far away, and which legs take a ferry.
- `selfcheck.ts`: the offline end-to-end check.
- `lib.ts`: areas, seeded random numbers, and the record type.
