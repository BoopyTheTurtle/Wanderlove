import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppReviewCard } from "./AppReviewCard";
import { QuestComment } from "./QuestComment";
import { QuestCommentCard } from "./QuestCommentCard";
import { TaskVote } from "./TaskVote";
import { TaskVoteButtons } from "./TaskVoteButtons";

vi.mock("../features", () => ({ TESTER_FEEDBACK_ENABLED: false }));
vi.mock("../lib/supabase", () => ({ supabase: {} }));

const noop = () => Promise.resolve();

describe("with TESTER_FEEDBACK_ENABLED off", () => {
  it("renders nothing for every component", () => {
    expect(renderToStaticMarkup(<TaskVoteButtons vote={1} onVote={noop} />)).toBe("");
    expect(renderToStaticMarkup(<QuestCommentCard mode="together" onSend={noop} />)).toBe("");
    expect(renderToStaticMarkup(<QuestCommentCard mode="solo" onSend={noop} alreadySent />)).toBe("");
    expect(renderToStaticMarkup(<AppReviewCard onSend={noop} />)).toBe("");
    expect(renderToStaticMarkup(<TaskVote taskId="silly-001" />)).toBe("");
    expect(renderToStaticMarkup(<QuestComment runId="r" userId="u" mode="together" />)).toBe("");
  });
});
