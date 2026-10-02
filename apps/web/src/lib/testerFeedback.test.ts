import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TesterFeedbackError,
  loadTaskVotes,
  questRef,
  sendAppReview,
  sendQuestComment,
  toTesterError,
  voteTask,
} from "./testerFeedback";

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

describe("questRef", () => {
  it("is the hex sha256 of the run id followed by the user id", async () => {
    // sha256("run-1user-1"), worked out apart from the code under test.
    expect(await questRef("run-1", "user-1")).toBe("a16ebefe130eeccaa835e876fc26a8b2a43c25113f537c6527f1048f564909b9");
  });
});

describe("votes", () => {
  it("casts and clears", async () => {
    await voteTask("intro-001", 1);
    await voteTask("intro-001", 0);
    expect(calls).toEqual([
      ["tester_vote_task", { p_task_id: "intro-001", p_vote: 1 }],
      ["tester_vote_task", { p_task_id: "intro-001", p_vote: 0 }],
    ]);
  });

  it("reads the caller's votes, with 0 for tasks without one", async () => {
    queued.push({ data: [{ task_id: "silly-002", vote: -1 }], error: null });
    expect(await loadTaskVotes(["intro-001", "silly-002"])).toEqual({ "intro-001": 0, "silly-002": -1 });
  });

  it("asks nothing for no tasks", async () => {
    expect(await loadTaskVotes([])).toEqual({});
    expect(calls).toEqual([]);
  });
});

describe("comments and reviews", () => {
  it("sends a comment under the quest's hash, never its run id", async () => {
    await sendQuestComment({
      runId: "run-1",
      userId: "user-1",
      body: "Lovely",
      question: "Which moment?",
      mode: "together",
      tasksDone: 5,
    });
    const [name, args] = calls[0] as [string, Record<string, unknown>];
    expect(name).toBe("tester_send_quest_comment");
    expect(args.p_quest_ref).toBe(await questRef("run-1", "user-1"));
    expect(JSON.stringify(args)).not.toContain("run-1");
    expect(args).toMatchObject({ p_body: "Lovely", p_question: "Which moment?", p_mode: "together", p_tasks_done: 5 });
  });

  it("sends blank review fields as nothing", async () => {
    await sendAppReview({ overall: " ", likes: "The map", wishes: "" }, "0.1.0");
    expect(calls).toEqual([
      [
        "tester_send_app_review",
        { p_overall: undefined, p_likes: "The map", p_wishes: undefined, p_app_version: "0.1.0" },
      ],
    ]);
  });

  it("explains a refusal and passes other errors through", async () => {
    queued.push({ data: null, error: { code: "P0001", message: "already_sent" } });
    await expect(sendQuestComment({ runId: "r", userId: "u", body: "x", question: "q", mode: "solo" })).rejects.toEqual(
      new TesterFeedbackError("already_sent"),
    );
    const other = { code: "500", message: "boom" };
    expect(toTesterError(other)).toBe(other);
  });
});
