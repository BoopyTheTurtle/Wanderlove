import type { LatLng, RouteOptions } from "@wannadoo/core";
import { supabase } from "./supabase";

// Stop reports (mvp-roadmap.md stage 11). A report sends one stop's position, and nothing about the walk around it:
// never the start, the path, or the live position. The phone downloads every reported place and new routes skip them.

export type ReportReason = "unsafe" | "unpleasant";
export const REPORT_NOTE_MAX = 280;

// How long the downloaded list serves new routes before the next one fetches it again.
export const REPORTED_PLACES_TTL_MS = 10 * 60 * 1000;

let cache: { places: LatLng[]; at: number } | null = null;
// Places this phone reported since sign-in; they apply even before the list downloads, or when it fails to.
let mine: LatLng[] = [];
// Bumped on sign-out, so a download still in flight never refills the cache for the next user.
let generation = 0;

// Sends the stop's position, rounded by the server to about a metre, with the reason and an optional note. Takes the
// two coordinates alone, so passing a whole Stop can never send more.
export async function reportStop(stop: LatLng, reason: ReportReason, note: string): Promise<void> {
  const position = { lat: stop.lat, lng: stop.lng };
  const trimmed = note.trim();
  const { error } = await supabase.rpc("report_stop", {
    p_lat: position.lat,
    p_lng: position.lng,
    p_reason: reason,
    ...(trimmed ? { p_note: trimmed } : {}),
  });
  if (error) throw error;
  mine = [...mine, position];
  if (cache) cache = { ...cache, places: [...cache.places, position] };
}

// Every open or confirmed report's position. Downloads the whole list, so the request says nothing about where the
// user is. Throws when the download fails.
export async function loadReportedPlaces(now = Date.now()): Promise<LatLng[]> {
  if (cache && now - cache.at < REPORTED_PLACES_TTL_MS) return cache.places;
  const asked = generation;
  const { data, error } = await supabase.rpc("reported_places");
  if (error) throw error;
  const places = [...(data ?? []).map((r) => ({ lat: r.lat, lng: r.lng })), ...mine];
  if (asked === generation) cache = { places, at: now };
  return places;
}

// Route options for a surprise route. The reported places never block a walk: when the list fails to load, the route
// avoids only what this phone reported.
export async function surpriseRouteOptions(maxMeters?: number): Promise<RouteOptions> {
  let avoid: LatLng[];
  try {
    avoid = await loadReportedPlaces();
  } catch (e) {
    console.error("Couldn't load reported places", e);
    avoid = mine;
  }
  return { maxMeters, avoid };
}

// On sign-out: the list and this phone's own reports go, like the place cache.
export function clearReportedPlaces(): void {
  cache = null;
  mine = [];
  generation++;
}

export type ReportFailure = "tooMany" | "offline" | "other";

// Sorts a failed report into what the sheet tells the user.
export function reportFailure(
  error: unknown,
  online = typeof navigator === "undefined" || navigator.onLine,
): ReportFailure {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === "P0001" && e.message === "too_many_reports") return "tooMany";
  if (!online || /failed to fetch|network|load failed/i.test(e?.message ?? "")) return "offline";
  return "other";
}
