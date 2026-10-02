import { describe, expect, it } from "vitest";
import { sunTimes } from "../daylight";
import { badgeById, badges, badgesEarned, isAfterDark } from "./badges";
import type { BadgeContext } from "./badges";

// All instants are UTC so the tests do not depend on the machine's time zone.
const RIGA = { lat: 56.9496, lng: 24.1052 };
const TROMSO = { lat: 69.65, lng: 18.96 };
const AUTUMN_NOON = new Date("2026-10-02T09:00:00Z"); // 12:00 in Riga, sun well up

function context(overrides: Partial<BadgeContext> = {}): BadgeContext {
  return { finishedAt: AUTUMN_NOON, position: RIGA, isSpecialQuest: false, isFirstQuest: false, ...overrides };
}

describe("badge registry", () => {
  it("holds exactly the ids shared with the backend", () => {
    expect(badges.map((b) => b.id)).toEqual([
      "first-walk",
      "first-rain-walk",
      "first-after-dark",
      "season-spring",
      "season-summer",
      "season-autumn",
      "season-winter",
      "special-quest",
    ]);
  });

  it("gives every badge a title and both a couple and a solo line", () => {
    for (const badge of badges) {
      expect(badge.title).not.toBe("");
      expect(badge.line).not.toBe("");
      expect(badge.soloLine).not.toBe("");
      expect(badge.soloLine).not.toMatch(/together|you two/i);
    }
  });

  it("keeps the rain badge inactive until live weather", () => {
    expect(badgeById("first-rain-walk")?.active).toBe(false);
    expect(badges.filter((b) => !b.active).map((b) => b.id)).toEqual(["first-rain-walk"]);
  });

  it("returns undefined for an unknown id", () => {
    expect(badgeById("first-moon-walk")).toBeUndefined();
  });
});

