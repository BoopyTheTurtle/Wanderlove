import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { weeklyRhythm } from "@wannadoo/core";
import { RhythmCardView } from "./RhythmCard";
import { monthTitle, weekLabel, weekName } from "../lib/rhythmBadgesView";

vi.mock("../lib/supabase", () => ({ supabase: {} }));

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Friday 2 October 2026, Riga. October's weeks start on Mondays 28 Sep, 5, 12, 19 and 26 Oct.
const now = new Date("2026-10-02T09:00:00Z");
const noop = () => {};

function render(walks: string[], goal: Parameters<typeof RhythmCardView>[0]["goal"]) {
  const rhythm = weeklyRhythm({ walks, now, goal: goal?.goal ?? null, paused: goal?.paused ?? false });
  return renderToStaticMarkup(<RhythmCardView rhythm={rhythm} goal={goal} onSetGoal={noop} onPause={noop} />);
}

describe("RhythmCardView", () => {
  it("shows this month's weeks, filled where you walked and plain elsewhere", () => {
    const html = render(["2026-09-15", "2026-10-01"], undefined);
    expect(html.match(/class="rhythm-week( [^"]*)?"/g)).toEqual([
      'class="rhythm-week filled current"',
      'class="rhythm-week upcoming"',
      'class="rhythm-week upcoming"',
      'class="rhythm-week upcoming"',
      'class="rhythm-week upcoming"',
    ]);
    expect(text(html)).toContain("October");
    expect(text(html)).toContain("2 weeks with a walk this season");
  });

  it("never names a week as missed and never counts down", () => {
    const html = render([], null);
    expect(html).not.toMatch(/miss|lost|broke|streak|left/i);
    expect(text(html)).toContain("Each week you walk fills in here.");
  });

  it("offers a goal to a couple, and none to a solo walker", () => {
    expect(text(render([], null))).toContain("Set a goal");
    expect(text(render([], undefined))).not.toContain("goal");
  });

  it("shows the goal as dots, filled by this period's walks", () => {
    const html = render(["2026-10-01"], { goal: "twice_monthly", paused: false });
    expect(text(html)).toContain("Two walks a month");
    expect(html.match(/class="rhythm-dot( done)?"/g)).toEqual(['class="rhythm-dot done"', 'class="rhythm-dot"']);
    expect(html).toContain('aria-label="1 of 2 so far"');
  });

  it("shows a paused goal quietly, with no dots", () => {
    const html = render([], { goal: "weekly", paused: true });
    expect(text(html)).toContain("One walk a week Paused");
    expect(html).not.toContain("rhythm-dot");
  });
});

describe("labels", () => {
  it("names weeks by their Monday and the month by the current week", () => {
    expect(weekLabel("2026-10-05")).toBe("5 Oct");
    const rhythm = weeklyRhythm({ walks: ["2026-10-01"], now });
    expect(monthTitle(rhythm.weeks)).toBe("October");
    expect(weekName(rhythm.weeks[0])).toMatch(/^Week of 28 Sept?, you walked, this week$/);
    expect(weekName(rhythm.weeks[1])).toBe("Week of 5 Oct");
  });
});
