// The weekly rhythm (gamification.md §4.3): a row of weeks, filled when the couple walked that week. No streaks:
// nothing counts down, nothing counts missed weeks, and an empty week carries no flag the app could paint as a loss.
import {
  DEFAULT_TIME_ZONE,
  civilDate,
  dayNumber,
  fromDayNumber,
  meteorologicalSeason,
  mondayOf,
  seasonStart,
} from "./calendar";
import type { CivilDate, Season } from "./calendar";

/** The couple's optional goal: one walk a week, or two a month. */
export type RhythmGoal = "weekly" | "twice_monthly";

/**
 * Which weeks to show: the weeks of the current month (the default), or the last `count` weeks ending with this one.
 * A week belongs to the month of its Thursday, as in ISO 8601, so each week sits in exactly one month and the current
 * week is always in view.
 */
export type RhythmWindow = { kind: "month" } | { kind: "weeks"; count: number };

export type RhythmInput = {
  /** When each finished quest ended: an instant, or a civil date ("YYYY-MM-DD") already in `timeZone`. */
  walks: ReadonlyArray<Date | CivilDate>;
  now: Date;
  goal?: RhythmGoal | null;
  /** Either partner can pause the goal (holiday, illness); a paused goal shows no dots. */
  paused?: boolean;
  window?: RhythmWindow;
  /** The zone weeks, months, and seasons are reckoned in. Defaults to Europe/Riga. */
  timeZone?: string;
};

export type RhythmWeek = {
  /** Monday, as "YYYY-MM-DD". */
  start: CivilDate;
  /** Sunday, as "YYYY-MM-DD". */
  end: CivilDate;
  /** True when the couple finished at least one quest that week. */
  filled: boolean;
  /** True for the week holding `now`. */
  current: boolean;
  /** True for a week that has not started yet; only the month window shows those. */
  upcoming: boolean;
};

export type GoalProgress = {
  goal: RhythmGoal;
  /** The span the dots cover: this week for "weekly", this calendar month for "twice_monthly". */
  period: "week" | "month";
  /** One dot per walk the goal asks for, filled in order; days with a walk count, so two walks in a day fill one. */
  dots: boolean[];
};

export type Rhythm = {
  weeks: RhythmWeek[];
  season: Season;
  /** Weeks this season (so far) with at least one walk. Never a count of missed weeks. */
  seasonWeeks: number;
  /** "5 weeks with a walk this season", or null before the season's first walk. */
  seasonLine: string | null;
  /** Null when there is no goal or it is paused. */
  goalProgress: GoalProgress | null;
};

/** Build the weekly rhythm for `now`. Pure and deterministic: every date is reckoned in `timeZone`. */
export function weeklyRhythm(input: RhythmInput): Rhythm {
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const today = civilDate(input.now, timeZone);
  const todayN = dayNumber(today);
  const thisMonday = mondayOf(todayN);

  // Walks after `now` (clock skew, a bad row) are ignored rather than shown in the future.
  const walkDays = new Set<number>();
  for (const walk of input.walks) {
    const n = dayNumber(typeof walk === "string" ? walk : civilDate(walk, timeZone));
    if (n <= todayN) walkDays.add(n);
  }
  const walkedInWeek = (monday: number) => {
    for (let d = monday; d < monday + 7; d++) if (walkDays.has(d)) return true;
    return false;
  };

  const weeks = windowMondays(input.window ?? { kind: "month" }, thisMonday).map((monday) => ({
    start: fromDayNumber(monday),
    end: fromDayNumber(monday + 6),
    filled: walkedInWeek(monday),
    current: monday === thisMonday,
    upcoming: monday > thisMonday,
  }));

  const seasonFirst = dayNumber(seasonStart(today));
  const seasonMondays = new Set<number>();
  for (const n of walkDays) if (n >= seasonFirst) seasonMondays.add(mondayOf(n));
  const seasonWeeks = seasonMondays.size;

  return {
    weeks,
    season: meteorologicalSeason(today),
    seasonWeeks,
    seasonLine: seasonWeeksLine(seasonWeeks),
    goalProgress: input.paused || !input.goal ? null : goalProgress(input.goal, walkDays, today, thisMonday),
  };
}

/** The count-up line for the season, or null at zero so the app never shows an empty tally. */
export function seasonWeeksLine(weeks: number): string | null {
  if (weeks <= 0) return null;
  return `${weeks} ${weeks === 1 ? "week" : "weeks"} with a walk this season`;
}

function windowMondays(window: RhythmWindow, thisMonday: number): number[] {
  if (window.kind === "weeks") {
    const count = Math.max(1, Math.floor(window.count));
    return Array.from({ length: count }, (_, i) => thisMonday - 7 * (count - 1 - i));
  }
  const monthOf = (monday: number) => fromDayNumber(monday + 3).slice(0, 7); // the Thursday's "YYYY-MM"
  const month = monthOf(thisMonday);
  let first = thisMonday;
  while (monthOf(first - 7) === month) first -= 7;
  const mondays: number[] = [];
  for (let m = first; monthOf(m) === month; m += 7) mondays.push(m);
  return mondays;
}

function goalProgress(goal: RhythmGoal, walkDays: Set<number>, today: CivilDate, thisMonday: number): GoalProgress {
  const [from, target, period] =
    goal === "weekly"
      ? ([thisMonday, 1, "week"] as const)
      : ([dayNumber(`${today.slice(0, 7)}-01`), 2, "month"] as const);
  const to = dayNumber(today);
  let walked = 0;
  for (const n of walkDays) if (n >= from && n <= to) walked++;
  return { goal, period, dots: Array.from({ length: target }, (_, i) => i < walked) };
}
