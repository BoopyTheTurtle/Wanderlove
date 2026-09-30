import type { Stop, Trail } from "@wannadoo/core";
import { loadPartner } from "./couples";
import { generateRunKey } from "./crypto";
import { buildRunKeyWraps, checkPartnerKey, type PartnerKeyCheck, type Recipient } from "./keys";
import { setRunKey, type DeviceKeys } from "./keyStore";
import { fromRunDetails, fromRunSnapshot, fromRunSummary, toRunDetails, toRunSummary } from "./runSnapshot";
import { openJson, sealJson } from "./sealed";
import { supabase } from "./supabase";

// A run's photo key, or null for a run without one (lib/photoKeys.ts, RunKeyLoader). A private run's trail opens
// with the same key.
export type OpenRunKey = (runId: string) => Promise<CryptoKey | null>;

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

// What a row holds of its trail: a plain snapshot on a run from before private trails, or the sealed details and
// summary (docs/private-trails.md, section 1). The monthly trim drops the details and keeps the summary.
type TrailColumns = {
  id: string;
  trail_id: string;
  trail_snapshot: unknown;
  details_ciphertext?: string | null;
  details_nonce?: string | null;
  summary_ciphertext: string | null;
  summary_nonce: string | null;
};

type RunRow = TrailColumns & {
  couple_id: string | null;
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
  abandoned_at: string | null;
  stop_completions: { stop_id: string; completed_by: string; completed_at: string }[];
};

const RUN_COLUMNS =
  "id, trail_id, trail_snapshot, details_ciphertext, details_nonce, summary_ciphertext, summary_nonce, couple_id, started_by, started_at, completed_at, abandoned_at, stop_completions(stop_id, completed_by, completed_at)";

// The trail of a run: a legacy run's snapshot as it is, a private run's details opened with the run key, or its
// summary once the details are gone. Throws when the key is missing or the ciphertext won't open.
export async function trailFromRow(row: TrailColumns, openKey: OpenRunKey): Promise<Trail> {
  if (row.trail_snapshot !== null) return fromRunSnapshot(row.trail_snapshot, row.trail_id);
  const key = await openKey(row.id);
  if (!key) throw new Error("This trail's key is missing");
  if (row.details_ciphertext && row.details_nonce) {
    const sealed = { ciphertext: row.details_ciphertext, nonce: row.details_nonce };
    return fromRunDetails(await openJson(sealed, key, row.id, "details"));
  }
  if (row.summary_ciphertext && row.summary_nonce) {
    const sealed = { ciphertext: row.summary_ciphertext, nonce: row.summary_nonce };
    return fromRunSummary(await openJson(sealed, key, row.id, "summary"));
  }
  throw new Error("This trail has neither details nor a summary");
}

export function runFromRow(row: RunRow, trail: Trail): Run {
  const completions: Completions = {};
  for (const c of row.stop_completions) completions[c.stop_id] = { by: c.completed_by, at: c.completed_at };
  return {
    id: row.id,
    trail,
    coupleId: row.couple_id,
    startedBy: row.started_by,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    abandonedAt: row.abandoned_at,
    completions,
  };
}

// How a new run's photos are kept (photo-encryption.md, sections 2 and 4). An encrypted run wraps its photo key for
// every member: the caller alone on a solo run, or the caller and the active partner. When the partner can't receive
// a key yet, the start waits (RunKeysNotReadyError) rather than let photos upload unencrypted:
// - "partner-without-keys": the partner's account has no keys (their phone hasn't opened the app since E.3).
// - "partner-unconfirmed": the partner's key is new or changed and waits for this user's trust (the app is asking).
// - "keys-mismatch": the server refused the wraps twice, because a key changed between the check and the start.
export type RunKeyPlan = { kind: "encrypted"; recipients: Recipient[] } | { kind: "wait"; reason: NotReadyReason };

export type NotReadyReason = "partner-without-keys" | "partner-unconfirmed" | "keys-mismatch";

export class RunKeysNotReadyError extends Error {
  constructor(readonly reason: NotReadyReason) {
    super(`The run's photo keys aren't ready: ${reason}`);
    this.name = "RunKeysNotReadyError";
  }
}

// Pure decision. `partnerId` is the active partner, or null on a solo run; `check` is lib/keys.ts's checkPartnerKey.
export function planRunKeys(me: Recipient, partnerId: string | null, check: PartnerKeyCheck): RunKeyPlan {
  if (partnerId === null) return { kind: "encrypted", recipients: [me] };
  if (check.status === "trusted" && check.key.partnerId === partnerId) {
    const { publicKey, keyId } = check.key;
    return { kind: "encrypted", recipients: [me, { userId: partnerId, publicKey, keyId }] };
  }
  if (check.status === "confirm") return { kind: "wait", reason: "partner-unconfirmed" };
  return { kind: "wait", reason: "partner-without-keys" };
}

// start_run's refusal when a wrap is missing or not for a member's current key (migration 20260929220000).
export function isKeysMismatch(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "P0001" && error.message === "keys_mismatch";
}

