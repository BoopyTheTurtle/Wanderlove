// Account keys, recovery, and partner trust for end-to-end encrypted photos (docs/photo-encryption.md, sections 2, 4
// and 5; recovery options A and C). Builds on lib/crypto.ts (the maths) and lib/keyStore.ts (this device's copy).
//
// API
//
// Gate (App.tsx uses these before the rest of the app):
// - loadKeyState(userId) → "ready" with this device's keys, "setup" when the account has no keys yet, or "unlock"
//   when the account has keys but this device has none (or an outdated pair).
//   A switch to new keys that stopped halfway (rotateAccountKeys) completes here.
// - prepareAccountKeys() → a new key pair sealed with a new recovery code, in memory only.
//   saveAccountKeys(userId, pending, { replace }) publishes it and keeps it on this device with its code until the
//   user has seen the code once in Profile (keyStore.forgetRecoveryCode). `replace` is option C: a new phone without
//   the code publishes a fresh pair, and the partner's phone re-shares past trails.
// - unlockWithRecoveryCode(userId, code) (option A) → the device keys; throws WrongRecoveryCodeError on a wrong code.
//   The user typed the code, so the device does not keep it.
// - rotateAccountKeys(userId, keys) → a new pair and a new recovery code, for a user whose code is gone from this
//   device. The private key cannot be exported, so the only way to a new code is a new pair: this user's own run
//   keys are rewrapped for it, and the partner's phone asks to trust the new keys.
//
// Partner trust (section 4; security review, finding 4):
// - An invite QR or link carries the inviter's key ID in its fragment (/link/<code>#k=<key_id>; the server never sees
//   it). Before redeeming, expectPartnerKey(myId, keyId) records it; after, verifyPartnerKey(myId) compares it with
//   the new partner's published key and pins the key on a match. On a mismatch the caller unlinks
//   (unlinkMismatchedPartner). The invitee cannot read the inviter's key before redeeming, so the check follows it.
// - checkPartnerKey(myId) → "none" (no partner, the partner has no key yet, or their key differs from the one their
//   invite carried; verifyPartnerKey tells that last case apart), "trusted", or "confirm" when the key differs from
//   the one this phone pinned ("changed") or is new to this phone while trails are shared ("new").
//   trustPartnerKey(myId, myKeys, key) re-shares every shared run's key with it, then pins it.
// - Trust on first use stays only as a fallback: a key first seen with no fingerprint to compare (a typed invite code,
//   the inviting phone, or a couple linked before invites carried one) and no shared encrypted trail is pinned
//   silently. Both phones show four emoji made from the pair's key IDs (lib/keyEmoji.ts) on the linked screen, the
//   trust prompt, and Profile, so the partners can compare them.
//
// For the photo flow (wave 2b):
// - loadKeyState(userId) or keyStore.loadDeviceKeys(userId) give this user's DeviceKeys: privateKey, publicKey, keyId.
// - checkPartnerKey(myId): wrap only for a "trusted" partner key. "confirm" means the app is showing the trust
//   screen; "none" with a partner means their phone has not made keys yet, so an encrypted start waits.
// - buildRunKeyWraps(runId, runKey, recipients) → the p_keys array for start_run (one entry per member, user_id,
//   wrapped_key, ephemeral_public_key, for_key_id). After the start, keyStore.setRunKey(runId, runKey) caches it.
// - loadRunKey(userId, keys, runId) → the run's photo key (cached in keyStore), or null for a run without keys (a
//   plain run from before encryption). Throws RunKeyPendingError while this user's copy was wrapped for an older key
//   (a new phone waiting for the partner's re-share), and DecryptionError on a damaged wrap.

import type { Database } from "./database.types";
import {
  fromBase64,
  generateAccountKeys,
  generateRecoveryCode,
  importPrivateKey,
  keyIdFor,
  openPrivateKey,
  rewrapRunKey,
  sealPrivateKey,
  toBase64,
  unwrapRunKey,
  wrapRunKey,
  type AccountKeys,
  type SealedPrivateKey,
} from "./crypto";
import { loadPartner, unlink } from "./couples";
import { clearRunKeys, getRunKey, loadDeviceKeys, saveDeviceKeys, setRunKey, type DeviceKeys } from "./keyStore";
import { supabase } from "./supabase";

type UserKeysRow = Pick<
  Database["public"]["Tables"]["user_keys"]["Row"],
  "public_key" | "key_id" | "recovery_blob" | "recovery_salt" | "recovery_iv"
>;

// ---------- this account's keys ----------

