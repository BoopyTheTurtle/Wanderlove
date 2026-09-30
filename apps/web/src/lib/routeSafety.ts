// The safety notes shown before a surprise route starts (route-safety.md, section 4), and what this phone remembers
// about them: how many surprise quests each user started here, and whether they asked not to see the note again.
import { seasonNote, walkLight } from "@wannadoo/core";
import type { LatLng, WalkLight } from "@wannadoo/core";

// "Shorter loop" asks for this much instead of the usual 2 km, which cuts the walk by about a third.
export const SHORTER_LOOP_METERS = 1400;

// The "Don't show again" option appears once the user has started this many surprise quests on this phone.
export const QUESTS_BEFORE_HIDE = 3;

export const SAFETY_NOTE = {
  title: "Your route is a suggestion.",
  body:
    "We picked these stops from the map, and nobody has walked this loop. Watch for traffic and cross at crossings. " +
    "Skip any stop that looks closed, private, unsafe, or just wrong; skipping costs nothing. You know the street " +
    "better than the map does.",
  winter: "Pavements and steps may be icy. Stay off frozen ponds and rivers, whatever the task says.",
  summer: "On a hot day, bring water and rest in the shade. If you hear thunder, head indoors and finish another time.",
  rural:
    "Part of this loop follows a road without a pavement. Walk facing traffic, single file, and wear a reflector " +
    "after dark.",
} as const;

export const QUIET_STOP_LINE =
  "This is a place of remembrance. Keep it quiet here, and let the photo wait if people are grieving or praying.";

// The extra lines under the pre-quest note: the season (by the phone's calendar), then the rural road.
export function safetyNoteLines(now: Date, rural: boolean): string[] {
  const lines: string[] = [];
  const season = seasonNote(now);
  if (season) lines.push(SAFETY_NOTE[season]);
  if (rural) lines.push(SAFETY_NOTE.rural);
  return lines;
}

// A time as HH:MM in the phone's own time zone.
export function formatClock(date: Date): string {
  return [date.getHours(), date.getMinutes()].map((n) => String(n).padStart(2, "0")).join(":");
}

export type SunsetWarning = { title: string; body: string };

// The after-sunset warning for a walk starting at `start` now, or null in daylight. It never blocks the quest.
export function sunsetWarning(now: Date, start: LatLng, durationMinutes: number): SunsetWarning | null {
  return sunsetWarningFor(walkLight(now, start, durationMinutes), durationMinutes);
}

export function sunsetWarningFor(light: WalkLight, durationMinutes: number): SunsetWarning | null {
  if (light.kind === "day") return null;
  // The card adds "Want a shorter loop?" while it can still offer one.
  const advice =
    "Stick to lit streets, wear a reflector (Latvian rules require one on unlit roads), and skip any stop that " +
    "feels too quiet.";
  if (light.kind === "dark") {
    return { title: "It’s already dark.", body: `This walk takes about ${durationMinutes} minutes. ${advice}` };
  }
  return {
    title: `It gets dark at ${formatClock(light.sunset)}.`,
    body: `This walk takes about ${durationMinutes} minutes and will end after sunset. ${advice}`,
  };
}

// ---- What this phone remembers ------------------------------------------------------------------------------------

const NOTE_KEY = "wannadoo_safety_note";

export type SafetyNoteState = { quests: number; hidden: boolean };

const EMPTY: SafetyNoteState = { quests: 0, hidden: false };

type NoteMap = Record<string, SafetyNoteState>;

function readAll(): NoteMap {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage.getItem(NOTE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as NoteMap) : {};
  } catch {
    return {};
  }
}

function writeAll(all: NoteMap): void {
  try {
    if (Object.keys(all).length === 0) globalThis.localStorage.removeItem(NOTE_KEY);
    else globalThis.localStorage.setItem(NOTE_KEY, JSON.stringify(all));
  } catch {
    // Without storage the note keeps showing, which is the safe side.
  }
}

export function loadSafetyNote(userId: string): SafetyNoteState {
  const entry: unknown = readAll()[userId];
  if (!entry || typeof entry !== "object") return EMPTY;
  const { quests, hidden } = entry as Record<string, unknown>;
  return {
    quests: typeof quests === "number" && Number.isFinite(quests) && quests > 0 ? Math.floor(quests) : 0,
    hidden: hidden === true,
  };
}

function saveSafetyNote(userId: string, state: SafetyNoteState): SafetyNoteState {
  writeAll({ ...readAll(), [userId]: state });
  return state;
}

// Counts a started surprise quest.
export function countSurpriseQuest(userId: string): SafetyNoteState {
  const state = loadSafetyNote(userId);
  return saveSafetyNote(userId, { ...state, quests: state.quests + 1 });
}

// "Don't show again": allowed only once the user has seen the note on enough quests.
export function hideSafetyNote(userId: string): SafetyNoteState {
  const state = loadSafetyNote(userId);
  if (!canHideSafetyNote(state)) return state;
  return saveSafetyNote(userId, { ...state, hidden: true });
}

export function canHideSafetyNote(state: SafetyNoteState): boolean {
  return state.quests >= QUESTS_BEFORE_HIDE;
}

// Leaving the phone clean: forgets this user's count and choice.
export function forgetSafetyNote(userId: string): void {
  const all = readAll();
  if (!(userId in all)) return;
  delete all[userId];
  writeAll(all);
}
