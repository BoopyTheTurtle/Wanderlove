import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ShownPhoto } from "../lib/useRunPhotos";
import { PlanNextWalkView } from "./PlanNextWalk";
import { ShareConsentView } from "./ShareConsentSection";
import { ShareProposalView } from "./ShareProposal";
import type { ShareStage } from "./planShare";

vi.mock("../lib/supabase", () => ({ supabase: {} }));

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const noop = () => {};

const photo = (id: string, src: string | null = `blob:${id}`): ShownPhoto => ({
  id,
  runId: "r1",
  stopId: "s1",
  uploaderId: "u1",
  width: 100,
  height: 100,
  createdAt: "2026-10-02T10:00:00Z",
  path: `r1/${id}.bin`,
  nonce: "n",
  url: "https://example.test",
  src,
  view: src ? "shown" : "opening",
});

function share(
  stage: ShareStage | "failed" | null,
  over: { earned?: number | null; error?: string | null; downloaded?: boolean } = {},
) {
  return text(
    renderToStaticMarkup(
      <ShareProposalView
        partnerName="Ilze"
        stage={stage}
        photos={[photo("p1"), photo("p2"), photo("p3", null)]}
        picked={null}
        busy={null}
        error={over.error ?? null}
        earned={over.earned ?? null}
        needsTap={false}
        downloaded={over.downloaded}
        photoReady
        onPick={noop}
        onPropose={noop}
        onCancel={noop}
        onShare={noop}
        onPickAgain={noop}
        onRetry={noop}
      />,
    ),
  );
}

describe("ShareProposalView", () => {
  it("offers the opened photos and says plainly that a shared photo leaves encryption", () => {
    const html = renderToStaticMarkup(
      <ShareProposalView
        partnerName="Ilze"
        stage={{ kind: "pick", excludePhotoId: "p2" }}
        photos={[photo("p1"), photo("p2"), photo("p3", null)]}
        picked={null}
        busy={null}
        error={null}
        earned={null}
        needsTap={false}
        photoReady={false}
        onPick={noop}
        onPropose={noop}
        onCancel={noop}
        onShare={noop}
        onPickAgain={noop}
        onRetry={noop}
      />,
    );
    expect(html.match(/role="radio"/g)).toHaveLength(1);
    expect(text(html)).toContain("leaves end-to-end encryption");
    expect(text(html)).toContain("Ask Ilze");
  });

  it("waits with no timer, and offers to withdraw", () => {
    const t = share({ kind: "waiting", shareId: "sh1" });
    expect(t).toBe(
      "Share a photo Waiting for Ilze They’ll answer when they’re ready. Nothing is shared until then. Withdraw",
    );
  });

  it("says a download on a computer earns no points", () => {
    expect(share({ kind: "approved", shareId: "sh1", photoId: "p1", auto: false }, { downloaded: true })).toContain(
      "Saved to this computer. Points come when you share from a phone.",
    );
  });

  it("hands an approved photo to the share sheet", () => {
    expect(share({ kind: "approved", shareId: "sh1", photoId: "p1", auto: false })).toContain(
      "Ilze said yes Share it wherever you like. Share the photo",
    );
    expect(share({ kind: "approved", shareId: "sh1", photoId: "p1", auto: true })).toContain("Ilze lets you share");
  });

  it("says a decline as not this time, with no reason", () => {
    expect(share({ kind: "declined", photoId: "p1" })).toBe("Share a photo Not this time Pick a different photo");
  });

  it("shows the points the confirmation returned", () => {
    expect(share({ kind: "shared", points: 20, byMe: true }, { earned: 20 })).toContain(
      "Shared. You earned 20 points together.",
    );
    expect(share({ kind: "shared", points: 0, byMe: true }, { earned: 0 })).toContain("used up");
  });

  it("shows a refusal kindly", () => {
    expect(
      share({ kind: "pick", excludePhotoId: null }, { error: "This quest already has its photo to share." }),
    ).toContain("This quest already has its photo to share.");
  });

  it("stays out of the way while loading", () => {
    expect(share(null)).toBe("");
  });
});

describe("PlanNextWalkView", () => {
  const view = (state: Parameters<typeof PlanNextWalkView>[0]["state"]) =>
    text(
      renderToStaticMarkup(
        <PlanNextWalkView
          partnerName="Ilze"
          state={state}
          today="2026-10-02"
          day={null}
          slot={null}
          busy={null}
          error={null}
          onDay={noop}
          onSlot={noop}
          onPlan={noop}
          onCancel={noop}
          onSkip={noop}
        />,
      ),
    );

  it("invites, with a way to skip", () => {
    const t = view(null);
    expect(t).toContain("Fancy another walk?");
    expect(t).toContain("Today Tomorrow Sun 4 Oct");
    expect(t).toContain("Morning Afternoon Evening");
    expect(t).toContain("Not now");
  });

  it("shows the plan and lets either partner cancel it", () => {
    expect(view({ day: "2026-10-03", slot: "morning", plannedByMe: false })).toBe(
      "Your next walk Tomorrow, morning Ilze planned it. Cancel the plan",
    );
  });

  it("shows nothing while loading or when the plan won't load", () => {
    expect(view("loading")).toBe("");
    expect(view("failed")).toBe("");
  });
});

describe("ShareConsentView", () => {
  const view = (state: boolean) =>
    renderToStaticMarkup(
      <ShareConsentView partnerName="Ilze" state={state} busy={false} error={null} onSet={noop} onRetry={noop} />,
    );

  it("is off by default: the partner asks each time", () => {
    const html = view(false);
    expect(html).not.toContain("checked");
    expect(text(html)).toContain("Let Ilze share our photos without asking each time");
    expect(text(html)).toContain("Ilze asks you about each photo");
  });

  it("when on, says one tap takes it back", () => {
    const html = view(true);
    expect(html).toContain("checked");
    expect(text(html)).toContain("Turning it off takes back");
  });
});
