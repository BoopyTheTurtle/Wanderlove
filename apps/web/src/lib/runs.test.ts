import { describe, expect, it, vi } from "vitest";
import { trail } from "@wannadoo/core";
import { toRunSnapshot } from "./runSnapshot";
import { allStopsDone, completedCount, isRunActive, isStopDone, nextStop, runFromRow, type Run } from "./runs";

// The helpers under test are pure; the client module only needs env vars that tests don't have.
vi.mock("./supabase", () => ({ supabase: {} }));

const [first, second, third] = trail.stops;

function row(completions: { stop_id: string; completed_by?: string; completed_at?: string }[] = []) {
  return {
    id: "run-1",
    trail_id: trail.id,
    trail_snapshot: JSON.parse(JSON.stringify(toRunSnapshot(trail))),
    couple_id: "couple-1",
    started_at: "2026-09-29T10:00:00Z",
    completed_at: null,
    abandoned_at: null,
    stop_completions: completions.map((c) => ({
      stop_id: c.stop_id,
      completed_by: c.completed_by ?? "user-a",
      completed_at: c.completed_at ?? "2026-09-29T10:05:00Z",
    })),
  };
}

describe("runFromRow", () => {
  it("rebuilds the trail and keys completions by stop", () => {
    const run = runFromRow(row([{ stop_id: second.id, completed_by: "user-b", completed_at: "t1" }]));
    expect(run.trail.id).toBe(trail.id);
    expect(run.trail.stops).toEqual(trail.stops);
    expect(run.coupleId).toBe("couple-1");
    expect(run.completions).toEqual({ [second.id]: { by: "user-b", at: "t1" } });
  });
});

describe("run state", () => {
  it("starts with nothing done and the first stop next", () => {
    const run = runFromRow(row());
    expect(completedCount(run)).toBe(0);
    expect(nextStop(run)?.id).toBe(first.id);
    expect(allStopsDone(run)).toBe(false);
    expect(isRunActive(run)).toBe(true);
  });

  it("picks the first open stop in trail order, whoever completed the others", () => {
    const run = runFromRow(row([{ stop_id: first.id }, { stop_id: third.id, completed_by: "user-b" }]));
    expect(completedCount(run)).toBe(2);
    expect(isStopDone(run, third.id)).toBe(true);
    expect(nextStop(run)?.id).toBe(second.id);
  });

  it("ignores completions for stops not on the trail", () => {
    const run = runFromRow(row([{ stop_id: "osm-node-1" }]));
    expect(completedCount(run)).toBe(0);
  });

  it("reports all done once every stop has a completion", () => {
    const run = runFromRow(row(trail.stops.map((s) => ({ stop_id: s.id }))));
    expect(completedCount(run)).toBe(trail.stops.length);
    expect(nextStop(run)).toBeNull();
    expect(allStopsDone(run)).toBe(true);
  });

  it("treats a finished or abandoned run as inactive", () => {
    const run: Run = runFromRow(row());
    expect(isRunActive({ ...run, completedAt: "t" })).toBe(false);
    expect(isRunActive({ ...run, abandonedAt: "t" })).toBe(false);
  });
});
