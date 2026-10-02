import { describe, expect, it } from "vitest";
import { seasonWeeksLine, weeklyRhythm } from "./rhythm";

// All instants are UTC so the tests do not depend on the machine's time zone. Riga is UTC+3 until 2026-10-25 and
// UTC+2 after; in 2026 summer time began on 2026-03-29.
const FRIDAY_NOON = new Date("2026-10-02T09:00:00Z"); // Friday 2 October 2026, 12:00 in Riga

describe("weeklyRhythm weeks", () => {
  it("shows the weeks whose Thursday falls in the current month, Monday first", () => {
    const { weeks } = weeklyRhythm({ walks: [], now: FRIDAY_NOON });
    expect(weeks.map((w) => w.start)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(weeks[0]).toEqual({ start: "2026-09-28", end: "2026-10-04", filled: false, current: true, upcoming: false });
    expect(weeks.slice(1).every((w) => w.upcoming && !w.current && !w.filled)).toBe(true);
  });

  it("keeps the current week in view at the start of a month that begins late in the week", () => {
    // Sunday 1 November 2026: its week's Thursday is 29 October, so the row is October's.
    const { weeks } = weeklyRhythm({ walks: [], now: new Date("2026-11-01T10:00:00Z") });
    expect(weeks.find((w) => w.current)?.start).toBe("2026-10-26");
    expect(weeks[0].start).toBe("2026-09-28");
  });

  it("fills a week with any walk in it and leaves an empty week plain", () => {
    const now = new Date("2026-10-30T10:00:00Z");
    const walks = [new Date("2026-10-06T15:00:00Z"), "2026-10-24", new Date("2026-10-25T09:00:00Z")];
    const { weeks } = weeklyRhythm({ walks, now });
    expect(weeks.map((w) => w.filled)).toEqual([false, true, false, true, false]);
    expect(Object.keys(weeks[0]).sort()).toEqual(["current", "end", "filled", "start", "upcoming"]);
  });

  it("splits weeks at Monday midnight in Riga, in summer time", () => {
    const now = new Date("2026-10-07T10:00:00Z");
    const sundayLate = weeklyRhythm({ walks: [new Date("2026-10-04T20:59:00Z")], now }); // Sun 23:59 EEST
    const mondayEarly = weeklyRhythm({ walks: [new Date("2026-10-04T21:00:00Z")], now }); // Mon 00:00 EEST
    expect(sundayLate.weeks.find((w) => w.filled)?.start).toBe("2026-09-28");
    expect(mondayEarly.weeks.find((w) => w.filled)?.start).toBe("2026-10-05");
  });

  it("splits weeks at Monday midnight in Riga, in winter time", () => {
    const now = new Date("2026-12-02T10:00:00Z");
    const sundayLate = weeklyRhythm({ walks: [new Date("2026-11-29T21:59:00Z")], now }); // Sun 23:59 EET
    const mondayEarly = weeklyRhythm({ walks: [new Date("2026-11-29T22:00:00Z")], now }); // Mon 00:00 EET
    expect(sundayLate.weeks.some((w) => w.filled)).toBe(false); // that Sunday's week belongs to November's row
    const lastTwo = weeklyRhythm({
      walks: [new Date("2026-11-29T21:59:00Z")],
      now,
      window: { kind: "weeks", count: 2 },
    });
    expect(lastTwo.weeks.map((w) => [w.start, w.filled])).toEqual([
      ["2026-11-23", true],
      ["2026-11-30", false],
    ]);
    expect(mondayEarly.weeks.find((w) => w.filled)?.start).toBe("2026-11-30");
  });

  it("uses the summer-time offset on the night the clocks go forward", () => {
    // 2026-03-29T21:30Z is Monday 00:30 EEST; with the winter offset it would still be Sunday.
    const { weeks } = weeklyRhythm({
      walks: [new Date("2026-03-29T21:30:00Z")],
      now: new Date("2026-04-01T10:00:00Z"),
      window: { kind: "weeks", count: 2 },
    });
    expect(weeks.map((w) => [w.start, w.filled])).toEqual([
      ["2026-03-23", false],
      ["2026-03-30", true],
    ]);
  });

  it("uses the winter-time offset on the night the clocks go back", () => {
    // 2026-10-25T21:30Z is Sunday 23:30 EET; with the summer offset it would already be Monday.
    const { weeks } = weeklyRhythm({
      walks: [new Date("2026-10-25T21:30:00Z")],
      now: new Date("2026-10-28T10:00:00Z"),
      window: { kind: "weeks", count: 2 },
    });
    expect(weeks.map((w) => [w.start, w.filled])).toEqual([
      ["2026-10-19", true],
      ["2026-10-26", false],
    ]);
  });

  it("shows the last N weeks ending with this one", () => {
    const { weeks } = weeklyRhythm({ walks: [], now: FRIDAY_NOON, window: { kind: "weeks", count: 3 } });
    expect(weeks.map((w) => w.start)).toEqual(["2026-09-14", "2026-09-21", "2026-09-28"]);
    expect(weeks.map((w) => w.current)).toEqual([false, false, true]);
  });

  it("reckons the week in the zone it is given", () => {
    // Monday 00:30 in Riga is still Sunday evening in New York.
    const walk = new Date("2026-10-04T21:30:00Z");
    const window = { kind: "weeks", count: 2 } as const;
    const now = new Date("2026-10-07T16:00:00Z");
    const riga = weeklyRhythm({ walks: [walk], now, window });
    const newYork = weeklyRhythm({ walks: [walk], now, window, timeZone: "America/New_York" });
    expect(riga.weeks.map((w) => w.filled)).toEqual([false, true]);
    expect(newYork.weeks.map((w) => w.filled)).toEqual([true, false]);
  });

  it("ignores walks after now", () => {
    const { weeks } = weeklyRhythm({ walks: ["2026-10-06"], now: FRIDAY_NOON });
    expect(weeks.some((w) => w.filled)).toBe(false);
  });

  it("is deterministic", () => {
    const input = {
      walks: ["2026-09-29", new Date("2026-09-30T12:00:00Z")],
      now: FRIDAY_NOON,
      goal: "weekly" as const,
    };
    expect(weeklyRhythm(input)).toEqual(weeklyRhythm(input));
  });
});

describe("weeklyRhythm season count", () => {
  it("counts weeks with a walk since the season began, never missed ones", () => {
    // Autumn began on Tuesday 1 September 2026. Two walks share a week; three weeks in all.
    const walks = ["2026-09-01", "2026-09-03", "2026-09-16", "2026-10-01"];
    const rhythm = weeklyRhythm({ walks, now: FRIDAY_NOON });
    expect(rhythm.season).toBe("autumn");
    expect(rhythm.seasonWeeks).toBe(3);
    expect(rhythm.seasonLine).toBe("3 weeks with a walk this season");
  });

  it("leaves out last season's walks, even in a week that straddles the change", () => {
    // Monday 31 August is summer; that week only counts for autumn through a walk on or after 1 September.
    const summerOnly = weeklyRhythm({ walks: ["2026-08-31"], now: FRIDAY_NOON });
    expect(summerOnly.seasonWeeks).toBe(0);
    expect(summerOnly.seasonLine).toBeNull();
    const both = weeklyRhythm({ walks: ["2026-08-31", "2026-09-06"], now: FRIDAY_NOON });
    expect(both.seasonWeeks).toBe(1);
  });

  it("starts a fresh count when the season turns at midnight in Riga", () => {
    const walks = ["2026-11-25"];
    expect(weeklyRhythm({ walks, now: new Date("2026-11-30T21:59:00Z") }).seasonWeeks).toBe(1); // 23:59 30 Nov
    const winter = weeklyRhythm({ walks, now: new Date("2026-11-30T22:00:00Z") }); // 00:00 1 Dec
    expect(winter.season).toBe("winter");
    expect(winter.seasonWeeks).toBe(0);
  });

  it("carries winter across the new year", () => {
    const walks = ["2026-12-10", "2027-01-05", "2027-02-20"];
    const rhythm = weeklyRhythm({ walks, now: new Date("2027-02-25T10:00:00Z") });
    expect(rhythm.season).toBe("winter");
    expect(rhythm.seasonWeeks).toBe(3);
  });

  it("uses the singular for one week", () => {
    expect(seasonWeeksLine(1)).toBe("1 week with a walk this season");
    expect(seasonWeeksLine(5)).toBe("5 weeks with a walk this season");
    expect(seasonWeeksLine(0)).toBeNull();
  });
});

describe("weeklyRhythm goal", () => {
  it("shows no dots without a goal or while paused", () => {
    expect(weeklyRhythm({ walks: [], now: FRIDAY_NOON }).goalProgress).toBeNull();
    expect(weeklyRhythm({ walks: [], now: FRIDAY_NOON, goal: null }).goalProgress).toBeNull();
    expect(weeklyRhythm({ walks: [], now: FRIDAY_NOON, goal: "weekly", paused: true }).goalProgress).toBeNull();
  });

  it("fills one dot for a walk this week", () => {
    const empty = weeklyRhythm({ walks: ["2026-09-27"], now: FRIDAY_NOON, goal: "weekly" }); // last Sunday
    expect(empty.goalProgress).toEqual({ goal: "weekly", period: "week", dots: [false] });
    const done = weeklyRhythm({ walks: ["2026-09-28"], now: FRIDAY_NOON, goal: "weekly" }); // this Monday
    expect(done.goalProgress?.dots).toEqual([true]);
  });

  it("counts two walk days this calendar month for the twice-a-month goal", () => {
    // The current week began in September, but the month goal counts October only.
    const walks = ["2026-09-29", "2026-10-01"];
    const one = weeklyRhythm({ walks, now: FRIDAY_NOON, goal: "twice_monthly" });
    expect(one.goalProgress).toEqual({ goal: "twice_monthly", period: "month", dots: [true, false] });
    const full = weeklyRhythm({ walks: ["2026-10-01", "2026-10-02"], now: FRIDAY_NOON, goal: "twice_monthly" });
    expect(full.goalProgress?.dots).toEqual([true, true]);
  });

  it("counts two walks on one day as one dot", () => {
    const walks = [new Date("2026-10-01T08:00:00Z"), new Date("2026-10-01T16:00:00Z")];
    const rhythm = weeklyRhythm({ walks, now: FRIDAY_NOON, goal: "twice_monthly" });
    expect(rhythm.goalProgress?.dots).toEqual([true, false]);
  });

  it("starts the month at midnight in Riga", () => {
    // 2026-09-30T21:30Z is 00:30 on 1 October in Riga.
    const rhythm = weeklyRhythm({
      walks: [new Date("2026-09-30T21:30:00Z")],
      now: FRIDAY_NOON,
      goal: "twice_monthly",
    });
    expect(rhythm.goalProgress?.dots).toEqual([true, false]);
  });
});
