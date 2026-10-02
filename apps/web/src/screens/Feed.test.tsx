import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FeedView } from "./Feed";
import { feedWhen, itemCopy, openFeed, planDay } from "./feedItems";
import type { FeedState, ShareAnswer } from "./feedItems";
import type { FeedItem, FeedKind, FeedPayload } from "../lib/feed";
import type { ShareRequest } from "../lib/shares";

vi.mock("../lib/supabase", () => ({ supabase: {} }));

const noop = () => {};

function item(id: number, kind: FeedKind, payload: FeedPayload = {}, readAt: string | null = null): FeedItem {
  return { id, kind, payload, createdAt: "2026-10-01T09:00:00Z", readAt };
}

function screen(
  state: FeedState,
  {
    requests = {},
    answers = {},
    busy = null,
    failed = null,
  }: {
    requests?: Record<string, ShareRequest>;
    answers?: Record<string, ShareAnswer>;
    busy?: string | null;
    failed?: string | null;
  } = {},
) {
  const html = renderToStaticMarkup(
    <FeedView
      state={state}
      partnerName="Emma"
      requests={requests}
      answers={answers}
      busy={busy}
      failed={failed}
      onAnswer={noop}
      onRetry={noop}
      onBack={noop}
    />,
  );
  // The bottom nav follows the screen's own content; leave it out.
  const own = html.slice(0, html.indexOf('<nav class="bottom-nav"'));
  const buttons = [...own.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]).filter(Boolean);
  const text = own
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { html: own, buttons, text };
}

const copy = (i: FeedItem, request?: ShareRequest, answer?: ShareAnswer) => itemCopy(i, "Emma", request, answer);

const request: ShareRequest = { shareId: "s1", runId: "r1", photoId: "p1" };

// Wording the threat model rules out (abuse-threat-model.md, X1 and X2; gamification.md, 4.9).
const PRESSURE = /waiting|started|finished|reached|don.t forget|remind|hurry|still|yet/i;

describe("itemCopy", () => {
  it("names a badge from the core registry", () => {
    expect(copy(item(1, "badge_earned", { badge: "first-walk" }))).toEqual({
      title: "New memory: First walk",
      line: "Your first walk together",
    });
  });

  it("survives a badge this app does not know", () => {
    expect(copy(item(1, "badge_earned", { badge: "moon-walk" })).title).toBe("A new memory");
  });

  it("opens a league week", () => {
    expect(copy(item(1, "league_week_started", { week: "2026-09-28" })).title).toBe("A new week in your league");
  });

  it("offers a planned walk as an invitation with its day and time", () => {
    const { title, line } = copy(item(1, "walk_planned", { day: "2026-10-03", slot: "morning" }));
    expect(title).toBe("Emma suggests a walk");
    expect(line).toBe("Saturday 3 October in the morning, if it suits you.");
  });

  it("lets a cancelled walk go without blame", () => {
    const { title, line } = copy(item(1, "walk_plan_cancelled", { day: "2026-10-03", slot: "evening" }));
    expect(title).toBe("A walk came off the plan");
    expect(line).toContain("Saturday 3 October in the evening");
    expect(`${title} ${line}`).not.toMatch(/Emma|cancelled/);
  });

  it("asks about a share while it waits, and settles once answered", () => {
    const asked = item(1, "share_requested", { shareId: "s1" });
    expect(copy(asked, request).title).toBe("Emma would like to share a photo");
    expect(copy(asked, request, "approved").title).toBe("You said yes to sharing");
    expect(copy(asked, request, "declined").title).toBe("Not this time");
    expect(copy(asked, request, "gone").line).toBe("Nothing more to do here.");
    expect(copy(asked, undefined).line).toBe("Nothing more to do here.");
  });

  it("explains a share under standing consent", () => {
    expect(copy(item(1, "share_requested", { shareId: "s1", answer: "approved" })).line).toBe(
      "You said yes to sharing ahead of time.",
    );
  });

  it("gives a share's answer once, without a reminder", () => {
    expect(copy(item(1, "share_answered", { shareId: "s1", answer: "approved" })).title).toBe(
      "Emma approved your photo",
    );
    const no = copy(item(1, "share_answered", { shareId: "s1", answer: "declined" }));
    expect(no.title).toBe("Emma said not this time");
    expect(no.line).not.toMatch(/again|ask|another/i);
  });

  it("never pressures, in any kind", () => {
    const all: FeedItem[] = [
      item(1, "badge_earned", { badge: "first-rain-walk" }),
      item(2, "league_week_started", { week: "2026-09-28" }),
      item(3, "walk_planned", { day: "2026-10-03", slot: "afternoon" }),
      item(4, "walk_plan_cancelled", { day: "2026-10-03", slot: "afternoon" }),
      item(5, "share_requested", { shareId: "s1" }),
      item(6, "share_answered", { shareId: "s2", answer: "approved" }),
      item(7, "share_answered", { shareId: "s3", answer: "declined" }),
    ];
    for (const i of all) {
      const { title, line } = copy(i, request);
      expect(`${title} ${line}`).not.toMatch(PRESSURE);
    }
  });
});

