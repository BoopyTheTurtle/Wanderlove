import { supabase } from "./supabase";

// The weekly league (docs/mvp-roadmap.md, stage 8; gamification.md, 4.7). Opt-in: both partners say yes, and either
// leaves alone, at once. A board shows couple names and weekly points only, with the caller's place as a band, never a
// rank (abuse-threat-model.md, M4).

// The caller's couple's standing. null when the caller is not linked.
export type LeaderboardStatus = { inLeague: boolean; myYes: boolean; partnerYes: boolean; needsName: boolean };

type StatusRow = {
  in_league: boolean | null;
  my_yes: boolean | null;
  partner_yes: boolean | null;
  needs_name: boolean | null;
};

export function statusFromRows(rows: StatusRow[] | null | undefined): LeaderboardStatus | null {
  const row = rows?.[0];
  if (!row) return null;
  return {
    inLeague: row.in_league === true,
    myYes: row.my_yes === true,
    partnerYes: row.partner_yes === true,
    needsName: row.needs_name === true,
  };
}

export async function loadLeaderboardStatus(): Promise<LeaderboardStatus | null> {
  const { data, error } = await supabase.rpc("leaderboard_status");
  if (error) throw error;
  return statusFromRows(data as StatusRow[] | null);
}

export type Band = "top" | "middle" | "bottom";
export type LeagueRow = { name: string; points: number; isMe: boolean };
// The caller's league this week, best first. band is null when the caller's row is missing.
export type League = { rows: LeagueRow[]; band: Band | null; quests: number };

type LeagueDbRow = {
  couple_name: string | null;
  weekly_points: number | null;
  is_me: boolean | null;
  my_band: string | null;
  league_quests: number | null;
};

const BANDS: Record<string, Band> = { "top third": "top", "middle third": "middle", "bottom third": "bottom" };

// The server sends rows best first and repeats my_band and league_quests on every row.
export function leagueFromRows(rows: LeagueDbRow[] | null | undefined): League {
  const list = rows ?? [];
  const first = list[0];
  return {
    rows: list.map((r) => ({ name: r.couple_name ?? "", points: r.weekly_points ?? 0, isMe: r.is_me === true })),
    band: (first?.my_band && BANDS[first.my_band]) || null,
    quests: first?.league_quests ?? 0,
  };
}

// Empty when the couple is not listed this week.
export async function loadLeague(): Promise<League> {
  const { data, error } = await supabase.rpc("my_league");
  if (error) throw error;
  return leagueFromRows(data as LeagueDbRow[] | null);
}

// What the League tab shows.
export type LeaderboardView =
  | { kind: "unlinked" }
  | { kind: "out"; partnerYes: boolean }
  | { kind: "waiting" }
  | { kind: "needsName" }
  | { kind: "league"; league: League };

export function leaderboardView(status: LeaderboardStatus | null, league: League | null): LeaderboardView {
  if (!status) return { kind: "unlinked" };
  if (!status.inLeague) return status.myYes ? { kind: "waiting" } : { kind: "out", partnerYes: status.partnerYes };
  if (status.needsName) return { kind: "needsName" };
  return { kind: "league", league: league ?? { rows: [], band: null, quests: 0 } };
}

// The status first; the board only for a couple that is in the league and named.
export async function loadLeaderboard(): Promise<LeaderboardView> {
  const status = await loadLeaderboardStatus();
  const listed = status !== null && status.inLeague && !status.needsName;
  return leaderboardView(status, listed ? await loadLeague() : null);
}

export function bandLine(band: Band): string {
  return `You’re in the ${band} third this week.`;
}

export function questsLine(quests: number): string {
  if (quests === 0) return "No quests finished in your league yet this week.";
  return `Couples in your league finished ${quests.toLocaleString("en-GB")} ${quests === 1 ? "quest" : "quests"} this week.`;
}

// A refusal the server explains (raise ... errcode P0001).
export class LeaderboardError extends Error {
  constructor(readonly code: "not_linked") {
    super(code);
    this.name = "LeaderboardError";
  }
}

export function toLeaderboardError(error: unknown): unknown {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (e && e.code === "P0001" && e.message === "not_linked") return new LeaderboardError("not_linked");
  return error;
}

// Records the caller's yes. 'joined' once both partners have said yes.
export async function joinLeaderboard(): Promise<"joined" | "waiting"> {
  const { data, error } = await supabase.rpc("join_leaderboard");
  if (error) throw toLeaderboardError(error);
  return data === "joined" ? "joined" : "waiting";
}

// Takes the couple out at once and clears both yeses. Either partner may, alone.
export async function leaveLeaderboard(): Promise<void> {
  const { error } = await supabase.rpc("leave_leaderboard");
  if (error) throw error;
}
