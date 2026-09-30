import { describe, expect, it, vi } from "vitest";
import { trail } from "@wannadoo/core";
import { toRunSnapshot } from "./runSnapshot";
import {
  allStopsDone,
  canAddPhotos,
  completedCount,
  isRunActive,
  isKeysMismatch,
  isStopDone,
  nextStop,
  planRunKeys,
  runFromRow,
  type Run,
} from "./runs";
import type { PartnerKey } from "./keys";

// The helpers under test are pure; the client module only needs env vars that tests don't have.
vi.mock("./supabase", () => ({ supabase: {} }));

const [first, second, third] = trail.stops;

function row(completions: { stop_id: string; completed_by?: string; completed_at?: string }[] = []) {
  return {
    id: "run-1",
    trail_id: trail.id,
    trail_snapshot: JSON.parse(JSON.stringify(toRunSnapshot(trail))),
    couple_id: "couple-1",
    started_by: "user-a",
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

describe("canAddPhotos", () => {
  const base = {
    id: "r",
    trail,
    coupleId: null,
    startedBy: null,
    startedAt: "2026-09-29T08:00:00Z",
    completedAt: null,
    abandonedAt: null,
    completions: {},
  } satisfies Run;
  const now = Date.parse("2026-09-29T12:00:00Z");

  it("allows photos on an open run", () => {
    expect(canAddPhotos(base, now)).toBe(true);
  });
  it("allows photos for a day after the run finishes", () => {
    expect(canAddPhotos({ ...base, completedAt: "2026-09-29T11:00:00Z" }, now)).toBe(true);
    expect(canAddPhotos({ ...base, completedAt: "2026-09-28T12:30:00Z" }, now)).toBe(true);
  });
  it("closes a day after the run finishes", () => {
    expect(canAddPhotos({ ...base, completedAt: "2026-09-28T11:59:00Z" }, now)).toBe(false);
  });
  it("never allows photos on an abandoned run", () => {
    expect(canAddPhotos({ ...base, abandonedAt: "2026-09-29T11:59:00Z" }, now)).toBe(false);
  });
});

describe("startedBy", () => {
  it("carries who started the run, or null for older runs", () => {
    expect(runFromRow(row()).startedBy).toBe("user-a");
    expect(runFromRow({ ...row(), started_by: null }).startedBy).toBeNull();
  });
});

describe("planRunKeys", () => {
  const me = { userId: "me", publicKey: "my-public", keyId: "my-key" };
  const key: PartnerKey = { partnerId: "partner", publicKey: "their-public", keyId: "their-key" };

  it("wraps for the caller alone on a solo run", () => {
    expect(planRunKeys(me, null, { status: "none" })).toEqual({ kind: "encrypted", recipients: [me] });
  });

  it("wraps for both members when the partner's key is trusted", () => {
    expect(planRunKeys(me, "partner", { status: "trusted", key })).toEqual({
      kind: "encrypted",
      recipients: [me, { userId: "partner", publicKey: "their-public", keyId: "their-key" }],
    });
  });

  it("starts plain when the partner has no keys yet", () => {
    expect(planRunKeys(me, "partner", { status: "none" })).toEqual({ kind: "plain", reason: "partner-without-keys" });
  });

  it("starts plain while the partner's key waits for trust", () => {
    const check = { status: "confirm", key, reason: "changed", partnerName: "Emma" } as const;
    expect(planRunKeys(me, "partner", check)).toEqual({ kind: "plain", reason: "partner-unconfirmed" });
  });

  it("never wraps for a trusted key of someone other than the active partner", () => {
    expect(planRunKeys(me, "someone-else", { status: "trusted", key })).toEqual({
      kind: "plain",
      reason: "partner-without-keys",
    });
  });
});

describe("isKeysMismatch", () => {
  it("recognises start_run's keys_mismatch and nothing else", () => {
    expect(isKeysMismatch({ code: "P0001", message: "keys_mismatch" })).toBe(true);
    expect(isKeysMismatch({ code: "P0001", message: "run_id_required" })).toBe(false);
    expect(isKeysMismatch({ code: "42501", message: "not signed in" })).toBe(false);
    expect(isKeysMismatch(null)).toBe(false);
  });
});
