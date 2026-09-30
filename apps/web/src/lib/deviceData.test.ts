import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAllForUser, clearOnSignOut } from "./deviceData";
import { expectPartnerKey, pinnedPartnerKeyId, withPin } from "./keys";
import { forgetDeviceKeys, markRecoveryHintDone, recoveryHintDone } from "./keyStore";
import { memoryStorage } from "./memoryStorage";
import { loadFollowedRun, loadWalkingPath, saveFollowedRun, saveWalkingPath } from "./runDevice";
import { loadLinkState, loadOpenInvite, loadPendingInvite, saveLinkState, saveOpenInvite } from "./session";

vi.mock("./supabase", () => ({ supabase: {} }));
// Node has no IndexedDB; the key database is checked in the browser.
vi.mock("./keyStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./keyStore")>()),
  forgetDeviceKeys: vi.fn(async () => {}),
}));

const PATH: [number, number][] = [
  [56.95, 24.1],
  [56.96, 24.11],
];

// Everything a signed-in user leaves on the phone, for Daniel and for Emma, who shares it.
function fillPhone() {
  for (const [me, partner] of [
    ["daniel", "emma"],
    ["emma", "daniel"],
  ]) {
    saveWalkingPath(me, `run-${me}`, PATH);
    saveFollowedRun(me, `run-${me}`);
    saveLinkState(me, { solo: true, knownPartnerId: partner });
    const pins: unknown = JSON.parse(localStorage.getItem("wannadoo_partner_keys") ?? "{}");
    localStorage.setItem(
      "wannadoo_partner_keys",
      JSON.stringify(withPin(pins as Record<string, Record<string, string>>, me, partner, "0123456789abcdef")),
    );
    expectPartnerKey(me, "fedcba9876543210");
    markRecoveryHintDone(me);
  }
  localStorage.setItem("wannadoo_pending_invite", "ABCDE12345");
  localStorage.setItem("wannadoo_pending_invite_key", "0123456789abcdef");
  saveOpenInvite({ userId: "daniel", code: "FGHIJ67890", expiresAt: Date.now() + 60_000 });
}

function emmaUntouched() {
  expect(loadWalkingPath("emma", "run-emma")).not.toBeNull();
  expect(loadFollowedRun("emma")).toBe("run-emma");
  expect(loadLinkState("emma")).toEqual({ solo: true, knownPartnerId: "daniel" });
  expect(pinnedPartnerKeyId("emma", "daniel")).toBe("0123456789abcdef");
  expect(recoveryHintDone("emma")).toBe(true);
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.mocked(forgetDeviceKeys).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clearOnSignOut", () => {
  it("forgets the user's walks, partner, and invites", () => {
    fillPhone();
    clearOnSignOut("daniel");
    expect(loadWalkingPath("daniel", "run-daniel")).toBeNull();
    expect(loadFollowedRun("daniel")).toBeNull();
    expect(loadLinkState("daniel").knownPartnerId).toBeNull();
    expect(loadPendingInvite()).toBeNull();
    expect(loadOpenInvite("daniel")).toBeNull();
    emmaUntouched();
  });

  it("keeps the keys, the key pins, and the solo choice", () => {
    fillPhone();
    clearOnSignOut("daniel");
    expect(forgetDeviceKeys).not.toHaveBeenCalled();
    expect(pinnedPartnerKeyId("daniel", "emma")).toBe("0123456789abcdef");
    expect(recoveryHintDone("daniel")).toBe(true);
    expect(loadLinkState("daniel").solo).toBe(true);
  });
});

describe("clearAllForUser", () => {
  it("removes everything the phone keeps for the user and nothing of anyone else's", async () => {
    fillPhone();
    await clearAllForUser("daniel");
    expect(forgetDeviceKeys).toHaveBeenCalledWith("daniel");
    expect(loadWalkingPath("daniel", "run-daniel")).toBeNull();
    expect(loadFollowedRun("daniel")).toBeNull();
    expect(loadLinkState("daniel")).toEqual({ solo: false, knownPartnerId: null });
    expect(pinnedPartnerKeyId("daniel", "emma")).toBeNull();
    expect(JSON.parse(localStorage.getItem("wannadoo_invite_key") ?? "{}")).toEqual({ emma: "fedcba9876543210" });
    expect(recoveryHintDone("daniel")).toBe(false);
    expect(loadPendingInvite()).toBeNull();
    expect(loadOpenInvite("daniel")).toBeNull();
    emmaUntouched();
  });

  it("leaves no Wannadoo key in storage once the last user cleans up", async () => {
    fillPhone();
    await clearAllForUser("daniel");
    await clearAllForUser("emma");
    const left = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    expect(left).toEqual([]);
  });

  it("drops a map it can't read", async () => {
    localStorage.setItem("wannadoo_partner_keys", "not json");
    await clearAllForUser("daniel");
    expect(localStorage.getItem("wannadoo_partner_keys")).toBeNull();
  });
});
