import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { castVote, nextVote } from "./feedbackState";
import type { Vote } from "./feedbackState";
import { TaskVoteButtons } from "./TaskVoteButtons";

const noop = () => Promise.resolve();

describe("nextVote", () => {
  it("cycles through up, down, and none", () => {
    let vote: Vote = 0;
    vote = nextVote(vote, 1);
    expect(vote).toBe(1);
    vote = nextVote(vote, -1);
    expect(vote).toBe(-1);
    vote = nextVote(vote, -1);
    expect(vote).toBe(0);
    vote = nextVote(vote, -1);
    expect(vote).toBe(-1);
    vote = nextVote(vote, 1);
    expect(vote).toBe(1);
    vote = nextVote(vote, 1);
    expect(vote).toBe(0);
  });
});

describe("castVote", () => {
  it("shows the vote before sending it", async () => {
    const order: string[] = [];
    await castVote(
      0,
      1,
      (v) => order.push(`show ${v}`),
      async (v) => {
        order.push(`send ${v}`);
      },
    );
    expect(order).toEqual(["show 1", "send 1"]);
  });

  it("keeps the vote on screen and stays quiet when the send fails", async () => {
    const show = vi.fn();
    await expect(castVote(1, -1, show, () => Promise.reject(new Error("offline")))).resolves.toBeUndefined();
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(-1);
  });
});

describe("TaskVoteButtons", () => {
  it("labels both buttons and marks only the chosen one pressed", () => {
    const html = renderToStaticMarkup(<TaskVoteButtons vote={1} onVote={noop} />);
    expect(html).toContain('aria-label="Good task" aria-pressed="true"');
    expect(html).toContain('aria-label="Not for us" aria-pressed="false"');
  });

  it("shows no vote as neither pressed", () => {
    const html = renderToStaticMarkup(<TaskVoteButtons vote={0} onVote={noop} />);
    expect(html).not.toContain('aria-pressed="true"');
  });
});