describe("planDay and feedWhen", () => {
  it("reads a plan's date in words, and copes with a bad one", () => {
    expect(planDay("2026-10-04")).toBe("Sunday 4 October");
    expect(planDay("soon")).toBe("a day soon");
  });

  it("says today, yesterday, or the date", () => {
    const now = new Date(2026, 9, 2, 15, 0);
    expect(feedWhen(new Date(2026, 9, 2, 8, 0).toISOString(), now)).toBe("Today");
    expect(feedWhen(new Date(2026, 9, 1, 23, 0).toISOString(), now)).toBe("Yesterday");
    expect(feedWhen(new Date(2026, 8, 20, 12, 0).toISOString(), now)).toBe("20 Sept");
  });
});

describe("FeedView", () => {
  it("shows loading, and a retry after a failure", () => {
    expect(screen({ status: "loading" }).text).toContain("Loading…");
    const failed = screen({ status: "error" });
    expect(failed.text).toContain("Couldn’t load your notifications.");
    expect(failed.buttons).toEqual(["Try again"]);
  });

  it("is calm when empty", () => {
    const { text, buttons } = screen({ status: "ready", items: [] });
    expect(text).toContain("All quiet.");
    expect(buttons).toEqual([]);
  });

  it("lists items in the order given and marks the unread ones new", () => {
    const { html, text } = screen({
      status: "ready",
      items: [
        item(2, "league_week_started", {}, null),
        item(1, "badge_earned", { badge: "first-walk" }, "2026-10-01T10:00:00Z"),
      ],
    });
    expect(text.indexOf("A new week")).toBeLessThan(text.indexOf("First walk"));
    expect(html.match(/feed-item is-new/g)).toHaveLength(1);
    expect(html.match(/>New</g)).toHaveLength(1);
  });

  it("offers Share it and Not this time on a waiting request, with the photo opening on the phone", () => {
    const { html, buttons } = screen(
      { status: "ready", items: [item(1, "share_requested", { shareId: "s1" })] },
      { requests: { s1: request } },
    );
    expect(buttons).toEqual(["Share it", "Not this time"]);
    expect(html).toContain("Opening the photo…");
  });

  it("drops the buttons once answered, or when the request no longer waits", () => {
    const answered = screen(
      { status: "ready", items: [item(1, "share_requested", { shareId: "s1" })] },
      { requests: { s1: request }, answers: { s1: "declined" } },
    );
    expect(answered.buttons).toEqual([]);
    expect(answered.text).toContain("Not this time");
    const gone = screen({ status: "ready", items: [item(1, "share_requested", { shareId: "s1" })] });
    expect(gone.buttons).toEqual([]);
  });

  it("holds both buttons while an answer saves, and says when it failed", () => {
    const items = [item(1, "share_requested", { shareId: "s1" })];
    const saving = screen({ status: "ready", items }, { requests: { s1: request }, busy: "s1" });
    expect(saving.buttons).toEqual(["Saving…", "Not this time"]);
    expect(saving.html.match(/disabled/g)).toHaveLength(2);
    const failed = screen({ status: "ready", items }, { requests: { s1: request }, failed: "s1" });
    expect(failed.text).toContain("Couldn’t save that.");
  });
});

describe("openFeed", () => {
  it("marks only the unread items it loaded as read, and keeps them new for this visit", async () => {
    const items = [
      item(3, "league_week_started"),
      item(2, "badge_earned", {}, "2026-10-01T10:00:00Z"),
      item(1, "share_answered"),
    ];
    const markRead = vi.fn(async (ids: number[]) => ids.length);
    const shown = await openFeed(async () => items, markRead);
    expect(markRead).toHaveBeenCalledWith([3, 1]);
    expect(shown).toBe(items);
    expect(shown.filter((i) => i.readAt === null)).toHaveLength(2);
  });

  it("skips the call when everything is read", async () => {
    const markRead = vi.fn(async () => 0);
    await openFeed(async () => [item(1, "badge_earned", {}, "2026-10-01T10:00:00Z")], markRead);
    expect(markRead).not.toHaveBeenCalled();
  });

  it("still shows the feed when marking fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const items = [item(1, "badge_earned")];
    await expect(
      openFeed(
        async () => items,
        async () => {
          throw new Error("offline");
        },
      ),
    ).resolves.toBe(items);
    error.mockRestore();
  });

  it("fails when the feed itself fails to load, marking nothing", async () => {
    const markRead = vi.fn(async () => 0);
    await expect(
      openFeed(async () => {
        throw new Error("offline");
      }, markRead),
    ).rejects.toThrow("offline");
    expect(markRead).not.toHaveBeenCalled();
  });
});
