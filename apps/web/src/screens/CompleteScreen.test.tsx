import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QuestPointsNote } from "./CompleteScreen";

vi.mock("../lib/supabase", () => ({ supabase: {} }));

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("QuestPointsNote", () => {
  it("says what the couple earned together, with the parts in small print", () => {
    const html = renderToStaticMarkup(
      <QuestPointsNote points={{ total: 205, stops: 50, photos: 25, finish: 100, weekBonus: 30 }} />,
    );
    expect(text(html)).toBe(
      "You earned 205 points together 50 for stops · 25 for photos · 100 for finishing · 30 for your first walk this week",
    );
  });

  it("leaves out the week's bonus when it didn't apply", () => {
    const html = renderToStaticMarkup(
      <QuestPointsNote points={{ total: 160, stops: 50, photos: 10, finish: 100, weekBonus: 0 }} />,
    );
    expect(text(html)).toBe("You earned 160 points together 50 for stops · 10 for photos · 100 for finishing");
  });

  it("shows nothing without points: loading, Just me, solo, or never arrived", () => {
    expect(renderToStaticMarkup(<QuestPointsNote points={null} />)).toBe("");
    expect(
      renderToStaticMarkup(<QuestPointsNote points={{ total: 0, stops: 0, photos: 0, finish: 0, weekBonus: 0 }} />),
    ).toBe("");
  });
});