// start_run's refusal of a run without keys (migration 20260930100000). This app always sends keys, so it only
// surfaces if the call itself loses them; startRun reports it as a plain error, never as a reason to start unencrypted.
export function isKeysRequired(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "P0001" && error.message === "keys_required";
}

async function currentPlan(me: Recipient, alone: boolean): Promise<RunKeyPlan> {
  if (alone) return { kind: "encrypted", recipients: [me] };
  const check = await checkPartnerKey(me.userId);
  // "none" covers both a solo caller and a partner without keys; only the partner lookup tells them apart.
  const partnerId = check.status === "none" ? ((await loadPartner(me.userId))?.id ?? null) : check.key.partnerId;
  return planRunKeys(me, partnerId, check);
}

export type StartedRun = { run: Run; plan: RunKeyPlan };

// Who a new run is for: "together" invites the active partner, who joins only by accepting (docs/private-trails.md,
// section 2); "alone" is Just me, which the partner never sees. Without a partner both start a solo run.
export type QuestMode = "together" | "alone";

// start_run's arguments for a private trail: its details and summary sealed with the run key and bound to the run ID.
// The server gets no trail name, place, or stop ID, only how many stops there are.
export async function sealedStartArgs(trail: Trail, runKey: CryptoKey, runId: string) {
  const details = await sealJson(toRunDetails(trail), runKey, runId, "details");
  const summary = await sealJson(toRunSummary(trail), runKey, runId, "summary");
  return {
    p_trail_id: "private",
    p_details: details.ciphertext,
    p_details_nonce: details.nonce,
    p_summary: summary.ciphertext,
    p_summary_nonce: summary.nonce,
    p_stop_count: trail.stops.length,
  };
}

// Starts a private run and abandons any run the caller still has open. The phone picks the run ID, makes the run key,
// seals the trail with it, and wraps it for the caller and, on a Together start, the partner, all in one call; this
// phone then caches the key. When a key changed meanwhile (keys_mismatch) it checks the keys again and retries once.
// Throws RunKeysNotReadyError when the partner can't receive a key yet.
export async function startRun(
  trail: Trail,
  me: { id: string; keys: DeviceKeys },
  mode: QuestMode = "together",
): Promise<StartedRun> {
  const self: Recipient = { userId: me.id, publicKey: me.keys.publicKey, keyId: me.keys.keyId };
  const alone = mode === "alone";
  for (let attempt = 0; attempt < 2; attempt++) {
    const plan = await currentPlan(self, alone);
    if (plan.kind === "wait") throw new RunKeysNotReadyError(plan.reason);
    const runId = crypto.randomUUID();
    const runKey = await generateRunKey();
    const p_keys = await buildRunKeyWraps(runId, runKey, plan.recipients);
    const { data, error } = await supabase.rpc("start_run", {
      ...(await sealedStartArgs(trail, runKey, runId)),
      p_snapshot: null,
      p_keys,
      p_run_id: runId,
      // Without a partner the plan holds the caller alone, and "none" starts the same solo run as "invite" would.
      p_partner: plan.recipients.length > 1 ? "invite" : "none",
    });
    if (!error) {
      setRunKey(data, runKey);
      return { run: await readBack(data, async () => runKey), plan };
    }
    if (isKeysRequired(error)) throw new Error("The server refused a trail without photo keys", { cause: error });
    if (!isKeysMismatch(error)) throw error;
  }
  throw new RunKeysNotReadyError("keys-mismatch");
}

async function readBack(runId: string, openKey: OpenRunKey): Promise<Run> {
  const run = await loadRun(runId, openKey);
  if (!run) throw new Error("The new run could not be read back");
  return run;
}

