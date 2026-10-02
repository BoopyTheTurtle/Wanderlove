import { supabase } from "./supabase";

// Consent-first photo sharing (docs/mvp-roadmap.md, stage 7; gamification.md, 4.8). Either partner proposes one photo
// of a quest both walked; the other approves or declines ("not this time") on their own phone, unless they granted
// standing consent. Once approved, the proposer's phone shares through the OS share sheet and then calls confirmShare,
// which earns 20 points, at most once per quest and three times a week. The server holds consent state only; the photo
// stays end-to-end encrypted. Nothing shows the proposer a timer or reminder.

export type ShareStatus = "pending" | "approved" | "declined" | "shared";

// A quest's share as either partner sees it: the live one, else the latest declined.
export type RunShare = {
  shareId: string;
  photoId: string | null;
  status: ShareStatus;
  proposedByMe: boolean;
  auto: boolean;
  points: number;
};

export type ShareRequest = { shareId: string; runId: string; photoId: string | null };

const STATUSES: readonly ShareStatus[] = ["pending", "approved", "declined", "shared"];

const toStatus = (s: unknown): ShareStatus => (STATUSES.includes(s as ShareStatus) ? (s as ShareStatus) : "pending");

type RunShareRow = {
  share_id: string;
  photo_id: string | null;
  status: string;
  proposed_by_me: boolean | null;
  auto: boolean | null;
  points: number | null;
};

export function runShareFromRows(rows: RunShareRow[] | null | undefined): RunShare | null {
  const row = rows?.[0];
  if (!row) return null;
  return {
    shareId: row.share_id,
    photoId: row.photo_id ?? null,
    status: toStatus(row.status),
    proposedByMe: row.proposed_by_me === true,
    auto: row.auto === true,
    points: row.points ?? 0,
  };
}

export type ShareErrorCode =
  | "photo_not_found"
  | "not_couple_quest"
  | "run_not_finished"
  | "share_exists"
  | "share_pending"
  | "photo_declined"
  | "too_many_proposals"
  | "share_gone"
  | "not_approved";

const SHARE_ERRORS: readonly ShareErrorCode[] = [
  "photo_not_found",
  "not_couple_quest",
  "run_not_finished",
  "share_exists",
  "share_pending",
  "photo_declined",
  "too_many_proposals",
  "share_gone",
  "not_approved",
];

// A refusal the server explains (raise ... errcode P0001).
export class ShareError extends Error {
  constructor(readonly code: ShareErrorCode) {
    super(code);
    this.name = "ShareError";
  }
}

export function toShareError(error: unknown): unknown {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (e && e.code === "P0001" && SHARE_ERRORS.includes(e.message as ShareErrorCode)) {
    return new ShareError(e.message as ShareErrorCode);
  }
  return error;
}

// Whether the caller has granted standing consent to the partner's proposals.
export async function loadShareConsent(): Promise<boolean> {
  const { data, error } = await supabase.rpc("share_consent");
  if (error) throw error;
  return data === true;
}

// Grants or withdraws standing consent in one call; withdrawing drops approvals it gave that are not yet shared.
export async function setShareConsent(on: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_share_consent", { p_on: on });
  if (error) throw error;
}

// Proposes one photo; "approved" at once when the partner has standing consent, else "pending".
export async function proposeShare(photoId: string): Promise<{ shareId: string; status: ShareStatus }> {
  const { data, error } = await supabase.rpc("propose_share", { p_photo_id: photoId });
  if (error) throw toShareError(error);
  const row = data?.[0];
  if (!row) throw new Error("propose_share returned no row");
  return { shareId: row.share_id, status: toStatus(row.status) };
}

// Approves or declines a proposal made to the caller; returns the new status.
export async function answerShare(shareId: string, approve: boolean): Promise<ShareStatus> {
  const { data, error } = await supabase.rpc("answer_share", { p_share_id: shareId, p_approve: approve });
  if (error) throw toShareError(error);
  return toStatus(data);
}

// Withdraws the caller's own proposal before it is shared. Safe to call twice.
export async function cancelShare(shareId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_share", { p_share_id: shareId });
  if (error) throw error;
}

// Call after the share sheet completed; returns the points earned (20, or 0 when capped or already confirmed).
export async function confirmShare(shareId: string): Promise<number> {
  const { data, error } = await supabase.rpc("confirm_share", { p_share_id: shareId });
  if (error) throw toShareError(error);
  return data ?? 0;
}

// Proposals waiting for the caller's answer, oldest first.
export async function loadShareRequests(): Promise<ShareRequest[]> {
  const { data, error } = await supabase.rpc("pending_share_requests");
  if (error) throw error;
  return (data ?? []).map((r) => ({ shareId: r.share_id, runId: r.run_id, photoId: r.photo_id ?? null }));
}

// A quest's share, or null when it has none or the caller did not walk it.
export async function loadRunShare(runId: string): Promise<RunShare | null> {
  const { data, error } = await supabase.rpc("run_share", { p_run_id: runId });
  if (error) throw error;
  return runShareFromRows(data);
}
