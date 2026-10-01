import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@wannadoo/core";
import {
  JOURNEY_MARKERS,
  JourneyMap,
  MAX_STEPS,
  avatarSize,
  cameraOffset,
  coupleY,
  journeyLabel,
  journeySeenKey,
  lapOf,
  markerIndex,
  readSeen,
  walkPlan,
  writeSeen,
} from "./JourneyMap";

vi.mock("../lib/supabase", () => ({ supabase: {} }));

const N = JOURNEY_MARKERS.length;

const profile = (id: string, name: string): Profile =>
  ({ id, name, initials: name[0], color: "#8b2e45", avatar: "" }) as unknown as Profile;
const me = profile("u1", "Ana");
const partner = profile("u2", "Ben");

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("markers", () => {
  it("are ordered bottom to top and shrink with distance", () => {
    for (let i = 1; i < N; i++) {
      expect(JOURNEY_MARKERS[i].y).toBeLessThan(JOURNEY_MARKERS[i - 1].y);
      expect(JOURNEY_MARKERS[i].w).toBeLessThan(JOURNEY_MARKERS[i - 1].w);
    }
  });

  it("place the couple by quests done, wrapping onto a fresh scene", () => {
    expect(markerIndex(0)).toBe(0);
    expect(markerIndex(3)).toBe(3);
    expect(markerIndex(N - 1)).toBe(N - 1);
    expect(markerIndex(N)).toBe(0);
    expect(markerIndex(N + 1)).toBe(1);
    expect(lapOf(0)).toBe(0);
    expect(lapOf(N - 1)).toBe(0);
    expect(lapOf(N)).toBe(1);
    expect(lapOf(2 * N + 3)).toBe(2);
  });
});

describe("avatarSize", () => {
  it("shrinks with the marker's perspective and stays readable far away", () => {
    const sizes = JOURNEY_MARKERS.map((_, i) => avatarSize(i, 358));
    for (let i = 1; i < N; i++) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
    expect(sizes[0]).toBeGreaterThan(55);
    expect(sizes[N - 1]).toBeGreaterThanOrEqual(24);
  });

  it("scales with the scene's width", () => {
    expect(avatarSize(0, 716)).toBeCloseTo(2 * avatarSize(0, 358), -1);
  });
});

describe("walkPlan", () => {
  it("walks once from the count last seen to the new one", () => {
    expect(walkPlan(3, 4, false)).toEqual({ from: 3, to: 4 });
  });

  it("stands still on a first visit, with no change, or after a drop", () => {
    expect(walkPlan(null, 7, false)).toEqual({ from: 7, to: 7 });
    expect(walkPlan(7, 7, false)).toEqual({ from: 7, to: 7 });
    expect(walkPlan(9, 2, false)).toEqual({ from: 2, to: 2 });
  });

  it("skips the walk under reduced motion", () => {
    expect(walkPlan(3, 6, true)).toEqual({ from: 6, to: 6 });
  });

  it("walks at most MAX_STEPS markers", () => {
    expect(walkPlan(0, 20, false)).toEqual({ from: 20 - MAX_STEPS, to: 20 });
  });
});

describe("camera", () => {
  const width = 358;
  const sceneHeight = width * 1.5;

  it("measures the couple's feet within a stack of scenes, newest on top", () => {
    expect(coupleY(0, 0, width)).toBeCloseTo(JOURNEY_MARKERS[0].y * sceneHeight);
    // Crossing into lap 1 with lap 0 still below it.
    expect(coupleY(N - 1, 1, width)).toBeCloseTo(sceneHeight + JOURNEY_MARKERS[N - 1].y * sceneHeight);
    expect(coupleY(N, 1, width)).toBeCloseTo(JOURNEY_MARKERS[0].y * sceneHeight);
  });

  it("keeps the view inside the strip", () => {
    // Near the bottom of the scene: the view rests on the scene's bottom edge.
    expect(cameraOffset(sceneHeight - 10, 400, sceneHeight)).toBeCloseTo(400 - sceneHeight);
    // Near the top: never moves the strip down past its top.
    expect(cameraOffset(20, 400, sceneHeight)).toBe(0);
    // In between: the couple stands at 62 % of the view.
    expect(cameraOffset(300, 400, sceneHeight)).toBeCloseTo(0.62 * 400 - 300);
  });
});

describe("journeyLabel", () => {
  it("counts quests walked together, without countdowns", () => {
    expect(journeyLabel(7, true)).toBe("Your journey: 7 quests walked together");
    expect(journeyLabel(1, true)).toBe("Your journey: 1 quest walked together");
    expect(journeyLabel(null, true)).toBe("Your journey together");
    expect(journeyLabel(null, false)).toBe("Your journey: you stand at the start of the path");
  });
});

describe("seen count", () => {
  it("shares one key between both partners", () => {
    expect(journeySeenKey("a", "b")).toBe(journeySeenKey("b", "a"));
  });

  it("round-trips through localStorage", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(readSeen("k")).toBeNull();
    writeSeen("k", 7);
    expect(readSeen("k")).toBe(7);
    localStorage.setItem("k", "nonsense");
    expect(readSeen("k")).toBeNull();
  });

  it("survives blocked storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readSeen("k")).toBeNull();
    expect(() => writeSeen("k", 3)).not.toThrow();
  });
});

describe("JourneyMap", () => {
  const rims = (html: string) => (html.match(/journey-map-walked/g) ?? []).length;
  const scenes = (html: string) => (html.match(/class="journey-map-scene"/g) ?? []).length;

  it("shows a solo user alone on the first marker", () => {
    const html = renderToStaticMarkup(<JourneyMap me={me} partner={null} questsDone={null} seenKey={null} />);
    expect(html).toContain('aria-label="Your journey: you stand at the start of the path"');
    expect(html).toContain('aria-label="Ana"');
    expect(html).not.toContain('aria-label="Ben"');
    expect(rims(html)).toBe(0);
    expect(html).toContain('loading="lazy"');
  });

  it.each([
    [0, 0],
    [3, 3],
    [N, 0],
    [N + 1, 1],
  ])("puts a couple with %i quests past %i walked markers", (done, walked) => {
    vi.stubGlobal("localStorage", memoryStorage());
    const key = journeySeenKey(me.id, partner.id);
    writeSeen(key, done);
    const html = renderToStaticMarkup(<JourneyMap me={me} partner={partner} questsDone={done} seenKey={key} />);
    expect(html).toContain(`aria-label="Your journey: ${done} ${done === 1 ? "quest" : "quests"} walked together"`);
    expect(html).toContain('aria-label="Ana"');
    expect(html).toContain('aria-label="Ben"');
    expect(rims(html)).toBe(walked);
    expect(scenes(html)).toBe(1);
    expect(html).not.toMatch(/next|reward|to go/i);
  });
});
