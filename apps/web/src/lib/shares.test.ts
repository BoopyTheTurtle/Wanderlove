import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ShareError,
  answerShare,
  cancelShare,
  confirmShare,
  loadRunShare,
  loadShareConsent,
  loadShareRequests,
  proposeShare,
  runShareFromRows,
  setShareConsent,
  toShareError,
} from "./shares";

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

describe("consent", () => {
  it("reads and sets standing consent", async () => {
    queued.push({ data: true, error: null });
    expect(await loadShareConsent()).toBe(true);
    await setShareConsent(false);
    expect(calls).toEqual([["share_consent"], ["set_share_consent", { p_on: false }]]);
  });
});

describe("the flow", () => {
  it("proposes, answers, confirms, and cancels", async () => {
    queued.push(
      { data: [{ share_id: "s-1", status: "pending" }], error: null },
      { data: "approved", error: null },
      { data: 20, error: null },
    );
    expect(await proposeShare("p-1")).toEqual({ shareId: "s-1", status: "pending" });
    expect(await answerShare("s-1", true)).toBe("approved");
    expect(await confirmShare("s-1")).toBe(20);
    await cancelShare("s-1");
    expect(calls).toEqual([
      ["propose_share", { p_photo_id: "p-1" }],
      ["answer_share", { p_share_id: "s-1", p_approve: true }],
      ["confirm_share", { p_share_id: "s-1" }],
      ["cancel_share", { p_share_id: "s-1" }],
    ]);
  });

  it("reads a capped confirmation as no points", async () => {
    queued.push({ data: 0, error: null });
    expect(await confirmShare("s-1")).toBe(0);
  });

  it("explains a refusal and passes other errors through", async () => {
    queued.push({ data: null, error: { code: "P0001", message: "share_pending" } });
    await expect(proposeShare("p-1")).rejects.toEqual(new ShareError("share_pending"));
    queued.push({ data: null, error: { code: "P0001", message: "not_approved" } });
    await expect(confirmShare("s-1")).rejects.toEqual(new ShareError("not_approved"));
    const other = { code: "P0001", message: "something_else" };
    expect(toShareError(other)).toBe(other);
  });
});

describe("reading", () => {
  it("lists the requests waiting for the caller", async () => {
    queued.push({ data: [{ share_id: "s-1", run_id: "r-1", photo_id: null }], error: null });
    expect(await loadShareRequests()).toEqual([{ shareId: "s-1", runId: "r-1", photoId: null }]);
  });

  it("reads a quest's share, or none", async () => {
    queued.push({
      data: [{ share_id: "s-1", photo_id: "p-1", status: "shared", proposed_by_me: true, auto: true, points: 20 }],
      error: null,
    });
    expect(await loadRunShare("r-1")).toEqual({
      shareId: "s-1",
      photoId: "p-1",
      status: "shared",
      proposedByMe: true,
      auto: true,
      points: 20,
    });
    expect(calls).toEqual([["run_share", { p_run_id: "r-1" }]]);
    expect(runShareFromRows([])).toBeNull();
  });
});
