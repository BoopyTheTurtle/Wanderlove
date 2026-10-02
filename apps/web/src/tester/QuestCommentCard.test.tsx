import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { onceSender } from "./feedbackState";
import type { SendStatus } from "./feedbackState";
import { pickQuestion, questionsFor } from "./questions";
import { COMMENT_THANKS, QuestCommentCard } from "./QuestCommentCard";

const noop = () => Promise.resolve();

describe("questions", () => {
  it("offers twelve together and eleven solo, with solo asking about you alone", () => {
    expect(questionsFor("together")).toHaveLength(12);
    const solo = questionsFor("solo");
    expect(solo).toHaveLength(11);
    expect(solo).toContain("Did the route feel right for you? What would have made it better?");
    expect(solo.join(" ")).not.toContain("two of you");
    expect(solo.join(" ")).not.toContain("between stops");
  });

  it("never picks the question already shown", () => {
    const current = questionsFor("together")[0];
    for (const r of [0, 0.5, 0.999]) expect(pickQuestion("together", current, () => r)).not.toBe(current);
  });
});

describe("onceSender", () => {
  it("sends once, ignoring taps while in flight and after success", async () => {
    let finish = () => {};
    const send = vi.fn<(body: string, question: string) => Promise<void>>(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const statuses: SendStatus[] = [];
    const go = onceSender(send, (s) => statuses.push(s));

    const first = go("Loved the bench", "q");
    void go("Loved the bench", "q");
    finish();
    await first;
    await go("again", "q");

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("Loved the bench", "q");
    expect(statuses).toEqual(["sending", "sent"]);
  });

  it("allows another try after a failure", async () => {
    const send = vi
      .fn<(body: string, question: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const statuses: SendStatus[] = [];
    const go = onceSender(send, (s) => statuses.push(s));
    await go("hi", "q");
    await go("hi", "q");
    expect(send).toHaveBeenCalledTimes(2);
    expect(statuses).toEqual(["sending", "failed", "sending", "sent"]);
  });
});

describe("QuestCommentCard", () => {
  it("asks one of the questions, with Send off while empty", () => {
    const html = renderToStaticMarkup(<QuestCommentCard mode="together" onSend={noop} />);
    expect(html).toContain("How was this quest?");
    expect(html).toContain('maxLength="1000"');
    expect(html).toContain("Another question");
    expect(html).toMatch(/<button type="button" class="btn-primary tester-send" disabled="">Send/);
    const placeholder = /placeholder="([^"]+)"/.exec(html)?.[1].replace(/&#x27;/g, "'");
    expect(questionsFor("together")).toContain(placeholder);
  });

  it("collapses to the thanks line once sent", () => {
    const html = renderToStaticMarkup(<QuestCommentCard mode="solo" onSend={noop} alreadySent />);
    expect(html).toContain(COMMENT_THANKS);
    expect(html).not.toContain("<textarea");
  });
});
