import { describe, expect, it, vi } from "vitest";
import { entryFromRow, pairOf } from "./taskHistory";

// The helpers under test are pure; the client module only needs env vars that tests don't have.
vi.mock("./supabase", () => ({ supabase: {} }));

const A = "16161616-0000-0000-0000-00000000000a";
const B = "16161616-0000-0000-0000-00000000000b";

describe("pairOf", () => {
  it("orders the pair the same way from either side", () => {
    expect(pairOf(A, B)).toEqual({ person_low: A, person_high: B });
    expect(pairOf(B, A)).toEqual({ person_low: A, person_high: B });
  });

  it("records a Just me quest under the player alone", () => {
    expect(pairOf(B, null)).toEqual({ person_low: B, person_high: B });
  });

  it("compares ids as Postgres does, ignoring case", () => {
    expect(pairOf(B.toUpperCase(), A)).toEqual({ person_low: A, person_high: B });
  });
});

describe("entryFromRow", () => {
  it("maps a row to an entry", () => {
    expect(entryFromRow({ task_id: "silly-014", outcome: "skipped", at: "2026-10-01T10:00:00Z" })).toEqual({
      taskId: "silly-014",
      outcome: "skipped",
      at: "2026-10-01T10:00:00Z",
    });
  });
});