describe("badgesEarned", () => {
  it("awards the first walk, its season, and nothing else on a plain daytime first quest", () => {
    expect(badgesEarned(context({ isFirstQuest: true }))).toEqual(["first-walk", "season-autumn"]);
  });

  it("awards everything that applies at once, in registry order", () => {
    const finishedAt = new Date("2026-12-21T17:00:00Z"); // 19:00 in Riga, dark
    expect(badgesEarned(context({ finishedAt, isFirstQuest: true, isSpecialQuest: true }))).toEqual([
      "first-walk",
      "first-after-dark",
      "season-winter",
      "special-quest",
    ]);
  });

  it("returns only badges not already earned", () => {
    const finishedAt = new Date("2026-12-21T17:00:00Z");
    const earned = badgesEarned(context({ finishedAt, isSpecialQuest: true }), ["first-after-dark", "season-winter"]);
    expect(earned).toEqual(["special-quest"]);
    expect(badgesEarned(context(), new Set(["season-autumn"]))).toEqual([]);
  });

  it("ignores unknown ids among those already earned", () => {
    expect(badgesEarned(context(), ["first-moon-walk"])).toEqual(["season-autumn"]);
  });

  it("never returns the rain badge", () => {
    const all = badges.map((b) => b.id).filter((id) => id !== "first-rain-walk");
    for (const finishedAt of [AUTUMN_NOON, new Date("2026-12-21T17:00:00Z")]) {
      const earned = badgesEarned(context({ finishedAt, isFirstQuest: true, isSpecialQuest: true }));
      expect(earned).not.toContain("first-rain-walk");
    }
    expect(badgesEarned(context(), all)).toEqual([]);
  });

  describe("seasons", () => {
    it.each([
      ["2026-02-28T21:59:00Z", "season-winter"], // 23:59 on 28 February in Riga
      ["2026-02-28T22:00:00Z", "season-spring"], // 00:00 on 1 March
      ["2026-05-31T20:59:00Z", "season-spring"], // 23:59 on 31 May (summer time)
      ["2026-05-31T21:00:00Z", "season-summer"], // 00:00 on 1 June
      ["2026-08-31T20:59:00Z", "season-summer"],
      ["2026-08-31T21:00:00Z", "season-autumn"],
      ["2026-11-30T21:59:00Z", "season-autumn"], // 23:59 on 30 November (winter time)
      ["2026-11-30T22:00:00Z", "season-winter"],
    ])("puts a walk finished at %s in %s", (iso, badge) => {
      // No position, so only the season can be earned.
      const earned = badgesEarned(context({ finishedAt: new Date(iso), position: undefined }));
      expect(earned).toEqual([badge]);
    });

    it("reckons the season in the zone it is given", () => {
      const finishedAt = new Date("2026-03-01T03:00:00Z"); // 05:00 on 1 March in Riga; 22:00 on 28 Feb in New York
      expect(badgesEarned(context({ finishedAt, position: undefined }))).toEqual(["season-spring"]);
      expect(badgesEarned(context({ finishedAt, position: undefined, timeZone: "America/New_York" }))).toEqual([
        "season-winter",
      ]);
    });
  });

  describe("after dark", () => {
    const winterSunset = Date.parse("2026-12-21T13:43:00Z"); // about 15:43 in Riga

    it("awards it after sunset, computed from the position", () => {
      const before = badgesEarned(context({ finishedAt: new Date(winterSunset - 10 * 60000) }));
      const after = badgesEarned(context({ finishedAt: new Date(winterSunset + 10 * 60000) }));
      expect(before).not.toContain("first-after-dark");
      expect(after).toContain("first-after-dark");
    });

    it("awards it before sunrise and after midnight", () => {
      expect(badgesEarned(context({ finishedAt: new Date("2026-12-21T05:00:00Z") }))).toContain("first-after-dark");
      expect(badgesEarned(context({ finishedAt: new Date("2026-12-21T22:30:00Z") }))).toContain("first-after-dark");
    });

    it("uses sun times the caller passes instead of the position", () => {
      const sun = { rise: new Date("2026-10-02T04:00:00Z"), set: new Date("2026-10-02T08:00:00Z") };
      expect(badgesEarned(context({ sun }))).toContain("first-after-dark");
      expect(badgesEarned(context({ sun, position: undefined }))).toContain("first-after-dark");
    });

    it("needs a position or sun times to award it", () => {
      const finishedAt = new Date("2026-12-21T17:00:00Z");
      expect(badgesEarned(context({ finishedAt, position: undefined }))).toEqual(["season-winter"]);
    });

    it("treats polar night as dark and the midnight sun as light", () => {
      const midnightSun = new Date("2026-06-21T22:00:00Z"); // midnight in Tromsø, sun still up
      const polarNoon = new Date("2026-12-21T11:00:00Z"); // noon in Tromsø, sun never rises
      expect(badgesEarned(context({ finishedAt: midnightSun, position: TROMSO }))).toEqual(["season-summer"]);
      expect(badgesEarned(context({ finishedAt: polarNoon, position: TROMSO }))).toEqual([
        "first-after-dark",
        "season-winter",
      ]);
    });
  });
});

describe("isAfterDark", () => {
  it("reads the sun times at their edges", () => {
    const sun = sunTimes(new Date("2026-12-21T10:00:00Z"), RIGA.lat, RIGA.lng);
    if (typeof sun === "string") throw new Error(sun);
    expect(isAfterDark(new Date(sun.rise.getTime() - 1), sun)).toBe(true);
    expect(isAfterDark(sun.rise, sun)).toBe(false);
    expect(isAfterDark(new Date(sun.set.getTime() - 1), sun)).toBe(false);
    expect(isAfterDark(sun.set, sun)).toBe(true);
  });

  it("handles polar day and night", () => {
    expect(isAfterDark(AUTUMN_NOON, "always-down")).toBe(true);
    expect(isAfterDark(AUTUMN_NOON, "always-up")).toBe(false);
  });
});
