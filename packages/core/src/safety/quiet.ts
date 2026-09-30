import type { LatLng } from "../geo";
import { haversineDistanceMeters } from "../geo";

// Quiet stops (route-safety.md H14) take only introductory, deep, or wrap-up tasks, which the quest engine puts on
// slots 1, 3, and 5. A route holds at most two of them.

export const MAX_QUIET_STOPS = 2;

// Slots count from 1, so quiet stops sit on even indexes.
export const isQuietSlot = (index: number) => index % 2 === 0;

function loopMeters(start: LatLng, stops: LatLng[]): number {
  let d = 0;
  let prev = start;
  for (const s of stops) {
    d += haversineDistanceMeters(prev, s);
    prev = s;
  }
  return d + haversineDistanceMeters(prev, start);
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

// The shortest walking order (by straight lines) that puts every quiet stop on a quiet slot. Five stops give 120
// orders, cheap enough to try them all. Returns the stops unchanged when no order fits, which the max-two rule rules
// out for five stops.
export function orderStops<T extends LatLng & { quiet: boolean }>(start: LatLng, stops: T[]): T[] {
  if (stops.length > 8) return stops;
  let best: { order: T[]; len: number } | null = null;
  for (const order of permutations(stops)) {
    if (order.some((s, i) => s.quiet && !isQuietSlot(i))) continue;
    const len = loopMeters(start, order);
    if (!best || len < best.len) best = { order, len };
  }
  return best ? best.order : stops;
}
