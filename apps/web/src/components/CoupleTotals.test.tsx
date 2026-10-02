import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CoupleTotalsCard, CoupleTotalsView } from "./CoupleTotals";

vi.mock("../lib/supabase", () => ({ supabase: {} }));

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("CoupleTotalsView", () => {
  it("shows the name, the three totals, and the points", () => {
    const html = renderToStaticMarkup(
      <CoupleTotalsView
        name="Wild Pair"
        totals={{ questsDone: 3, photosTaken: 1, challengesDone: 12, points: 1240 }}
      />,
    );
    expect(text(html)).toBe("Wild Pair quests done 3 photo taken 1 challenges done 12 points 1,240");
  });

  it("shows only the totals without a name", () => {
    const html = renderToStaticMarkup(
      <CoupleTotalsView name={null} totals={{ questsDone: 0, photosTaken: 0, challengesDone: 0, points: 0 }} />,
    );
    expect(html).not.toContain("couple-totals-name");
    expect(text(html)).toBe("quests done 0 photos taken 0 challenges done 0 points 0");
  });

  it("says one point in the singular", () => {
    const html = renderToStaticMarkup(
      <CoupleTotalsView name={null} totals={{ questsDone: 0, photosTaken: 0, challengesDone: 0, points: 1 }} />,
    );
    expect(text(html)).toContain("point 1");
  });
});

describe("CoupleTotalsCard", () => {
  it("shows nothing before the totals arrive", () => {
    expect(renderToStaticMarkup(<CoupleTotalsCard totals={null} />)).toBe("");
  });
});
