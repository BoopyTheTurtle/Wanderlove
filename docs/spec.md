# Wanderclue — Friday Demo Spec

## Scope

One trail, one flow, no backend. "Rediscover Riga" — Established Couples mode,
Rediscover type (a neighborhood the couple doesn't normally visit). Web app,
mobile-responsive, deployed as a link judges can open on a phone or laptop.

Demo format is stationary: judges won't walk the route, so real GPS still
works but every stop also has a manual "simulate arrival" override.

## Core loop

1. **Trail start** — single trail (only one exists), short intro, "Start" button.
2. **Map view** — react-leaflet + OSM tiles. Shows all 5 stops (locked/unlocked
   pins), a live "you are here" dot from `watchPosition`, or the simulated
   position when the dev toggle is used.
3. **Arrival** — Haversine distance from live/simulated position to a stop's
   coordinates. Within `radiusMeters` (default 75m) unlocks that stop's
   challenge. A "Simulate arrival" button on each locked stop bypasses this
   for the demo.
4. **Challenge** — a paired, escalating-disclosure prompt (both partners
   answer, not one interviewing the other) plus
   `<input type="file" accept="image/*" capture="environment">` for a photo.
5. **Submit** — photo + short answer saved to `localStorage`, pin lights up
   on the map, stop marked complete.
6. **Repeat** for remaining stops.
7. **Trail complete** — recap screen: mini gallery of the captured photos
   pinned on the map, "trail complete" message.

## Data model

Trail content lives in one static file, separate from app logic, so stops
are trivial to replace once real Riga locations are picked:

```
packages/core/src/trail.ts
{
  id, name, description,
  stops: [
    { id, name, lat, lng, radiusMeters, prompt, challengeType }
  ]
}
```

5 placeholder stops using real, well-known Riga city-centre coordinates
(Freedom Monument, Vērmanes dārzs, Central Market, Dome Square, Riga Castle)
— real pins, real distances, so the proximity-unlock logic is genuinely
testable now, but swappable by editing this one file later.

Progress is the only thing in `localStorage`:
`wanderclue_progress: { [stopId]: { completedAt, photoDataUrl, answer } }`

## Prompts

Drawn from the escalating-disclosure research in `Date activities.odt`:
start light (Tier 1/2 style — "what's a small thing that made you happy this
week?"), escalate by stop (Tier 2/3 style by the last stop). Both partners
answer the same prompt, not a quiz format.

## Components

- `TrailStart`
- `MapView` (markers, live/simulated dot, unlock logic)
- `ChallengeModal` (prompt + photo capture + submit)
- `TrailComplete` (recap gallery)
- Dev-only `SimulateLocationToggle`

## Visual design

Aubergine/gold palette as CSS variables from the start, so the Figma (once
you send it) is a fast reskin rather than a rebuild. Structural UI built
clean and plain until then.

## Explicitly out of scope

Two-phone sync (fake with one device), offline trail downloads, accounts/
auth, MapLibre custom map styling, real backend/database.

## Build approach

This is a small, tightly-scoped single Vite app — I'll build it directly
rather than fan out subagents, since coordination overhead outweighs the
benefit at this size. I'll consider a subagent only for a self-contained,
parallelizable chunk (e.g. writing/reviewing the full prompt set) if useful.

## Deploy

Local Vite dev server to build and test against real Riga coordinates.
Vercel or Netlify for a shareable link before Friday — I'll ask before
actually deploying/publishing anything public.
