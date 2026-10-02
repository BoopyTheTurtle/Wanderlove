import { supabase } from "./supabase";

// Memory badges (docs/mvp-roadmap.md, stage 9; gamification.md, 4.6): experiences, not effort, earned once per couple
// (or, for a Just me quest, once per player). They appear unannounced and award no points. The server decides
// first-walk and the season itself, takes the phone's word for after-dark and special quests, and refuses rain until
// live weather exists.

export const BADGE_IDS = [
  "first-walk",
  "first-rain-walk",
  "first-after-dark",
  "season-spring",
  "season-summer",
  "season-autumn",
  "season-winter",
  "special-quest",
] as const;

export type BadgeId = (typeof BADGE_IDS)[number];

// scope "solo": earned on the caller's own Just me or solo quests, never shown to the partner.
export type Badge = { badge: BadgeId; earnedOn: string; scope: "couple" | "solo" };

type BadgeRow = { badge: string | null; earned_on: string | null; scope: string | null };

export function isBadgeId(id: unknown): id is BadgeId {
  return typeof id === "string" && (BADGE_IDS as readonly string[]).includes(id);
}

export function badgesFromRows(rows: BadgeRow[] | null | undefined): Badge[] {
  return (rows ?? []).flatMap((r) =>
    isBadgeId(r.badge) && r.earned_on
      ? [{ badge: r.badge, earnedOn: r.earned_on, scope: r.scope === "solo" ? ("solo" as const) : ("couple" as const) }]
      : [],
  );
}

export type BadgeErrorCode = "badge_unknown" | "run_not_finished" | "not_member";

const BADGE_ERRORS: readonly BadgeErrorCode[] = ["badge_unknown", "run_not_finished", "not_member"];

// A refusal the server explains (raise ... errcode P0001).
export class BadgeError extends Error {
  constructor(readonly code: BadgeErrorCode) {
    super(code);
    this.name = "BadgeError";
  }
}

export function toBadgeError(error: unknown): unknown {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (e && e.code === "P0001" && BADGE_ERRORS.includes(e.message as BadgeErrorCode)) {
    return new BadgeError(e.message as BadgeErrorCode);
  }
  return error;
}

// Claims badges for a finished run the caller walked; returns those newly earned. Call once at quest finish.
export async function claimBadges(runId: string, badges: BadgeId[] = []): Promise<BadgeId[]> {
  const { data, error } = await supabase.rpc("claim_badges", { p_run: runId, p_badges: badges });
  if (error) throw toBadgeError(error);
  return (data ?? []).filter(isBadgeId);
}

// The caller's badges, oldest first: the couple's and the caller's own solo ones.
export async function loadBadges(): Promise<Badge[]> {
  const { data, error } = await supabase.rpc("my_badges");
  if (error) throw error;
  return badgesFromRows(data);
}
