import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LeaderboardScreen, LeagueSettingsView } from "./Leaderboard";
import type { LeaderboardState, LeagueSettingsState } from "./Leaderboard";

vi.mock("../lib/supabase", () => ({ supabase: {} }));

const noop = () => {};

function parse(html: string) {
  const buttons = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { html, buttons, text };
}

function screen(state: LeaderboardState, partnerName: string | null = "Emma") {
  const html = renderToStaticMarkup(
    <LeaderboardScreen state={state} partnerName={partnerName} onRetry={noop} onOpenProfile={noop} />,
  );
  // The bottom nav's buttons follow the screen's own; leave them out.
  return parse(html.slice(0, html.indexOf('<nav class="bottom-nav"')));
}

describe("LeaderboardScreen", () => {
  it("shows loading and offers a retry after a failure", () => {
    expect(screen("loading").text).toContain("Loading your league…");
    const failed = screen("failed");
    expect(failed.text).toContain("Couldn’t load your league.");
    expect(failed.buttons).toEqual(["Try again"]);
  });

  it("explains the league is for couples when not linked", () => {
    const { text, buttons } = screen({ kind: "unlinked" }, null);
    expect(text).toContain("The weekly league is for couples.");
    expect(buttons).toEqual(["Open Profile"]);
  });

  it("points to Profile to join", () => {
    const { text, buttons } = screen({ kind: "out", partnerYes: false });
    expect(text).toContain("only your couple name and weekly points");
    expect(text).toContain("You both say yes in Profile");
    expect(buttons).toEqual(["Open Profile"]);
  });

  it("says plainly when the partner has said yes", () => {
    expect(screen({ kind: "out", partnerYes: true }).text).toContain(
      "Emma has said yes. You join once you say yes too.",
    );
  });

  it("waits for the partner without a button to nudge them", () => {
    const { text, buttons } = screen({ kind: "waiting" });
    expect(text).toContain("once Emma says yes too");
    expect(buttons).toEqual([]);
  });

  it("asks for a couple name", () => {
    const { text, buttons } = screen({ kind: "needsName" });
    expect(text).toContain("once you have a couple name");
    expect(buttons).toEqual(["Name your couple"]);
  });

  it("shows an empty league", () => {
    expect(screen({ kind: "league", league: { rows: [], band: null, quests: 0 } }).text).toContain(
      "No couples to show yet this week.",
    );
  });

  it("shows a league of one without a band", () => {
    const { text } = screen({
      kind: "league",
      league: { rows: [{ name: "Us", points: 30, isMe: true }], band: "top", quests: 1 },
    });
    expect(text).toContain("You’re the only couple in your league so far this week.");
    expect(text).not.toContain("top third");
  });

  it("lists the league best first, highlights the couple, and gives the band in words", () => {
    const { html, text, buttons } = screen({
      kind: "league",
      league: {
        rows: [
          { name: "Wild Pair", points: 1250, isMe: false },
          { name: "Us", points: 300, isMe: true },
          { name: "Slow Walkers", points: 0, isMe: false },
        ],
        band: "middle",
        quests: 9,
      },
    });
    expect(text).toContain("Couples in your league finished 9 quests this week.");
    expect(text).toContain("You’re in the middle third this week.");
    expect(text.indexOf("Wild Pair")).toBeLessThan(text.indexOf("Us (you)"));
    expect(text).toContain("1,250 pts");
    expect(html.match(/league-row mine/g)).toHaveLength(1);
    // Nothing links anywhere, and no rank number shows.
    expect(buttons).toEqual([]);
    expect(html).not.toContain("<a ");
    expect(text).not.toMatch(/#\d/);
  });
});

function settings(state: LeagueSettingsState, extra: Partial<Parameters<typeof LeagueSettingsView>[0]> = {}) {
  return parse(
    renderToStaticMarkup(
      <LeagueSettingsView
        partnerName="Emma"
        state={state}
        busy={null}
        error={null}
        onJoin={noop}
        onLeave={noop}
        onRetry={noop}
        {...extra}
      />,
    ),
  );
}

const out = { inLeague: false, myYes: false, partnerYes: false, needsName: false };

describe("LeagueSettingsView", () => {
  it("shows nothing when not linked", () => {
    expect(settings(null).html).toBe("");
  });

  it("offers to join and says what other couples see", () => {
    const { text, buttons } = settings(out);
    expect(text).toContain("only your couple name and weekly points");
    expect(text).toContain("You join once you and Emma both say yes.");
    expect(buttons).toEqual(["Join the weekly league"]);
  });

  it("says when the partner has said yes", () => {
    expect(settings({ ...out, partnerYes: true }).text).toContain("Emma has said yes. You join once you say yes too.");
  });

  it("waits for the partner and lets me take my yes back", () => {
    const { text, buttons } = settings({ ...out, myYes: true });
    expect(text).toContain("You’ve said yes.");
    expect(text).toContain("Your couple joins once Emma says yes too.");
    expect(buttons).toEqual(["Leave"]);
  });

  it("shows the couple in the league with a Leave that needs no one else", () => {
    const { text, buttons } = settings({ inLeague: true, myYes: true, partnerYes: true, needsName: false });
    expect(text).toContain("You’re in the weekly league.");
    expect(text).toContain("without asking the other");
    expect(buttons).toEqual(["Leave"]);
  });

  it("notes that an unnamed couple doesn't show", () => {
    const note = "Your couple shows in the league only once it has a couple name.";
    expect(settings({ inLeague: true, myYes: true, partnerYes: true, needsName: true }).text).toContain(note);
    expect(settings({ ...out, needsName: true }).text).toContain(note);
    expect(settings(out).text).not.toContain(note);
  });

  it("names the action under way and shows errors", () => {
    expect(settings(out, { busy: "join" }).buttons).toEqual(["Joining…"]);
    const { html, text } = settings(out, { error: "Couldn’t save that." });
    expect(html).toContain('role="alert"');
    expect(text).toContain("Couldn’t save that.");
  });

  it("offers a retry when loading failed", () => {
    expect(settings("failed").buttons).toEqual(["Try again"]);
    expect(settings("loading").text).toContain("Loading…");
  });

  it("never mentions relinking", () => {
    for (const state of [
      out,
      { ...out, myYes: true },
      { inLeague: true, myYes: true, partnerYes: true, needsName: true },
    ]) {
      expect(settings(state).text.toLowerCase()).not.toMatch(/relink|link again|restore/);
    }
  });
});
