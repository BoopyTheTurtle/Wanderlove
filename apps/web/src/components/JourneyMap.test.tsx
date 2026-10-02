import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "@wannadoo/core";
import { COUPLE_SPOT, JOURNEY_ART, JourneyMap, journeyLabel } from "./JourneyMap";

vi.mock("../lib/supabase", () => ({ supabase: {} }));

const profile = (id: string, name: string): Profile =>
  ({ id, name, initials: name[0], color: "#8b2e45", avatar: "" }) as unknown as Profile;
const me = profile("u1", "Ana");
const partner = profile("u2", "Ben");

describe("journeyLabel", () => {
  it("counts quests walked together, without countdowns", () => {
    expect(journeyLabel(7, true)).toBe("Your journey: 7 quests walked together");
    expect(journeyLabel(1, true)).toBe("Your journey: 1 quest walked together");
    expect(journeyLabel(null, true)).toBe("Your journey together");
    expect(journeyLabel(null, false)).toBe("Your journey: you stand at the start of the path");
  });
});

describe("JourneyMap", () => {
  it("shows a solo user alone on the path", () => {
    const html = renderToStaticMarkup(<JourneyMap me={me} partner={null} questsDone={null} />);
    expect(html).toContain('aria-label="Your journey: you stand at the start of the path"');
    expect(html).toContain(`src="${JOURNEY_ART}"`);
    expect(html).toContain('aria-label="Ana"');
    expect(html).not.toContain('aria-label="Ben"');
    expect(html).not.toContain("journey-couple-hands");
  });

  it("shows the couple hand in hand, with no markers or reward text", () => {
    const html = renderToStaticMarkup(<JourneyMap me={me} partner={partner} questsDone={3} />);
    expect(html).toContain('aria-label="Your journey: 3 quests walked together"');
    expect(html).toContain('aria-label="Ana"');
    expect(html).toContain('aria-label="Ben"');
    expect(html).toContain("journey-couple-hands");
    expect(html).not.toMatch(/marker|next|reward|to go/i);
  });

  it("stands the couple in the lower third of the scene", () => {
    expect(COUPLE_SPOT.y).toBeGreaterThan(2 / 3);
    expect(COUPLE_SPOT.y).toBeLessThan(1);
  });
});
