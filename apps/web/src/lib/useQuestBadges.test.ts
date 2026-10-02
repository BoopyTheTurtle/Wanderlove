import { beforeEach, describe, expect, it, vi } from "vitest";
import { specialQuests, trail as curated } from "@wannadoo/core";
import type { Trail } from "@wannadoo/core";
import { BadgeError } from "./badges";
import type { BadgeId } from "./badges";
import {
  CLAIM_WINDOW_MS,
  badgeCandidates,
  claimQuestBadgesOnce,
  finishPosition,
  hasClaimed,
  isSpecialQuestRun,
  markClaimed,
  resetClaimGuard,
} from "./useQuestBadges";
import type { ClaimStorage } from "./useQuestBadges";

vi.mock("./supabase", () => ({ supabase: {} }));

// A trail ending in Riga Old Town.
const riga: Trail = {
  ...curated,
  id: "surprise-1",
  kind: "surprise",
  stops: [{ ...curated.stops[0], id: "s1", lat: 56.9496, lng: 24.1052 }],
};
const special = specialQuests[0].trail;

// 2 October 2026: 12:00 Riga is daylight, 23:00 Riga is dark.
const NOON = "2026-10-02T09:00:00Z";
const NIGHT = "2026-10-02T20:00:00Z";

function memoryStorage(): ClaimStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

function run(completedAt: string | null, trail: Trail = riga, id = "run-1") {
  return { id, trail, completedAt };
}

beforeEach(() => resetClaimGuard());

describe("badge candidates", () => {
  it("asks for the season in daylight, and leaves first-walk to the server", () => {
    expect(badgeCandidates(run(NOON))).toEqual(["season-autumn"]);
  });

  it("adds after dark from the trail's last stop", () => {
    expect(finishPosition(run(NIGHT))).toEqual({ lat: 56.9496, lng: 24.1052 });
    expect(badgeCandidates(run(NIGHT))).toEqual(["first-after-dark", "season-autumn"]);
  });

  it("adds special-quest for a special quest's trail", () => {
    expect(isSpecialQuestRun(run(NOON, special))).toBe(true);
    expect(isSpecialQuestRun(run(NOON))).toBe(false);
    expect(badgeCandidates(run(NOON, special))).toContain("special-quest");
  });

  it("claims nothing for an unfinished run, and no after dark without stops", () => {
    expect(badgeCandidates(run(null))).toEqual([]);
    expect(badgeCandidates(run(NIGHT, { ...riga, stops: [] }))).toEqual(["season-autumn"]);
  });
});

describe("claiming once per run", () => {
  const now = Date.parse(NIGHT) + 60_000;

  it("calls the server once, even when asked twice at the same time", async () => {
    const storage = memoryStorage();
    const claim = vi.fn(async (): Promise<BadgeId[]> => ["first-walk", "first-after-dark"]);
    const [a, b] = await Promise.all([
      claimQuestBadgesOnce(run(NIGHT), "me", { storage, claim, now }),
      claimQuestBadgesOnce(run(NIGHT), "me", { storage, claim, now }),
    ]);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenCalledWith("run-1", ["first-after-dark", "season-autumn"]);
    expect(a).toEqual(["first-walk", "first-after-dark"]);
    expect(b).toEqual(a);
    expect(hasClaimed(storage, "me", "run-1")).toBe(true);
  });

  it("never calls again once this phone has claimed the run", async () => {
    const storage = memoryStorage();
    markClaimed(storage, "me", "run-1");
    const claim = vi.fn(async (): Promise<BadgeId[]> => []);
    expect(await claimQuestBadgesOnce(run(NIGHT), "me", { storage, claim, now })).toEqual([]);
    expect(claim).not.toHaveBeenCalled();
  });

  it("keeps each user's claims apart", async () => {
    const storage = memoryStorage();
    markClaimed(storage, "partner", "run-1");
    const claim = vi.fn(async (): Promise<BadgeId[]> => []);
    await claimQuestBadgesOnce(run(NIGHT), "me", { storage, claim, now });
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it("skips an unfinished run and one that ended too long ago", async () => {
    const storage = memoryStorage();
    const claim = vi.fn(async (): Promise<BadgeId[]> => []);
    await claimQuestBadgesOnce(run(null), "me", { storage, claim, now });
    await claimQuestBadgesOnce(run(NIGHT), "me", { storage, claim, now: Date.parse(NIGHT) + CLAIM_WINDOW_MS + 1 });
    expect(claim).not.toHaveBeenCalled();
    expect(hasClaimed(storage, "me", "run-1")).toBe(false);
  });

  it("tries again after a network failure", async () => {
    const storage = memoryStorage();
    const claim = vi.fn<() => Promise<BadgeId[]>>().mockRejectedValueOnce(new Error("offline"));
    claim.mockResolvedValueOnce(["first-walk"]);
    await expect(claimQuestBadgesOnce(run(NIGHT), "me", { storage, claim, now })).rejects.toThrow("offline");
    expect(hasClaimed(storage, "me", "run-1")).toBe(false);
    expect(await claimQuestBadgesOnce(run(NIGHT), "me", { storage, claim, now })).toEqual(["first-walk"]);
    expect(claim).toHaveBeenCalledTimes(2);
  });

  it("keeps the flag after a refusal the server explains", async () => {
    const storage = memoryStorage();
    const claim = vi.fn(async (): Promise<BadgeId[]> => {
      throw new BadgeError("not_member");
    });
    await expect(claimQuestBadgesOnce(run(NIGHT), "me", { storage, claim, now })).rejects.toBeInstanceOf(BadgeError);
    resetClaimGuard();
    expect(await claimQuestBadgesOnce(run(NIGHT), "me", { storage, claim, now })).toEqual([]);
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it("remembers only the latest runs", () => {
    const storage = memoryStorage();
    for (let i = 0; i < 25; i++) markClaimed(storage, "me", `run-${i}`);
    expect(hasClaimed(storage, "me", "run-0")).toBe(false);
    expect(hasClaimed(storage, "me", "run-24")).toBe(true);
  });
});
