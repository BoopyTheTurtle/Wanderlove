// Memory badges (gamification.md §4.6): a small set that records experiences, not effort. They appear unannounced,
// and the app never lists the ones still locked. The ids are shared with the backend; never rename one.
import { sunTimes } from "../daylight";
import type { SunTimes } from "../daylight";
import type { LatLng } from "../geo";
import { DEFAULT_TIME_ZONE, meteorologicalSeason } from "../rhythm/calendar";

export type BadgeId =
  | "first-walk"
  | "first-rain-walk"
  | "first-after-dark"
  | "season-spring"
  | "season-summer"
  | "season-autumn"
  | "season-winter"
  | "special-quest";

export type Badge = {
  id: BadgeId;
  title: string;
  /** The memory, for a couple ("you two"). */
  line: string;
  /** The same memory for a solo walker ("Just me"). */
  soloLine: string;
  /** False for a badge the app cannot award yet; badgesEarned never returns it. */
  active: boolean;
};

export const badges: readonly Badge[] = [
  {
    id: "first-walk",
    title: "First walk",
    line: "Your first walk together",
    soloLine: "Your first walk",
    active: true,
  },
  {
    // Defined for the backend, but waits for live weather before the app can tell a rain walk.
    id: "first-rain-walk",
    title: "Rain walk",
    line: "You two walked in the rain",
    soloLine: "You walked in the rain",
    active: false,
  },
  {
    id: "first-after-dark",
    title: "After dark",
    line: "Your first walk together after dark",
    soloLine: "Your first walk after dark",
    active: true,
  },
  {
    id: "season-spring",
    title: "Spring",
    line: "Your first spring walk together",
    soloLine: "Your first spring walk",
    active: true,
  },
  {
    id: "season-summer",
    title: "Summer",
    line: "Your first summer walk together",
    soloLine: "Your first summer walk",
    active: true,
  },
  {
    id: "season-autumn",
    title: "Autumn",
    line: "Your first autumn walk together",
    soloLine: "Your first autumn walk",
    active: true,
  },
  {
    id: "season-winter",
    title: "Winter",
    line: "Your first winter walk together",
    soloLine: "Your first winter walk",
    active: true,
  },
  {
    id: "special-quest",
    title: "Special quest",
    line: "You two finished a special quest",
    soloLine: "You finished a special quest",
    active: true,
  },
];

const byId = new Map(badges.map((badge) => [badge.id, badge]));

/** The registry entry for `id`, or undefined for an unknown id (an old or newer client's badge). */
export function badgeById(id: string): Badge | undefined {
  return byId.get(id as BadgeId);
}

export type BadgeContext = {
  /** When the quest finished. */
  finishedAt: Date;
  /**
   * Sunrise and sunset for that day and place, if the caller has them; otherwise `position` lets core compute them.
   * With neither, no after-dark badge is awarded. "always-down" (polar night) counts as dark, "always-up" as light.
   */
  sun?: SunTimes;
  /** Where the quest finished; used only to compute `sun` and never stored. */
  position?: LatLng;
  isSpecialQuest: boolean;
  /** True when this is the couple's (or solo walker's) first finished quest. */
  isFirstQuest: boolean;
  /** The zone the season is reckoned in. Defaults to Europe/Riga. */
  timeZone?: string;
};

/**
 * The badges this finished quest earns, in registry order: only active badges, and only those not in `alreadyEarned`.
 * Unknown ids in `alreadyEarned` are ignored.
 */
export function badgesEarned(context: BadgeContext, alreadyEarned: Iterable<string> = []): BadgeId[] {
  const earned = new Set<BadgeId>();
  if (context.isFirstQuest) earned.add("first-walk");
  if (context.isSpecialQuest) earned.add("special-quest");
  if (finishedInDark(context)) earned.add("first-after-dark");
  earned.add(`season-${meteorologicalSeason(context.finishedAt, context.timeZone ?? DEFAULT_TIME_ZONE)}`);

  const had = new Set(alreadyEarned);
  return badges.filter((badge) => badge.active && earned.has(badge.id) && !had.has(badge.id)).map((b) => b.id);
}

/** True when `at` falls after sunset or before sunrise (or in polar night). */
export function isAfterDark(at: Date, sun: SunTimes): boolean {
  if (sun === "always-down") return true;
  if (sun === "always-up") return false;
  const t = at.getTime();
  return t < sun.rise.getTime() || t >= sun.set.getTime();
}

function finishedInDark(context: BadgeContext): boolean {
  const sun =
    context.sun ?? (context.position && sunTimes(context.finishedAt, context.position.lat, context.position.lng));
  return sun ? isAfterDark(context.finishedAt, sun) : false;
}
