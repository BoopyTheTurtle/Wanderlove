import type { Stop, Trail } from "@wannadoo/core";
import { fromRunSnapshot, toRunSnapshot } from "./runSnapshot";
import { supabase } from "./supabase";

// Who completed a stop, and when. The first completion wins; a partner's later one is dropped.
export type StopCompletion = { by: string; at: string };
export type Completions = Record<string, StopCompletion>;

export type Run = {
  id: string;
  trail: Trail;
  coupleId: string | null; // null: a solo run
  // Who started the run; null for runs from before the database recorded it.
  startedBy: string | null;
  startedAt: string;
  completedAt: string | null;
  abandonedAt: string | null;
  completions: Completions;
};

type RunRow = {
  id: string;
  trail_id: string;
  trail_snapshot: unknown;
  couple_id: string | null;
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
  abandoned_at: string | null;
  stop_completions: { stop_id: string; completed_by: string; completed_at: string }[];
};

const RUN_COLUMNS =
  "id, trail_id, trail_snapshot, couple_id, started_by, started_at, completed_at, abandoned_at, stop_completions(stop_id, completed_by, completed_at)";

export function runFromRow(row: RunRow): Run {
  const completions: Completions = {};
  for (const c of row.stop_completions) completions[c.stop_id] = { by: c.completed_by, at: c.completed_at };
  return {
    id: row.id,
    trail: fromRunSnapshot(row.trail_snapshot, row.trail_id),
    coupleId: row.couple_id,
    startedBy: row.started_by,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    abandonedAt: row.abandoned_at,
    completions,
  };
}

// Starts a run for the caller and their active partner, and abandons any run either still has open. Only a
// stop-only snapshot reaches the server.
export async function startRun(trail: Trail): Promise<Run> {
  const { data: runId, error } = await supabase.rpc("start_run", {
    p_trail_id: trail.id,
    p_snapshot: toRunSnapshot(trail),
  });
  if (error) throw error;
  const run = await loadRun(runId);
  if (!run) throw new Error("The new run could not be read back");
  return run;
}

// The caller's open run, including one the partner started, or null. RLS limits runs to those the caller belongs to.
export async function loadActiveRun(): Promise<Run | null> {
  const { data, error } = await supabase
    .from("trail_runs")
    .select(RUN_COLUMNS)
    .is("completed_at", null)
    .is("abandoned_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? runFromRow(data) : null;
}

// Any run the caller belongs to, open or ended; null when it doesn't exist or the caller can't see it.
export async function loadRun(runId: string): Promise<Run | null> {
  const { data, error } = await supabase.from("trail_runs").select(RUN_COLUMNS).eq("id", runId).maybeSingle();
  if (error) throw error;
  return data ? runFromRow(data) : null;
}

// Marks a stop done. When the partner got there first, their completion stands and this call succeeds quietly.
// Throws when the run has ended or the stop isn't on it.
export async function completeStop(runId: string, stopId: string): Promise<void> {
  const { error } = await supabase
    .from("stop_completions")
    .upsert({ run_id: runId, stop_id: stopId }, { onConflict: "run_id,stop_id", ignoreDuplicates: true });
  if (error) throw error;
}

// Ends a run as walked. Does nothing if the run has already ended.
export async function finishRun(runId: string): Promise<void> {
  const { error } = await supabase
    .from("trail_runs")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", runId)
    .is("completed_at", null)
    .is("abandoned_at", null);
  if (error) throw error;
}

// Ends a run unfinished. Does nothing if the run has already ended.
export async function abandonRun(runId: string): Promise<void> {
  const { error } = await supabase
    .from("trail_runs")
    .update({ abandoned_at: new Date().toISOString() })
    .eq("id", runId)
    .is("completed_at", null)
    .is("abandoned_at", null);
  if (error) throw error;
}

// Pure helpers for the screens.

export function isStopDone(run: Run, stopId: string): boolean {
  return stopId in run.completions;
}

export function completedCount(run: Run): number {
  return run.trail.stops.filter((s) => isStopDone(run, s.id)).length;
}

// The first stop in trail order that nobody has completed yet, or null when all are done.
export function nextStop(run: Run): Stop | null {
  return run.trail.stops.find((s) => !isStopDone(run, s.id)) ?? null;
}

export function allStopsDone(run: Run): boolean {
  return nextStop(run) === null;
}

export function isRunActive(run: Run): boolean {
  return run.completedAt === null && run.abandonedAt === null;
}

// How long after a run finishes its members may still add photos (supabase/migrations, `private.can_add_photo`).
export const PHOTO_GRACE_MS = 24 * 60 * 60 * 1000;

// Whether the server still takes photos for this run: open, or finished less than a day ago. Never once abandoned.
export function canAddPhotos(run: Run, now = Date.now()): boolean {
  if (run.abandonedAt !== null) return false;
  return run.completedAt === null || now - Date.parse(run.completedAt) < PHOTO_GRACE_MS;
}
