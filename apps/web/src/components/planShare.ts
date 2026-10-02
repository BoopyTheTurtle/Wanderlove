import { PlanError } from "../lib/plannedWalks";
import type { PlannedWalk, WalkSlot } from "../lib/plannedWalks";
import { ShareError } from "../lib/shares";
import type { RunShare } from "../lib/shares";
import { downloadBlob } from "../lib/saveFiles";

// The state logic behind PlanNextWalk and ShareProposal, kept apart from the components so it tests without a DOM.

// How many days the picker offers, today included.
export const PLAN_DAYS = 14;

export const SLOT_LABEL: Record<WalkSlot, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

// Today in Riga, YYYY-MM-DD, the calendar the server checks plans against.
export function rigaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Riga",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// `count` days from `today` on, today first.
export function nextDays(today: string, count = PLAN_DAYS): string[] {
  const start = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

// "Today", "Tomorrow", else "Sat 10 Oct".
export function dayLabel(day: string, today: string): string {
  const [first, second] = nextDays(today, 2);
  if (day === first) return "Today";
  if (day === second) return "Tomorrow";
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// "Tomorrow, evening" or "Sat 10 Oct, morning".
export function planSummary(plan: PlannedWalk, today: string): string {
  return `${dayLabel(plan.day, today)}, ${SLOT_LABEL[plan.slot].toLowerCase()}`;
}

export function planErrorMessage(error: unknown): string {
  if (error instanceof PlanError) {
    if (error.code === "not_linked") return "You’re no longer linked, so there’s no walk to plan together.";
    return "Pick a day in the next two weeks and a time of day.";
  }
  return "Couldn’t save that. Check your connection and try again.";
}

// What the card shows, from the quest's share as the server reports it.
export type ShareStage =
  // Nothing proposed yet, or the last proposal was declined and the caller chose to pick another photo.
  | { kind: "pick"; excludePhotoId: string | null }
  | { kind: "waiting"; shareId: string }
  | { kind: "approved"; shareId: string; photoId: string | null; auto: boolean }
  | { kind: "declined"; photoId: string | null }
  | { kind: "shared"; points: number; byMe: boolean }
  // The partner proposed: they wait for my answer in the feed, or share the photo I approved.
  | { kind: "partner-asked" }
  | { kind: "partner-approved" };

export function shareStage(share: RunShare | null, pickAgain = false): ShareStage {
  if (!share) return { kind: "pick", excludePhotoId: null };
  switch (share.status) {
    case "pending":
      return share.proposedByMe ? { kind: "waiting", shareId: share.shareId } : { kind: "partner-asked" };
    case "approved":
      return share.proposedByMe
        ? { kind: "approved", shareId: share.shareId, photoId: share.photoId, auto: share.auto }
        : { kind: "partner-approved" };
    case "shared":
      return { kind: "shared", points: share.points, byMe: share.proposedByMe };
    case "declined":
      // The partner who declined sees no verdict, just the chance to pick a photo of their own.
      return share.proposedByMe && !pickAgain
        ? { kind: "declined", photoId: share.photoId }
        : { kind: "pick", excludePhotoId: share.photoId };
  }
}

// A refusal from the server, said kindly. Anything else is a connection problem.
export function shareRefusal(error: unknown, partnerName: string): string {
  if (!(error instanceof ShareError)) return "Couldn’t do that. Check your connection and try again.";
  switch (error.code) {
    case "photo_not_found":
      return "That photo isn’t here any more. Pick another one.";
    case "not_couple_quest":
      return "Only a quest you both walked can be shared.";
    case "run_not_finished":
      return "Finish the quest first, then pick a photo.";
    case "share_exists":
      return "This quest already has its photo to share.";
    case "share_pending":
      return `You already have a photo waiting for ${partnerName} from another quest. One at a time.`;
    case "photo_declined":
      return `${partnerName} said not this time to that photo.`;
    case "too_many_proposals":
      return "This quest has had all its asks. Its photos stay between you two.";
    case "share_gone":
      return "That share isn’t open any more.";
    case "not_approved":
      return `${partnerName} hasn’t said yes to this one yet.`;
  }
}

export function pointsLine(points: number): string {
  return points > 0
    ? `Shared. You earned ${points} points together.`
    : "Shared. This week’s share points are already used up, so no points this time.";
}

export type ShareOutcome = "shared" | "cancelled" | "needs-tap" | "downloaded";

// Hands one photo to the OS share sheet. Without one (most desktops) the photo downloads, for posting by hand.
export async function sharePhotoFile(file: File): Promise<ShareOutcome> {
  let canShare = false;
  try {
    canShare = !!navigator.share && !!navigator.canShare?.({ files: [file] });
  } catch {
    canShare = false;
  }
  if (!canShare) {
    downloadBlob(file, file.name);
    return "downloaded";
  }
  try {
    await navigator.share({ files: [file] });
    return "shared";
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "AbortError") return "cancelled";
    // iOS refuses the sheet when too long passed since the tap; ask for one more.
    if (name === "NotAllowedError") return "needs-tap";
    throw e;
  }
}
