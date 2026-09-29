# Wannadoo

Wannadoo turns a city into a shared adventure for couples. It builds a short walking loop from where you stand,
unlocks a conversation prompt at each stop, and collects a photo there, so the relationship gains a map of places
visited together. [docs/concept.md](docs/concept.md) covers the full concept and competitive landscape.

## Quick start

You need Node 22 or newer; `.nvmrc` pins the version the team uses.

```bash
npm install
npm run dev
```

Sign-in needs a Supabase project. Create `apps/web/.env.local` with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` (the publishable key) from the project's API settings, then open http://localhost:5173 and sign
in with an emailed code.

To work offline from the online project, start the local stack (`npm run db:start`, needs Docker Desktop) and run
`npm run dev:local` instead. It serves http://localhost:5174, where a **Test mode** button signs in as a seeded user.

## Repository layout

| Path            | Contents                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `apps/web`      | The React + Vite app: screens, components, styles, and browser storage                             |
| `supabase`      | Database migrations, access rules, seed data, and pgTAP tests                                      |
| `packages/core` | Platform-neutral logic shared by every app: trails, test profiles, geo maths, and route generation |
| `docs/`         | Concept, build specs, user-research interviews, and design mockups                                 |
| `.github/`      | CI workflow, pull request template, and code owners                                                |

`packages/core` holds no React, DOM, or storage code, so a future native app can import it unchanged.

## Commands

Run these from the repository root.

| Command             | Does                                                       |
| ------------------- | ---------------------------------------------------------- |
| `npm run dev`       | Starts the web app on port 5173 against the online project |
| `npm run dev:local` | Starts it on port 5174 against the local Supabase stack    |
| `npm run build`     | Typechecks and builds the web app into `apps/web/dist`     |
| `npm run typecheck` | Typechecks every workspace                                 |
| `npm run lint`      | Runs ESLint                                                |
| `npm run format`    | Formats every file with Prettier                           |
| `npm test`          | Runs the Vitest suites                                     |
| `npm run check`     | Runs typecheck, lint, format check, and tests — as CI does |
| `npm run db:start`  | Starts the local Supabase stack (needs Docker Desktop)     |
| `npm run db:reset`  | Rebuilds the local database from migrations and the seed   |
| `npm run db:test`   | Runs the pgTAP access-rule tests                           |

## External services

Route generation calls two free OpenStreetMap services from the browser: Overpass for nearby places and the FOSSGIS
foot router for walking distance. Both need no key but rate-limit heavily; a public launch needs its own instances or a
paid provider.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) describes the branch, review, and commit workflow.
