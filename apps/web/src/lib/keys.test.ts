import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  WrongRecoveryCodeError,
  decryptPhoto,
  encryptPhoto,
  generateAccountKeys,
  generateRunKey,
  openPrivateKey,
  photoAad,
  unwrapRunKey,
  wrapRunKey,
  type AccountKeys,
} from "./crypto";
import type { DeviceKeys } from "./keyStore";
import {
  buildRunKeyWraps,
  decideKeyState,
  decidePartnerKey,
  prepareAccountKeys,
  publicKeyFromPkcs8,
  rewrapForPartner,
  withPin,
  type PartnerKey,
} from "./keys";

// The logic under test is pure or pure crypto; the client module only needs env vars that tests don't have.
vi.mock("./supabase", () => ({ supabase: {} }));

let emma: AccountKeys;
let jonas: AccountKeys;
let jonasNewPhone: AccountKeys;

function device(keys: AccountKeys): DeviceKeys {
  return { privateKey: keys.privateKey, publicKey: keys.publicKey, keyId: keys.keyId };
}

function row(keys: AccountKeys, sealed = true) {
  return {
    public_key: keys.publicKey,
    key_id: keys.keyId,
    recovery_blob: sealed ? "blob" : null,
    recovery_salt: sealed ? "salt" : null,
    recovery_iv: sealed ? "iv" : null,
  };
}

beforeAll(async () => {
  [emma, jonas, jonasNewPhone] = await Promise.all([
    generateAccountKeys(),
    generateAccountKeys(),
    generateAccountKeys(),
  ]);
});

describe("decideKeyState", () => {
  it("asks for setup when the account has no keys", () => {
    expect(decideKeyState(null, null)).toEqual({ status: "setup" });
    expect(decideKeyState(null, device(emma))).toEqual({ status: "setup" });
  });

  it("is ready when this device holds the published pair", () => {
    expect(decideKeyState(row(emma), device(emma))).toEqual({ status: "ready", keys: device(emma) });
  });

  it("asks to unlock on a device without keys", () => {
    expect(decideKeyState(row(emma), null)).toEqual({ status: "unlock", canUseCode: true, replaced: false });
    expect(decideKeyState(row(emma, false), null)).toEqual({ status: "unlock", canUseCode: false, replaced: false });
  });

  it("asks to unlock when another phone replaced the pair", () => {
    expect(decideKeyState(row(jonasNewPhone), device(jonas))).toEqual({
      status: "unlock",
      canUseCode: true,
      replaced: true,
    });
  });
});

describe("prepareAccountKeys", () => {
  it("seals the private key with the recovery code it returns", async () => {
    const pending = await prepareAccountKeys();
    const pkcs8 = await openPrivateKey(pending.sealed, pending.recoveryCode);
    expect(await publicKeyFromPkcs8(pkcs8)).toBe(pending.keys.publicKey);
    await expect(openPrivateKey(pending.sealed, "0".repeat(24))).rejects.toBeInstanceOf(WrongRecoveryCodeError);
  });
});

describe("publicKeyFromPkcs8", () => {
  it("recovers the raw public key of a private key", async () => {
    expect(await publicKeyFromPkcs8(emma.privateKeyPkcs8)).toBe(emma.publicKey);
    expect(await publicKeyFromPkcs8(jonas.privateKeyPkcs8)).not.toBe(emma.publicKey);
  });
});

describe("decidePartnerKey", () => {
  it("trusts the pinned key", () => {
    expect(decidePartnerKey("abc", "abc", "abc")).toBe("trusted");
  });
  it("reports a changed key", () => {
    expect(decidePartnerKey("abc", "def", "def")).toBe("changed");
  });
  it("reports a key this phone has never pinned", () => {
    expect(decidePartnerKey(undefined, "abc", "abc")).toBe("new");
  });
  it("refuses a key whose published ID does not match it", () => {
    expect(decidePartnerKey("abc", "abc", "zzz")).toBe("invalid");
  });
});

describe("withPin", () => {
  it("pins per user and partner without touching others", () => {
    const pins = withPin({ me: { old: "1" }, other: { p: "2" } }, "me", "partner", "3");
    expect(pins).toEqual({ me: { old: "1", partner: "3" }, other: { p: "2" } });
    expect(withPin(pins, "me", "partner", "4").me.partner).toBe("4");
  });
});

describe("run keys", () => {
  it("wraps a run key for each member, bound to the run", async () => {
    const runKey = await generateRunKey();
    const wraps = await buildRunKeyWraps("run-1", runKey, [
      { userId: "emma", publicKey: emma.publicKey, keyId: emma.keyId },
      { userId: "jonas", publicKey: jonas.publicKey, keyId: jonas.keyId },
    ]);
    expect(wraps.map((w) => [w.user_id, w.for_key_id])).toEqual([
      ["emma", emma.keyId],
      ["jonas", jonas.keyId],
    ]);
    const jonasCopy = await unwrapRunKey(
      wraps[1].wrapped_key,
      wraps[1].ephemeral_public_key,
      jonas.privateKey,
      "run-1",
    );
    const photo = new Blob([new Uint8Array([1, 2, 3])]);
    const { ciphertext, nonce } = await encryptPhoto(photo, runKey, photoAad("run-1", "p"));
    const plain = await decryptPhoto(ciphertext, nonce, jonasCopy, photoAad("run-1", "p"));
    expect(new Uint8Array(await plain.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("re-shares Emma's copies with Jonas's new phone, skipping copies she cannot open", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const runKey = await generateRunKey();
    const mine = await wrapRunKey(runKey, emma.publicKey, "run-1");
    const partner: PartnerKey = { partnerId: "jonas", publicKey: jonasNewPhone.publicKey, keyId: jonasNewPhone.keyId };
    const { wraps, skipped } = await rewrapForPartner(
      [
        {
          run_id: "run-1",
          wrapped_key: mine.wrappedKey,
          ephemeral_public_key: mine.ephemeralPublicKey,
          for_key_id: emma.keyId,
        },
        {
          run_id: "run-2",
          wrapped_key: mine.wrappedKey,
          ephemeral_public_key: mine.ephemeralPublicKey,
          for_key_id: "old",
        },
        // Wrapped for run-1, so it fails to open as run-3.
        {
          run_id: "run-3",
          wrapped_key: mine.wrappedKey,
          ephemeral_public_key: mine.ephemeralPublicKey,
          for_key_id: emma.keyId,
        },
      ],
      device(emma),
      partner,
    );
    expect(skipped).toBe(2);
    expect(wraps).toHaveLength(1);
    expect(wraps[0]).toMatchObject({ run_id: "run-1", user_id: "jonas", for_key_id: jonasNewPhone.keyId });
    const opened = await unwrapRunKey(
      wraps[0].wrapped_key,
      wraps[0].ephemeral_public_key,
      jonasNewPhone.privateKey,
      "run-1",
    );
    const { ciphertext, nonce } = await encryptPhoto(new Blob([new Uint8Array([9])]), runKey, "a");
    expect(new Uint8Array(await (await decryptPhoto(ciphertext, nonce, opened, "a")).arrayBuffer())).toEqual(
      new Uint8Array([9]),
    );
  });
});
