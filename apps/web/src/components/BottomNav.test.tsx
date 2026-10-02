import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BottomNav } from "./BottomNav";
import { NavContext } from "./nav";
import type { NavHandlers, NavTab } from "./nav";

const go = () => {};

function render(active: NavTab, nav: NavHandlers) {
  const html = renderToStaticMarkup(
    <NavContext.Provider value={nav}>
      <BottomNav active={active} />
    </NavContext.Provider>,
  );
  return [...html.matchAll(/<button([^>]*)>.*?<span>([^<]*)<\/span><\/button>/g)].map((m) => ({
    label: m[2],
    disabled: m[1].includes('aria-disabled="true"'),
    current: m[1].includes('aria-current="page"'),
  }));
}

describe("BottomNav", () => {
  it("has League where Messages was", () => {
    expect(render("explore", {}).map((b) => b.label)).toEqual(["Explore", "Activity", "League", "Profile"]);
  });

  it("enables League when the app gives it a destination", () => {
    const league = render("explore", { league: go }).find((b) => b.label === "League");
    expect(league).toEqual({ label: "League", disabled: false, current: false });
    expect(render("explore", {}).find((b) => b.label === "League")?.disabled).toBe(true);
  });

  it("marks League as the current tab", () => {
    expect(render("league", { league: go }).find((b) => b.current)?.label).toBe("League");
  });
});
