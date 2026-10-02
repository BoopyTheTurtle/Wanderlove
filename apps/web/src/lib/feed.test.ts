import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Json } from "./database.types";
import { feedFromRows, loadFeed, loadUnreadCount, markFeedRead, payloadFromJson } from "./feed";

const calls: unknown[][] = [];
const queued: { data: unknown; error: unknown }[] = [];

vi.mock("./supabase", () => ({
  supabase: {
    rpc: (name: string, args?: unknown) => {
      calls.push(args === undefined ? [name] : [name, args]);
      return Promise.resolve(queued.shift() ?? { data: null, error: null });
    },
  },
}));

beforeEach(() => {
  calls.length = 0;
  queued.length = 0;
});

const row = (id: number, kind: string, payload: Json, read: string | null = null) => ({
  id,
  kind,
  payload,
  created_at: "2026-10-02T10:00:00Z",
  read_at: read,
});

describe("loading", () => {
  it("maps the items newest first, as the server sends them", async () => {
    queued.push({
      data: [
        row(2, "share_answered", { share_id: "s-1", answer: "declined" }),
        row(1, "walk_planned", { day: "2026-10-04", slot: "evening" }, "2026-10-02T11:00:00Z"),
      ],
      error: null,
    });
    expect(await loadFeed()).toEqual([
      {
        id: 2,
        kind: "share_answered",
        payload: { shareId: "s-1", answer: "declined" },
        createdAt: "2026-10-02T10:00:00Z",
        readAt: null,
      },
      {
        id: 1,
        kind: "walk_planned",
        payload: { day: "2026-10-04", slot: "evening" },
        createdAt: "2026-10-02T10:00:00Z",
        readAt: "2026-10-02T11:00:00Z",
      },
    ]);
    expect(calls).toEqual([["my_feed", { p_limit: 50 }]]);
  });

  it("drops kinds it does not know", () => {
    expect(feedFromRows([row(1, "partner_finished_quest", {})])).toEqual([]);
    expect(feedFromRows(null)).toEqual([]);
  });

  it("keeps only known payload fields of the right type", () => {
    expect(payloadFromJson({ badge: "first-walk", week: "2026-09-28", answer: "maybe", extra: 1 })).toEqual({
      badge: "first-walk",
      week: "2026-09-28",
    });
    expect(payloadFromJson(null)).toEqual({});
    expect(payloadFromJson([1])).toEqual({});
  });

  it("counts unread", async () => {
    queued.push({ data: 3, error: null });
    expect(await loadUnreadCount()).toBe(3);
    expect(await loadUnreadCount()).toBe(0);
  });

  it("throws a failed load", async () => {
    const error = new Error("offline");
    queued.push({ data: null, error });
    await expect(loadFeed()).rejects.toBe(error);
  });
});

describe("marking read", () => {
  it("marks given items, or all", async () => {
    queued.push({ data: 2, error: null }, { data: 5, error: null });
    expect(await markFeedRead([1, 2])).toBe(2);
    expect(await markFeedRead()).toBe(5);
    expect(calls).toEqual([
      ["mark_feed_read", { p_ids: [1, 2] }],
      ["mark_feed_read", {}],
    ]);
  });
});
