import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStorage } from "./memoryStorage";
import {
  QUESTS_BEFORE_HIDE,
  SAFETY_NOTE,
  canHideSafetyNote,
  countSurpriseQuest,
  forgetSafetyNote,
  formatClock,
  hideSafetyNote,
  loadSafetyNote,
  safetyNoteLines,
  sunsetWarning,
  sunsetWarningFor,
} from "./routeSafety";

const RIGA = { lat: 56.9496, lng: 24.1052 };

describe("safetyNoteLines", () => {
  it("adds the winter line from November to March", () => {
    for (const month of [10, 11, 0, 1, 2]) {
      expect(safetyNoteLines(new Date(2026, month, 15, 12), false)).toEqual([SAFETY_NOTE.winter]);
    }
  });

  it("adds the summer line from June to August", () => {
    for (const month of [5, 6, 7]) {
      expect(safetyNoteLines(new Date(2026, month, 15, 12), false)).toEqual([SAFETY_NOTE.summer]);
    }
  });

  it("adds no season line in spring and autumn", () => {
    for (const month of [3, 4, 8, 9]) expect(safetyNoteLines(new Date(2026, month, 15, 12), false)).toEqual([]);
  });

  it("adds the rural line after the season", () => {
    expect(safetyNoteLines(new Date(2026, 0, 15), true)).toEqual([SAFETY_NOTE.winter, SAFETY_NOTE.rural]);
    expect(safetyNoteLines(new Date(2026, 9, 15), true)).toEqual([SAFETY_NOTE.rural]);
  });
});

describe("formatClock", () => {
  it("pads hours and minutes in local time", () => {
    expect(formatClock(new Date(2026, 11, 21, 9, 5))).toBe("09:05");
    expect(formatClock(new Date(2026, 11, 21, 16, 42))).toBe("16:42");
    expect(formatClock(new Date(2026, 11, 21, 0, 0))).toBe("00:00");
  });
});

describe("sunsetWarning", () => {
  it("stays silent in daylight", () => {
    expect(sunsetWarningFor({ kind: "day" }, 50)).toBeNull();
  });

  it("names the sunset time when the walk ends after it", () => {
    const warning = sunsetWarningFor({ kind: "ends-after-sunset", sunset: new Date(2026, 11, 21, 16, 42) }, 50);
    expect(warning?.title).toBe("It gets dark at 16:42.");
    expect(warning?.body).toContain("about 50 minutes and will end after sunset");
    expect(warning?.body).toMatch(/skip any stop that feels too quiet\.$/);
  });

  it("says when it is already dark", () => {
    const warning = sunsetWarningFor({ kind: "dark", afterDusk: true }, 35);
    expect(warning?.title).toBe("It’s already dark.");
    expect(warning?.body).toContain("about 35 minutes");
  });

  it("works from the start position and the clock", () => {
    // Riga on December 21: sunset about 13:43 UTC.
    expect(sunsetWarning(new Date(Date.UTC(2026, 11, 21, 10)), RIGA, 50)).toBeNull();
    expect(sunsetWarning(new Date(Date.UTC(2026, 11, 21, 13, 10)), RIGA, 50)?.title).toMatch(/^It gets dark at /);
    expect(sunsetWarning(new Date(Date.UTC(2026, 11, 21, 18)), RIGA, 50)?.title).toBe("It’s already dark.");
  });
});

describe("safety note storage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts shown, with nothing counted", () => {
    expect(loadSafetyNote("daniel")).toEqual({ quests: 0, hidden: false });
  });

  it("offers don't-show-again only after three quests", () => {
    for (let i = 1; i < QUESTS_BEFORE_HIDE; i++) {
      expect(canHideSafetyNote(countSurpriseQuest("daniel"))).toBe(false);
      expect(hideSafetyNote("daniel").hidden).toBe(false);
    }
    expect(canHideSafetyNote(countSurpriseQuest("daniel"))).toBe(true);
    expect(hideSafetyNote("daniel")).toEqual({ quests: QUESTS_BEFORE_HIDE, hidden: true });
    expect(loadSafetyNote("daniel").hidden).toBe(true);
  });

  it("keeps each user's count apart", () => {
    countSurpriseQuest("daniel");
    countSurpriseQuest("daniel");
    countSurpriseQuest("emma");
    expect(loadSafetyNote("daniel").quests).toBe(2);
    expect(loadSafetyNote("emma").quests).toBe(1);
  });

  it("forgets one user and removes the key once empty", () => {
    countSurpriseQuest("daniel");
    countSurpriseQuest("emma");
    forgetSafetyNote("daniel");
    expect(loadSafetyNote("daniel").quests).toBe(0);
    expect(loadSafetyNote("emma").quests).toBe(1);
    forgetSafetyNote("emma");
    expect(localStorage.getItem("wannadoo_safety_note")).toBeNull();
  });

  it("shows the note again when storage holds junk", () => {
    localStorage.setItem("wannadoo_safety_note", JSON.stringify({ daniel: { quests: "many", hidden: "yes" } }));
    expect(loadSafetyNote("daniel")).toEqual({ quests: 0, hidden: false });
    localStorage.setItem("wannadoo_safety_note", "not json");
    expect(loadSafetyNote("daniel")).toEqual({ quests: 0, hidden: false });
  });
});
