import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BadgeShelfView } from "./BadgeShelf";
import { earnedDay, shelfItems } from "../lib/rhythmBadgesView";
import { BadgeEarnedNote } from "./BadgeEarnedNote";
import type { Badge } from "../lib/badges";

vi.mock("../lib/supabase", () => ({ supabase: {} }));

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const earned: Badge[] = [
  { badge: "first-walk", earnedOn: "2026-08-20", scope: "couple" },
  { badge: "season-autumn", earnedOn: "2026-10-02", scope: "solo" },
];

describe("BadgeShelf", () => {
  it("lists earned badges newest first, with the line that fits their owner", () => {
    expect(shelfItems(earned)).toEqual([
      { id: "solo:season-autumn", title: "Autumn", line: "Your first autumn walk", day: "2026-10-02" },
      { id: "couple:first-walk", title: "First walk", line: "Your first walk together", day: "2026-08-20" },
    ]);
    expect(text(renderToStaticMarkup(<BadgeShelfView badges={earned} />))).toBe(
      "Memories Autumn Your first autumn walk 2 Oct 2026 First walk Your first walk together 20 Aug 2026",
    );
  });

  it("shows nothing before the first badge, so no locked badge is ever listed", () => {
    expect(renderToStaticMarkup(<BadgeShelfView badges={[]} />)).toBe("");
  });

  it("formats the earned day without shifting it by time zone", () => {
    expect(earnedDay("2026-01-01")).toBe("1 Jan 2026");
  });
});

describe("BadgeEarnedNote", () => {
  it("names each new badge with the couple's line", () => {
    const html = renderToStaticMarkup(<BadgeEarnedNote badges={["first-walk", "first-after-dark"]} solo={false} />);
    expect(text(html)).toBe("First walk Your first walk together After dark Your first walk together after dark");
  });

  it("uses the solo line on a solo walk", () => {
    expect(text(renderToStaticMarkup(<BadgeEarnedNote badges={["special-quest"]} solo />))).toBe(
      "Special quest You finished a special quest",
    );
  });

  it("shows nothing when the walk earned no badge", () => {
    expect(renderToStaticMarkup(<BadgeEarnedNote badges={[]} solo={false} />)).toBe("");
  });
});
