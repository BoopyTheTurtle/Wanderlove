import { describe, expect, it } from "vitest";
import { civilTwilight, seasonNote, sunTimes, walkLight } from "./daylight";

// All instants are UTC so the tests do not depend on the machine's time zone.
const RIGA = { lat: 56.9496, lng: 24.1052 };
const TROMSO = { lat: 69.65, lng: 18.96 };
const TRONDHEIM = { lat: 63.43, lng: 10.39 };
const TWO_MINUTES = 2 * 60000;

function times(now: Date, at: { lat: number; lng: number }, altitude?: number) {
  const result = sunTimes(now, at.lat, at.lng, altitude);
  if (typeof result === "string") throw new Error(`expected rise and set, got ${result}`);
  return result;
}

function expectNear(actual: Date, expectedIso: string) {
  expect(Math.abs(actual.getTime() - Date.parse(expectedIso))).toBeLessThanOrEqual(TWO_MINUTES);
}

describe("sunTimes", () => {
  it("gives Riga's winter solstice sunset at about 15:43 local (UTC+2)", () => {
    const { set } = times(new Date("2026-12-21T10:00:00Z"), RIGA);
    expectNear(set, "2026-12-21T13:43:00Z");
  });

  it("gives Riga's summer solstice sunset at about 22:21 local (UTC+3)", () => {
    const { set } = times(new Date("2026-06-21T10:00:00Z"), RIGA);
    expectNear(set, "2026-06-21T19:21:00Z");
  });

  it("puts sunrise before sunset and civil dusk after sunset", () => {
    const now = new Date("2026-12-21T10:00:00Z");
    const sun = times(now, RIGA);
    const civil = civilTwilight(now, RIGA.lat, RIGA.lng);
    if (typeof civil === "string") throw new Error(civil);
    expect(sun.rise.getTime()).toBeLessThan(sun.set.getTime());
    expect(civil.set.getTime()).toBeGreaterThan(sun.set.getTime());
    expect(civil.rise.getTime()).toBeLessThan(sun.rise.getTime());
  });

  it("reports polar day and polar night in Tromsø", () => {
    expect(sunTimes(new Date("2026-06-21T10:00:00Z"), TROMSO.lat, TROMSO.lng)).toBe("always-up");
    expect(sunTimes(new Date("2026-12-21T10:00:00Z"), TROMSO.lat, TROMSO.lng)).toBe("always-down");
  });
});

describe("walkLight", () => {
  const winterNoon = new Date("2026-12-21T10:00:00Z");
  const sunset = times(winterNoon, RIGA).set;

  it("is day when the walk ends before sunset", () => {
    const now = new Date(sunset.getTime() - 50 * 60000);
    expect(walkLight(now, RIGA, 49)).toEqual({ kind: "day" });
  });

  it("warns when the walk ends after sunset", () => {
    const now = new Date(sunset.getTime() - 50 * 60000);
    expect(walkLight(now, RIGA, 51)).toEqual({ kind: "ends-after-sunset", sunset });
  });

  it("is dark but before civil dusk just after sunset", () => {
    const now = new Date(sunset.getTime() + 10 * 60000);
    expect(walkLight(now, RIGA, 50)).toEqual({ kind: "dark", afterDusk: false });
  });

  it("is dark after civil dusk in the evening and before dawn", () => {
    expect(walkLight(new Date("2026-12-21T17:00:00Z"), RIGA, 50)).toEqual({ kind: "dark", afterDusk: true });
    expect(walkLight(new Date("2026-12-21T04:00:00Z"), RIGA, 50)).toEqual({ kind: "dark", afterDusk: true });
  });

  it("is day all day under the midnight sun", () => {
    expect(walkLight(new Date("2026-06-21T22:00:00Z"), TROMSO, 50)).toEqual({ kind: "day" });
  });

  it("is dark in polar night, after dusk only once civil twilight ends", () => {
    expect(walkLight(new Date("2026-12-21T10:45:00Z"), TROMSO, 50)).toEqual({ kind: "dark", afterDusk: false });
    expect(walkLight(new Date("2026-12-21T18:00:00Z"), TROMSO, 50)).toEqual({ kind: "dark", afterDusk: true });
  });

  it("never reaches civil dusk on a white night", () => {
    // Trondheim, June 21: the sun sets around 21:37 UTC but civil twilight lasts all night.
    expect(walkLight(new Date("2026-06-21T22:30:00Z"), TRONDHEIM, 50)).toEqual({ kind: "dark", afterDusk: false });
  });
});

describe("seasonNote", () => {
  // The local-time constructor keeps the month stable whatever the machine's time zone.
  const noteFor = (month: number) => seasonNote(new Date(2026, month - 1, 15, 12));

  it("gives the winter note from November to March", () => {
    for (const month of [11, 12, 1, 2, 3]) expect(noteFor(month)).toBe("winter");
  });

  it("gives the summer note from June to August", () => {
    for (const month of [6, 7, 8]) expect(noteFor(month)).toBe("summer");
  });

  it("gives no note in April, May, September, and October", () => {
    for (const month of [4, 5, 9, 10]) expect(noteFor(month)).toBeNull();
  });

  it("uses the local month at the edges of a month", () => {
    expect(seasonNote(new Date(2026, 2, 31, 23, 59))).toBe("winter");
    expect(seasonNote(new Date(2026, 3, 1, 0, 0))).toBeNull();
  });
});
