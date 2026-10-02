import type { Json } from "./database.types";
import { supabase } from "./supabase";

// The in-app feed (docs/mvp-roadmap.md, stage 10; gamification.md, 4.9). It holds only what the partner sent on purpose
// or what the couple earned together, never that the partner started, finished, or reached anything
// (abuse-threat-model.md, X1). Payloads name no trail, stop, or place.

export const FEED_KINDS = [
  "badge_earned",
  "league_week_started",
  "walk_planned",
  "walk_plan_cancelled",
  "share_requested",
  "share_answered",
] as const;

export type FeedKind = (typeof FEED_KINDS)[number];

// Each kind fills only its own fields: badge for badge_earned; week (its Monday) for league_week_started; day and slot
// for walk items; shareId, and answer once there is one, for share items.
export type FeedPayload = {
  badge?: string;
  week?: string;
  day?: string;
  slot?: string;
  shareId?: string;
  answer?: "approved" | "declined";
};

export type FeedItem = { id: number; kind: FeedKind; payload: FeedPayload; createdAt: string; readAt: string | null };

type FeedRow = { id: number; kind: string; payload: Json; created_at: string; read_at: string | null };

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export function payloadFromJson(json: Json): FeedPayload {
  const o = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  const answer = o.answer === "approved" || o.answer === "declined" ? o.answer : undefined;
  const payload: FeedPayload = {
    badge: str(o.badge),
    week: str(o.week),
    day: str(o.day),
    slot: str(o.slot),
    shareId: str(o.share_id),
    answer,
  };
  return Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined)) as FeedPayload;
}

// Drops kinds this app does not know, so an older app survives a newer server.
export function feedFromRows(rows: FeedRow[] | null | undefined): FeedItem[] {
  return (rows ?? []).flatMap((r) =>
    (FEED_KINDS as readonly string[]).includes(r.kind)
      ? [
          {
            id: r.id,
            kind: r.kind as FeedKind,
            payload: payloadFromJson(r.payload),
            createdAt: r.created_at,
            readAt: r.read_at ?? null,
          },
        ]
      : [],
  );
}

// The caller's newest items first, at most `limit` (1 to 100).
export async function loadFeed(limit = 50): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc("my_feed", { p_limit: limit });
  if (error) throw error;
  return feedFromRows(data as FeedRow[] | null);
}

// How many items are unread, for the bell.
export async function loadUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc("feed_unread_count");
  if (error) throw error;
  return data ?? 0;
}

// Marks the given items read, or all of them without ids; returns how many changed.
export async function markFeedRead(ids?: number[]): Promise<number> {
  const { data, error } = await supabase.rpc("mark_feed_read", ids ? { p_ids: ids } : {});
  if (error) throw error;
  return data ?? 0;
}
