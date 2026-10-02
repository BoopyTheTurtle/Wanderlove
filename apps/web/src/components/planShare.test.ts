import { describe, expect, it, vi } from "vitest";
import { PlanError } from "../lib/plannedWalks";
import { ShareError } from "../lib/shares";
import type { RunShare } from "../lib/shares";
import {
  dayLabel,
  nextDays,
  planErrorMessage,
  planSummary,
  pointsLine,
  rigaToday,
  shareRefusal,
  shareStage,
} from "./planShare";

vi.mock("../lib/supabase", () => ({ supabase: {} }));

const share = (over: Partial<RunShare>): RunShare => ({
  shareId: "sh1",
  photoId: "p1",
  status: "pending",
  proposedByMe: true,
  auto: false,
  points: 0,
  ...over,
});

describe("plan the next walk", () => {
  it("takes today from Riga's calendar, not the phone's", () => {
    // 23:30 UTC on 2 October is already 3 October in Riga (UTC+3 in summer time).
    expect(rigaToday(new Date("2026-10-02T23:30:00Z"))).toBe("2026-10-03");
    expect(rigaToday(new Date("2026-10-02T12:00:00Z"))).toBe("2026-10-02");
  });

  it("offers fourteen days from today, across a month's end", () => {
    const days = nextDays("2026-10-25");
    expect(days).toHaveLength(14);
    expect(days[0]).toBe("2026-10-25");
    expect(days[7]).toBe("2026-11-01");
    expect(days[13]).toBe("2026-11-07");
  });

  it("names today and tomorrow, and dates the rest", () => {
    expect(dayLabel("2026-10-02", "2026-10-02")).toBe("Today");
    expect(dayLabel("2026-10-03", "2026-10-02")).toBe("Tomorrow");
    expect(dayLabel("2026-10-10", "2026-10-02")).toBe("Sat 10 Oct");
  });

  it("sums up the plan as a day and a time", () => {
    expect(planSummary({ day: "2026-10-03", slot: "evening", plannedByMe: true }, "2026-10-02")).toBe(
      "Tomorrow, evening",
    );
  });

  it("explains the server's refusals, and blames the connection for anything else", () => {
    expect(planErrorMessage(new PlanError("not_linked"))).toMatch(/no longer linked/);
    expect(planErrorMessage(new PlanError("day_invalid"))).toMatch(/next two weeks/);
    expect(planErrorMessage(new Error("offline"))).toMatch(/connection/);
  });
});

describe("share stages", () => {
  it("offers the picker when the quest has no share", () => {
    expect(shareStage(null)).toEqual({ kind: "pick", excludePhotoId: null });
  });

  it("waits calmly on my proposal, and points the partner to their feed", () => {
    expect(shareStage(share({ status: "pending" }))).toEqual({ kind: "waiting", shareId: "sh1" });
    expect(shareStage(share({ status: "pending", proposedByMe: false }))).toEqual({ kind: "partner-asked" });
  });

  it("lets the proposer share once approved, by hand or by standing consent", () => {
    expect(shareStage(share({ status: "approved" }))).toEqual({
      kind: "approved",
      shareId: "sh1",
      photoId: "p1",
      auto: false,
    });
    expect(shareStage(share({ status: "approved", auto: true }))).toMatchObject({ kind: "approved", auto: true });
    expect(shareStage(share({ status: "approved", proposedByMe: false }))).toEqual({ kind: "partner-approved" });
  });

  it("shows a decline to the proposer as not this time, then lets them pick another photo", () => {
    expect(shareStage(share({ status: "declined" }))).toEqual({ kind: "declined", photoId: "p1" });
    expect(shareStage(share({ status: "declined" }), true)).toEqual({ kind: "pick", excludePhotoId: "p1" });
  });

  it("shows the partner who declined no verdict, just the picker without that photo", () => {
    expect(shareStage(share({ status: "declined", proposedByMe: false }))).toEqual({
      kind: "pick",
      excludePhotoId: "p1",
    });
  });

  it("records a confirmed share with its points", () => {
    expect(shareStage(share({ status: "shared", points: 20 }))).toEqual({ kind: "shared", points: 20, byMe: true });
  });

  it("says the points only once the share is confirmed, and explains a capped week", () => {
    expect(pointsLine(20)).toBe("Shared. You earned 20 points together.");
    expect(pointsLine(0)).toMatch(/used up/);
  });
});

describe("share refusals", () => {
  it("turns each server refusal into a kind line", () => {
    expect(shareRefusal(new ShareError("share_pending"), "Ilze")).toBe(
      "You already have a photo waiting for Ilze from another quest. One at a time.",
    );
    expect(shareRefusal(new ShareError("photo_declined"), "Ilze")).toBe("Ilze said not this time to that photo.");
    expect(shareRefusal(new ShareError("too_many_proposals"), "Ilze")).toMatch(/between you two/);
    expect(shareRefusal(new ShareError("share_exists"), "Ilze")).toMatch(/already has its photo/);
  });

  it("blames the connection for anything else", () => {
    expect(shareRefusal(new Error("fetch failed"), "Ilze")).toMatch(/connection/);
  });
});
