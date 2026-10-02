import { badgeById } from "@wannadoo/core";
import { loadFeed, markFeedRead } from "../lib/feed";
import type { FeedItem } from "../lib/feed";
import type { ShareRequest } from "../lib/shares";

// The words and the loading behind the feed screen (Feed.tsx), kept apart from its components. Every line reads as an
// invitation: no reminders, no "your partner is waiting" (abuse-threat-model.md, X1 and X2; gamification.md, 4.9).

// How a share request stands on this phone: answered here, or found already settled when answering.
export type ShareAnswer = "approved" | "declined" | "gone";

export type FeedState = { status: "loading" } | { status: "error" } | { status: "ready"; items: FeedItem[] };

// Loads the feed and marks what it shows as read. Only the loaded items are marked, so one that arrives meanwhile
// keeps its dot. The items keep their unread state for this visit, so the screen can show what is new. A failed mark
// leaves the feed on screen; the bell simply stays lit.
export async function openFeed(
  load: () => Promise<FeedItem[]> = loadFeed,
  markRead: (ids: number[]) => Promise<number> = markFeedRead,
): Promise<FeedItem[]> {
  const items = await load();
  const unread = items.filter((i) => i.readAt === null).map((i) => i.id);
  if (unread.length > 0) {
    try {
      await markRead(unread);
    } catch (e) {
      console.error("Couldn't mark the feed read", e);
    }
  }
  return items;
}

// "Saturday 4 October" for a plan's Riga date (YYYY-MM-DD).
export function planDay(day: string): string {
  const at = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return "a day soon";
  return at.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

function slotWords(slot: string | undefined): string {
  return slot === "morning" || slot === "afternoon" || slot === "evening" ? `in the ${slot}` : "";
}

// When an item arrived: "Today", "Yesterday", or a date.
export function feedWhen(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export type ItemCopy = { title: string; line: string };

// The words for an item. `request` is the open proposal behind a share request, if it still waits for an answer.
export function itemCopy(
  item: FeedItem,
  partnerName: string,
  request: ShareRequest | undefined,
  answer: ShareAnswer | undefined,
): ItemCopy {
  const p = item.payload;
  switch (item.kind) {
    case "badge_earned": {
      const badge = p.badge ? badgeById(p.badge) : undefined;
      return badge
        ? { title: `New memory: ${badge.title}`, line: badge.line }
        : { title: "A new memory", line: "Something you two did together" };
    }
    case "league_week_started":
      return { title: "A new week in your league", line: "Every couple starts again from zero." };
    case "walk_planned": {
      const when = [planDay(p.day ?? ""), slotWords(p.slot)].filter(Boolean).join(" ");
      return { title: `${partnerName} suggests a walk`, line: `${when}, if it suits you.` };
    }
    case "walk_plan_cancelled": {
      const when = [planDay(p.day ?? ""), slotWords(p.slot)].filter(Boolean).join(" ");
      return { title: "A walk came off the plan", line: `${when}. Plan another whenever you both like.` };
    }
    case "share_requested":
      if (answer === "approved") return { title: "You said yes to sharing", line: `${partnerName} can share it now.` };
      if (answer === "declined") return { title: "Not this time", line: "The photo stays between you two." };
      if (p.answer === "approved") {
        return {
          title: `${partnerName} picked a photo to share`,
          line: "You said yes to sharing ahead of time.",
        };
      }
      if (request && answer !== "gone") {
        return { title: `${partnerName} would like to share a photo`, line: "Only if you are happy with it." };
      }
      return { title: `${partnerName} asked to share a photo`, line: "Nothing more to do here." };
    case "share_answered":
      return p.answer === "approved"
        ? { title: `${partnerName} approved your photo`, line: "You can share it from the quest’s album." }
        : { title: `${partnerName} said not this time`, line: "The photo stays between you two." };
  }
}
