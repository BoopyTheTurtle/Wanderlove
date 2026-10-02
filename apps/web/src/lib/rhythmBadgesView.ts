import { badgeById } from "@wannadoo/core";
import type { RhythmWeek } from "@wannadoo/core";
import type { Badge } from "./badges";
import type { GoalKind } from "./rhythm";

// Pure helpers for RhythmCard, BadgeShelf, and their tests.

export const GOAL_LABELS: Record<GoalKind, string> = {
  weekly: "One walk a week",
  twice_monthly: "Two walks a month",
};

// "29 Sep" for a week's Monday.
export function weekLabel(start: string): string {
  return new Date(`${start}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// The month the weeks belong to: the month of the current week's Thursday, as core reckons it.
export function monthTitle(weeks: readonly RhythmWeek[]): string {
  const week = weeks.find((w) => w.current) ?? weeks[0];
  if (!week) return "";
  const thursday = new Date(`${week.start}T12:00:00Z`);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  return thursday.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
}

// What a screen reader hears for a week. An empty week is just its date: nothing marks it as a loss.
export function weekName(week: RhythmWeek): string {
  const parts = [`Week of ${weekLabel(week.start)}`];
  if (week.filled) parts.push("you walked");
  if (week.current) parts.push("this week");
  return parts.join(", ");
}

export type ShelfItem = { id: string; title: string; line: string; day: string };

// Newest first, with the line that fits the badge's owner; ids this build doesn't know are skipped.
export function shelfItems(badges: readonly Badge[]): ShelfItem[] {
  return badges
    .flatMap((b) => {
      const entry = badgeById(b.badge);
      if (!entry) return [];
      return [
        {
          id: `${b.scope}:${b.badge}`,
          title: entry.title,
          line: b.scope === "solo" ? entry.soloLine : entry.line,
          day: b.earnedOn,
        },
      ];
    })
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

// "2 Oct 2026" for a civil date, whatever the phone's time zone.
export function earnedDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