export type KeyState =
  | { status: "ready"; keys: DeviceKeys }
  | { status: "setup" }
  // canUseCode: the server holds a sealed private key. replaced: this device held a pair the account no longer uses.
  | { status: "unlock"; canUseCode: boolean; replaced: boolean };

// decideKeyState also reports a switch to new keys that published the new pair but stopped before finishing.
type DecidedKeyState = KeyState | { status: "rotating"; keys: DeviceKeys & { next: DeviceKeys } };

// Thrown when another phone stored the account's first keys between this phone's check and its save.
export class KeysAlreadyExistError extends Error {
  constructor() {
    super("This account already has keys.");
    this.name = "KeysAlreadyExistError";
  }
}

export function decideKeyState(row: UserKeysRow | null, device: DeviceKeys | null): DecidedKeyState {
  if (!row) return { status: "setup" };
  if (device && device.keyId === row.key_id && device.publicKey === row.public_key) {
    return { status: "ready", keys: device };
  }
  const next = device?.next;
  if (device && next && next.keyId === row.key_id && next.publicKey === row.public_key) {
    return { status: "rotating", keys: { ...device, next } };
  }
  return { status: "unlock", canUseCode: row.recovery_blob !== null, replaced: device !== null };
}

async function loadUserKeysRow(userId: string): Promise<UserKeysRow | null> {
  const { data, error } = await supabase
    .from("user_keys")
    .select("public_key, key_id, recovery_blob, recovery_salt, recovery_iv")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadKeyState(userId: string): Promise<KeyState> {
  const [row, device] = await Promise.all([loadUserKeysRow(userId), loadDeviceKeys(userId)]);
  const state = decideKeyState(row, device);
  if (state.status === "rotating") return { status: "ready", keys: await finishRotation(userId, state.keys) };
  return state;
}

// A key pair and its recovery code, not stored anywhere yet.
export type PendingKeys = { keys: AccountKeys; recoveryCode: string; sealed: SealedPrivateKey };

function userKeysFields(pending: PendingKeys) {
  return {
    public_key: pending.keys.publicKey,
    key_id: pending.keys.keyId,
    recovery_blob: pending.sealed.blob,
    recovery_salt: pending.sealed.salt,
    recovery_iv: pending.sealed.iv,
  };
}

export async function prepareAccountKeys(): Promise<PendingKeys> {
  const keys = await generateAccountKeys();
  const recoveryCode = generateRecoveryCode();
  const sealed = await sealPrivateKey(keys.privateKeyPkcs8, recoveryCode);
  return { keys, recoveryCode, sealed };
}

function toDeviceKeys(keys: AccountKeys): DeviceKeys {
  return { privateKey: keys.privateKey, publicKey: keys.publicKey, keyId: keys.keyId };
}

// Publishes the pair with its sealed private key, then keeps the device copy. With replace (option C) it overwrites
// the account's earlier pair and code; otherwise it refuses when keys already exist.
export async function saveAccountKeys(
  userId: string,
  pending: PendingKeys,
  { replace }: { replace: boolean },
): Promise<DeviceKeys> {
  const fields = userKeysFields(pending);
  // A plain update, not an upsert: the owner may update only these columns, and an upsert also sets user_id.
  const { error } = replace
    ? await supabase.from("user_keys").update(fields).eq("user_id", userId)
    : await supabase.from("user_keys").insert({ user_id: userId, ...fields });
  if (error) {
    if (error.code === "23505") throw new KeysAlreadyExistError();
    throw error;
  }
  const device: DeviceKeys = { ...toDeviceKeys(pending.keys), recoveryCode: pending.recoveryCode };
  clearRunKeys();
  await saveDeviceKeys(userId, device);
  return device;
}

// The raw public key (base64) that belongs to a PKCS#8 private key, so a recovered key can be checked against the
// published one.
export async function publicKeyFromPkcs8(pkcs8: string): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey("pkcs8", fromBase64(pkcs8), { name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const jwk = await subtle.exportKey("jwk", key);
  const raw = new Uint8Array(65);
  raw[0] = 4;
  raw.set(fromBase64Url(jwk.x!), 1);
  raw.set(fromBase64Url(jwk.y!), 33);
  return toBase64(raw);
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  return fromBase64(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

// Option A. Opens the sealed private key with the code, checks it matches the published public key, and keeps it on
// this device. Throws WrongRecoveryCodeError on a wrong code.
export async function unlockWithRecoveryCode(userId: string, code: string): Promise<DeviceKeys> {
  const row = await loadUserKeysRow(userId);
  if (!row?.recovery_blob || !row.recovery_salt || !row.recovery_iv) {
    throw new Error("This account has no recovery code.");
  }
  const pkcs8 = await openPrivateKey({ blob: row.recovery_blob, salt: row.recovery_salt, iv: row.recovery_iv }, code);
  if ((await publicKeyFromPkcs8(pkcs8)) !== row.public_key) {
    throw new Error("The recovered key does not match the account's public key.");
  }
  const device: DeviceKeys = {
    privateKey: await importPrivateKey(pkcs8),
    publicKey: row.public_key,
    keyId: row.key_id,
  };
  clearRunKeys();
  await saveDeviceKeys(userId, device);
  return device;
}

// A new pair and a new recovery code for a user whose code is gone from this device (security review, finding 3).
// The order keeps a failure safe: this device stores the new pair beside the current one first; then the new public
// key goes out; then this user's run keys are rewrapped for it; only then does the new pair replace the current one
// here. A failure before the publish leaves the current pair in use. A failure after it resumes on the next
// loadKeyState, since the current private key is still on this device to rewrap with. Other phones of this user then
// ask for the new code, and the partner's phone asks to trust the new keys before it re-shares.
export async function rotateAccountKeys(userId: string, current: DeviceKeys): Promise<DeviceKeys> {
  const pending = await prepareAccountKeys();
  const base: DeviceKeys = { ...current };
  delete base.next;
  const switching = { ...base, next: { ...toDeviceKeys(pending.keys), recoveryCode: pending.recoveryCode } };
  await saveDeviceKeys(userId, switching);
  const { error } = await supabase.from("user_keys").update(userKeysFields(pending)).eq("user_id", userId);
  if (error) {
    // Nothing changed on the server. The current pair stays in use; the unused new one can go.
    await saveDeviceKeys(userId, base).catch(() => {});
    throw error;
  }
  return finishRotation(userId, switching);
}

// Rewraps this user's own run keys from the current pair to the new one, then makes the new pair current here. Copies
// wrapped for an older pair are skipped: this device cannot open them, and the partner's re-share covers shared ones.
async function finishRotation(userId: string, device: DeviceKeys & { next: DeviceKeys }): Promise<DeviceKeys> {
  const { data: rows, error } = await supabase
    .from("run_keys")
    .select("run_id, wrapped_key, ephemeral_public_key, for_key_id")
    .eq("user_id", userId);
  if (error) throw error;
  const self: PartnerKey = { partnerId: userId, publicKey: device.next.publicKey, keyId: device.next.keyId };
  const { wraps } = await rewrapForPartner(rows, device, self);
  if (wraps.length > 0) {
    // share_run_keys writes every row or none, and lets a member write their own.
    const { error: shareError } = await supabase.rpc("share_run_keys", { p_keys: wraps });
    if (shareError) throw shareError;
  }
  clearRunKeys();
  await saveDeviceKeys(userId, device.next);
  return device.next;
}

// ---------- the partner's key ----------

export type PartnerKey = { partnerId: string; publicKey: string; keyId: string };

export type PartnerKeyCheck =
  | { status: "none" }
  | { status: "trusted"; key: PartnerKey }
  | { status: "confirm"; key: PartnerKey; reason: "changed" | "new"; partnerName: string };

// Pure decision. computedKeyId is the fingerprint this phone computed from the published key; a server key_id that
// disagrees makes the key unusable, since start_run and share_run_keys check the server's.
export function decidePartnerKey(
  pinnedKeyId: string | undefined,
  computedKeyId: string,
  serverKeyId: string,
): "invalid" | "trusted" | "changed" | "new" {
  if (computedKeyId !== serverKeyId) return "invalid";
  if (pinnedKeyId === undefined) return "new";
  return pinnedKeyId === computedKeyId ? "trusted" : "changed";
}

// Pinned partner key IDs on this device: { [myId]: { [partnerId]: keyId } }.
export type Pins = Record<string, Record<string, string>>;
const PINS_KEY = "wannadoo_partner_keys";

export function withPin(pins: Pins, myId: string, partnerId: string, keyId: string): Pins {
  return { ...pins, [myId]: { ...pins[myId], [partnerId]: keyId } };
}

function readPins(): Pins {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage.getItem(PINS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Pins) : {};
  } catch {
    return {};
  }
}

// The key ID this phone pinned for the partner, if any.
export function pinnedPartnerKeyId(myId: string, partnerId: string): string | null {
  return readPins()[myId]?.[partnerId] ?? null;
}

function pinPartnerKey(myId: string, partnerId: string, keyId: string) {
  try {
    globalThis.localStorage.setItem(PINS_KEY, JSON.stringify(withPin(readPins(), myId, partnerId, keyId)));
  } catch {
    // Without storage the phone asks again next time, which is safe.
  }
}

type RunKeyRow = { run_id: string; wrapped_key: string; ephemeral_public_key: string; for_key_id: string };

// This user's wrapped keys for runs the partner also walked.
async function sharedRunKeys(myId: string, partnerId: string): Promise<RunKeyRow[]> {
  const { data: mine, error } = await supabase
    .from("run_keys")
    .select("run_id, wrapped_key, ephemeral_public_key, for_key_id")
    .eq("user_id", myId);
  if (error) throw error;
  if (mine.length === 0) return [];
  const { data: members, error: membersError } = await supabase
    .from("trail_run_members")
    .select("run_id")
    .eq("user_id", partnerId)
    .in(
      "run_id",
      mine.map((r) => r.run_id),
    );
  if (membersError) throw membersError;
  const shared = new Set(members.map((m) => m.run_id));
  return mine.filter((r) => shared.has(r.run_id));
}

// The key ID an invite carried, per user: { [myId]: keyId }. Set just before redeeming, cleared once checked.
const EXPECTED_KEY = "wannadoo_invite_key";

function readExpected(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage.getItem(EXPECTED_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

// Records the key ID from an invite before redeeming it, or clears an earlier one (null).
export function expectPartnerKey(myId: string, keyId: string | null) {
  const all = readExpected();
  if (keyId) all[myId] = keyId;
  else delete all[myId];
  try {
    globalThis.localStorage.setItem(EXPECTED_KEY, JSON.stringify(all));
  } catch {
    // Without storage the check still runs right after redeeming, from the accept screen.
  }
}

// Pure decision for an invite's key ID: the partner's published key must hash to it and carry it.
export function decideInviteKey(expectedKeyId: string, computedKeyId: string | null, serverKeyId: string | null) {
  return expectedKeyId === computedKeyId && expectedKeyId === serverKeyId;
}

// The partner's published key, and the key ID this phone computes from it; nulls when they have no key yet.
async function loadPartnerCardKey(
  partnerId: string,
): Promise<{ key: PartnerKey | null; computedKeyId: string | null }> {
  const { data: card, error } = await supabase
    .from("profile_cards")
    .select("public_key, key_id")
    .eq("id", partnerId)
    .maybeSingle();
  if (error) throw error;
  if (!card?.public_key || !card.key_id) return { key: null, computedKeyId: null };
  return {
    key: { partnerId, publicKey: card.public_key, keyId: card.key_id },
    computedKeyId: await keyIdFor(card.public_key),
  };
}

export type InviteKeyCheck =
  { status: "unchecked" } | { status: "verified" } | { status: "mismatch"; partnerName: string };

// After redeeming an invite that carried a key ID: pins the new partner's key when it matches, and reports a mismatch
// for the caller to unlink. "unchecked" means there was nothing to compare (no key ID, or no partner).
export async function verifyPartnerKey(myId: string): Promise<InviteKeyCheck> {
  const expected = readExpected()[myId];
  if (!expected) return { status: "unchecked" };
  const partner = await loadPartner(myId);
  if (!partner) return { status: "unchecked" };
  const { key, computedKeyId } = await loadPartnerCardKey(partner.id);
  if (!key || !decideInviteKey(expected, computedKeyId, key.keyId)) {
    return { status: "mismatch", partnerName: partner.name };
  }
  pinPartnerKey(myId, partner.id, key.keyId);
  expectPartnerKey(myId, null);
  return { status: "verified" };
}

// Ends a link whose partner key did not match their invite, and forgets the invite's key ID.
export async function unlinkMismatchedPartner(myId: string): Promise<void> {
  await unlink();
  expectPartnerKey(myId, null);
}

// The partner's key ID to show as emoji: the one this phone pinned, or else the published one if it is sound.
export async function partnerKeyIdForCheck(myId: string, partnerId: string): Promise<string | null> {
  const pinned = pinnedPartnerKeyId(myId, partnerId);
  if (pinned) return pinned;
  const { key, computedKeyId } = await loadPartnerCardKey(partnerId);
  return key && key.keyId === computedKeyId ? key.keyId : null;
}

// Compares the active partner's published key with the key ID their invite carried, or else with the one this phone
// pinned. A key first seen with neither, and no shared trail to re-share, is pinned silently (trust on first use);
// otherwise the user confirms.
export async function checkPartnerKey(myId: string): Promise<PartnerKeyCheck> {
  const partner = await loadPartner(myId);
  if (!partner) return { status: "none" };
  // A key that differs from the invite's key ID is never trusted; the app unlinks (verifyPartnerKey says so).
  if ((await verifyPartnerKey(myId)).status === "mismatch") return { status: "none" };

  const { key, computedKeyId } = await loadPartnerCardKey(partner.id);
  if (!key || !computedKeyId) return { status: "none" };
  const decision = decidePartnerKey(readPins()[myId]?.[partner.id], computedKeyId, key.keyId);
  if (decision === "invalid") {
    console.error("The partner's published key ID does not match their key");
    return { status: "none" };
  }
  if (decision === "trusted") return { status: "trusted", key };
  if (decision === "new" && (await sharedRunKeys(myId, partner.id)).length === 0) {
    pinPartnerKey(myId, partner.id, key.keyId);
    return { status: "trusted", key };
  }
  return { status: "confirm", key, reason: decision, partnerName: partner.name };
}

export type ShareRunKey = {
  run_id: string;
  user_id: string;
  wrapped_key: string;
  ephemeral_public_key: string;
  for_key_id: string;
};

// Rewraps this user's copies of shared run keys for the partner's key (or, in rotateAccountKeys, for this user's own
// new key). Rows wrapped for an older key of this user,
// or damaged ones, are skipped: this phone cannot open them.
export async function rewrapForPartner(rows: RunKeyRow[], myKeys: DeviceKeys, partner: PartnerKey) {
  const wraps: ShareRunKey[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (row.for_key_id !== myKeys.keyId) {
      skipped++;
      continue;
    }
    try {
      const wrapped = await rewrapRunKey(
        row.wrapped_key,
        row.ephemeral_public_key,
        myKeys.privateKey,
        partner.publicKey,
        row.run_id,
      );
      wraps.push({
        run_id: row.run_id,
        user_id: partner.partnerId,
        wrapped_key: wrapped.wrappedKey,
        ephemeral_public_key: wrapped.ephemeralPublicKey,
        for_key_id: partner.keyId,
      });
    } catch (e) {
      console.error("Couldn't rewrap a run key", row.run_id, e);
      skipped++;
    }
  }
  return { wraps, skipped };
}

// Option C and key changes: after the user confirms, re-shares every shared trail's key with the partner's current
// key, then pins it. Returns how many trails were shared.
export async function trustPartnerKey(myId: string, myKeys: DeviceKeys, key: PartnerKey): Promise<number> {
  const { wraps } = await rewrapForPartner(await sharedRunKeys(myId, key.partnerId), myKeys, key);
  if (wraps.length > 0) {
    const { error } = await supabase.rpc("share_run_keys", { p_keys: wraps });
    if (error) throw error;
  }
  pinPartnerKey(myId, key.partnerId, key.keyId);
  return wraps.length;
}

// ---------- run keys ----------

export type Recipient = { userId: string; publicKey: string; keyId: string };

// start_run's p_keys: the run key wrapped for each member, bound to the run ID.
export async function buildRunKeyWraps(
  runId: string,
  runKey: CryptoKey,
  recipients: Recipient[],
): Promise<Omit<ShareRunKey, "run_id">[]> {
  return Promise.all(
    recipients.map(async (r) => {
      const wrapped = await wrapRunKey(runKey, r.publicKey, runId);
      return {
        user_id: r.userId,
        wrapped_key: wrapped.wrappedKey,
        ephemeral_public_key: wrapped.ephemeralPublicKey,
        for_key_id: r.keyId,
      };
    }),
  );
}

// Thrown when this user's copy of a run key was wrapped for an older key pair: the partner's phone has not yet
// re-shared it with this phone's new keys.
export class RunKeyPendingError extends Error {
  constructor() {
    super("This trail's key waits for your partner's phone to share it again.");
    this.name = "RunKeyPendingError";
  }
}

export async function loadRunKey(userId: string, keys: DeviceKeys, runId: string): Promise<CryptoKey | null> {
  const cached = getRunKey(runId);
  if (cached) return cached;
  const { data, error } = await supabase
    .from("run_keys")
    .select("wrapped_key, ephemeral_public_key, for_key_id")
    .eq("run_id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.for_key_id !== keys.keyId) throw new RunKeyPendingError();
  const key = await unwrapRunKey(data.wrapped_key, data.ephemeral_public_key, keys.privateKey, runId);
  setRunKey(runId, key);
  return key;
}
