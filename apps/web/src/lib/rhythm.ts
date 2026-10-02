import { supabase } from "./supabase";

// Weekly rhythm instead of a streak (docs/mvp-roadmap.md, stage 9; gamification.md, 4.3). Linked, the days come from the
// couple's finished quests; unlinked, from the caller's own solo quests. Weeks run Monday to Sunday in Riga. An empty week
// is neutral, and a paused goal shows nothing as missed.

// A Riga day (YYYY-MM-DD) with the quests finished on it.
export type RhythmDay = { day: string; quests: number };

export type GoalKind = "weekly" | "twice_monthly";
export type RhythmGoal = { goal: GoalKind; paused: boolean };

type DayRow = { day: string | null; quests: number | null };
type GoalRow = { goal: string | null; paused: boolean | null };

export function daysFromRows(rows: DayRow[] | null | undefined): RhythmDay[] {
  return (rows ?? []).filter((r) => r.day).map((r) => ({ day: r.day as string, quests: r.quests ?? 0 }));
}

export function goalFromRows(rows: GoalRow[] | null | undefined): RhythmGoal | null {
  const row = rows?.[0];
  if (!row || (row.goal !== "weekly" && row.goal !== "twice_monthly")) return null;
  return { goal: row.goal, paused: row.paused === true };
}

// Days with finished quests over the last `weeks` weeks (1 to 104), oldest first.
export async function loadRhythm(weeks = 26): Promise<RhythmDay[]> {
  const { data, error } = await supabase.rpc("my_rhythm", { p_weeks: weeks });
  if (error) throw error;
  return daysFromRows(data);
}

// The couple's goal; null when unlinked or no goal is set.
export async function loadRhythmGoal(): Promise<RhythmGoal | null> {
  const { data, error } = await supabase.rpc("rhythm_goal");
  if (error) throw error;
  return goalFromRows(data);
}

// A refusal the server explains (raise ... errcode P0001).
export class RhythmError extends Error {
  constructor(readonly code: "not_linked" | "goal_invalid") {
    super(code);
    this.name = "RhythmError";
  }
}

export function toRhythmError(error: unknown): unknown {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (e && e.code === "P0001" && (e.message === "not_linked" || e.message === "goal_invalid")) {
    return new RhythmError(e.message);
  }
  return error;
}

// Sets the couple's goal, unpaused; null clears it. Either partner may, alone.
export async function setRhythmGoal(goal: GoalKind | null): Promise<void> {
  const { error } = await supabase.rpc("set_rhythm_goal", { p_goal: goal as string });
  if (error) throw toRhythmError(error);
}

// Pauses or resumes the couple's goal, no reason asked. Does nothing without a goal.
export async function pauseRhythmGoal(paused: boolean): Promise<void> {
  const { error } = await supabase.rpc("pause_rhythm_goal", { p_paused: paused });
  if (error) throw toRhythmError(error);
}

// The Monday (YYYY-MM-DD) of the week holding a Riga day.
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// Quests per week, keyed by the week's Monday. Weeks without a walk are simply absent.
export function questsByWeek(days: RhythmDay[]): Map<string, number> {
  const weeks = new Map<string, number>();
  for (const { day, quests } of days) {
    const monday = weekStart(day);
    weeks.set(monday, (weeks.get(monday) ?? 0) + quests);
  }
  return weeks;
}
