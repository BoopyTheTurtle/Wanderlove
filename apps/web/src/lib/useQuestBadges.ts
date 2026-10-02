import { useEffect, useRef, useState } from "react";
import { badgesEarned, specialQuests } from "@wannadoo/core";
import type { LatLng } from "@wannadoo/core";
import { claimBadges, BadgeError } from "./badges";
import type { BadgeId } from "./badges";
import type { Run } from "./runs";

// Memory badges at quest finish (gamification.md, 4.6). The phone works out what it alone can know (after dark,
// special quest) with core's badgesEarned, then claims once per run; the server adds first-walk and checks the season.
// The position for after-dark is the trail's last stop, held on this phone; it never leaves it.

const CLAIMED_KEY = "wannadoo_badge_claims";
// Enough to cover any run a phone could still finish; older ids drop off.
const MAX_CLAIMED = 20;
// A run finished longer ago than this is not claimed: the server reckons the season by today's date.
export const CLAIM_WINDOW_MS = 12 * 60 * 60 * 1000;

// { [userId]: runId[] }, newest last.
type Claimed = Record<string, string[]>;

export type ClaimStorage = Pick<Storage, "getItem" | "setItem">;

function readClaimed(storage: ClaimStorage): Claimed {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(CLAIMED_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Claimed) : {};
  } catch {
    return {};
  }
}

function writeClaimed(storage: ClaimStorage, claimed: Claimed) {
  try {
    storage.setItem(CLAIMED_KEY, JSON.stringify(claimed));
  } catch {
    // Storage blocked: the in-memory guard still stops a second call in this session.
  }
}

export function hasClaimed(storage: ClaimStorage, userId: string, runId: string): boolean {
  const runs = readClaimed(storage)[userId];
  return Array.isArray(runs) && runs.includes(runId);
}

export function markClaimed(storage: ClaimStorage, userId: string, runId: string, claimed = true) {
  const all = readClaimed(storage);
  const runs = (Array.isArray(all[userId]) ? all[userId] : []).filter((id) => id !== runId);
  if (claimed) runs.push(runId);
  all[userId] = runs.slice(-MAX_CLAIMED);
  writeClaimed(storage, all);
}

/** True when the run's trail is one of core's special quests. */
export function isSpecialQuestRun(run: Pick<Run, "trail">): boolean {
  return specialQuests.some((q) => q.trail.id === run.trail.id);
}

/** Where the quest finished: the trail's last stop, or undefined when the phone holds no stops. */
export function finishPosition(run: Pick<Run, "trail">): LatLng | undefined {
  const last = run.trail.stops[run.trail.stops.length - 1];
  return last ? { lat: last.lat, lng: last.lng } : undefined;
}

/**
 * The badges the phone asks for. first-walk is left to the server, which awards it on any claim; asking for it too
 * would be harmless, but the server is the one that knows whether this is the first quest.
 */
export function badgeCandidates(run: Pick<Run, "trail" | "completedAt">): BadgeId[] {
  if (!run.completedAt) return [];
  return badgesEarned({
    finishedAt: new Date(run.completedAt),
    position: finishPosition(run),
    isSpecialQuest: isSpecialQuestRun(run),
    isFirstQuest: false,
  });
}

// This session's claims by user and run. A second caller (a remount, StrictMode's double effect) gets the same answer
// instead of a second call.
const claims = new Map<string, Promise<BadgeId[]>>();

export type ClaimDeps = {
  storage: ClaimStorage;
  claim: (runId: string, badges: BadgeId[]) => Promise<BadgeId[]>;
  now: number;
};

/**
 * Claims the badges of a finished run once per user and run on this phone, and returns the newly earned ones. Returns
 * [] without calling when the run is unfinished, too old, or claimed in an earlier session. A network failure clears
 * the flag so a later visit tries again; a refusal the server explains keeps it.
 */
export function claimQuestBadgesOnce(
  run: Pick<Run, "id" | "trail" | "completedAt">,
  userId: string,
  deps: ClaimDeps,
): Promise<BadgeId[]> {
  const key = `${userId}:${run.id}`;
  const pending = claims.get(key);
  if (pending) return pending;
  if (!run.completedAt) return Promise.resolve([]);
  if (deps.now - new Date(run.completedAt).getTime() > CLAIM_WINDOW_MS) return Promise.resolve([]);
  if (hasClaimed(deps.storage, userId, run.id)) return Promise.resolve([]);

  markClaimed(deps.storage, userId, run.id);
  const claim = deps.claim(run.id, badgeCandidates(run)).catch((e: unknown) => {
    if (!(e instanceof BadgeError)) {
      markClaimed(deps.storage, userId, run.id, false);
      claims.delete(key);
    }
    throw e;
  });
  claims.set(key, claim);
  return claim;
}

/** Test hook: forgets this session's claims. */
export function resetClaimGuard() {
  claims.clear();
}

function deviceStorage(): ClaimStorage {
  try {
    return localStorage;
  } catch {
    const memory = new Map<string, string>();
    return { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) };
  }
}

/**
 * The badges this run just earned, for BadgeEarnedNote. Pass null (for a past run opened from Activity, or before the
 * run loads) to claim nothing. Claims once per run on this phone; starts empty and fills when the server answers.
 */
export function useQuestBadges(run: Run | null, userId: string): BadgeId[] {
  const [earned, setEarned] = useState<{ runId: string; badges: BadgeId[] } | null>(null);
  // The run object changes on every sync; the claim depends only on which run finished and when.
  const latest = useRef(run);
  latest.current = run;
  const runId = run?.id ?? null;
  const completedAt = run?.completedAt ?? null;

  useEffect(() => {
    const finished = latest.current;
    if (!finished || !completedAt) return;
    let current = true;
    claimQuestBadgesOnce(finished, userId, { storage: deviceStorage(), claim: claimBadges, now: Date.now() }).then(
      (badges) => current && badges.length > 0 && setEarned({ runId: finished.id, badges }),
      (e: unknown) => console.error("Couldn't claim badges", e),
    );
    return () => {
      current = false;
    };
  }, [runId, completedAt, userId]);

  return earned && earned.runId === runId ? earned.badges : [];
}
