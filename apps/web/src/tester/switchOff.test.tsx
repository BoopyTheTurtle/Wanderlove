import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppReviewCard } from "./AppReviewCard";
import { QuestCommentCard } from "./QuestCommentCard";
import { TaskVoteButtons } from "./TaskVoteButtons";

vi.mock("../features", () => ({ TESTER_FEEDBACK_ENABLED: false }));

const noop = () => Promise.resolve();

describe("with TESTER_FEEDBACK_ENABLED off", () => {
  it("renders nothing for every component", () => {
    expect(renderToStaticMarkup(<TaskVoteButtons vote={1} onVote={noop} />)).toBe("");
    expect(renderToStaticMarkup(<QuestCommentCard mode="together" onSend={noop} />)).toBe("");
    expect(renderToStaticMarkup(<QuestCommentCard mode="solo" onSend={noop} alreadySent />)).toBe("");
    expect(renderToStaticMarkup(<AppReviewCard onSend={noop} />)).toBe("");
  });
});
