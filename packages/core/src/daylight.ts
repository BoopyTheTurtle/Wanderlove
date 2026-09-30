// Sunrise, sunset, civil dusk, and calendar-season notes, computed on the phone (route-safety.md §2.3 H10, H11, H4;
// §2.4). Pure maths: no API, and the start position never leaves the device. Functions return Dates and identifiers;
// the app formats the times and owns the copy.
import type { LatLng } from "./geo";

const RAD = Math.PI / 180;
const MS_PER_DAY = 86400000;
const JULIAN_UNIX_EPOCH = 2440587.5;
const J2000 = 2451545;

/** Sun altitude, in degrees, at which the upper limb touches the horizon (includes refraction). */
export const SUNSET_ALTITUDE = -0.833;
/** Sun altitude, in degrees, at which civil twilight ends (civil dusk) or begins (civil dawn). */
export const CIVIL_DUSK_ALTITUDE = -6;

export type SunTimes = { rise: Date; set: Date } | "always-up" | "always-down";

/**
 * Times when the sun crosses `altitude` for the solar day nearest `now`, by the standard sunrise equation.
 * Returns "always-up" or "always-down" when it never crosses that altitude that day (polar day or night).
 * Accurate to about a minute at mid latitudes.
 */
export function sunTimes(now: Date, lat: number, lng: number, altitude = SUNSET_ALTITUDE): SunTimes {
  const jd = now.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH;
  const n = Math.round(jd - J2000 + lng / 360);
  const jStar = n - lng / 360; // mean solar noon
  const M = mod360(357.5291 + 0.98560028 * jStar);
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const lambda = mod360(M + C + 180 + 102.9372);
  const transit = J2000 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const sinDec = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.sin(altitude * RAD) - Math.sin(lat * RAD) * sinDec) / (Math.cos(lat * RAD) * cosDec);
  if (cosH < -1) return "always-up";
  if (cosH > 1) return "always-down";
  const h = Math.acos(cosH) / RAD / 360;
  const toDate = (j: number) => new Date((j - JULIAN_UNIX_EPOCH) * MS_PER_DAY);
  return { rise: toDate(transit - h), set: toDate(transit + h) };
}

/** Civil dawn (`rise`) and civil dusk (`set`) for the solar day nearest `now`. */
export function civilTwilight(now: Date, lat: number, lng: number): SunTimes {
  return sunTimes(now, lat, lng, CIVIL_DUSK_ALTITUDE);
}

/**
 * The light situation before a quest:
 * - "day": the sun is up and stays up for the whole walk;
 * - "ends-after-sunset": the sun is up now but sets before the walk ends, so the app shows the after-sunset warning;
 * - "dark": the sun is already down (or polar night). `afterDusk` is true once civil twilight has ended too, when
 *   the route should prefer lit streets over parks and woods (H10).
 */
export type WalkLight =
  { kind: "day" } | { kind: "ends-after-sunset"; sunset: Date } | { kind: "dark"; afterDusk: boolean };

/** Decide the pre-quest light situation for a walk of `durationMinutes` starting at `start` now. */
export function walkLight(now: Date, start: LatLng, durationMinutes: number): WalkLight {
  const sun = sunTimes(now, start.lat, start.lng, SUNSET_ALTITUDE);
  if (sun === "always-up") return { kind: "day" };
  if (sun === "always-down" || isOutside(now, sun)) {
    return { kind: "dark", afterDusk: isAfterDusk(now, start) };
  }
  const end = new Date(now.getTime() + durationMinutes * 60000);
  if (end.getTime() > sun.set.getTime()) return { kind: "ends-after-sunset", sunset: sun.set };
  return { kind: "day" };
}

export type SeasonNote = "winter" | "summer";

/**
 * The calendar-season note for the pre-quest screen (H11, H4), by month in the local time zone of `date`:
 * November to March → "winter" (ice and cold), June to August → "summer" (heat and thunderstorms), otherwise null.
 */
export function seasonNote(date: Date): SeasonNote | null {
  const month = date.getMonth() + 1; // 1 = January
  if (month >= 11 || month <= 3) return "winter";
  if (month >= 6 && month <= 8) return "summer";
  return null;
}

function isAfterDusk(now: Date, start: LatLng): boolean {
  const civil = civilTwilight(now, start.lat, start.lng);
  if (civil === "always-up") return false; // white night: twilight all night long
  if (civil === "always-down") return true;
  return isOutside(now, civil);
}

function isOutside(now: Date, times: { rise: Date; set: Date }): boolean {
  const t = now.getTime();
  return t < times.rise.getTime() || t >= times.set.getTime();
}

function mod360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
