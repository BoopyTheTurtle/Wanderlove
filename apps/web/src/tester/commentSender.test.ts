import { describe, expect, it, vi } from "vitest";
import { TesterFeedbackError } from "../lib/testerFeedback";
import type { QuestComment } from "../lib/testerFeedback";
import { COMMENTED_KEY, commentSent, rememberComment, sendComment } from "./commentSender";
import type { CommentDeps } from "./commentSender";

vi.mock("../lib/supabase", () => ({ supabase: {} }));

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const context = { runId: "run-1", userId: "user-1", mode: "together" as const, tasksDone: 4, appVersion: "abc123" };

function deps(send: (comment: QuestComment) => Promise<void>): CommentDeps & { store: ReturnType<typeof memoryStore> } {
  return { send, questRef: async (runId, userId) => `ref:${runId}:${userId}`, store: memoryStore() };
}

describe("rememberComment", () => {
  it("remembers each quest once and reads it back", () => {
    const store = memoryStore();
    expect(commentSent("a", store)).toBe(false);
    rememberComment("a", store);
    rememberComment("a", store);
    rememberComment("b", store);
    expect(commentSent("a", store)).toBe(true);
    expect(JSON.parse(store.data.get(COMMENTED_KEY)!)).toEqual(["a", "b"]);
  });

  it("keeps the newest hundred", () => {
    const store = memoryStore();
    for (let i = 0; i < 105; i++) rememberComment(`q${i}`, store);
    expect(commentSent("q4", store)).toBe(false);
    expect(commentSent("q5", store)).toBe(true);
    expect(commentSent("q104", store)).toBe(true);
  });

  it("reads unreadable storage as nothing sent", () => {
    const store = memoryStore();
    store.data.set(COMMENTED_KEY, "{not json");
    expect(commentSent("a", store)).toBe(false);
  });
});

describe("sendComment", () => {
  it("sends the mode, tasks done, app version, and question, then remembers the run", async () => {
    const send = vi.fn<(comment: QuestComment) => Promise<void>>(() => Promise.resolve());
    const d = deps(send);
    await sendComment(context, "Loved the bench stop", "Which task surprised you, and how?", d);
    expect(send).toHaveBeenCalledWith({
      ...context,
      body: "Loved the bench stop",
      question: "Which task surprised you, and how?",
    });
    expect(commentSent("ref:run-1:user-1", d.store)).toBe(true);
    expect(commentSent("ref:run-2:user-1", d.store)).toBe(false);
  });

  it("counts a comment the server already holds as sent", async () => {
    const d = deps(() => Promise.reject(new TesterFeedbackError("already_sent")));
    await expect(sendComment(context, "Again", "Q", d)).resolves.toBeUndefined();
    expect(commentSent("ref:run-1:user-1", d.store)).toBe(true);
  });

  it("throws any other failure and remembers nothing, so the card offers Send again", async () => {
    const d = deps(() => Promise.reject(new Error("offline")));
    await expect(sendComment(context, "Hi", "Q", d)).rejects.toThrow("offline");
    expect(commentSent("ref:run-1:user-1", d.store)).toBe(false);
  });
});
