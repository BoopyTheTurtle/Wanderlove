import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LeaderboardError,
  bandLine,
  joinLeaderboard,
  leaderboardView,
  leagueFromRows,
  leaveLeaderboard,
  loadLeaderboard,
  questsLine,
  statusFromRows,
  toLeaderboardError,
} from "./leaderboard";

// Each rpc call is recorded and answered from the queue.
const calls: string[] = [];
const queued: { data: unknown; error: unknown }[] = [];

vi.mock("./supabase", () => ({
  supabase: {
    rpc: (name: string) => {
      calls.push(name);
      return Promise.resolve(queued.shift() ?? { data: null, error: null });
    },
  },
}));

beforeEach(() => {
  calls.length = 0;
  queued.length = 0;
});

const status = (over: Partial<Record<string, boolean>> = {}) => ({
  in_league: true,
  my_yes: true,
  partner_yes: true,
  needs_name: false,
  ...over,
});

const row = (name: string, points: number, isMe = false, band = "middle third", quests = 7) => ({
  couple_name: name,
  weekly_points: points,
  is_me: isMe,
  my_band: band,
  league_quests: quests,
});

describe("statusFromRows", () => {
  it("is null when not linked", () => {
    expect(statusFromRows([])).toBeNull();
    expect(statusFromRows(null)).toBeNull();
  });

  it("maps the flags, nulls as false", () => {
    expect(statusFromRows([{ in_league: false, my_yes: true, partner_yes: null, needs_name: true }])).toEqual({
      inLeague: false,
      myYes: true,
      partnerYes: false,
      needsName: true,
    });
  });
});

describe("leagueFromRows", () => {
  it("keeps the server's order and reads the band and quests from the rows", () => {
    expect(leagueFromRows([row("Wild Pair", 120), row("Us", 80, true)])).toEqual({
      rows: [
        { name: "Wild Pair", points: 120, isMe: false },
        { name: "Us", points: 80, isMe: true },
      ],
      band: "middle",
      quests: 7,
    });
  });

  it("maps every band and drops an unknown one", () => {
    expect(leagueFromRows([row("A", 1, true, "top third")]).band).toBe("top");
    expect(leagueFromRows([row("A", 1, true, "bottom third")]).band).toBe("bottom");
    expect(leagueFromRows([row("A", 1, true, "first")]).band).toBeNull();
  });

  it("is empty with no rows", () => {
    expect(leagueFromRows(null)).toEqual({ rows: [], band: null, quests: 0 });
  });
});

describe("leaderboardView", () => {
  const league = { rows: [], band: null, quests: 0 };
  const s = { inLeague: false, myYes: false, partnerYes: false, needsName: false };

  it("covers each standing", () => {
    expect(leaderboardView(null, null)).toEqual({ kind: "unlinked" });
    expect(leaderboardView(s, null)).toEqual({ kind: "out", partnerYes: false });
    expect(leaderboardView({ ...s, partnerYes: true }, null)).toEqual({ kind: "out", partnerYes: true });
    expect(leaderboardView({ ...s, myYes: true }, null)).toEqual({ kind: "waiting" });
    expect(leaderboardView({ ...s, inLeague: true, needsName: true }, null)).toEqual({ kind: "needsName" });
    expect(leaderboardView({ ...s, inLeague: true }, league)).toEqual({ kind: "league", league });
  });
});

describe("loadLeaderboard", () => {
  it("loads the board for a listed couple", async () => {
    queued.push({ data: [status()], error: null }, { data: [row("Us", 40, true, "top third", 2)], error: null });
    const view = await loadLeaderboard();
    expect(calls).toEqual(["leaderboard_status", "my_league"]);
    expect(view).toEqual({
      kind: "league",
      league: { rows: [{ name: "Us", points: 40, isMe: true }], band: "top", quests: 2 },
    });
  });

  it("skips the board for a couple that is out or unnamed", async () => {
    queued.push({ data: [status({ in_league: false, my_yes: false })], error: null });
    expect(await loadLeaderboard()).toEqual({ kind: "out", partnerYes: true });
    queued.push({ data: [status({ needs_name: true })], error: null });
    expect(await loadLeaderboard()).toEqual({ kind: "needsName" });
    queued.push({ data: [], error: null });
    expect(await loadLeaderboard()).toEqual({ kind: "unlinked" });
    expect(calls).toEqual(["leaderboard_status", "leaderboard_status", "leaderboard_status"]);
  });

  it("throws a failed load", async () => {
    const error = new Error("offline");
    queued.push({ data: null, error });
    await expect(loadLeaderboard()).rejects.toBe(error);
  });
});

describe("joining and leaving", () => {
  it("returns whether the couple is in", async () => {
    queued.push({ data: "joined", error: null }, { data: "waiting", error: null });
    expect(await joinLeaderboard()).toBe("joined");
    expect(await joinLeaderboard()).toBe("waiting");
    expect(calls).toEqual(["join_leaderboard", "join_leaderboard"]);
  });

  it("explains a refusal for an unlinked caller", async () => {
    queued.push({ data: null, error: { code: "P0001", message: "not_linked" } });
    await expect(joinLeaderboard()).rejects.toBeInstanceOf(LeaderboardError);
    const other = { code: "500", message: "boom" };
    expect(toLeaderboardError(other)).toBe(other);
  });

  it("leaves", async () => {
    await leaveLeaderboard();
    expect(calls).toEqual(["leave_leaderboard"]);
  });
});

describe("copy", () => {
  it("says the band in words", () => {
    expect(bandLine("top")).toBe("You’re in the top third this week.");
  });

  it("counts the league's quests", () => {
    expect(questsLine(0)).toBe("No quests finished in your league yet this week.");
    expect(questsLine(1)).toBe("Couples in your league finished 1 quest this week.");
    expect(questsLine(1200)).toBe("Couples in your league finished 1,200 quests this week.");
  });
});
