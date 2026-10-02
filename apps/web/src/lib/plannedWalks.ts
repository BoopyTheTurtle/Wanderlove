import { supabase } from "./supabase";

// Plan the next walk (docs/mvp-roadmap.md, stage 9; gamification.md, 4.4): an invitation, never a duty. One open plan
// per couple, a day and a rough time; either partner plans or cancels it, and the partner hears of each in the feed.
// A passed plan simply stops coming back, with no follow-up.

export const WALK_SLOTS = ["morning", "afternoon", "evening"] as const;
export type WalkSlot = (typeof WALK_SLOTS)[number];

// day is a Riga date, YYYY-MM-DD.
export type PlannedWalk = { day: string; slot: WalkSlot; plannedByMe: boolean };

type PlanRow = { day: string | null; slot: string | null; planned_by_me: boolean | null };

export function planFromRows(rows: PlanRow[] | null | undefined): PlannedWalk | null {
  const row = rows?.[0];
  if (!row?.day || !(WALK_SLOTS as readonly string[]).includes(row.slot ?? "")) return null;
  return { day: row.day, slot: row.slot as WalkSlot, plannedByMe: row.planned_by_me === true };
}

export type PlanErrorCode = "not_linked" | "slot_invalid" | "day_invalid";

const PLAN_ERRORS: readonly PlanErrorCode[] = ["not_linked", "slot_invalid", "day_invalid"];

// A refusal the server explains (raise ... errcode P0001).
export class PlanError extends Error {
  constructor(readonly code: PlanErrorCode) {
    super(code);
    this.name = "PlanError";
  }
}

export function toPlanError(error: unknown): unknown {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (e && e.code === "P0001" && PLAN_ERRORS.includes(e.message as PlanErrorCode)) {
    return new PlanError(e.message as PlanErrorCode);
  }
  return error;
}

// The couple's open plan, or null when there is none, it has passed, or the caller is not linked.
export async function loadPlannedWalk(): Promise<PlannedWalk | null> {
  const { data, error } = await supabase.rpc("my_planned_walk");
  if (error) throw error;
  return planFromRows(data);
}

// Plans the next walk for a day from today to 60 days ahead (Riga), replacing any plan.
export async function planWalk(day: string, slot: WalkSlot): Promise<void> {
  const { error } = await supabase.rpc("plan_walk", { p_day: day, p_slot: slot });
  if (error) throw toPlanError(error);
}

// Cancels the open plan; false when there was none to cancel.
export async function cancelPlannedWalk(): Promise<boolean> {
  const { data, error } = await supabase.rpc("cancel_planned_walk");
  if (error) throw toPlanError(error);
  return data === true;
}
