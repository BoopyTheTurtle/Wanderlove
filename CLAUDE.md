# CLAUDE.md

Guidance for Claude Code in this repository. The [README](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md) hold the
setup and team workflow; this file adds what an agent needs on top.

Current work is the internal build in [docs/internal-build.md](docs/internal-build.md). Its **Progress** section records
what is done and where to resume; update it at the end of each working session.

## Commands

Run everything from the repository root; npm workspaces route each script to the right package.

- `npm run dev` starts the web app on port 5173 against the online Supabase project (`apps/web/.env.local`).
  `npm run dev:local` starts it on port 5174 against the local stack. `.claude/launch.json` has both for the preview pane.
- `npm run check` runs typecheck, lint, format check, and tests. Run it before declaring a change done.
- `npm test -w @wannadoo/core -- routeGen` runs a single test file.
- `npm run db:start`, `db:reset`, `db:test`, and `db:types` drive the local Supabase stack; they need Docker Desktop.

## Architecture

- `packages/core` exports platform-neutral logic from `src/index.ts`: the `Trail`/`Stop` model, the curated trail, test
  profiles, geo maths, and `generateRoute`. It ships as TypeScript source with no build step; the web app imports it as
  `@wannadoo/core`. Keep React, DOM, and storage code out of it.
- `apps/web/src/App.tsx` owns routing and state: the auth session, the partner, the active trail run, and the draft route
  (never saved, regenerated on every visit to the map). Runs, stop completions, and photos live in Supabase; the phone
  keeps only small per-device state such as the solo choice and each run's walking path.
- `apps/web/src/lib` holds the browser-only pieces. Only `lib/*` imports supabase-js: `auth`, `profile`, `couples`,
  `runs`, and `photos` wrap the backend; the rest covers device storage, live GPS, and the one-shot start position.
- Route generation queries Overpass for places, builds a loop with cheapest insertion, and trims it to about 2 km against
  the FOSSGIS foot router. Both services rate-limit, so reuse the place cache and avoid request loops.

## Conventions

- The app renders inside a 390 px phone frame; check UI changes at that width.
- Colours come from the tokens at the top of `apps/web/src/index.css`, and a shared animated wine-to-coral gradient on `.phone`
  sits behind every screen. Text on that gradient uses `--on-bg` or `--on-bg-muted`.
- The schema changes only through new files in `supabase/migrations`; never edit a migration once it has deployed.
  Every access rule gets a pgTAP test in `supabase/tests` that checks the member, the partner, and a stranger.
- A migration that creates a table revokes Supabase's default grants on it (`revoke all on <table> from anon,
authenticated`) before granting what it needs: the defaults include TRUNCATE, which RLS does not cover.
- A new run is private ([docs/private-trails.md](docs/private-trails.md)): the phone seals its trail with the run key,
  and its stop IDs are `s1` to `sN` in trail order; `stop_completions` and `photos` key on them. Only legacy plain runs
  still carry `osm-<type>-<id>` stop IDs.
- A run's sealed details, like a legacy snapshot, never hold `start` or `path` (they can reveal a home); the database
  refuses them in a snapshot too.

## Parallel work

For any complex, multi-part task, use the `parallel-build` skill when the parts separate cleanly: it splits the work,
shows Edgar the split, and spawns `feature-builder` agents (`.claude/agents/feature-builder.md`), each on its own
branch and worktree. Agents push and open draft PRs against the integration branch (`chore/repo-structure` for the
internal build); Edgar approves every merge. Tell Edgar the plan before building anything non-trivial.
