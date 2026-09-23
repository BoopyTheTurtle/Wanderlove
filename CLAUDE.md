# CLAUDE.md

Guidance for Claude Code in this repository. The [README](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md) hold the
setup and team workflow; this file adds what an agent needs on top.

## Commands

Run everything from the repository root; npm workspaces route each script to the right package.

- `npm run dev` starts the web app on port 5173. `.claude/launch.json` starts the same server for the preview pane.
- `npm run check` runs typecheck, lint, format check, and tests. Run it before declaring a change done.
- `npm test -w @wannadoo/core -- routeGen` runs a single test file.

## Architecture

- `packages/core` exports platform-neutral logic from `src/index.ts`: the `Trail`/`Stop` model, the curated trail, test
  profiles, geo maths, and `generateRoute`. It ships as TypeScript source with no build step; the web app imports it as
  `@wannadoo/core`. Keep React, DOM, and storage code out of it.
- `apps/web/src/App.tsx` owns routing and state: the session, stop progress, the started route (saved), and the draft
  route (never saved, regenerated on every visit to the map).
- `apps/web/src/lib` holds the browser-only pieces: `localStorage` wrappers, live GPS, and the one-shot start position.
- Route generation queries Overpass for places, builds a loop with cheapest insertion, and trims it to 2.6 km against
  the FOSSGIS foot router. Both services rate-limit, so reuse the place cache and avoid request loops.

## Conventions

- The app renders inside a 390 px phone frame; check UI changes at that width.
- Colours come from the tokens at the top of `apps/web/src/index.css`, and a shared animated green gradient on `.phone`
  sits behind every screen. Text on that gradient uses `--on-bg` or `--on-bg-muted`.
- Stop IDs from generated routes take the form `osm-<type>-<id>`; progress in `localStorage` is keyed by stop ID.
