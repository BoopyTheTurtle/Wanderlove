import { describe, expect, it } from "vitest";
import type { Vote } from "./feedbackState";
import { openTaskVote, VoteSender } from "./voteSender";

// A fake server: records every send, and fails the next `failures` of them.
function fakeServer(saved: Record<string, Vote> = {}) {
  const sends: string[] = [];
  let failures = 0;
  return {
    sends,
    saved,
    failNext(n: number) {
      failures = n;
    },
    send: async (taskId: string, vote: Vote) => {
      sends.push(`${taskId} ${vote}`);
      if (failures > 0) {
        failures -= 1;
        throw new Error("offline");
      }
      saved[taskId] = vote;
    },
    load: async (taskIds: string[]) =>
      Object.fromEntries(taskIds.map((id) => [id, saved[id] ?? 0])) as Record<string, Vote>,
  };
}

describe("VoteSender", () => {
  it("sends a vote and keeps nothing waiting", async () => {
    const server = fakeServer();
    const sender = new VoteSender(server.send);
    await sender.vote("silly-001", 1);
    expect(server.saved).toEqual({ "silly-001": 1 });
    expect(sender.waiting("silly-001")).toBeUndefined();
  });

  it("keeps a failed vote quietly and retries it once on the next tap", async () => {
    const server = fakeServer();
    const sender = new VoteSender(server.send);
    server.failNext(1);
    await expect(sender.vote("silly-001", 1)).resolves.toBeUndefined();
    expect(sender.waiting("silly-001")).toBe(1);

    await sender.vote("deep-002", -1);
    expect(server.sends).toEqual(["silly-001 1", "silly-001 1", "deep-002 -1"]);
    expect(server.saved).toEqual({ "silly-001": 1, "deep-002": -1 });
  });

  it("drops a vote that fails its retry too", async () => {
    const server = fakeServer();
    const sender = new VoteSender(server.send);
    server.failNext(2);
    await sender.vote("silly-001", 1);
    await sender.vote("deep-002", 1);
    expect(sender.waiting("silly-001")).toBeUndefined();
    await sender.retry();
    expect(server.sends).toEqual(["silly-001 1", "silly-001 1", "deep-002 1"]);
  });

  it("lets a new tap on the same task replace the waiting vote", async () => {
    const server = fakeServer();
    const sender = new VoteSender(server.send);
    server.failNext(1);
    await sender.vote("silly-001", 1);
    await sender.vote("silly-001", 0);
    expect(server.sends).toEqual(["silly-001 1", "silly-001 0"]);
    expect(server.saved).toEqual({ "silly-001": 0 });
  });
});

describe("openTaskVote", () => {
  it("loads the tester's saved vote", async () => {
    const server = fakeServer({ "intro-003": -1 });
    expect(await openTaskVote(new VoteSender(server.send), server.load, "intro-003")).toBe(-1);
    expect(await openTaskVote(new VoteSender(server.send), server.load, "intro-004")).toBe(0);
  });

  it("retries a waiting vote when the next task opens", async () => {
    const server = fakeServer();
    const sender = new VoteSender(server.send);
    server.failNext(1);
    await sender.vote("silly-001", 1);
    expect(await openTaskVote(sender, server.load, "deep-002")).toBe(0);
    expect(server.saved).toEqual({ "silly-001": 1 });
  });

  it("shows a waiting vote over the saved one when the retry fails again", async () => {
    const server = fakeServer({ "silly-001": -1 });
    const sender = new VoteSender(server.send);
    server.failNext(2);
    await sender.vote("silly-001", 1);
    expect(await openTaskVote(sender, server.load, "silly-001")).toBe(1);
  });

  it("starts empty when the saved vote can't be read", async () => {
    const server = fakeServer();
    const failingLoad = () => Promise.reject(new Error("offline"));
    expect(await openTaskVote(new VoteSender(server.send), failingLoad, "silly-001")).toBeNull();
  });
});
