import { describe, expect, it } from "vitest";
import { inviteKeyIdFromHash } from "./session";

describe("inviteKeyIdFromHash", () => {
  it("reads the key ID from an invite link's fragment", () => {
    expect(inviteKeyIdFromHash("#k=0123456789abcdef")).toBe("0123456789abcdef");
    expect(inviteKeyIdFromHash("https://wannadoo.app/link/ABCDE12345#k=0123456789ABCDEF")).toBe("0123456789abcdef");
    expect(inviteKeyIdFromHash("#x=1&k=0123456789abcdef")).toBe("0123456789abcdef");
  });

  it("gives null without a well-formed key ID", () => {
    expect(inviteKeyIdFromHash("")).toBeNull();
    expect(inviteKeyIdFromHash("#k=0123")).toBeNull();
    expect(inviteKeyIdFromHash("#k=0123456789abcdefff")).toBeNull();
    expect(inviteKeyIdFromHash("#k=0123456789abcdeg")).toBeNull();
  });
});
