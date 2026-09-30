import { describe, expect, it } from "vitest";
import { CHECK_INTERVAL_MS, isNewVersion, readBuildId, shouldCheck } from "./appVersion";

describe("shouldCheck", () => {
  it("checks the first time", () => {
    expect(shouldCheck(null, 1_000)).toBe(true);
  });

  it("waits a minute between checks", () => {
    expect(shouldCheck(10_000, 10_000 + CHECK_INTERVAL_MS - 1)).toBe(false);
    expect(shouldCheck(10_000, 10_000 + CHECK_INTERVAL_MS)).toBe(true);
  });

  it("takes a custom interval", () => {
    expect(shouldCheck(0, 499, 500)).toBe(false);
    expect(shouldCheck(0, 500, 500)).toBe(true);
  });
});

describe("readBuildId", () => {
  it("reads the id from version.json", () => {
    expect(readBuildId({ id: "abc123" })).toBe("abc123");
  });

  it("ignores anything else", () => {
    expect(readBuildId(null)).toBeNull();
    expect(readBuildId("abc123")).toBeNull();
    expect(readBuildId({})).toBeNull();
    expect(readBuildId({ id: 42 })).toBeNull();
    expect(readBuildId({ id: "" })).toBeNull();
  });
});

describe("isNewVersion", () => {
  it("prompts when the live build differs", () => {
    expect(isNewVersion("old", "new")).toBe(true);
  });

  it("stays quiet on the same build", () => {
    expect(isNewVersion("same", "same")).toBe(false);
  });

  it("stays quiet when either ID is unknown", () => {
    expect(isNewVersion(undefined, "new")).toBe(false);
    expect(isNewVersion("old", null)).toBe(false);
  });
});
