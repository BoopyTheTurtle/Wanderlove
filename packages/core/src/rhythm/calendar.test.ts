import { describe, expect, it } from "vitest";
import { civilDate, dayNumber, fromDayNumber, meteorologicalSeason, mondayOf, seasonStart } from "./calendar";

// All instants are UTC so the tests do not depend on the machine's time zone. Riga is UTC+2 in winter and UTC+3 from
// the last Sunday of March to the last Sunday of October.

describe("civilDate", () => {
  it("reads the date in Riga, not in UTC", () => {
    expect(civilDate(new Date("2026-10-04T20:59:59Z"))).toBe("2026-10-04"); // Sunday 23:59:59 EEST
    expect(civilDate(new Date("2026-10-04T21:00:00Z"))).toBe("2026-10-05"); // Monday 00:00 EEST
    expect(civilDate(new Date("2026-11-29T21:59:59Z"))).toBe("2026-11-29"); // Sunday 23:59:59 EET
    expect(civilDate(new Date("2026-11-29T22:00:00Z"))).toBe("2026-11-30"); // Monday 00:00 EET
  });

  it("follows the zone it is given", () => {
    const instant = new Date("2026-03-01T03:00:00Z");
    expect(civilDate(instant, "Europe/Riga")).toBe("2026-03-01");
    expect(civilDate(instant, "America/New_York")).toBe("2026-02-28");
    expect(civilDate(instant, "UTC")).toBe("2026-03-01");
  });

  it("rejects an unknown zone", () => {
    expect(() => civilDate(new Date(), "Mars/Olympus")).toThrow(RangeError);
  });
});

describe("meteorologicalSeason", () => {
  it.each([
    ["2026-02-28", "winter"],
    ["2028-02-29", "winter"],
    ["2026-03-01", "spring"],
    ["2026-05-31", "spring"],
    ["2026-06-01", "summer"],
    ["2026-08-31", "summer"],
    ["2026-09-01", "autumn"],
    ["2026-11-30", "autumn"],
    ["2026-12-01", "winter"],
    ["2027-01-15", "winter"],
  ] as const)("puts %s in %s", (day, season) => {
    expect(meteorologicalSeason(day)).toBe(season);
  });

  it("turns at local midnight in Riga", () => {
    expect(meteorologicalSeason(new Date("2026-02-28T21:59:59Z"))).toBe("winter");
    expect(meteorologicalSeason(new Date("2026-02-28T22:00:00Z"))).toBe("spring");
    expect(meteorologicalSeason(new Date("2026-05-31T20:59:59Z"))).toBe("spring");
    expect(meteorologicalSeason(new Date("2026-05-31T21:00:00Z"))).toBe("summer");
  });
});

describe("day arithmetic", () => {
  it("round-trips civil dates", () => {
    for (const day of ["1970-01-01", "2026-03-29", "2026-10-25", "2028-02-29", "2026-12-31"]) {
      expect(fromDayNumber(dayNumber(day))).toBe(day);
    }
  });

  it("finds the Monday of a week, with Sunday as its last day", () => {
    expect(fromDayNumber(mondayOf(dayNumber("2026-10-04")))).toBe("2026-09-28"); // Sunday
    expect(fromDayNumber(mondayOf(dayNumber("2026-10-05")))).toBe("2026-10-05"); // Monday
    expect(fromDayNumber(mondayOf(dayNumber("2027-01-01")))).toBe("2026-12-28"); // across a year
  });

  it("finds the start of the season, with winter starting the year before", () => {
    expect(seasonStart("2026-10-02")).toBe("2026-09-01");
    expect(seasonStart("2026-03-01")).toBe("2026-03-01");
    expect(seasonStart("2026-08-31")).toBe("2026-06-01");
    expect(seasonStart("2026-12-24")).toBe("2026-12-01");
    expect(seasonStart("2027-02-28")).toBe("2026-12-01");
  });
});
