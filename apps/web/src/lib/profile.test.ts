import { describe, expect, it, vi } from "vitest";
import { needsTermsUpdate, TERMS_VERSION } from "./profile";
import type { ProfileRow } from "./profile";

vi.mock("./supabase", () => ({ supabase: {} }));

const row = (over: Partial<ProfileRow>) =>
  ({
    display_name: "Emma",
    terms_accepted_at: "2026-09-29T10:00:00Z",
    terms_version: TERMS_VERSION,
    ...over,
  }) as ProfileRow;

describe("needsTermsUpdate", () => {
  it("asks a tester on an older notice to accept the current one", () => {
    expect(needsTermsUpdate(row({ terms_version: "tester-v1" }))).toBe(true);
    expect(needsTermsUpdate(row({ terms_version: null }))).toBe(true);
  });

  it("lets a tester on the current notice through", () => {
    expect(needsTermsUpdate(row({}))).toBe(false);
  });

  it("leaves someone not yet onboarded to onboarding", () => {
    expect(needsTermsUpdate(row({ terms_accepted_at: null, terms_version: null }))).toBe(false);
    expect(needsTermsUpdate(row({ display_name: null, terms_version: "tester-v1" }))).toBe(false);
  });
});