// The caller's open run, including a partner's run the caller joined, or null. RLS limits runs to those the caller
// belongs to, so an invitation not yet accepted stays out.
export async function loadActiveRun(openKey: OpenRunKey): Promise<Run | null> {
  const { data, error } = await supabase
    .from("trail_runs")
    .select(RUN_COLUMNS)
    .is("completed_at", null)
    .is("abandoned_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? runFromRow(data, await trailFromRow(data, openKey)) : null;
}

// Any run the caller belongs to, open or ended; null when it doesn't exist or the caller can't see it.
export async function loadRun(runId: string, openKey: OpenRunKey): Promise<Run | null> {
  const { data, error } = await supabase.from("trail_runs").select(RUN_COLUMNS).eq("id", runId).maybeSingle();
  if (error) throw error;
  return data ? runFromRow(data, await trailFromRow(data, openKey)) : null;
}

// ---- Invitations (docs/private-trails.md, section 2) -------------------------------------------------------------

// The partner's open invitation to this user, the newest, or null. Only the invitee reads invitations, and only while
// the run is open and the couple lasts; the run itself stays out of reach until accepted.
export async function loadRunInvite(): Promise<{ runId: string } | null> {
  const { data, error } = await supabase
    .from("run_invites")
    .select("run_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { runId: data.run_id } : null;
}

// Joins the partner's run: "gone" when it ended, the couple unlinked, or the invitation was declined. Joining
// abandons this user's other open runs.
export async function acceptRun(runId: string): Promise<"joined" | "gone"> {
  const { data, error } = await supabase.rpc("accept_run", { p_run_id: runId });
  if (error) throw error;
  return data === "joined" ? "joined" : "gone";
}

// Whether the partner has joined the caller's run. The starter reads every member of their run but never the
// invitation, so a declined invitation reads the same as one still waiting: false.
export async function hasPartnerJoined(runId: string, partnerId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("trail_run_members")
    .select("user_id", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("user_id", partnerId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// "Not now": drops the invitation and this user's copy of the run key. The partner's phone can't tell it from an
// invitation still waiting.
export async function declineRun(runId: string): Promise<void> {
  const { error } = await supabase.rpc("decline_run", { p_run_id: runId });
  if (error) throw error;
}

// A walk that has ended, as the Activity list shows it.
export type PastRun = {
  id: string;
  trailId: string;
  trailName: string;
  stopCount: number;
  stopsDone: number;
  photoCount: number;
  startedAt: string;
  endedAt: string;
  // "left": abandoned part of the way.
  outcome: "finished" | "left";
};

type PastRunRow = TrailColumns & {
  started_at: string;
  completed_at: string | null;
  abandoned_at: string | null;
  stop_count: number | null;
  stop_completions: { stop_id: string }[];
  photos: { count: number }[];
};

// The list needs names only, so a private run's summary is enough; its details stay on the server.
const PAST_RUN_COLUMNS =
  "id, trail_id, trail_snapshot, summary_ciphertext, summary_nonce, stop_count, started_at, completed_at, abandoned_at, stop_completions(stop_id), photos(count)";

// Stands in for a private trail this phone can't open, such as one whose key waits for the partner's re-share.
export function lockedTrail(stopCount: number): Trail {
  return fromRunSummary({
    trailId: "private",
    name: "A trail this phone can’t open yet",
    stops: Array.from({ length: Math.max(stopCount, 1) }, (_, i) => `Stop ${i + 1}`),
  });
}

// Null for a run that is still open.
export function pastRunFromRow(row: PastRunRow, trail: Trail): PastRun | null {
  const endedAt = row.completed_at ?? row.abandoned_at;
  if (!endedAt) return null;
  const done = new Set(row.stop_completions.map((c) => c.stop_id));
  return {
    id: row.id,
    trailId: trail.id,
    trailName: trail.name,
    stopCount: trail.stops.length,
    stopsDone: trail.stops.filter((s) => done.has(s.id)).length,
    photoCount: row.photos[0]?.count ?? 0,
    startedAt: row.started_at,
    endedAt,
    outcome: row.completed_at ? "finished" : "left",
  };
}

// A run left before its first stop was a route the couple changed their mind about, not a journey: Activity hides it.
// A run left part of the way stays, labelled, since its stops and photos are real.
export function isJourney(run: PastRun): boolean {
  return run.outcome === "finished" || run.stopsDone > 0 || run.photoCount > 0;
}

const PAST_RUN_LIMIT = 50;

// The caller's ended runs worth listing, newest ending first, each named from its summary. RLS limits runs, stops,
// and photos to the caller's own. A private trail this phone can't open is listed without its names.
export async function listPastRuns(openKey: OpenRunKey): Promise<PastRun[]> {
  const { data, error } = await supabase
    .from("trail_runs")
    .select(PAST_RUN_COLUMNS)
    .or("completed_at.not.is.null,abandoned_at.not.is.null")
    .order("started_at", { ascending: false })
    .limit(PAST_RUN_LIMIT);
  if (error) throw error;
  const runs = await Promise.all(
    data.map(async (row) => {
      let trail: Trail;
      try {
        trail = await trailFromRow(row, openKey);
      } catch (e) {
        console.error("Couldn't open a past trail", row.id, e);
        trail = lockedTrail(row.stop_count ?? 0);
      }
      return pastRunFromRow(row, trail);
    }),
  );
  return runs
    .filter((run): run is PastRun => run !== null && isJourney(run))
    .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
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

// How long the server keeps a run's photos after it ends; a scheduled job then deletes them (docs/mvp-roadmap.md,
// stage 1). The app infers the deletion from the end date, as the schema has no record of it yet.
export const PHOTO_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function runEndedAt(run: Pick<Run, "completedAt" | "abandonedAt">): string | null {
  return run.completedAt ?? run.abandonedAt;
}

// The day a walk ended, as Activity and the album show it.
export function journeyDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const PHOTOS_REMOVED_NOTE = "Photos from this walk were removed a month after it ended.";

// Whether an ended run with no photos left has passed the retention window, so any photos it had are gone. A run
// that never had photos reads the same; the album words it to fit both.
export function photosRemoved(endedAt: string | null, photoCount: number, now = Date.now()): boolean {
  return endedAt !== null && photoCount === 0 && now - Date.parse(endedAt) >= PHOTO_RETENTION_MS;
}
