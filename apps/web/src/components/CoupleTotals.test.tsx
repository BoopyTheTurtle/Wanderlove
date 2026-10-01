import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CoupleTotalsView } from "./CoupleTotals";

vi.mock("../lib/supabase", () => ({ supabase: {} }));

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("CoupleTotalsView", () => {
  it("shows the name and the three totals", () => {
    const html = renderToStaticMarkup(
      <CoupleTotalsView name="Wild Pair" totals={{ questsDone: 3, photosTaken: 1, challengesDone: 1240 }} />,
    );
    expect(text(html)).toBe("Wild Pair quests done 3 photo taken 1 challenges done 1,240");
  });

  it("shows only the totals without a name", () => {
    const html = renderToStaticMarkup(
      <CoupleTotalsView name={null} totals={{ questsDone: 0, photosTaken: 0, challengesDone: 0 }} />,
    );
    expect(html).not.toContain("couple-totals-name");
    expect(text(html)).toBe("quests done 0 photos taken 0 challenges done 0");
  });
});
